// Compendium + file ingestion into noodlr-memory. System-agnostic text extraction: we
// never assume a game system's data shape — we pull name + any description-like HTML and
// fall back to a compact JSON of the document's system data.

import { getEmbedOverride, getRagClient } from "./config";
import type { IngestDocument } from "./client";
import { IMPORTANCE, withImportance } from "./importance";
import type { SiloId } from "./silos";
import { bumpStats } from "../util/stats";
import { warn } from "../constants";

/** Strip HTML to plain text using a detached element (browser context). */
function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

/** An embedded collection on a live document; a plain keyed object on raw source data. */
function embedded(value: any): any[] {
  if (!value) return [];
  const list: any[] = typeof value.forEach === "function" ? [...value] : Object.values(value);
  return list.map((entry) => (typeof entry?.toObject === "function" ? entry.toObject() : entry));
}

/**
 * A roll table's rows, which live nowhere near `system`.
 *
 * A RollTable has no `system` at all: its prose is top-level `description` and its content is the
 * `results` collection. Reading only the `system.*` paths therefore reduced a whole d100 table to
 * its title, which is how the compendium corpus ended up holding "Wild Magic Surge" as a name with
 * none of its hundred effects.
 *
 * The range prefix is kept because it is the mechanic: a row means nothing without the numbers that
 * select it. v13 split `TableResult#text` into `name` + `description`; older packs still carry the
 * legacy field, so all three are read and deduplicated rather than guessed between.
 */
function tableRows(doc: any): string[] {
  const lines: string[] = [];
  for (const row of embedded(doc?.results)) {
    const range: unknown[] = Array.isArray(row?.range) ? row.range : [];
    const label =
      range.length === 2
        ? range[0] === range[1]
          ? String(range[0])
          : `${range[0]}-${range[1]}`
        : "";
    const seen = new Set<string>();
    for (const field of [row?.name, row?.description, row?.text]) {
      const text = stripHtml(String(field ?? ""));
      if (text) seen.add(text);
    }
    const body = [...seen].join(" — ");
    if (body) lines.push(label ? `${label}: ${body}` : body);
  }
  return lines;
}

/**
 * A creature's traits and actions, which are embedded Items rather than fields of `system`.
 *
 * Same shape of omission as the roll tables above and the one the offline miner had to fix first:
 * in the SRD Aboleth, `system` ends around line 551 and `items` runs past 1,900. Most statblocks
 * carry no biography, so an actor read through the `system.*` paths alone fell through to the
 * truncated-JSON fallback and was indexed as a name and a few hundred numbers, with every trait,
 * attack and legendary action absent from the embedding.
 */
function itemLines(doc: any): string[] {
  const lines: string[] = [];
  for (const item of embedded(doc?.items)) {
    const name = String(item?.name ?? "").trim();
    const body = stripHtml(String(item?.system?.description?.value ?? ""));
    const text = [name, body].filter(Boolean).join(": ");
    if (text) lines.push(text);
  }
  return lines;
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

  // Core documents that keep their prose at the top level rather than under `system`: RollTable,
  // Cards, Adventure, Scene.
  if (typeof doc?.description === "string" && doc.description) parts.push(stripHtml(doc.description));

  const rows = tableRows(doc);
  if (rows.length > 0) {
    const formula = String(doc?.formula ?? "").trim();
    parts.push(formula ? `Roll ${formula}:\n${rows.join("\n")}` : rows.join("\n"));
  }

  // Whether anything narrative was found. Embedded items are appended after this is read, because
  // they are mechanics rather than prose: a statblock with traits but no biography still wants its
  // numbers, and gating the fallback on `parts.length` would have dropped AC and hit points the
  // moment item text started arriving.
  const hasProse = parts.length > 1;
  parts.push(...itemLines(doc));

  // Fallback: compact system data if no prose was found.
  if (!hasProse && doc?.system && typeof doc.system === "object") {
    try {
      parts.push(JSON.stringify(doc.system).slice(0, 4000));
    } catch {
      /* ignore */
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

/** The document type, however the caller obtained the document. */
function documentKind(doc: any): string {
  return String(doc?.documentName ?? doc?.constructor?.documentName ?? "unknown");
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
  // A document whose text is only its own name was not really read. That is not a failure the
  // service can report — it accepts the row, embeds it, and counts it as inserted — so the count
  // in the UI looks like success. Every silent omission found so far (roll table rows, a
  // creature's embedded items) presented exactly this way, so it is tallied by type and reported.
  const nameOnly: Record<string, number> = {};

  for (let i = 0; i < docs.length; i += BATCH) {
    if (signal?.aborted) break;
    const batch = docs.slice(i, i + BATCH);
    const documents: IngestDocument[] = [];
    for (const doc of batch) {
      const text = documentToText(doc);
      if (!text) continue;
      if (text.trim() === String(doc.name ?? "").trim()) {
        const kind = documentKind(doc);
        nameOnly[kind] = (nameOnly[kind] ?? 0) + 1;
      }
      documents.push({
        text,
        metadata: withImportance(
          {
            sourceName: doc.name ?? "document",
            compendium: packLabel,
            docId: doc.id,
            docType: documentKind(doc),
          },
          IMPORTANCE.ingested,
        ),
      });
    }
    if (documents.length > 0) {
      const res = await client.ingest(silo, documents, embed, signal);
      inserted += res.inserted ?? 0;
      bumpStats({ ingestDocs: res.inserted ?? 0, ingestChunks: res.chunks ?? 0 });
    }
    processed += batch.length;
    onProgress?.({ processed, total: docs.length, inserted });
  }

  const bare = Object.entries(nameOnly);
  if (bare.length > 0) {
    const summary = bare.map(([kind, count]) => `${kind} x${count}`).join(", ");
    warn(
      `ingest: ${packId} produced ${bare.reduce((sum, [, count]) => sum + count, 0)} of ` +
        `${docs.length} documents with no text beyond their name (${summary}). Their content is ` +
        `in a field this extractor does not read; retrieval will match the title and nothing else.`,
    );
  }

  return { documents: docs.length, inserted };
}
