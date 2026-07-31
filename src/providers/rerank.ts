// Rerank client for OpenRouter's (OpenAI-adjacent) POST /rerank endpoint. A cross-encoder
// re-scores retrieved documents against the query for precision — a token-saver, since we can
// then inject fewer, more-relevant chunks into the DM prompt. Kept module-side (not in
// noodlr-memory) so the model is configured where users can see and swap it.
//
// Request:  { model, query, documents: string[], top_n }
// Response: { results: [{ index, relevance_score, document:{text} }] }  (sorted by relevance)

import { debug, warn } from "../constants";
import { getFeatureConfig } from "./config";
import { isConfigured, resolveBaseUrl } from "./types";

/**
 * Rerank is a pure optimization, so a failing endpoint must never break retrieval. But silently
 * swallowing every error meant a misconfigured account produced an unexplained 404 in the network
 * tab and nothing else. We now explain the failure once per session per reason, then stay quiet.
 */
const reported = new Set<string>();

function reportOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  warn(message);
}

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
    if (!res.ok) {
      // Read the provider's own explanation — OpenRouter returns a useful message body (e.g. a
      // privacy/guardrail policy that blocks every endpoint for the chosen rerank model).
      let detail = "";
      try {
        const body = await res.json();
        detail = String(body?.error?.message ?? body?.message ?? "").trim();
      } catch {
        /* non-JSON error body; the status alone will have to do */
      }
      const hint =
        res.status === 404
          ? " Either the model isn't a rerank model, or your provider account blocks every endpoint that serves it (OpenRouter: check Settings -> Privacy / data policy). Retrieval continues without rerank — you can turn rerank off in Memory & Knowledge to silence this."
          : " Retrieval continues without rerank.";
      reportOnce(
        `${res.status}:${detail}`,
        `rerank unavailable (HTTP ${res.status}${detail ? `: ${detail}` : ""}).${hint}`,
      );
      return null;
    }
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((r: any) => ({
        index: Number(r?.index),
        score: Number(r?.relevance_score ?? r?.score ?? 0),
      }))
      .filter((r: RerankResult) => Number.isInteger(r.index) && r.index >= 0);
  } catch (err) {
    // Aborts are routine (the user cancelled the turn); anything else is worth one warning.
    if ((err as Error)?.name === "AbortError") {
      debug("rerank aborted");
      return null;
    }
    reportOnce("network", `rerank request failed: ${String(err)}. Retrieval continues without it.`);
    return null;
  }
}
