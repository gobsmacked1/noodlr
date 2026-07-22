// RAG (noodlr-memory) settings registration + typed accessors, plus a factory for the
// RagClient and the optional embedding override.

import { MODULE_ID, RAG_SETTINGS } from "../constants";
import { registerFeatureProviderSettings, getFeatureConfig } from "../providers/config";
import { RagClient, type EmbedOverride, type RagConnection } from "./client";
import { DEFAULT_QUERY_SILOS, isSiloId, type SiloId } from "./silos";

export function registerRagSettings(): void {
  const S = RAG_SETTINGS;
  const L = (s: string) => `NOODLR.Rag.${s}`;

  game.settings.register(MODULE_ID, S.enabled, {
    name: L("Enabled.Name"),
    hint: L("Enabled.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, S.serviceUrl, {
    name: L("ServiceUrl.Name"),
    hint: L("ServiceUrl.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "http://127.0.0.1:3010",
  });
  game.settings.register(MODULE_ID, S.secret, {
    name: L("Secret.Name"),
    hint: L("Secret.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, S.hybrid, {
    name: L("Hybrid.Name"),
    hint: L("Hybrid.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, S.agentMode, {
    name: L("AgentMode.Name"),
    hint: L("AgentMode.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, S.sendEmbedConfig, {
    name: L("SendEmbedConfig.Name"),
    hint: L("SendEmbedConfig.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, S.tokenBudget, {
    name: L("TokenBudget.Name"),
    hint: L("TokenBudget.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1500,
  });
  game.settings.register(MODULE_ID, S.topK, {
    name: L("TopK.Name"),
    hint: L("TopK.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 5,
  });
  // Managed in the Memory window; empty = use DEFAULT_QUERY_SILOS.
  game.settings.register(MODULE_ID, S.querySilos, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  // Embedding provider (used only when sendEmbedConfig is on).
  registerFeatureProviderSettings("embeddings");
}

export function getRagConnection(): RagConnection {
  return {
    serviceUrl: (game.settings.get(MODULE_ID, RAG_SETTINGS.serviceUrl) as string) ?? "",
    secret: (game.settings.get(MODULE_ID, RAG_SETTINGS.secret) as string) ?? "",
  };
}

export function getRagClient(): RagClient {
  return new RagClient(getRagConnection());
}

export function isRagEnabled(): boolean {
  const enabled = game.settings.get(MODULE_ID, RAG_SETTINGS.enabled) as boolean;
  return Boolean(enabled) && getRagConnection().serviceUrl.trim().length > 0;
}

/** Build the embed override from the embeddings feature config, if the user opted in. */
export function getEmbedOverride(): EmbedOverride | undefined {
  const send = game.settings.get(MODULE_ID, RAG_SETTINGS.sendEmbedConfig) as boolean;
  if (!send) return undefined;
  const cfg = getFeatureConfig("embeddings");
  if (!cfg.model.trim()) return undefined;
  return {
    provider: cfg.provider === "custom" ? "custom" : "openrouter",
    model: cfg.model,
    baseUrl: cfg.baseUrl || undefined,
    apiKey: cfg.apiKey || undefined,
  };
}

export function getQuerySilos(): SiloId[] {
  const raw = (game.settings.get(MODULE_ID, RAG_SETTINGS.querySilos) as string) ?? "";
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SiloId => isSiloId(s));
  return parsed.length > 0 ? parsed : DEFAULT_QUERY_SILOS;
}

export function getRagTuning(): { topK: number; hybrid: boolean; tokenBudget: number } {
  return {
    topK: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.topK)) || 5,
    hybrid: (game.settings.get(MODULE_ID, RAG_SETTINGS.hybrid) as boolean) ?? true,
    tokenBudget: Number(game.settings.get(MODULE_ID, RAG_SETTINGS.tokenBudget)) || 1500,
  };
}
