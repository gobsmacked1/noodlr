// Lightweight, client-scoped usage counters so advanced users can SEE what the complex features
// are doing instead of taking it on faith: how many chat turns, how many tokens, how much memory
// was retrieved vs. actually injected, how often rerank ran and how much it trimmed, and how many
// documents were ingested. Persisted per-client (survives reloads); debounced writes.

import { MODULE_ID, log } from "../constants";

const KEY = "diagnostics.stats";

export interface StatCounters {
  chatTurns: number;
  promptTokens: number;
  completionTokens: number;
  ragQueries: number;
  /** Total hits returned by memory across all queries (pre-rerank). */
  ragHits: number;
  /** Characters of memory context actually injected into prompts (~4 chars/token). */
  ragInjectedChars: number;
  rerankCalls: number;
  /** Total chunks kept after rerank (compare with ragHits to see the trim). */
  rerankKept: number;
  /** Times the low-confidence web-search fallback fired (OpenRouter chat only). */
  webFallbacks: number;
  /** Assembled DM-prompt size samples (estimator tokens), for avg/peak vs the context budget. */
  ctxSentCount: number;
  ctxSentSum: number;
  ctxSentPeak: number;
  ingestDocs: number;
  ingestChunks: number;
  images: number;
  music: number;
  video: number;
  /** Epoch ms of the last reset (start of the current measurement window). */
  since: number;
}

function blank(): StatCounters {
  return {
    chatTurns: 0,
    promptTokens: 0,
    completionTokens: 0,
    ragQueries: 0,
    ragHits: 0,
    ragInjectedChars: 0,
    rerankCalls: 0,
    rerankKept: 0,
    webFallbacks: 0,
    ctxSentCount: 0,
    ctxSentSum: 0,
    ctxSentPeak: 0,
    ingestDocs: 0,
    ingestChunks: 0,
    images: 0,
    music: 0,
    video: 0,
    since: Date.now(),
  };
}

let cache: StatCounters | null = null;
let saveTimer: number | null = null;

/** Register the client-scoped storage setting. Call once during init. */
export function registerStatsSettings(): void {
  game.settings.register(MODULE_ID, KEY, {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
}

function load(): StatCounters {
  if (cache) return cache;
  let next: StatCounters;
  try {
    const raw = (game.settings.get(MODULE_ID, KEY) as string) || "{}";
    next = { ...blank(), ...JSON.parse(raw) };
  } catch {
    next = blank();
  }
  cache = next;
  return next;
}

function persist(): void {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    game.settings
      .set(MODULE_ID, KEY, JSON.stringify(cache))
      .catch((err: unknown) => log("stats save:", err));
  }, 1000);
}

/** Add to one or more counters. Unknown/undefined patch values are ignored. */
export function bumpStats(patch: Partial<StatCounters>): void {
  // Settings may not be registered yet (e.g. very early). Guard so counters never throw.
  if (!game.settings?.settings?.has?.(`${MODULE_ID}.${KEY}`)) return;
  const s = load();
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "number" && k in s) (s as any)[k] += v;
  }
  persist();
}

/**
 * Record the estimated size (in estimator tokens) of one assembled DM prompt actually sent to the
 * model. Kept separate from `bumpStats` because it needs a running max (peak), not a sum. This is
 * measured with the same ~4-char/token estimator the context budget uses, so avg/peak are directly
 * comparable to the configured budget — the DM can see how close each turn runs to the ceiling.
 */
export function noteContextEst(tokens: number): void {
  if (!game.settings?.settings?.has?.(`${MODULE_ID}.${KEY}`)) return;
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const s = load();
  s.ctxSentCount += 1;
  s.ctxSentSum += tokens;
  if (tokens > s.ctxSentPeak) s.ctxSentPeak = tokens;
  persist();
}

export function snapshotStats(): StatCounters {
  return { ...load() };
}

export async function resetStats(): Promise<void> {
  cache = blank();
  await game.settings.set(MODULE_ID, KEY, JSON.stringify(cache));
}
