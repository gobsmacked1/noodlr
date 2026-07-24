// Read/register per-feature provider configuration backed by Foundry settings.
// Each feature stores four keys: <feature>.provider, .baseUrl, .apiKey, .model.
//
// All four are registered `config: false`: we render them ourselves in the Noodlr
// configuration windows (grouped per feature, with layman help and write-only API-key
// fields) instead of Foundry's generic native settings list. That native list showed the
// same anonymous "Provider / Base URL / API key / Model" rows five times over with no
// indication of which feature they belonged to, and exposed the raw key in a text input.

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
  music: { provider: "openrouter", model: "google/lyria-3-clip-preview" },
  video: { provider: "openrouter", model: "google/veo-3.1-fast" },
  rerank: { provider: "openrouter", model: "cohere/rerank-4-fast" },
};

function key(feature: FeatureId, field: string): string {
  return `${feature}.${field}`;
}

/** Register the four provider settings for a feature (config:false = custom UI only). */
export function registerFeatureProviderSettings(feature: FeatureId): void {
  const d = DEFAULTS[feature];
  const common = { scope: "world" as const, config: false, type: String };

  game.settings.register(MODULE_ID, key(feature, "provider"), {
    ...common,
    default: d.provider ?? "openrouter",
  });
  game.settings.register(MODULE_ID, key(feature, "baseUrl"), {
    ...common,
    default: d.baseUrl ?? "",
  });
  game.settings.register(MODULE_ID, key(feature, "apiKey"), { ...common, default: "" });
  game.settings.register(MODULE_ID, key(feature, "model"), { ...common, default: d.model ?? "" });
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

/**
 * Template-safe view of a feature's provider config for rendering. Deliberately omits the
 * API key value — the UI must never receive stored keys (a `hasKey` flag is enough to show
 * a "saved" placeholder). Prevents keys leaking into the DOM / browser devtools.
 */
export interface ProviderView {
  provider: ProviderKind;
  isOpenrouter: boolean;
  isCustom: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export function getProviderView(feature: FeatureId): ProviderView {
  const cfg = getFeatureConfig(feature);
  return {
    provider: cfg.provider,
    isOpenrouter: cfg.provider === "openrouter",
    isCustom: cfg.provider === "custom",
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasKey: cfg.apiKey.trim().length > 0,
  };
}

/** Form payload for one feature's provider block (from FormDataExtended, expanded). */
export interface ProviderFormData {
  provider?: string;
  baseUrl?: string;
  model?: string;
  /** New key value. Empty string = leave the stored key untouched (write-only field). */
  apiKey?: string;
  /** When true, explicitly wipe the stored key. */
  apiKeyClear?: boolean;
}

/**
 * Persist a feature's provider block from submitted form data. The API key is write-only:
 * a blank field keeps the existing key; a non-blank field overwrites it; the clear flag
 * wipes it. We never round-trip the stored key through the browser.
 */
export async function saveProviderFromForm(
  feature: FeatureId,
  data: ProviderFormData | undefined,
): Promise<void> {
  if (!data) return;
  const set = (field: string, value: string) =>
    game.settings.set(MODULE_ID, key(feature, field), value);

  const provider = data.provider === "custom" ? "custom" : "openrouter";
  await set("provider", provider);
  await set("baseUrl", String(data.baseUrl ?? "").trim());
  await set("model", String(data.model ?? "").trim());

  if (data.apiKeyClear) {
    await set("apiKey", "");
  } else {
    const newKey = String(data.apiKey ?? "");
    if (newKey.trim().length > 0) await set("apiKey", newKey.trim());
  }
}
