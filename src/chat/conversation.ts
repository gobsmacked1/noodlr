// Conversation orchestration: assembles the message payload, streams the assistant
// response, resolves {{roll:...}} macros against real Foundry dice, and (optionally)
// runs one bounded continuation so the DM can react to the authoritative results.

import { MODULE_ID, SETTINGS } from "../constants";
import { getFeatureConfig } from "../providers/config";
import { ChatClientError, streamChatCompletion } from "../providers/chat-client";
import { type ChatMessage, type FeatureProviderConfig, isConfigured } from "../providers/types";
import { fetchOpenRouterContextLength } from "../providers/models";
import { getContextBudget, isChatMemoryWritesEnabled } from "../prompt/settings";
import {
  type ResolvedRoll,
  formatRollResultsForModel,
  resolveRollMacros,
} from "../dice/roll-macros";
import { retrieveContext } from "../rag/retrieval";
import { buildWebFallbackPlugins } from "../rag/web-fallback";
import { assemblePrompt } from "../prompt/assembler";
import { parseDirectives } from "../players/directives";
import { applyMemoryDirectives } from "../rag/memory-writes";
import { buildCombatStateBlock } from "../combat/tracker";
import { bumpStats, noteContextEst } from "../util/stats";
import { estimateMessagesTokens } from "../util/tokens";

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

  /** Synthetic roll-continuation user turns (marked so Retry can skip past them). */
  #synthetic = new WeakSet<ChatMessage>();

  reset(): void {
    this.messages.length = 0;
  }

  /**
   * Roll history back to just before the most recent *human* user turn (skipping synthetic
   * roll-continuation turns), dropping that turn and everything after it. Returns the human
   * text so the caller can re-send it (Retry) or discard it (Reject). Null if none found.
   */
  popLastUserTurn(): string | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === "user" && !this.#synthetic.has(m)) {
        const text = m.content;
        this.messages.length = i;
        return text;
      }
    }
    return null;
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

    // One-time-per-model/budget sanity check: warn if the context budget can't fit the model.
    maybeWarnBudgetVsModel(cfg);

    const userMsg: ChatMessage = { role: "user", content: userText };
    if (hooks.speakerName) userMsg.name = sanitizeName(hooks.speakerName);
    this.messages.push(userMsg);
    bumpStats({ chatTurns: 1 });

    // Retrieve campaign memory once per user turn (graceful not-queried when disabled/offline).
    const rag = await retrieveContext(userText, hooks.signal);
    const ragBlock = rag.block;
    // When memory came back empty/weak and the GM opted in, fold a one-shot web search into the
    // initial request only (OpenRouter chat provider; undefined otherwise). See rag/web-fallback.
    const webPlugins = buildWebFallbackPlugins(cfg, rag);
    if (webPlugins) bumpStats({ webFallbacks: 1 });
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
      // Record how big the prompt we're about to send is (estimator tokens), so Diagnostics can
      // show avg/peak against the context budget and the DM knows whether to raise the ceiling.
      noteContextEst(estimateMessagesTokens(payload));

      hooks.onAssistantStart?.();
      let raw = "";
      // Only ground the first request; roll continuations reason over dice results, not the web.
      for await (const delta of streamChatCompletion(cfg, {
        messages: payload,
        plugins: continuations === 0 ? webPlugins : undefined,
        signal: hooks.signal,
      })) {
        raw += delta;
        hooks.onDelta?.(delta);
      }

      const { text: withRolls, rolls } = await resolveRollMacros(raw);
      // Strip any @@NOODLR memory directives before display/history; execute them with the "gm"
      // audience (enforced to gm/player-writable silos + audited) when the toggle is on.
      const { text: resolved, directives } = parseDirectives(withRolls);
      this.messages.push({ role: "assistant", content: resolved });
      hooks.onAssistantDone?.(resolved, rolls);

      if (isChatMemoryWritesEnabled() && directives.length > 0) {
        await applyMemoryDirectives("gm", directives);
      }

      if (rolls.length > 0 && allowContinuation && continuations < MAX_CONTINUATIONS) {
        continuations++;
        const cont: ChatMessage = {
          role: "user",
          content: `${formatRollResultsForModel(rolls)}\n\nContinue the scene from these results; do not repeat prior narration.`,
        };
        this.#synthetic.add(cont);
        this.messages.push(cont);
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

// Remembers which (model:budget) combos we've already evaluated this session, so the check runs
// once per change instead of every turn.
const budgetChecked = new Set<string>();

/**
 * If the configured context budget exceeds the chosen OpenRouter model's real context window,
 * warn the GM once (per model+budget). Best-effort and non-blocking: only OpenRouter (whose
 * catalog exposes context_length), silent when the model/limit is unknown. Custom endpoints are
 * skipped — we have no reliable way to know their window.
 */
function maybeWarnBudgetVsModel(cfg: FeatureProviderConfig): void {
  if (cfg.provider !== "openrouter" || !cfg.model) return;
  const budget = getContextBudget();
  const key = `${cfg.model}:${budget}`;
  if (budgetChecked.has(key)) return;
  void fetchOpenRouterContextLength(cfg.model).then((limit) => {
    if (!limit) return; // unknown — leave unmarked so we can retry once the catalog loads
    budgetChecked.add(key);
    if (budget > limit) {
      ui.notifications?.warn(
        game.i18n.format("NOODLR.Chat.BudgetExceedsModel", {
          budget,
          limit,
          model: cfg.model,
        }),
      );
    }
  });
}
