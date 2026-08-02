// How much a stored memory is worth at retrieval time.
//
// noodlr-memory's re-ranker folds `importance` (0-10) into the score alongside cosine similarity,
// BM25, and recency. The module used to write nothing at all, which is not neutral: a missing value
// scores the same as zero, so a rulebook chapter someone deliberately ingested competed on equal
// terms with an offhand line of table chatter the sniffer happened to catch. When the chatter is
// wrong — a mistaken ruling, a troubleshooting aside — it can then outrank the book it contradicts.
//
// The ordering that matters: what a human chose to put in beats what a bot decided to keep, which
// beats what was captured incidentally. Absolute values are less important than the gaps.

export const IMPORTANCE = {
  /** A human typed or corrected this in the memory browser. The strongest signal there is. */
  curated: 8,
  /** Compendium, document, and file ingestion — deliberate acts against chosen material. */
  ingested: 7,
  /** The GM co-pilot's own remember/update directives, audited by the GM as they happen. */
  assistantWrite: 6,
  /** Committed generated artifacts (accepted scene art, narration, and their ledger entries). */
  artifact: 5,
  /** Accepted GM co-pilot dialogue: useful continuity, but conversation rather than canon. */
  conversation: 3,
  /** Spoken-session transcript segments. Verbatim, unedited, and often mid-thought. */
  transcript: 3,
  /** Whatever the chat-log sniffer swept up. Broadest net, lowest confidence. */
  incidental: 2,
  /** Self-test scaffolding. Should never influence an answer. */
  diagnostic: 1,
} as const;

export type ImportanceLevel = (typeof IMPORTANCE)[keyof typeof IMPORTANCE];

/**
 * Attach an importance to a document's metadata without overriding one that's already there
 * (a caller with a specific reason outranks the category default).
 */
export function withImportance(
  metadata: Record<string, unknown> | undefined,
  level: ImportanceLevel,
): Record<string, unknown> {
  return { importance: level, ...(metadata ?? {}) };
}
