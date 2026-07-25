// RAG Lite: an in-browser MemoryBackend. Same surface as the remote noodlr-memory client, but
// everything runs on the GM's machine — embeddings via the bundled transformers.js model, a
// hybrid (cosine + BM25, RRF-fused) search over per-silo JSON stores in the world's data folder.
// Zero setup, no service, no key; the trade-off is it holds the index in the GM's browser and
// isn't shared across GMs. Power users switch to the noodlr-memory backend instead.

import { log } from "../../constants";
import { RagClientError } from "../client";
import type { MemoryBackend, CollectionsInfo, IngestDocument, QueryOptions, RagHit } from "../backend";
import { SILOS, SILO_IDS, isSiloId, type SiloId } from "../silos";
import { EMBED_MODEL, embedTexts } from "./embedder";
import { chunkText } from "./chunker";
import {
  addRecords,
  clearSilo,
  countSilo,
  decodeVec,
  encodeVec,
  getRecords,
  hashText,
  type LocalRecord,
} from "./store";
import { bm25Scores, cosine, rankByScore, rrf, tokenize } from "./search";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function entitiesOf(meta: Record<string, unknown>): string[] {
  const e = (meta as { entities?: unknown }).entities;
  return Array.isArray(e) ? e.map((x) => String(x)) : [];
}

export class LocalMemory implements MemoryBackend {
  async health(): Promise<{ ok: boolean; backend: string }> {
    return { ok: true, backend: `lite (${EMBED_MODEL})` };
  }

  async collections(): Promise<CollectionsInfo> {
    const stats: Record<string, unknown> = {};
    for (const id of SILO_IDS) stats[id] = { count: await countSilo(id) };
    return { collections: { ...SILOS }, stats };
  }

  async ingest(
    collection: SiloId,
    documents: IngestDocument[],
    _embed?: unknown,
    signal?: AbortSignal,
  ): Promise<{ inserted: number; chunks: number }> {
    if (!isSiloId(collection)) throw new RagClientError(`Unknown silo: ${collection}`);
    const texts: string[] = [];
    const metas: Record<string, unknown>[] = [];
    let docsIn = 0;

    for (const doc of documents) {
      if (signal?.aborted) break;
      const raw = String(doc.text ?? "").trim();
      if (!raw) continue;
      const parts = doc.kind === "event" ? [raw] : chunkText(raw);
      for (const t of parts) {
        texts.push(t);
        metas.push(doc.metadata ?? {});
      }
      docsIn++;
    }
    if (texts.length === 0) return { inserted: 0, chunks: 0 };

    const vecs = await embedTexts(texts);
    const now = Date.now();
    const recs: LocalRecord[] = texts.map((text, i) => ({
      id: uid(),
      text,
      vec: encodeVec(vecs[i] ?? []),
      hash: hashText(text),
      importance: num((metas[i] as { importance?: unknown }).importance),
      ts: num((metas[i] as { ts?: unknown }).ts) || now,
      entities: entitiesOf(metas[i]),
      metadata: metas[i],
    }));

    const added = await addRecords(collection, recs);
    log(`RAG Lite: ingested ${docsIn} doc(s) -> ${added} new chunk(s) into "${collection}"`);
    return { inserted: docsIn, chunks: added };
  }

  async ingestFile(
    collection: SiloId,
    filename: string,
    payload: { fileType: "text"; text: string } | { fileType: "pdf"; data: string },
    embed?: unknown,
    signal?: AbortSignal,
  ): Promise<{ inserted: number; chunks: number }> {
    if (payload.fileType === "pdf") {
      throw new RagClientError(
        "RAG Lite can't read PDFs yet — convert it to a .txt file, or switch to the " +
          "noodlr-memory backend (which parses PDFs server-side).",
      );
    }
    return this.ingest(collection, [{ text: payload.text, metadata: { sourceName: filename } }], embed, signal);
  }

  async query(opts: QueryOptions): Promise<{ hits: RagHit[]; mode: string }> {
    const topK = opts.topK ?? 5;
    const hybrid = opts.hybrid ?? true;
    const mode = hybrid ? "hybrid" : "dense";
    const queries = (
      opts.searchTexts?.length ? opts.searchTexts : opts.searchText ? [opts.searchText] : []
    )
      .map((s) => s.trim())
      .filter(Boolean);
    if (queries.length === 0) return { hits: [], mode };

    // Gather candidates across the requested silos.
    const candidates: LocalRecord[] = [];
    for (const c of opts.collections) {
      if (isSiloId(c)) candidates.push(...(await getRecords(c)));
    }
    if (candidates.length === 0) return { hits: [], mode };

    const byId = new Map(candidates.map((r) => [r.id, r] as const));
    const docTokens = candidates.map((r) => tokenize(r.text));
    const docVecs = candidates.map((r) => decodeVec(r.vec));

    const qVecs = await embedTexts(queries);
    const perQuery: string[][] = [];
    for (let qi = 0; qi < queries.length; qi++) {
      const qv = Float32Array.from(qVecs[qi] ?? []);
      const denseRanked = candidates
        .map((r, i) => ({ id: r.id, s: cosine(qv, docVecs[i]) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id);
      if (hybrid) {
        const bm = bm25Scores(tokenize(queries[qi]), docTokens);
        const sparseRanked = candidates
          .map((r, i) => ({ id: r.id, s: bm[i] }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.id);
        perQuery.push(rankByScore(rrf([denseRanked, sparseRanked])));
      } else {
        perQuery.push(denseRanked);
      }
    }

    const fused = rrf(perQuery);
    const entities = (opts.entities ?? []).map((e) => e.toLowerCase()).filter(Boolean);
    const now = Date.now();
    const scored = [...fused.entries()]
      .map(([id, score]) => {
        const rec = byId.get(id);
        if (!rec) return null;
        let s = score;
        s *= 1 + 0.05 * rec.importance; // importance soft-boost
        const ageDays = (now - rec.ts) / 86_400_000;
        s *= 1 + 0.1 * Math.exp(-ageDays / 30); // gentle recency boost
        if (entities.length) {
          const hay = `${rec.text} ${JSON.stringify(rec.metadata)}`.toLowerCase();
          if (entities.some((e) => hay.includes(e))) s *= 1.25; // entity soft-boost
        }
        return { rec, s };
      })
      .filter((x): x is { rec: LocalRecord; s: number } => x !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, topK);

    const hits: RagHit[] = scored.map((x) => ({
      id: x.rec.id,
      score: x.s,
      text: x.rec.text,
      metadata: x.rec.metadata,
    }));
    return { hits, mode };
  }

  async purge(collection: SiloId): Promise<{ ok: boolean; purged: string }> {
    if (!isSiloId(collection)) throw new RagClientError(`Unknown silo: ${collection}`);
    await clearSilo(collection);
    return { ok: true, purged: collection };
  }
}

let singleton: LocalMemory | null = null;

export function getLocalMemory(): LocalMemory {
  if (!singleton) singleton = new LocalMemory();
  return singleton;
}
