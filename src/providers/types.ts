// Provider configuration model. Two shapes only, applied uniformly to every AI feature
// (Chat, Embeddings, TTS, Image, Transcription):
//   - openrouter: OpenRouter API key + model slug, fixed base URL.
//   - custom:     any OpenAI-compatible base URL + optional key + model.
// We will not maintain per-vendor proprietary clients.

export type ProviderKind = "openrouter" | "custom";

/** The AI feature areas that each carry an independent provider config. */
export type FeatureId =
  | "chat"
  | "embeddings"
  | "tts"
  | "image"
  | "transcription"
  | "music"
  | "video"
  | "rerank";

export interface FeatureProviderConfig {
  provider: ProviderKind;
  /** Base URL for the custom provider; ignored for openrouter (uses the fixed base). */
  baseUrl: string;
  /** API key. Required for openrouter; optional for custom (local servers often need none). */
  apiKey: string;
  /** Model slug / id sent to the endpoint. */
  model: string;
}

/** OpenRouter's fixed OpenAI-compatible base. */
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Resolve the effective base URL (no trailing slash) for a feature config. */
export function resolveBaseUrl(cfg: FeatureProviderConfig): string {
  const base = cfg.provider === "openrouter" ? OPENROUTER_BASE : cfg.baseUrl.trim();
  return base.replace(/\/+$/, "");
}

/** True when the config has enough to attempt a request. */
export function isConfigured(cfg: FeatureProviderConfig): boolean {
  if (!cfg.model.trim()) return false;
  if (cfg.provider === "openrouter") return cfg.apiKey.trim().length > 0;
  // custom: needs a base URL; key optional.
  return resolveBaseUrl(cfg).length > 0;
}

/** A single chat message in OpenAI-compatible format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional display name (maps a table participant to a speaker). */
  name?: string;
}
