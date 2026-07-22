// Media feature settings (TTS, Image, Transcription/push-to-log) registration + typed
// accessors. Provider config (openrouter/custom base+key+model) reuses the shared
// per-feature registration; media-specific options are registered here.

import { MODULE_ID, MEDIA_SETTINGS } from "../constants";
import { registerFeatureProviderSettings } from "../providers/config";

export function registerMediaSettings(): void {
  const M = MEDIA_SETTINGS;
  const L = (s: string) => `NOODLR.Media.${s}`;

  registerFeatureProviderSettings("tts");
  registerFeatureProviderSettings("image");
  registerFeatureProviderSettings("transcription");

  // --- TTS ---
  game.settings.register(MODULE_ID, M.ttsEnabled, {
    name: L("TtsEnabled.Name"),
    hint: L("TtsEnabled.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, M.ttsVoice, {
    name: L("TtsVoice.Name"),
    hint: L("TtsVoice.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, M.ttsAutoRead, {
    name: L("TtsAutoRead.Name"),
    hint: L("TtsAutoRead.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  // --- Image ---
  game.settings.register(MODULE_ID, M.imageSystemPrompt, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, M.imageExpandPrompt, {
    name: L("ImageExpand.Name"),
    hint: L("ImageExpand.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, M.imageSteps, {
    name: L("ImageSteps.Name"),
    hint: L("ImageSteps.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 20,
  });
  game.settings.register(MODULE_ID, M.imageCfg, {
    name: L("ImageCfg.Name"),
    hint: L("ImageCfg.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 7.0,
  });
  game.settings.register(MODULE_ID, M.imageSampler, {
    name: L("ImageSampler.Name"),
    hint: L("ImageSampler.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "Euler a",
  });
  game.settings.register(MODULE_ID, M.imageSeed, {
    name: L("ImageSeed.Name"),
    hint: L("ImageSeed.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: -1,
  });
  game.settings.register(MODULE_ID, M.imageNegative, {
    name: L("ImageNegative.Name"),
    hint: L("ImageNegative.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, M.imageSize, {
    name: L("ImageSize.Name"),
    hint: L("ImageSize.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "1024x1024",
  });

  // --- Push-to-log transcription ---
  game.settings.register(MODULE_ID, M.pushToLogPostChat, {
    name: L("PushPostChat.Name"),
    hint: L("PushPostChat.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, M.pushToLogIngest, {
    name: L("PushIngest.Name"),
    hint: L("PushIngest.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, M.pushToLogIngestInterval, {
    name: L("PushIngestInterval.Name"),
    hint: L("PushIngestInterval.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    range: { min: 60, max: 3600, step: 30 },
  });
  game.settings.register(MODULE_ID, M.pushToLogSegmentSeconds, {
    name: L("PushSegment.Name"),
    hint: L("PushSegment.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    range: { min: 5, max: 60, step: 5 },
  });
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
