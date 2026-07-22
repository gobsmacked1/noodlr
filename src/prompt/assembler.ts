// Context assembler: composes the final message payload from all layers under one token
// budget, with a defined order (top → bottom):
//
//   system prompt · top lorebook · RAG memory · Foundry ground-truth state ·
//   [history, with author's note injected at depth] · bottom lorebook · post-history
//
// Post-history instructions are always the very last message; the combat reminder is
// swapped into that slot whenever Foundry reports active combat (computed at assembly
// time, so it needs no start/end hooks to stay correct).

import type { ChatMessage } from "../providers/types";
import { getEffectiveChatSystemPrompt } from "../chat/system-prompt";
import { activateEntries } from "./lorebook";
import {
  getAuthorNote,
  getAuthorNoteDepth,
  getCombatReminder,
  getContextBudget,
  getPostHistory,
  loadLorebook,
} from "./settings";
import { estimateMessagesTokens, estimateMessageTokens } from "../util/tokens";

export interface AssembleInput {
  /** User/assistant turns, oldest first. */
  history: ChatMessage[];
  /** Latest user text (drives lorebook key scanning). */
  scanText: string;
  ragBlock?: string | null;
  /** Foundry ground-truth state block (Phase 5). */
  foundryState?: string | null;
  /** Override combat detection; defaults to Foundry's active combat. */
  combatActive?: boolean;
}

function sys(content: string): ChatMessage {
  return { role: "system", content };
}

/** Build the text scanned for lorebook keys: recent turns + the latest user text. */
function buildScanText(input: AssembleInput): string {
  const recent = input.history.slice(-6).map((m) => m.content);
  return [...recent, input.scanText].join("\n");
}

function buildPostHistory(input: AssembleInput): string {
  const combatActive = input.combatActive ?? Boolean(game.combat?.started);
  const parts: string[] = [];
  if (combatActive) {
    const reminder = getCombatReminder().trim();
    if (reminder) parts.push(reminder);
  }
  const post = getPostHistory().trim();
  if (post) parts.push(post);
  return parts.join("\n\n");
}

/** Keep the most recent messages that fit `budget` tokens (preserving order). */
function trimHistory(history: ChatMessage[], budget: number): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(history[i]);
    if (used + cost > budget && kept.length > 0) break;
    kept.push(history[i]);
    used += cost;
  }
  kept.reverse();
  return kept;
}

/** Insert the author's note system message before the last `depth` messages. */
function injectAuthorNote(history: ChatMessage[], note: string, depth: number): ChatMessage[] {
  if (!note) return history;
  const idx = Math.max(0, history.length - depth);
  const anchor = sys(`# Session anchor\n${note}`);
  return [...history.slice(0, idx), anchor, ...history.slice(idx)];
}

export function assemblePrompt(input: AssembleInput): ChatMessage[] {
  const leading: ChatMessage[] = [sys(getEffectiveChatSystemPrompt())];

  const active = activateEntries(loadLorebook(), buildScanText(input));
  const topEntries = active.filter((e) => e.position === "top");
  const bottomEntries = active.filter((e) => e.position === "bottom");

  if (topEntries.length > 0) {
    leading.push(sys(`# World Info\n${topEntries.map((e) => e.content).join("\n\n")}`));
  }
  if (input.ragBlock) leading.push(sys(input.ragBlock));
  if (input.foundryState) leading.push(sys(input.foundryState));

  const trailing: ChatMessage[] = [];
  if (bottomEntries.length > 0) {
    trailing.push(sys(`# World Info\n${bottomEntries.map((e) => e.content).join("\n\n")}`));
  }
  const post = buildPostHistory(input);
  if (post) trailing.push(sys(post));

  // Budget the history around the fixed blocks and the author's note.
  const budget = getContextBudget();
  const note = getAuthorNote().trim();
  const noteTokens = note ? estimateMessageTokens(sys(note)) + 4 : 0;
  const fixedTokens = estimateMessagesTokens([...leading, ...trailing]) + noteTokens;
  const historyBudget = Math.max(0, budget - fixedTokens);

  const trimmed = trimHistory(input.history, historyBudget);
  const withNote = injectAuthorNote(trimmed, note, getAuthorNoteDepth());

  return [...leading, ...withNote, ...trailing];
}
