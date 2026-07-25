// Clean-room hybrid search primitives for RAG Lite: a tiny BM25 over the silo's texts, cosine
// over the stored embeddings, and Reciprocal Rank Fusion to blend the two ranked lists (and to
// blend multiple sub-queries in Agent Mode). Corpora are small (a table's worth of chunks per
// silo on a typical table), so recomputing IDF per query is cheap and keeps the store simple.

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were",
  "be", "as", "at", "by", "it", "this", "that", "with", "from", "into", "his", "her", "their",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** BM25 relevance of `query` against each document (already tokenized). Returns score per doc. */
export function bm25Scores(queryTokens: string[], docTokens: string[][]): number[] {
  const N = docTokens.length;
  if (N === 0) return [];
  const k1 = 1.5;
  const b = 0.75;
  const df = new Map<string, number>();
  const docLen = docTokens.map((toks) => toks.length);
  const avgdl = docLen.reduce((a, c) => a + c, 0) / N || 1;

  const tf: Array<Map<string, number>> = docTokens.map((toks) => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return m;
  });

  const qset = [...new Set(queryTokens)];
  return docTokens.map((_, i) => {
    let score = 0;
    for (const q of qset) {
      const n = df.get(q);
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const f = tf[i].get(q) ?? 0;
      if (f === 0) continue;
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * docLen[i]) / avgdl)));
    }
    return score;
  });
}

/** Cosine similarity of two unit-ish vectors (dot product; vectors are stored normalized). */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Fuse ranked lists (each an ordered array of item ids, best first) via Reciprocal Rank Fusion.
 * Returns a Map<id, fusedScore>. k=60 is the conventional RRF constant.
 */
export function rrf(rankedLists: string[][], k = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank];
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return fused;
}

/** Order ids best-first from a score map. */
export function rankByScore(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
