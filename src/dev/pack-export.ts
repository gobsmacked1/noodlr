// Developer-only: export compendium packs as JSONL for the offline rules miner.
//
// This is NOT an ingestion path and deliberately shares no code with `rag/ingest.ts`. That module's
// `documentToText()` reduces a document to its name plus a stripped description and truncates the
// system data with `JSON.stringify(doc.system).slice(0, 4000)` — exactly right for an embedding, and
// fatal here.
//
// The miner's entire method is comparing what the prose promises against what the schema can hold,
// so it needs both sides complete and separate: prose as prose, structured data as structured data,
// nothing summarized and nothing cut off. A truncated `system` would make the miner report enforced
// rules as unenforced, which is the one error that would waste the most time downstream.
//
// Output is one JSON object per line under `<mediaFolder>/rules-corpus/<pack>.jsonl`. Nothing is
// sent anywhere: the GM downloads the files and runs the miner outside Foundry.

import { MODULE_ID, log } from "../constants";
import { getMediaFolder, ensureMediaFolder } from "../media/storage";

const SUBFOLDER = "rules-corpus";

export interface ExportProgress {
  pack: string;
  processed: number;
  total: number;
}

export interface ExportResult {
  packId: string;
  documents: number;
  path: string;
  bytes: number;
}

/** Strip HTML to plain text using a detached element, preserving block breaks. */
function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html);
  // Enrichers carry the mechanics we care about (`[[/save ...]]`, `&Reference[...]`) and survive as
  // text, so no special handling is needed here — but block tags must not weld sentences together,
  // because the miner quotes spans and a run-on span will not match the source it came from.
  tmp.querySelectorAll("br, p, div, li, tr, h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.append(document.createTextNode("\n"));
  });
  return (tmp.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Everything a rule might be written in, in one string.
 *
 * `chatFlavor` is included and labelled rather than merged, because a non-empty one is signal S5:
 * only 129 of 4,674 dnd5e content files have one, and when present it reads like a stage direction
 * for the GM ("On Hit: Target pushed 15 feet away.") — which is precisely a rule the schema could
 * not hold. Losing the distinction between it and the description would cost the miner that signal.
 */
function collectProse(doc: any): string {
  const parts: string[] = [];

  const system = doc?.system ?? {};
  const description = system.description ?? {};
  for (const [label, value] of [
    ["", description.value],
    ["", system.details?.biography?.value],
    ["", description.unidentified],
    ["Chat flavor: ", description.chatFlavor],
  ] as const) {
    const text = stripHtml(String(value ?? ""));
    if (text) parts.push(`${label}${text}`);
  }

  // JournalEntry pages: the rules glossary lives here, and it is where the prose-only rules are.
  const pages = doc?.pages;
  if (pages && typeof pages.forEach === "function") {
    pages.forEach((page: any) => {
      const content = stripHtml(String(page?.text?.content ?? ""));
      if (!content) return;
      parts.push(page?.name ? `## ${page.name}\n${content}` : content);
    });
  }

  return parts.join("\n\n").trim();
}

/**
 * Flatten a document's activities to the fields that decide enforcement.
 *
 * Activities are a Collection in dnd5e 4+ and a plain object when read from a raw source object, so
 * both shapes are handled. The type is the important part: the closed list (attack, cast, check,
 * damage, enchant, forward, heal, save, summon, transform, utility) contains no verb that moves a
 * creature, which is signal S7 and the reason forced movement is inexpressible rather than merely
 * unimplemented.
 */
function collectActivities(system: any): unknown[] {
  const raw = system?.activities;
  if (!raw) return [];
  const list: any[] = typeof raw.forEach === "function" ? [...raw] : Object.values(raw);
  return list.map((activity: any) => {
    const a = typeof activity?.toObject === "function" ? activity.toObject() : activity;
    return {
      id: a?._id ?? a?.id ?? null,
      type: a?.type ?? null,
      name: a?.name ?? null,
      activation: a?.activation ?? null,
      consumption: a?.consumption ?? null,
      duration: a?.duration ?? null,
      range: a?.range ?? null,
      target: a?.target ?? null,
      damage: a?.damage ?? null,
      save: a?.save ?? null,
      check: a?.check ?? null,
      effects: a?.effects ?? null,
    };
  });
}

/** One corpus line. Field names are the miner's contract; see noodlr-rules-corpus/AGENTS.md. */
function toCorpusRecord(
  doc: any,
  packId: string,
  packLabel: string,
): Record<string, unknown> | null {
  const source = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  const system = source?.system ?? {};
  const prose = collectProse(doc);

  // A document with no prose asserts no rule in words, so there is nothing for the miner to compare
  // against the schema. Skipping them here rather than in the miner saves the tokens.
  if (!prose) return null;

  return {
    uuid: doc?.uuid ?? `${packId}.${source?._id ?? ""}`,
    packId,
    packLabel,
    name: source?.name ?? "",
    type: source?.type ?? doc?.documentName ?? "",
    identifier: system?.identifier ?? null,
    prose,
    data: system,
    activities: collectActivities(system),
    effects: Array.isArray(source?.effects) ? source.effects : [],
  };
}

function filePickerClass(): any {
  return (
    (foundry as any)?.applications?.apps?.FilePicker?.implementation ??
    (globalThis as any).FilePicker
  );
}

function corpusFolder(): string {
  return `${getMediaFolder()}/${SUBFOLDER}`;
}

/** Filesystem-safe name for a pack id like `dnd-players-handbook.spells`. */
function fileNameFor(packId: string): string {
  return `${packId.replace(/[^A-Za-z0-9._-]+/g, "_")}.jsonl`;
}

/**
 * Export one pack to a JSONL file. Returns null when the pack yields no prose-bearing documents.
 */
export async function exportPack(
  packId: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult | null> {
  const pack = game.packs?.get(packId);
  if (!pack) throw new Error(`Compendium not found: ${packId}`);

  const fp = filePickerClass();
  if (!fp?.upload) throw new Error("FilePicker.upload unavailable (need GM upload permission).");

  const label = pack.metadata?.label ?? packId;
  const docs: any[] = await pack.getDocuments();

  const lines: string[] = [];
  let processed = 0;
  for (const doc of docs) {
    const record = toCorpusRecord(doc, packId, label);
    if (record) lines.push(JSON.stringify(record));
    processed++;
    if (processed % 100 === 0) onProgress?.({ pack: label, processed, total: docs.length });
  }
  onProgress?.({ pack: label, processed, total: docs.length });

  if (lines.length === 0) return null;

  const folder = corpusFolder();
  await ensureMediaFolder(folder);
  const body = `${lines.join("\n")}\n`;
  const name = fileNameFor(packId);
  const file = new File([body], name, { type: "application/x-ndjson" });
  await fp.upload("data", folder, file, {}, { notify: false });

  log(`rules-corpus: exported ${lines.length} documents from ${packId}`);
  return { packId, documents: lines.length, path: `${folder}/${name}`, bytes: body.length };
}

/** Export several packs in sequence. Individual failures are reported and do not stop the run. */
export async function exportPacks(
  packIds: string[],
  onProgress?: (p: ExportProgress) => void,
): Promise<{ results: ExportResult[]; failures: Array<{ packId: string; error: string }> }> {
  const results: ExportResult[] = [];
  const failures: Array<{ packId: string; error: string }> = [];

  for (const packId of packIds) {
    try {
      const result = await exportPack(packId, onProgress);
      if (result) results.push(result);
    } catch (err) {
      failures.push({ packId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results, failures };
}

/** Console entry point: `game.modules.get("noodlr").api.exportPacks([...])`. */
export function corpusFolderPath(): string {
  return corpusFolder();
}

export const _internal = { stripHtml, collectProse, collectActivities, toCorpusRecord, MODULE_ID };
