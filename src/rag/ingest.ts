// Compendium + file ingestion into noodlr-memory. System-agnostic text extraction: we
// never assume a game system's data shape — we pull name + any description-like HTML and
// fall back to a compact JSON of the document's system data.

import { getEmbedOverride, getRagClient } from "./config";
import type { IngestDocument } from "./client";
import type { SiloId } from "./silos";

/** Strip HTML to plain text using a detached element (browser context). */
function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

/** Best-effort, system-agnostic conversion of a Foundry document to indexable text. */
export function documentToText(doc: any): string {
  const parts: string[] = [];
  if (doc?.name) parts.push(String(doc.name));

  // JournalEntry: concatenate page contents.
  const pages = doc?.pages;
  if (pages && typeof pages.forEach === "function") {
    pages.forEach((p: any) => {
      if (p?.name) parts.push(String(p.name));
      const content = p?.text?.content;
      if (typeof content === "string" && content) parts.push(stripHtml(content));
    });
  }

  // Common description locations on items/actors.
  const desc = doc?.system?.description?.value ?? doc?.system?.details?.biography?.value;
  if (typeof desc === "string" && desc) parts.push(stripHtml(desc));

  // Fallback: compact system data if we still have only the name.
  if (parts.length <= 1 && doc?.system && typeof doc.system === "object") {
    try {
      parts.push(JSON.stringify(doc.system).slice(0, 4000));
    } catch {
      /* ignore */
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

export interface IngestProgress {
  processed: number;
  total: number;
  inserted: number;
}

/**
 * Ingest an entire compendium pack into a silo. Documents are loaded, converted to text,
 * and sent in batches. Returns totals; calls onProgress after each batch.
 */
export async function ingestCompendium(
  packId: string,
  silo: SiloId,
  onProgress?: (p: IngestProgress) => void,
  signal?: AbortSignal,
): Promise<{ documents: number; inserted: number }> {
  const pack = game.packs?.get(packId);
  if (!pack) throw new Error(`Compendium not found: ${packId}`);

  const docs: any[] = await pack.getDocuments();
  const client = getRagClient();
  const embed = getEmbedOverride();
  const packLabel = pack.metadata?.label ?? packId;

  const BATCH = 25;
  let inserted = 0;
  let processed = 0;

  for (let i = 0; i < docs.length; i += BATCH) {
    if (signal?.aborted) break;
    const batch = docs.slice(i, i + BATCH);
    const documents: IngestDocument[] = [];
    for (const doc of batch) {
      const text = documentToText(doc);
      if (!text) continue;
      documents.push({
        text,
        metadata: { sourceName: doc.name ?? "document", compendium: packLabel, docId: doc.id },
      });
    }
    if (documents.length > 0) {
      const res = await client.ingest(silo, documents, embed, signal);
      inserted += res.inserted ?? 0;
    }
    processed += batch.length;
    onProgress?.({ processed, total: docs.length, inserted });
  }

  return { documents: docs.length, inserted };
}
