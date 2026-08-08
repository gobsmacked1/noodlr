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
// Output is one JSON object per line, offered to the GM as a `<pack>.jsonl` download link. Nothing
// is sent anywhere and nothing is written to the game server: the GM saves the files and runs the
// miner outside Foundry.

import { MODULE_ID, log } from "../constants";

export interface ExportProgress {
  pack: string;
  processed: number;
  total: number;
}

export interface ExportResult {
  packId: string;
  packLabel: string;
  documents: number;
  records: number;
  /** Suggested filename; becomes the link's `download` attribute. */
  file: string;
  bytes: number;
  blob: Blob;
}

/**
 * 64-bit-ish content hash, hex, synchronous.
 *
 * Used only to recognize that two documents state the same rule in the same words, so that a trait
 * shared by sixty monsters costs one model call instead of sixty. `crypto.subtle` is async and would
 * turn a tight export loop into a promise storm for no benefit; collision risk across a corpus of
 * tens of thousands of strings is negligible at this width.
 */
function hashText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(h1)}${hex(h2)}`;
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
 * Every field a rule might be written in, in one string.
 *
 * Chat flavor is labelled rather than merged, because a non-empty one is signal S5: it reads like a
 * stage direction for the GM ("On Hit: Target pushed 15 feet away."), which is precisely a rule the
 * schema could not hold. Losing the distinction would cost the miner that signal.
 *
 * The field moved. In dnd5e 5.x the item carries `description.chat` and the *activity* carries
 * `description.chatFlavor` — verified against the 5.3.3 pack sources, where every `chatFlavor:` hit
 * sits under an activity and items expose `chat:` instead. Reading only `description.chatFlavor` off
 * the item, as the first version of this file did, finds nothing anywhere. All spellings are
 * collected because the cost of covering them is nil and the cost of guessing wrong is a dead signal
 * that still looks alive.
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
    ["Chat flavor: ", description.chat],
    ["Chat flavor: ", system.chatFlavor],
  ] as const) {
    const text = stripHtml(String(value ?? ""));
    if (text) parts.push(`${label}${text}`);
  }

  for (const activity of activityObjects(system)) {
    const flavor = stripHtml(String(activity?.description?.chatFlavor ?? ""));
    if (flavor) parts.push(`Chat flavor: ${flavor}`);
  }

  // Journal pages are deliberately absent here; each is its own record. See toCorpusRecords.
  return parts.join("\n\n").trim();
}

/** Activities are a Collection on a live document and a plain keyed object on a raw source. */
function activityObjects(system: any): any[] {
  const raw = system?.activities;
  if (!raw) return [];
  const list: any[] = typeof raw.forEach === "function" ? [...raw] : Object.values(raw);
  return list.map((a) => (typeof a?.toObject === "function" ? a.toObject() : a));
}

/**
 * Flatten a document's activities to the fields that decide enforcement.
 *
 * The type is the important part: the closed list (attack, cast, check, damage, enchant, forward,
 * heal, save, summon, transform, utility) contains no verb that moves a creature, which is signal S7
 * and the reason forced movement is inexpressible rather than merely unimplemented.
 */
function collectActivities(system: any): unknown[] {
  return activityObjects(system).map((a: any) => ({
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
    description: a?.description ?? null,
  }));
}

/**
 * How the thing is used, read rather than inferred.
 *
 * In dnd5e 5.x activation moved off the item and into each activity, so Action versus Bonus Action
 * versus Reaction versus Legendary Action is `activity.activation.type` — structured, authored, and
 * the exact taxonomy a statblock prints. A feature with no activity at all is passive; one whose
 * activation type is blank is a trait that exists to be read.
 */
function activationOf(system: any): string {
  const activities = activityObjects(system);
  if (activities.length === 0) return "passive";
  for (const a of activities) {
    const type = String(a?.activation?.type ?? "").trim();
    if (type) return type;
  }
  return "passive";
}

/** Provenance, for precedence ordering and for the runtime licence gate. */
function sourceOf(system: any, packageName: string): Record<string, unknown> {
  const source = system?.source ?? {};
  return {
    // The Foundry module id. This is what `noodlr-hooks-55e` checks with `game.modules.get(id)`
    // before applying a rule, so a table never enforces content the operator has not bought.
    sourceBook: packageName,
    // The publisher's own book name where the pack bothers to fill it in. Empty throughout the SRD
    // content, commonly set in premium modules; treated as a label, never as the gate.
    bookTitle: String(source.book ?? "") || null,
    license: String(source.license ?? "") || null,
    // '2014' or '2024'. The edition split the precedence order encodes.
    rulesEdition: String(source.rules ?? "") || null,
    revision: source.revision ?? null,
  };
}

/**
 * The subset of a creature that gives its features meaning.
 *
 * "Restrained until the end of its next turn" is not a rule until you know whose turn, how big it
 * is, and what it is immune to. Every embedded record carries this so the miner never has to resolve
 * a parent it cannot see.
 */
function holderContext(doc: any, system: any): Record<string, unknown> {
  const traits = system?.traits ?? {};
  const attributes = system?.attributes ?? {};
  const details = system?.details ?? {};
  return {
    uuid: doc?.uuid ?? null,
    name: doc?.name ?? "",
    documentType: doc?.type ?? null,
    cr: details?.cr ?? null,
    creatureType: details?.type ?? null,
    size: traits?.size ?? null,
    ac: attributes?.ac ?? null,
    hp: attributes?.hp ?? null,
    movement: attributes?.movement ?? null,
    senses: attributes?.senses ?? null,
    // Already structured, and dnd5e applies these during damage application — so they are evidence
    // of enforcement rather than rules to mine.
    damageImmunities: traits?.di ?? null,
    damageResistances: traits?.dr ?? null,
    damageVulnerabilities: traits?.dv ?? null,
    damageModification: traits?.dm ?? null,
    conditionImmunities: traits?.ci ?? null,
    languages: traits?.languages ?? null,
    important: traits?.important ?? null,
    legendaryActions: system?.resources?.legact ?? null,
    legendaryResistance: system?.resources?.legres ?? null,
    lair: system?.resources?.lair ?? null,
  };
}

/**
 * The chapter a rule page was printed in.
 *
 * Much thinner than a creature's context because a rule stands alone in a way a trait does not, but
 * the entry name is still the difference between "Hide" the action and "Hide" the hit-point sack:
 * one is a page of "Actions", the other of "Monsters A to Z".
 */
function journalHolderContext(doc: any): Record<string, unknown> {
  return {
    uuid: doc?.uuid ?? null,
    name: doc?.name ?? "",
    documentType: "JournalEntry",
  };
}

interface RecordContext {
  packId: string;
  packLabel: string;
  packageName: string;
}

/** One corpus line. Field names are the miner's contract; see noodlr-rules-corpus/AGENTS.md. */
function baseRecord(
  doc: any,
  source: any,
  system: any,
  prose: string,
  ctx: RecordContext,
): Record<string, unknown> {
  return {
    uuid: doc?.uuid ?? `${ctx.packId}.${source?._id ?? ""}`,
    packId: ctx.packId,
    packLabel: ctx.packLabel,
    ...sourceOf(system, ctx.packageName),
    name: source?.name ?? "",
    type: source?.type ?? doc?.documentName ?? "",
    // An item states its subtype as `{value}`; a dnd5e rule page states it as a bare string, and it
    // is the field that separates a condition page from an ordinary rule page.
    subtype: (typeof system?.type === "string" ? system.type : system?.type?.value) ?? null,
    identifier: system?.identifier ?? null,
    // Where this copy came from, when it is a copy. A monster's Pack Tactics points back at the
    // Monster Manual's feature; an adventure module's reprint of a spell points back at the book it
    // was lifted from. That makes "the same rule twice" distinguishable from "this book revised the
    // rule", which is the difference precedence ordering has to get right or a stale reprint quietly
    // outranks the current text.
    compendiumSource: source?._stats?.compendiumSource ?? null,
    activation: activationOf(system),
    prose,
    // Recognizes the same rule stated in the same words on a different sheet. Pack Tactics is
    // byte-identical across every creature that has it — the templated `[[lookup @name]]` enricher
    // is what keeps it so — and mining it once instead of sixty times is most of the saving on the
    // monster half of the corpus.
    proseHash: hashText(prose),
    data: system,
    activities: collectActivities(system),
    effects: Array.isArray(source?.effects) ? source.effects : [],
  };
}

/**
 * Expand one compendium document into the records the miner should reason over.
 *
 * The mining unit is whatever holds a single rule, and for a creature that is not the creature. A
 * monster's traits, actions, bonus actions, reactions and legendary actions are embedded Items in a
 * sibling `items[]` array, not fields of `system` — in the SRD Aboleth, `system` ends at line 551
 * and `items` runs past 1,900. Exporting the actor alone yields a name, a challenge rating and a
 * paragraph of atmosphere, with every mechanic silently discarded.
 */
function toCorpusRecords(doc: any, ctx: RecordContext): Array<Record<string, unknown>> {
  const source = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  const system = source?.system ?? {};
  const records: Array<Record<string, unknown>> = [];

  // A document with no prose asserts no rule in words, so there is nothing to compare against the
  // schema. Skipping the holder does not skip its items: most statblocks carry no biography at all.
  const prose = collectProse(doc);
  if (prose) records.push(baseRecord(doc, source, system, prose, ctx));

  // Journal pages, on exactly the same principle as a creature's items and for a source that matters
  // more: the 2024 Rules Glossary is ONE JournalEntry holding a page per condition, and "Actions" is
  // one holding a page per action. Concatenating them produced a single record named "Rules Glossary"
  // — Concentration, Incapacitated and Opportunity Attack were all in the corpus and none of them was
  // findable, citable, or small enough to survive a data budget. This is the most valuable prose in
  // the whole corpus, because it is the rules text itself rather than a creature's use of it.
  const pages: any[] = typeof doc?.pages?.forEach === "function" ? [...doc.pages] : [];
  if (pages.length > 0) {
    const entry = journalHolderContext(doc);
    for (const page of pages) {
      const pageSource = typeof page?.toObject === "function" ? page.toObject() : page;
      const pageProse = stripHtml(String(pageSource?.text?.content ?? ""));
      if (!pageProse) continue;
      const pageSystem = pageSource?.system ?? {};
      records.push({
        ...baseRecord(page, pageSource, pageSystem, pageProse, ctx),
        uuid: page?.uuid ?? `${doc?.uuid ?? ctx.packId}.JournalEntryPage.${pageSource?._id ?? ""}`,
        holder: entry,
      });
    }
  }

  const embedded: any[] = typeof doc?.items?.forEach === "function" ? [...doc.items] : [];
  if (embedded.length === 0) return records;

  const holder = holderContext(doc, system);
  for (const item of embedded) {
    const itemSource = typeof item?.toObject === "function" ? item.toObject() : item;
    const itemSystem = itemSource?.system ?? {};
    const itemProse = collectProse(item);
    if (!itemProse) continue;
    records.push({
      ...baseRecord(item, itemSource, itemSystem, itemProse, ctx),
      uuid: item?.uuid ?? `${doc?.uuid ?? ctx.packId}.Item.${itemSource?._id ?? ""}`,
      holder,
    });
  }

  return records;
}

/** Filesystem-safe name for a pack id like `dnd-players-handbook.spells`. */
function fileNameFor(packId: string): string {
  return `${packId.replace(/[^A-Za-z0-9._-]+/g, "_")}.jsonl`;
}

/**
 * Build one pack's file. Returns null when the pack yields no prose-bearing documents.
 *
 * Produces a Blob and stops there rather than triggering the save itself. v0.5.2 clicked a
 * synthetic anchor per pack and lost almost everything: browsers block a burst of programmatic
 * downloads, so Firefox saved the first file and silently dropped the rest, and because the anchor
 * was removed in the same tick as the click it never read the `download` attribute either — the one
 * file that did arrive was named `2jfYE0kS` with no extension. Neither is fixable with a delay,
 * because the user gesture that would authorize the saves is long gone by the time the first
 * `getDocuments()` resolves. The caller renders a real link the GM clicks, which is a genuine user
 * gesture every time and cannot be throttled or renamed.
 *
 * The blob is built from an array of parts rather than one joined string: a pack runs to tens of
 * megabytes and joining it first would double the peak allocation for no reason.
 */
export async function exportPack(
  packId: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult | null> {
  const pack = game.packs?.get(packId);
  if (!pack) throw new Error(`Compendium not found: ${packId}`);

  const ctx: RecordContext = {
    packId,
    packLabel: pack.metadata?.label ?? packId,
    packageName: pack.metadata?.packageName ?? packId.split(".")[0] ?? "",
  };
  const docs: any[] = await pack.getDocuments();

  const parts: string[] = [];
  let processed = 0;
  for (const doc of docs) {
    for (const record of toCorpusRecords(doc, ctx)) parts.push(`${JSON.stringify(record)}\n`);
    processed++;
    if (processed % 100 === 0) onProgress?.({ pack: ctx.packLabel, processed, total: docs.length });
  }
  onProgress?.({ pack: ctx.packLabel, processed, total: docs.length });

  if (parts.length === 0) return null;

  const blob = new Blob(parts, { type: "application/x-ndjson" });
  log(`rules-corpus: built ${parts.length} records from ${docs.length} documents in ${packId}`);
  return {
    packId,
    packLabel: ctx.packLabel,
    documents: docs.length,
    records: parts.length,
    file: fileNameFor(packId),
    bytes: blob.size,
    blob,
  };
}

/**
 * Build several packs in sequence. Individual failures are reported and do not stop the run.
 *
 * `onReady` fires as each pack finishes so its link can be offered immediately, rather than making
 * the GM watch a spinner through the whole set before anything is clickable.
 */
export async function exportPacks(
  packIds: string[],
  onProgress?: (p: ExportProgress) => void,
  onReady?: (result: ExportResult) => void,
): Promise<{ results: ExportResult[]; failures: Array<{ packId: string; error: string }> }> {
  const results: ExportResult[] = [];
  const failures: Array<{ packId: string; error: string }> = [];

  for (const packId of packIds) {
    try {
      const result = await exportPack(packId, onProgress);
      if (result) {
        results.push(result);
        onReady?.(result);
      }
      // Yield to the event loop so the link that was just added actually paints before the next
      // pack monopolizes the main thread for several seconds.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (err) {
      failures.push({ packId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results, failures };
}

export const _internal = {
  stripHtml,
  collectProse,
  collectActivities,
  activationOf,
  holderContext,
  sourceOf,
  hashText,
  toCorpusRecords,
  MODULE_ID,
};
