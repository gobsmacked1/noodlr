// Chronicle pipeline: the DM appends "📜 Chronicle: <new canon>" after significant
// scenes. We parse those lines, queue them for GM review, and (on approval) promote them
// to lorebook entries and/or ingest them as kind:"event" memories. This is the core
// anti-amnesia loop.

import { MODULE_ID, SETTINGS, log } from "../constants";
import { loadChronicleQueue, loadLorebook, saveChronicleQueue, saveLorebook } from "./settings";
import { makeLorebookEntry, type ChronicleItem } from "./types";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";
import type { SiloId } from "../rag/silos";

// Match a Chronicle line: optional markdown bullet, optional 📜, then "Chronicle:".
const CHRONICLE_RE = /^[\s>*_-]*(?:📜\s*)?Chronicle:\s*(.+?)\s*$/gim;

/** Extract chronicle fact lines from assistant output. */
export function parseChronicleLines(text: string): string[] {
  const out: string[] = [];
  CHRONICLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHRONICLE_RE.exec(text)) !== null) {
    const fact = m[1].trim();
    if (fact) out.push(fact);
  }
  return out;
}

/** Parse + enqueue chronicle facts from an assistant message (respects the toggle). */
export async function captureChronicle(assistantText: string): Promise<number> {
  const autoParse = (game.settings.get(MODULE_ID, SETTINGS.chronicleAutoParse) as boolean) ?? true;
  if (!autoParse) return 0;

  const facts = parseChronicleLines(assistantText);
  if (facts.length === 0) return 0;

  const queue = loadChronicleQueue();
  const existing = new Set(queue.map((q) => q.text));
  let added = 0;
  for (const text of facts) {
    if (existing.has(text)) continue;
    queue.push({ id: foundry.utils.randomID(), text, ts: Date.now() });
    existing.add(text);
    added++;
  }
  if (added > 0) {
    await saveChronicleQueue(queue);
    log(`captured ${added} chronicle fact(s) for review`);
  }
  return added;
}

/** Promote a queued fact to a lorebook entry (keys seeded from entities, if any). */
export async function promoteToLorebook(item: ChronicleItem): Promise<void> {
  const entries = loadLorebook();
  const maxOrder = entries.reduce((m, e) => Math.max(m, e.order), 0);
  entries.push(
    makeLorebookEntry({
      name: item.text.slice(0, 60),
      keys: item.entities ?? [],
      content: item.text,
      constant: (item.entities?.length ?? 0) === 0, // no keys -> always inject so it isn't lost
      position: "top",
      order: maxOrder + 1,
    }),
  );
  await saveLorebook(entries);
}

/** Ingest a queued fact as a structured event memory. */
export async function ingestChronicleEvent(item: ChronicleItem, silo: SiloId): Promise<void> {
  if (!isRagEnabled()) throw new Error("Memory (RAG) is not enabled.");
  await getRagClient().ingest(
    silo,
    [
      {
        text: item.text,
        kind: "event",
        metadata: {
          importance: 3,
          event_type: "chronicle",
          entities: item.entities ?? [],
          ts: item.ts,
        },
      },
    ],
    getEmbedOverride(),
  );
}

/** Remove a fact from the review queue by id. */
export async function dismissChronicleItem(id: string): Promise<void> {
  const queue = loadChronicleQueue().filter((q) => q.id !== id);
  await saveChronicleQueue(queue);
}
