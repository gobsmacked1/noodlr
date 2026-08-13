// Compendium + file ingestion into noodlr-memory. System-agnostic text extraction: we
// never assume a game system's data shape — we pull name + any description-like HTML and
// fall back to a compact JSON of the document's system data.

import { getEmbedOverride, getRagClient } from "./config";
import { type IngestDocument, type IngestResult } from "./client";
import { isRateLimit } from "./failure";
import { IMPORTANCE, withImportance } from "./importance";
import type { IngestReport } from "./ingest-queue";
import { parseStructuredFile, structuredFormatFor } from "./parse-structured";
import type { SiloId } from "./silos";
import { bumpStats } from "../util/stats";
import { debug, warn } from "../constants";

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
  if (typeof doc?.description === "string" && doc.description)
    parts.push(stripHtml(doc.description));

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * First wait after a rate limit, in ms, doubling from there.
 *
 * This was 20s, sized for a per-minute account window on the same reasoning the service used, and the
 * premise turned out to be wrong: an OpenRouter generation log shows a single-text embed returning
 * 200 and another refused ~1.0s later, so the common refusal is momentary saturation upstream rather
 * than a rolled window. A blip that clears in a second does not need a twenty-second park, and
 * parking anyway is what made a working ingest spend its whole budget on waiting. Doubling still
 * reaches a long wait quickly when the limit is real.
 */
const RATE_LIMIT_WAIT_MS = 1_000;
const RATE_LIMIT_WAIT_MAX_MS = 120_000;
/**
 * How long one batch may spend waiting out rate limits before the run gives up and reports.
 *
 * Time rather than a count of attempts, for the reason the service learned the same lesson: a
 * handful of exponential retries all land inside one per-minute window and then quit while the
 * provider is still refusing. Twenty minutes is long enough for any per-minute limit to roll over
 * many times over, and short enough that a key which is out of credit does not hang all evening.
 */
const RATE_LIMIT_BUDGET_MS = 1_200_000;

/**
 * Run one request, waiting out a rate limit rather than failing the whole run.
 *
 * The wait is counted down through `report` because an ingest that sits silent for two minutes is
 * indistinguishable from one that has hung — which is precisely how the previous version presented,
 * right before it reported failure and lost the whole pack.
 */
/**
 * Run `send`, ticking the elapsed seconds while it is in flight.
 *
 * A request that is merely SLOW has to look different from one that is stuck, and it did not: the
 * phase was reported once as "sending" with an empty note and then nothing changed until the reply
 * arrived. That is how a working ingest came to read as hung — the service was absorbing rate-limit
 * waits internally, so the countdown below never fired and the only visible state was a progress bar
 * that had stopped moving. The service now hands a 429 back quickly instead, but the heartbeat is
 * the part that makes any long request honest, whatever the reason.
 */
async function reportWhilePending<T>(
  send: () => Promise<T>,
  report: (r: IngestReport) => void,
): Promise<T> {
  const started = Date.now();
  const tick = () =>
    report({
      phase: "sending",
      note: game.i18n.format("NOODLR.Rag.Queue.Sending", {
        seconds: Math.round((Date.now() - started) / 1000),
      }),
    });
  tick();
  const timer = window.setInterval(tick, 1000);
  try {
    return await send();
  } finally {
    window.clearInterval(timer);
  }
}

async function withPatience<T>(
  send: () => Promise<T>,
  signal: AbortSignal | undefined,
  report: (r: IngestReport) => void,
): Promise<T> {
  let waits = 0;
  let spent = 0;
  for (;;) {
    try {
      return await reportWhilePending(send, report);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (!isRateLimit(err)) throw err;

      waits++;
      const wait = Math.min(RATE_LIMIT_WAIT_MAX_MS, RATE_LIMIT_WAIT_MS * 2 ** (waits - 1));
      if (spent + wait > RATE_LIMIT_BUDGET_MS) throw err;
      spent += wait;
      debug(`ingest rate-limited, waiting ${wait}ms (${spent}ms spent)`);

      const until = Date.now() + wait;
      while (Date.now() < until) {
        if (signal?.aborted) throw err;
        report({
          phase: "waiting",
          note: game.i18n.format("NOODLR.Rag.Queue.RateLimited", {
            seconds: Math.max(1, Math.ceil((until - Date.now()) / 1000)),
            attempt: waits,
          }),
        });
        await sleep(Math.min(1000, Math.max(0, until - Date.now())));
      }
    }
  }
}

export interface IngestCompendiumOptions {
  /** Document index to start from, so a rate-limited or cancelled run can be resumed. */
  from?: number;
  report?: (r: IngestReport) => void;
  signal?: AbortSignal;
}

/**
 * Ingest an entire compendium pack into a silo. Documents are loaded, converted to text,
 * and sent in batches. Returns totals; reports progress (and any rate-limit wait) as it goes.
 */
