// What the rules module has been doing, so the GM's chatbot is not the last to know.
//
// Every `noodlrHooks.ruling` is one plain sentence written by the module that applied it — a failed
// concentration save, a shove, a creature going down. Without this the AI GM is narrating a fight it
// cannot see the mechanics of, which is exactly the failure the ⚔️ tracker block exists to prevent;
// this is the same idea applied to events rather than to state.
//
// A short ring buffer, not a log: the point is the last few beats, and an unbounded list would eat
// the context budget it rides in (the assembler trims only history, never fixed blocks). Old entries
// are worth nothing here anyway — anything durable belongs in memory, written deliberately.

const MAX_RULINGS = 12;

/** Rulings older than this are dropped on read: a fight from an hour ago is not "what just happened". */
const STALE_MS = 15 * 60 * 1000;

interface RecordedRuling {
  kind: string;
  summary: string;
  at: number;
}

const recent: RecordedRuling[] = [];

export function noteRuling(
  event: { kind?: string; summary?: string; [key: string]: unknown } | undefined,
): void {
  const summary = String(event?.summary ?? "").trim();
  if (!summary) return;
  recent.push({ kind: String(event?.kind ?? "ruling"), summary, at: Date.now() });
  if (recent.length > MAX_RULINGS) recent.splice(0, recent.length - MAX_RULINGS);
}

/** Dropped when a fight ends, and on demand from the chat panel's clear control. */
export function clearRulings(): void {
  recent.length = 0;
}

/**
 * The block injected alongside the combat tracker, or null when nothing has happened lately.
 *
 * Labelled as already-applied on purpose. The model's instinct on reading "Kobold fails its
 * concentration save" is to roll it, and the whole point is that the rules module already did.
 */
export function buildRulingsBlock(): string | null {
  const cutoff = Date.now() - STALE_MS;
  const live = recent.filter((r) => r.at >= cutoff);
  if (live.length === 0) return null;
  const lines = live.map((r) => `- ${r.summary}`).join("\n");
  return (
    "# Rules already applied (by the rules module, not by you)\n" +
    "These have happened. Narrate around them; do not re-roll, re-decide, or contradict them.\n" +
    lines
  );
}
