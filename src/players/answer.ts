// Players-only "Ask the Table" generation (P2).
//
// Runs ON the GM's client (players relay their question in over the socket; see relay.ts), so the
// OpenRouter key / memory secret never leave the GM machine. The bot is deliberately minimal and
// scoped:
//   - System prompt: the players-only gatekeeper / unreliable-narrator prompt.
//   - Memory: PLAYER_QUERY_SILOS ONLY. gm_* is physically unreachable, so no prompt injection can
//     extract concealed knowledge — the guardrail is the retrieval scope, not the prompt.
//   - No lorebook / author's-note / combat block: those are GM canon and could leak.
// Privileged adjudication (Insight-on-a-lying-NPC etc.) is NOT handled here — that's the bot-to-bot
// relay in P3. P2 answers mundane, player-visible questions truthfully.

import { getFeatureConfig } from "../providers/config";
import { ChatClientError, chatCompletion } from "../providers/chat-client";
import { isConfigured, type ChatMessage } from "../providers/types";
import { retrieveContext } from "../rag/retrieval";
import { PLAYER_QUERY_SILOS } from "../rag/silos";
import { PLAYERS_SYSTEM_PROMPT } from "../prompts";
import { sanitizeUserText } from "../util/sanitize";
import { bumpStats } from "../util/stats";
import { parseDirectives, type Directive } from "./directives";

/** OpenAI message `name` fields disallow spaces/most punctuation; normalize. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "player";
}

export interface PlayerAnswer {
  /** Player-facing text (directive lines already stripped). */
  text: string;
  /** Any action directives the bot emitted (ADJUDICATE / REMEMBER / UPDATE / FORGET). */
  directives: Directive[];
}

/**
 * Generate the players-only bot's answer to one question. The players bot reuses the GM's `chat`
 * provider/model. Directives are parsed out (the relay acts on them). Throws ChatClientError if the
 * provider is unconfigured or the request fails.
 */
export async function generatePlayerAnswer(
  question: string,
  askUserName: string,
  signal?: AbortSignal,
): Promise<PlayerAnswer> {
  const cfg = getFeatureConfig("chat");
  if (!isConfigured(cfg)) {
    throw new ChatClientError(
      "Chat provider is not configured. The GM must set the provider, model, and (for OpenRouter) API key.",
    );
  }

  // Re-sanitize GM-side too: a crafted socket payload could bypass the panel's input hygiene.
  const clean = sanitizeUserText(question, { maxLength: 2000, allowNewlines: true });
  if (!clean) throw new ChatClientError("Empty question.");

  // Player-visible memory only. gm_* silos are never queried on a player's behalf.
  const rag = await retrieveContext(clean, signal, { silos: [...PLAYER_QUERY_SILOS] });

  const messages: ChatMessage[] = [{ role: "system", content: PLAYERS_SYSTEM_PROMPT }];
  if (rag.block) messages.push({ role: "system", content: rag.block });
  messages.push({ role: "user", content: clean, name: sanitizeName(askUserName) });

  const raw = (await chatCompletion(cfg, { messages, signal })).trim();
  bumpStats({ chatTurns: 1 });
  return parseDirectives(raw);
}