export async function ingestCompendium(
  packId: string,
  silo: SiloId,
  opts: IngestCompendiumOptions = {},
): Promise<{ documents: number; inserted: number; skipped: number }> {
  const { from = 0, signal } = opts;
  const report = opts.report ?? (() => {});
  const pack = game.packs?.get(packId);
  if (!pack) throw new Error(`Compendium not found: ${packId}`);

  report({ phase: "loading", note: game.i18n.localize("NOODLR.Rag.Queue.Loading") });
  const docs: any[] = await pack.getDocuments();
  const client = getRagClient();
  const embed = getEmbedOverride();
  const packLabel = pack.metadata?.label ?? packId;

  const BATCH = 25;
  let inserted = 0;
  let skipped = 0;
  let processed = from;
  report({ processed, total: docs.length, inserted, resumeAt: from });
  // A document whose text is only its own name was not really read. That is not a failure the
  // service can report — it accepts the row, embeds it, and counts it as inserted — so the count
  // in the UI looks like success. Every silent omission found so far (roll table rows, a
  // creature's embedded items) presented exactly this way, so it is tallied by type and reported.
  const nameOnly: Record<string, number> = {};

  for (let i = from; i < docs.length; i += BATCH) {
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
      const res = await withPatience(
        () => client.ingest(silo, documents, embed, signal),
        signal,
        report,
      );
      inserted += res.inserted ?? 0;
      skipped += res.skipped ?? 0;
      bumpStats({ ingestDocs: res.inserted ?? 0, ingestChunks: res.chunks ?? 0 });
    }
    processed += batch.length;
    // resumeAt is only advanced once the batch is stored, so a resume never skips unsent documents
    // and never re-sends stored ones.
    report({
      processed,
      total: docs.length,
      inserted,
      skipped,
      resumeAt: i + batch.length,
      note: "",
    });
  }

  reportBare(nameOnly, packId, docs.length);
  return { documents: docs.length, inserted, skipped };
}

/**
 * Ingest one uploaded file, with the same rate-limit patience as a compendium.
 *
 * Lives here rather than in the window because it is the same conversation with the same key: an
 * upload that fails on a 429 while a pack is mid-run is the same bug, and the window should not hold
 * a second copy of the wait loop. JSON/YAML/CSV are parsed in the browser into per-record documents
 * so both backends handle them identically; PDF is parsed server-side and RAG Lite refuses it.
 */
export async function ingestUploadedFile(
  file: File,
  silo: SiloId,
  opts: { report?: (r: IngestReport) => void; signal?: AbortSignal } = {},
): Promise<{ documents: number; inserted: number; skipped: number }> {
  const report = opts.report ?? (() => {});
  const { signal } = opts;
  const client = getRagClient();
  const embed = getEmbedOverride();

  report({ phase: "loading", total: 1, note: game.i18n.localize("NOODLR.Rag.Queue.Loading") });

  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  const structured = structuredFormatFor(file.name, file.type);

  let send: () => Promise<IngestResult>;
  if (structured) {
    const parsed = await parseStructuredFile(file);
    if (parsed.length === 0) throw new Error(game.i18n.localize("NOODLR.Rag.StructuredEmpty"));
    const documents = parsed.map((d) => ({
      ...d,
      metadata: withImportance(d.metadata, IMPORTANCE.ingested),
    }));
    report({ total: documents.length });
    send = () => client.ingest(silo, documents, embed, signal);
  } else if (isPdf) {
    const data = await fileToBase64(file);
    send = () =>
      client.ingestFile(
        silo,
        file.name,
        { fileType: "pdf", data },
        embed,
        signal,
        IMPORTANCE.ingested,
      );
  } else {
    const text = await file.text();
    send = () =>
      client.ingestFile(
        silo,
        file.name,
        { fileType: "text", text },
        embed,
        signal,
        IMPORTANCE.ingested,
      );
  }

  const res = await withPatience(send, signal, report);
  bumpStats({ ingestDocs: res.inserted ?? 0, ingestChunks: res.chunks ?? 0 });
  const inserted = res.inserted ?? 0;
  const skipped = res.skipped ?? 0;
  report({ processed: 1, total: 1, inserted, skipped, note: "" });
  return { documents: 1, inserted, skipped };
}

/** Read a file as base64 without its data-URL prefix, for the PDF passthrough. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function reportBare(nameOnly: Record<string, number>, packId: string, total: number): void {
  const bare = Object.entries(nameOnly);
  if (bare.length > 0) {
    const summary = bare.map(([kind, count]) => `${kind} x${count}`).join(", ");
    warn(
      `ingest: ${packId} produced ${bare.reduce((sum, [, count]) => sum + count, 0)} of ` +
        `${total} documents with no text beyond their name (${summary}). Their content is ` +
        `in a field this extractor does not read; retrieval will match the title and nothing else.`,
    );
  }
}
