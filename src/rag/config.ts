// RAG (noodlr-memory) settings registration + typed accessors, plus a factory for the
// RagClient and the optional embedding override.

import { MODULE_ID, RAG_SETTINGS } from "../constants";
import { registerFeatureProviderSettings, getFeatureConfig } from "../providers/config";
import { RagClient, type EmbedOverride, type RagConnection } from "./client";
import type { MemoryBackend } from "./backend";
import { getLocalMemory } from "./local/local-memory";
import { DEFAULT_QUERY_SILOS, isSiloId, type SiloId } from "./silos";
import { getRagTarget } from "./target";

export type RagBackendKind = "lite" | "service";

export function registerRagSettings(): void {
  const S = RAG_SETTINGS;
  // All RAG settings are rendered in the consolidated Memory & Knowledge window
  // (config:false), never the native settings list. The shared secret is write-only there.
  const worldBool = { scope: "world" as const, config: false, type: Boolean };
  const worldStr = { scope: "world" as const, config: false, type: String };
  const worldNum = { scope: "world" as const, config: false, type: Number };

  game.settings.register(MODULE_ID, S.enabled, { ...worldBool, default: false });
  // Default to "lite": zero-config in-browser memory works out of the box for non-technical
  // tables. Power users switch to "service" (noodlr-memory) for shared, PDF-capable memory.
  game.settings.register(MODULE_ID, S.backend, { ...worldStr, default: "lite" });
  // How the browser reaches the service. "direct" is the historical behavior and stays the default
  // so upgrading worlds keep the URL they already entered; "proxy" is the recommendation for anyone
  // running the service on a Unix socket or on a host the GM's browser can't address directly.
  game.settings.register(MODULE_ID, S.targetMode, { ...worldStr, default: "direct" });
  game.settings.register(MODULE_ID, S.servicePath, { ...worldStr, default: "/memory" });
  game.settings.register(MODULE_ID, S.serviceUrl, {
    ...worldStr,
    default: "http://127.0.0.1:3010",
  });
  // Client scope (NOT world): the shared secret lives only on the GM's own client and is
  // never synced to player browsers. Only the GM talks to noodlr-memory (see retrieval.ts),
  // so each GM/assistant-GM enters the secret once on their machine. World-scoped settings are
  // broadcast to every client — a secret must never be one.
  game.settings.register(MODULE_ID, S.secret, {
    scope: "client" as const,
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, S.hybrid, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, S.agentMode, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, S.sendEmbedConfig, { ...worldBool, default: false });
  // 0 = use whatever the service was configured with. See the note in constants.ts.
  game.settings.register(MODULE_ID, S.embedBatchSize, { ...worldNum, default: 0 });
  game.settings.register(MODULE_ID, S.embedPaceMs, { ...worldNum, default: 0 });
  // 4000 tokens of retrieved knowledge is a comfortable default for large-context models (200k-1M);
  // topK 8 gives the budget enough candidate chunks to actually fill it (~400-800 tokens each).
  game.settings.register(MODULE_ID, S.tokenBudget, { ...worldNum, default: 4000 });
  game.settings.register(MODULE_ID, S.topK, { ...worldNum, default: 8 });
  // Managed in the Memory window; empty = use DEFAULT_QUERY_SILOS.
  game.settings.register(MODULE_ID, S.querySilos, { ...worldStr, default: "" });

  // Rerank refinement (module-side, after /query). Kept in the module — not noodlr-memory —
  // so the model is configured where it's obvious and swappable if it ever gets deprecated.
  game.settings.register(MODULE_ID, S.rerankEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, S.rerankTopN, { ...worldNum, default: 5 });

  // Web-search fallback (OpenRouter chat only). Off by default. minScore=0 means "fire only when
  // memory returns nothing"; raise it to also fire when the best hit is weak (backend-scaled).
  game.settings.register(MODULE_ID, S.webFallbackEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, S.webFallbackMinScore, { ...worldNum, default: 0 });
  game.settings.register(MODULE_ID, S.webFallbackMaxResults, { ...worldNum, default: 3 });

  // Native Foundry chat-log capture (-> unfiltered_chat silo). Off by default; whispers excluded
  // by default (privacy); 300 s flush interval matches push-to-log.
  game.settings.register(MODULE_ID, S.chatLogEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, S.chatLogInterval, { ...worldNum, default: 300 });
  game.settings.register(MODULE_ID, S.chatLogWhispers, { ...worldBool, default: false });

  // Embedding + rerank providers (used only when their features are enabled).
  registerFeatureProviderSettings("embeddings");
  registerFeatureProviderSettings("rerank");
}

export function isRerankEnabled(): boolean {
  return Boolean(game.settings.get(MODULE_ID, RAG_SETTINGS.rerankEnabled));
}

export function getRerankTopN(): number {
  return Number(game.settings.get(MODULE_ID, RAG_SETTINGS.rerankTopN)) || 5;
}

export interface WebFallbackConfig {
  enabled: boolean;
  /** Fire when the best hit's score is <= this (0 = only when nothing was retrieved). */
  minScore: number;
  /** Max web results to fold into the request. */
  maxResults: number;
}

export function getWebFallbackConfig(): WebFallbackConfig {
  return {
    enabled: Boolean(game.settings.get(MODULE_ID, RAG_SETTINGS.webFallbackEnabled)),
    minScore: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.webFallbackMinScore)) || 0,
    maxResults: Math.max(
      1,
      Math.min(10, Number(game.settings.get(MODULE_ID, RAG_SETTINGS.webFallbackMaxResults)) || 3),
    ),
  };
}

