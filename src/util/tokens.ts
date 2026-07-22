// Rough token estimation. No real tokenizer is bundled (kept dependency-free); ~4 chars
// per token is a serviceable heuristic for budgeting prompt assembly. Intentionally
// conservative-ish; swap for a real tokenizer later if precision matters.

import type { ChatMessage } from "../providers/types";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a message, including a small per-message role overhead. */
export function estimateMessageTokens(msg: ChatMessage): number {
  return estimateTokens(msg.content) + 4;
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}
