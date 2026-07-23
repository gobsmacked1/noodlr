// Media feature settings (TTS, Image, Transcription/push-to-log) registration + typed
// accessors. Provider config (openrouter/custom base+key+model) reuses the shared
// per-feature registration; media-specific options are registered here.

import { MODULE_ID, MEDIA_SETTINGS } from "../constants";
import { registerFeatureProviderSettings } from "../providers/config";

export function registerMediaSettings(): void {
  const M = MEDIA_SETTINGS;

  registerFeatureProviderSettings("tts");
  registerFeatureProviderSettings("image");
  registerFeatureProviderSettings("transcription");

  // Media options are rendered in the Noodlr configuration windows (config:false), grouped
  // with their feature so nothing floats free in the native settings list.
  const worldBool = { scope: "world" as const, config: false, type: Boolean };
  const worldStr = { scope: "world" as const, config: false, type: String };
  const worldNum = { scope: "world" as const, config: false, type: Number };

  // --- TTS ---
  game.settings.register(MODULE_ID, M.ttsEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.ttsVoice, { ...worldStr, default: "" });
  game.settings.register(MODULE_ID, M.ttsAutoRead, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  // --- Image ---
  game.settings.register(MODULE_ID, M.imageSystemPrompt, { ...worldStr, default: "" });
  game.settings.register(MODULE_ID, M.imageExpandPrompt, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.imageSteps, { ...worldNum, default: 20 });
  game.settings.register(MODULE_ID, M.imageCfg, { ...worldNum, default: 7.0 });
  game.settings.register(MODULE_ID, M.imageSampler, { ...worldStr, default: "Euler a" });
  game.settings.register(MODULE_ID, M.imageSeed, { ...worldNum, default: -1 });
  game.settings.register(MODULE_ID, M.imagePositive, { ...worldStr, default: "" });
  game.settings.register(MODULE_ID, M.imageNegative, { ...worldStr, default: "" });
  game.settings.register(MODULE_ID, M.imageSize, { ...worldStr, default: "1024x1024" });

  // --- Push-to-log transcription ---
  game.settings.register(MODULE_ID, M.pushToLogPostChat, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.pushToLogIngest, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.pushToLogIngestInterval, { ...worldNum, default: 300 });
  game.settings.register(MODULE_ID, M.pushToLogSegmentSeconds, { ...worldNum, default: 20 });
}

export const getTtsEnabled = () => Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsEnabled));
export const getTtsVoice = () =>
  (game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsVoice) as string) ?? "";
export const getTtsAutoRead = () =>
  Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsAutoRead));

export function getImageParams(): {
  steps: number;
  cfg: number;
  sampler: string;
  seed: number;
  positive: string;
  negative: string;
  size: string;
  expand: boolean;
  systemPrompt: string;
} {
  const g = (k: string) => game.settings.get(MODULE_ID, k);
  return {
    steps: Number(g(MEDIA_SETTINGS.imageSteps)) || 20,
    cfg: Number(g(MEDIA_SETTINGS.imageCfg)) || 7.0,
    sampler: (g(MEDIA_SETTINGS.imageSampler) as string) || "Euler a",
    seed: Number(g(MEDIA_SETTINGS.imageSeed)),
    positive: (g(MEDIA_SETTINGS.imagePositive) as string) || "",
    negative: (g(MEDIA_SETTINGS.imageNegative) as string) || "",
    size: (g(MEDIA_SETTINGS.imageSize) as string) || "1024x1024",
    expand: Boolean(g(MEDIA_SETTINGS.imageExpandPrompt)),
    systemPrompt: (g(MEDIA_SETTINGS.imageSystemPrompt) as string) || "",
  };
}

export function getPushToLogConfig(): {
  postChat: boolean;
  ingest: boolean;
  ingestInterval: number;
  segmentSeconds: number;
} {
  const g = (k: string) => game.settings.get(MODULE_ID, k);
  return {
    postChat: Boolean(g(MEDIA_SETTINGS.pushToLogPostChat)),
    ingest: Boolean(g(MEDIA_SETTINGS.pushToLogIngest)),
    ingestInterval: Number(g(MEDIA_SETTINGS.pushToLogIngestInterval)) || 300,
    segmentSeconds: Number(g(MEDIA_SETTINGS.pushToLogSegmentSeconds)) || 20,
  };
}
