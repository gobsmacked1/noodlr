// Live model-list retrieval for the config UI. OpenRouter's model catalog is public
// (no API key required), so we can offer autocomplete suggestions without ever touching a
// stored key. Results are cached for the session to avoid refetching on every window open.

import { OPENROUTER_BASE } from "./types";

let cache: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

/** Fetch OpenRouter's model ids (sorted). Returns [] on any failure — never throws. */
export async function fetchOpenRouterModels(): Promise<string[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/models`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      const ids = list
        .map((m: any) => (typeof m?.id === "string" ? m.id : ""))
        .filter((id: string) => id.length > 0)
        .sort((a: string, b: string) => a.localeCompare(b));
      cache = ids;
      return ids;
    } catch {
      return [];
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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
