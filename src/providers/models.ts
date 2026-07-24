// Live model-list retrieval for the config UI. OpenRouter's model catalog is public
// (no API key required), so we can offer autocomplete suggestions without ever touching a
// stored key. Results are cached for the session to avoid refetching on every window open.

import { OPENROUTER_BASE } from "./types";

// Cache per (modality|sort) so each feature's filtered list is fetched once per session.
const cache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

/**
 * Fetch OpenRouter model ids filtered server-side by output modality (and sorted).
 *
 * The full catalog is ~343 text models, which is overwhelming when picking, say, a TTS or
 * image model. OpenRouter supports server-side filtering via `output_modalities` — verified
 * values: text, image, audio (music), embeddings, speech (TTS), transcription (STT), rerank,
 * video — so each feature only offers viable slugs. Server-side `sort` order is preserved
 * (we don't re-sort) so "newest" / "context-high-to-low" surface the best options first.
 *
 * The catalog is public (no key), so this never touches a stored key. Returns [] on any
 * failure — never throws.
 */
export async function fetchOpenRouterModels(
  modality = "text",
  sort = "newest",
): Promise<string[]> {
  const key = `${modality}|${sort}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const url = new URL(`${OPENROUTER_BASE}/models`);
      url.searchParams.set("output_modalities", modality);
      url.searchParams.set("sort", sort);
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      const ids = list
        .map((m: any) => (typeof m?.id === "string" ? m.id : ""))
        .filter((id: string) => id.length > 0);
      cache.set(key, ids);
      return ids;
    } catch {
      return [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

// Cache the full speech-model objects (they carry per-model `supported_voices`).
let speechModelsCache: any[] | null = null;

/**
 * Fetch the voice names an OpenRouter TTS model actually supports (from the model's
 * `supported_voices` metadata — e.g. mai-voice-2 → ["en-US-Harper:MAI-Voice-2", ...]).
 * Returns [] when the model is unknown or has none listed (caller decides on a fallback).
 * Public catalog — never touches a stored key. Never throws.
 */
export async function fetchOpenRouterVoices(modelId: string): Promise<string[]> {
  const id = modelId.trim();
  if (!id) return [];
  try {
    if (!speechModelsCache) {
      const url = new URL(`${OPENROUTER_BASE}/models`);
      url.searchParams.set("output_modalities", "speech");
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      const json = await res.json();
      speechModelsCache = Array.isArray(json?.data) ? json.data : [];
    }
    const m = (speechModelsCache ?? []).find(
      (x: any) => x?.id === id || x?.canonical_slug === id,
    );
    const voices = m?.supported_voices;
    return Array.isArray(voices) ? voices.filter((v: unknown): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Best-effort model list from a custom OpenAI-compatible endpoint (`GET {base}/models`).
 * Uses the supplied key if provided. Returns [] on any failure — never throws.
 */
export async function fetchCustomModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey && apiKey.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    const res = await fetch(`${base}/models`, { headers });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    return list
      .map((m: any) => (typeof m?.id === "string" ? m.id : ""))
      .filter((id: string) => id.length > 0)
      .sort((a: string, b: string) => a.localeCompare(b));
  } catch {
    return [];
  }
}
