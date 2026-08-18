// Persistence for RAG Lite. Each silo is one JSON file under <mediaFolder>/memory/<silo>.json,
// written through Foundry's FilePicker (same data-filesystem path we use for images) and read
// back with a plain fetch. Vectors are stored as base64-encoded Float32 to keep files compact
// and parsing fast. An in-memory index (Map<silo, records[]>) is loaded lazily on the GM's
// client; retrieval is GM-gated, so only the GM ever holds it.

import { getMediaFolder, ensureMediaFolder } from "../../media/storage";
import type { SiloId } from "../silos";

const MEMORY_SUBFOLDER = "memory";

export interface LocalRecord {
  id: string;
  text: string;
  /** base64-encoded Float32Array of the (unit-normalized) embedding. */
  vec: string;
  /** Cheap content hash for dedupe. */
  hash: string;
  importance: number;
  ts: number;
  entities: string[];
  metadata: Record<string, unknown>;
}

function filePicker(): any {
  const ns = (foundry as any).applications?.apps?.FilePicker;
  return ns ?? (globalThis as any).FilePicker;
}

function memoryFolder(): string {
  return `${getMediaFolder()}/${MEMORY_SUBFOLDER}`;
}

function siloPath(silo: SiloId): string {
  return `${memoryFolder()}/${silo}.json`;
}

// ---- Float32 <-> base64 --------------------------------------------------------------------

export function encodeVec(v: number[] | Float32Array): string {
  const f = v instanceof Float32Array ? v : Float32Array.from(v);
  const bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function decodeVec(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

/** djb2 string hash (as hex) — fast, good enough for chunk dedupe. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

// ---- In-memory index + persistence ---------------------------------------------------------

const cache = new Map<SiloId, LocalRecord[]>();
const loaded = new Set<SiloId>();

/** Resolve a data-relative path to a fetchable URL (respects Foundry's route prefix). */
function routeUrl(path: string): string {
  const getRoute = (foundry as any).utils?.getRoute;
  return typeof getRoute === "function" ? getRoute(path) : `/${path}`;
}

/** A silo that has never been ingested is the normal case, not an error worth a console line. */
async function readSilo(path: string): Promise<LocalRecord[]> {
  try {
    const resp = await fetch(routeUrl(path), { cache: "no-store" });
    if (!resp.ok) return [];
    const data = JSON.parse(await resp.text());
    return Array.isArray(data?.records) ? (data.records as LocalRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * THIS WORLD'S SILOS AND NOTHING ELSE. Silos moved to `worlds/<id>/assets/noodlr-out/memory` with
 * the media folder in v0.7.5, and a read-through to the pre-v0.7.5 shared folder was built and then
 * removed before release on the user's instruction (2026-08-17), for the same reason the capability
 * cache's adoption was: a brand-new campaign silently inheriting the previous one's lore, secrets
 * and `gm_*` entries is a fault that surfaces weeks later as retrieval saying something impossible,
 * with nothing traceable back to an adoption. Worse here than for the cache, because a silo holds
 * the GM's own writing. A world whose corpus is in the old tree re-ingests it.
 */
async function loadSilo(silo: SiloId): Promise<LocalRecord[]> {
  if (loaded.has(silo)) return cache.get(silo) ?? [];
  cache.set(silo, await readSilo(siloPath(silo)));
  loaded.add(silo);
  return cache.get(silo) ?? [];
}

async function saveSilo(silo: SiloId): Promise<void> {
  const fp = filePicker();
  if (!fp?.upload) throw new Error("FilePicker.upload unavailable (need GM upload permission).");
  await ensureMediaFolder(memoryFolder());
  const body = JSON.stringify({ version: 1, silo, records: cache.get(silo) ?? [] });
  const file = new File([body], `${silo}.json`, { type: "application/json" });
  await fp.upload("data", memoryFolder(), file, {}, { notify: false });
}

export async function getRecords(silo: SiloId): Promise<LocalRecord[]> {
  return loadSilo(silo);
}

/** Add records (deduped by hash) to a silo and persist. Returns how many were newly added. */
export async function addRecords(silo: SiloId, incoming: LocalRecord[]): Promise<number> {
  const records = await loadSilo(silo);
  const seen = new Set(records.map((r) => r.hash));
  let added = 0;
  for (const rec of incoming) {
    if (seen.has(rec.hash)) continue;
    seen.add(rec.hash);
    records.push(rec);
    added++;
  }
  if (added > 0) await saveSilo(silo);
  return added;
}

/** Remove records by id and/or content hash; persists. Returns how many were removed. */
export async function removeRecords(
  silo: SiloId,
  sel: { ids?: string[]; hashes?: Array<string | number> },
): Promise<number> {
  const records = await loadSilo(silo);
  const idSet = new Set((sel.ids ?? []).map(String));
  const hashSet = new Set((sel.hashes ?? []).map(String));
  if (idSet.size === 0 && hashSet.size === 0) return 0;
  const kept = records.filter((r) => !idSet.has(r.id) && !hashSet.has(String(r.hash)));
  const removed = records.length - kept.length;
  if (removed > 0) {
    cache.set(silo, kept);
    loaded.add(silo);
    await saveSilo(silo);
  }
  return removed;
}

export async function clearSilo(silo: SiloId): Promise<void> {
  cache.set(silo, []);
  loaded.add(silo);
  await saveSilo(silo);
}

export async function countSilo(silo: SiloId): Promise<number> {
  return (await loadSilo(silo)).length;
}
