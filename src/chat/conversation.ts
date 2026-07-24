// Conversation orchestration: assembles the message payload, streams the assistant
// response, resolves {{roll:...}} macros against real Foundry dice, and (optionally)
// runs one bounded continuation so the DM can react to the authoritative results.

import { MODULE_ID, SETTINGS } from "../constants";
import { getFeatureConfig } from "../providers/config";
import { ChatClientError, streamChatCompletion } from "../providers/chat-client";
import { type ChatMessage, isConfigured } from "../providers/types";
import {
  type ResolvedRoll,
  formatRollResultsForModel,
  resolveRollMacros,
} from "../dice/roll-macros";
import { retrieveContext } from "../rag/retrieval";
import { assemblePrompt } from "../prompt/assembler";
import { captureChronicle } from "../prompt/chronicle";
import { buildCombatStateBlock } from "../combat/tracker";
import { bumpStats } from "../util/stats";

export interface SendHooks {
  /** Display name of the speaker (maps to a Foundry user). */
  speakerName?: string;
  /** Abort signal to cancel the whole turn. */
  signal?: AbortSignal;
  /** Fired when a new assistant message begins streaming. */
  onAssistantStart?(): void;
  /** Fired for each streamed content delta. */
  onDelta?(delta: string): void;
  /** Fired when an assistant message finishes (after roll resolution). */
  onAssistantDone?(text: string, rolls: ResolvedRoll[]): void;
}

/** Max automatic continuation calls after a turn that contained dice rolls. */
const MAX_CONTINUATIONS = 1;

export class Conversation {
  /** User/assistant turns only; the system prompt is assembled fresh each request. */
  readonly messages: ChatMessage[] = [];

  reset(): void {
    this.messages.length = 0;
  }

  /**
   * Run one user turn end-to-end. Throws ChatClientError if the provider is not
   * configured or the request fails; callers surface this to the user.
   */
  async send(userText: string, hooks: SendHooks = {}): Promise<void> {
    const cfg = getFeatureConfig("chat");
    if (!isConfigured(cfg)) {
      throw new ChatClientError(
        "Chat provider is not configured. Set the provider, model, and (for OpenRouter) API key in the module settings.",
      );
    }

    const userMsg: ChatMessage = { role: "user", content: userText };
    if (hooks.speakerName) userMsg.name = sanitizeName(hooks.speakerName);
    this.messages.push(userMsg);
    bumpStats({ chatTurns: 1 });

    // Retrieve campaign memory once per user turn (graceful null when disabled/offline).
    const ragBlock = await retrieveContext(userText, hooks.signal);
    // Ground-truth combat state (null outside combat).
    const foundryState = buildCombatStateBlock();

    const allowContinuation =
      (game.settings.get(MODULE_ID, SETTINGS.chatContinueAfterRoll) as boolean) ?? true;
    let continuations = 0;

    for (;;) {
      const payload = assemblePrompt({
        history: this.messages,
        scanText: userText,
        ragBlock,
        foundryState,
      });

      hooks.onAssistantStart?.();
      let raw = "";
      for await (const delta of streamChatCompletion(cfg, {
        messages: payload,
        signal: hooks.signal,
      })) {
        raw += delta;
        hooks.onDelta?.(delta);
      }

      const { text: resolved, rolls } = await resolveRollMacros(raw);
      this.messages.push({ role: "assistant", content: resolved });
      hooks.onAssistantDone?.(resolved, rolls);

      // Anti-amnesia: queue any 📜 Chronicle facts for GM review.
      await captureChronicle(resolved);

      if (rolls.length > 0 && allowContinuation && continuations < MAX_CONTINUATIONS) {
        continuations++;
        this.messages.push({
          role: "user",
          content: `${formatRollResultsForModel(rolls)}\n\nContinue the scene from these results; do not repeat prior narration.`,
        });
        continue;
      }
      break;
    }
  }
}

/** OpenAI message `name` fields disallow spaces/most punctuation; normalize. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "player";
}
