// Read/register per-feature provider configuration backed by Foundry settings.
// Each feature stores four keys: <feature>.provider, .baseUrl, .apiKey, .model.

import { MODULE_ID } from "../constants";
import type { FeatureId, FeatureProviderConfig, ProviderKind } from "./types";

interface FeatureDefaults {
  provider?: ProviderKind;
  baseUrl?: string;
  model?: string;
}

/** Spec defaults per AGENTS.md (chat has no mandated default model). */
const DEFAULTS: Record<FeatureId, FeatureDefaults> = {
  chat: { provider: "openrouter", model: "" },
  embeddings: { provider: "openrouter", model: "perplexity/pplx-embed-v1-4b" },
  tts: { provider: "openrouter", model: "microsoft/mai-voice-2" },
  image: { provider: "openrouter", model: "google/gemini-3.1-flash-lite-image" },
  transcription: { provider: "openrouter", model: "openai/whisper-large-v3-turbo" },
};

function key(feature: FeatureId, field: string): string {
  return `${feature}.${field}`;
}

/** Register the four provider settings for a feature (config:true = native settings UI). */
export function registerFeatureProviderSettings(feature: FeatureId): void {
  const d = DEFAULTS[feature];
  const L = (s: string) => `NOODLR.Provider.${s}`;

  game.settings.register(MODULE_ID, key(feature, "provider"), {
    name: L("Provider.Name"),
    hint: L("Provider.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: { openrouter: "OpenRouter", custom: "Custom (OpenAI-compatible)" },
    default: d.provider ?? "openrouter",
  });
  game.settings.register(MODULE_ID, key(feature, "baseUrl"), {
    name: L("BaseUrl.Name"),
    hint: L("BaseUrl.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: d.baseUrl ?? "",
  });
  game.settings.register(MODULE_ID, key(feature, "apiKey"), {
    name: L("ApiKey.Name"),
    hint: L("ApiKey.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, key(feature, "model"), {
    name: L("Model.Name"),
    hint: L("Model.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: d.model ?? "",
  });
}

/** Read the current provider configuration for a feature. */
export function getFeatureConfig(feature: FeatureId): FeatureProviderConfig {
  const get = (field: string) => game.settings.get(MODULE_ID, key(feature, field)) as string;
  const provider = (get("provider") as ProviderKind) ?? "openrouter";
  return {
    provider: provider === "custom" ? "custom" : "openrouter",
    baseUrl: get("baseUrl") ?? "",
    apiKey: get("apiKey") ?? "",
    model: get("model") ?? "",
  };
}