/** Whether a shared secret is stored (for a write-only "saved" placeholder in the UI). */
export function hasRagSecret(): boolean {
  return ((game.settings.get(MODULE_ID, RAG_SETTINGS.secret) as string) ?? "").trim().length > 0;
}

/** Write-only save of the shared secret: blank keeps the existing value; clear wipes it. */
export async function saveRagSecret(newValue: string, clear: boolean): Promise<void> {
  if (clear) {
    await game.settings.set(MODULE_ID, RAG_SETTINGS.secret, "");
    return;
  }
  const v = String(newValue ?? "").trim();
  if (v.length > 0) await game.settings.set(MODULE_ID, RAG_SETTINGS.secret, v);
}

export function getRagConnection(): RagConnection {
  return {
    // Resolved from the target mode: a proxy path becomes an absolute URL on Foundry's own origin,
    // so error messages name something the GM can paste into a browser.
    serviceUrl: getRagTarget().effectiveUrl,
    secret: (game.settings.get(MODULE_ID, RAG_SETTINGS.secret) as string) ?? "",
  };
}

/** Active memory backend: "lite" (in-browser) or "service" (noodlr-memory). */
export function getRagBackend(): RagBackendKind {
  return game.settings.get(MODULE_ID, RAG_SETTINGS.backend) === "service" ? "service" : "lite";
}

/** Factory: the active MemoryBackend. Callers use the shared interface, backend-agnostic. */
export function getRagClient(): MemoryBackend {
  return getRagBackend() === "service" ? new RagClient(getRagConnection()) : getLocalMemory();
}

export function isRagEnabled(): boolean {
  const enabled = game.settings.get(MODULE_ID, RAG_SETTINGS.enabled) as boolean;
  if (!enabled) return false;
  // Lite needs no connection; the service backend needs a URL to be usable.
  if (getRagBackend() === "lite") return true;
  return getRagConnection().serviceUrl.trim().length > 0;
}

/**
 * Build the per-request embedding override.
 *
 * Two independent halves, and conflating them is what left the throttle unreachable. The PROVIDER
 * block (model, URL, key) is opt-in, because sending it means the GM's key leaves their browser for
 * the service, and the default is that keys stay server-side. The THROTTLE (batch size, pacing) is
 * not a credential and is sent whenever the GM has set one — it is the documented first lever
 * against a requests-per-minute limit, and a lever that only works when an unrelated checkbox is on
 * is a lever nobody finds. `resolveEmbedConfig` falls back to the server's own value for every field
 * we omit, so a throttle-only object leaves the provider config exactly as the service has it.
 */
export function getEmbedOverride(): EmbedOverride | undefined {
  const throttle = getEmbedThrottle();
  const send = game.settings.get(MODULE_ID, RAG_SETTINGS.sendEmbedConfig) as boolean;
  if (!send) return Object.keys(throttle).length > 0 ? throttle : undefined;
  const cfg = getFeatureConfig("embeddings");
  if (!cfg.model.trim()) return Object.keys(throttle).length > 0 ? throttle : undefined;
  return {
    ...throttle,
    provider: cfg.provider === "custom" ? "custom" : "openrouter",
    model: cfg.model,
    baseUrl: cfg.baseUrl || undefined,
    apiKey: cfg.apiKey || undefined,
  };
}

/** The throttle fields the GM has actually set; omitted fields keep the service's own defaults. */
function getEmbedThrottle(): Partial<EmbedOverride> {
  const out: Partial<EmbedOverride> = {};
  const batchSize = Number(game.settings.get(MODULE_ID, RAG_SETTINGS.embedBatchSize)) || 0;
  const paceMs = Number(game.settings.get(MODULE_ID, RAG_SETTINGS.embedPaceMs)) || 0;
  if (batchSize > 0) out.batchSize = Math.max(1, Math.min(256, Math.round(batchSize)));
  if (paceMs > 0) out.minIntervalMs = Math.max(0, Math.min(60_000, Math.round(paceMs)));
  return out;
}

export function getQuerySilos(): SiloId[] {
  const raw = (game.settings.get(MODULE_ID, RAG_SETTINGS.querySilos) as string) ?? "";
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SiloId => isSiloId(s));
  return parsed.length > 0 ? parsed : DEFAULT_QUERY_SILOS;
}

export interface ChatLogConfig {
  enabled: boolean;
  /** Flush interval in seconds (clamped 30-3600 elsewhere). */
  intervalSec: number;
  /** Include whispered messages (private by default). */
  includeWhispers: boolean;
}

/** Native Foundry chat-log capture config (feeds the `unfiltered_chat` silo). */
export function getChatLogConfig(): ChatLogConfig {
  return {
    enabled: Boolean(game.settings.get(MODULE_ID, RAG_SETTINGS.chatLogEnabled)),
    intervalSec: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.chatLogInterval)) || 300,
    includeWhispers: Boolean(game.settings.get(MODULE_ID, RAG_SETTINGS.chatLogWhispers)),
  };
}

export function getRagTuning(): { topK: number; hybrid: boolean; tokenBudget: number } {
  return {
    topK: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.topK)) || 8,
    hybrid: (game.settings.get(MODULE_ID, RAG_SETTINGS.hybrid) as boolean) ?? true,
    tokenBudget: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.tokenBudget)) || 4000,
  };
}
