// Rerank client for OpenRouter's (OpenAI-adjacent) POST /rerank endpoint. A cross-encoder
// re-scores retrieved documents against the query for precision — a token-saver, since we can
// then inject fewer, more-relevant chunks into the DM prompt. Kept module-side (not in
// noodlr-memory) so the model is configured where users can see and swap it.
//
// Request:  { model, query, documents: string[], top_n }
// Response: { results: [{ index, relevance_score, document:{text} }] }  (sorted by relevance)

import { getFeatureConfig } from "./config";
import { isConfigured, resolveBaseUrl } from "./types";

export interface RerankResult {
  /** Index into the original documents array. */
  index: number;
  /** Relevance score (higher = better). */
  score: number;
}

/**
 * Rerank documents against a query. Returns results sorted by relevance (highest first), or
 * null when rerank isn't configured / fails — callers then keep the original order. Never throws.
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN: number,
  signal?: AbortSignal,
): Promise<RerankResult[] | null> {
  const cfg = getFeatureConfig("rerank");
  if (!isConfigured(cfg) || documents.length === 0) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey.trim()) headers["Authorization"] = `Bearer ${cfg.apiKey.trim()}`;
    const res = await fetch(`${resolveBaseUrl(cfg)}/rerank`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model,
        query,
        documents,
        top_n: Math.min(Math.max(1, topN), documents.length),
      }),
      signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((r: any) => ({
        index: Number(r?.index),
        score: Number(r?.relevance_score ?? r?.score ?? 0),
      }))
      .filter((r: RerankResult) => Number.isInteger(r.index) && r.index >= 0);
  } catch {
    return null;
  }
}
