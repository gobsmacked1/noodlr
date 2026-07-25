// Media feature settings (TTS, Image, Transcription/push-to-log) registration + typed
// accessors. Provider config (openrouter/custom base+key+model) reuses the shared
// per-feature registration; media-specific options are registered here.

import { MODULE_ID, MEDIA_SETTINGS } from "../constants";
import { registerFeatureProviderSettings } from "../providers/config";

/** The four image generators. Each carries its own provider + full image-param config. */
export const IMAGE_KINDS = ["image", "portrait", "token", "map"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export interface ImageKindMeta {
  kind: ImageKind;
  /** Case-insensitive chat trigger word: "Generate <Word>: ...". */
  trigger: string;
  /** Output subfolder under the base media folder ("" = the base folder itself). */
  subfolder: string;
  /** Saved file format (all kinds now output .webp for consistency). */
  ext: "png" | "webp";
  /** Default aspect ratio (value from ASPECT_RATIOS; "" = model's native size). */
  defaultAspect: string;
  /** Keyed generators reuse a per-subject seed/appearance for continuity. */
  keyed: boolean;
  /** Scene-control (dragon menu) icon. */
  icon: string;
}

export const IMAGE_KIND_META: Record<ImageKind, ImageKindMeta> = {
  image: {
    kind: "image",
    trigger: "image",
    subfolder: "images",
    ext: "webp",
    defaultAspect: "16:9",
    keyed: false,
    icon: "fa-solid fa-image",
  },
  portrait: {
    kind: "portrait",
    trigger: "portrait",
    subfolder: "portraits",
    ext: "webp",
    defaultAspect: "3:4",
    keyed: true,
    icon: "fa-solid fa-user",
  },
  token: {
    kind: "token",
    trigger: "token",
    subfolder: "tokens",
    ext: "webp",
    defaultAspect: "1:1",
    keyed: true,
    icon: "fa-solid fa-chess-pawn",
  },
  map: {
    kind: "map",
    trigger: "map",
    subfolder: "maps",
    ext: "webp",
    defaultAspect: "3:4",
    keyed: false,
    icon: "fa-solid fa-map-location-dot",
  },
};

/**
 * Standard aspect ratios offered per generator. OpenRouter doesn't publish per-model
 * resolution limits, so we can't auto-populate exact pixel ranges; instead the user picks an
 * aspect ratio and we send a representative (SDXL-friendly) `size` for it. The "" option sends
 * no size at all — for slugs that ignore `size` and just return their own native resolution.
 */
export interface AspectRatio {
  value: string;
  label: string;
  /** Representative pixel size sent as `size` ("" = omit size, use the model's default). */
  size: string;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { value: "", label: "Default (model's native size)", size: "" },
  { value: "1:1", label: "1:1 — Square", size: "1024x1024" },
  { value: "4:3", label: "4:3 — Landscape", size: "1152x896" },
  { value: "3:4", label: "3:4 — Portrait", size: "896x1152" },
  { value: "3:2", label: "3:2 — Landscape", size: "1216x832" },
  { value: "2:3", label: "2:3 — Portrait", size: "832x1216" },
  { value: "16:9", label: "16:9 — Widescreen", size: "1344x768" },
  { value: "9:16", label: "9:16 — Tall", size: "768x1344" },
  { value: "21:9", label: "21:9 — Ultrawide", size: "1536x640" },
  { value: "9:21", label: "9:21 — Ultratall", size: "640x1536" },
];

/** Map an aspect-ratio value to a concrete "WxH" size string ("" when native/default). */
export function aspectToSize(aspect: string): string {
  return ASPECT_RATIOS.find((a) => a.value === aspect)?.size ?? "";
}

/** Per-kind image setting key: `${kind}.${field}` (scene kind reuses the legacy "image.*" keys). */
export function imageKey(kind: ImageKind, field: string): string {
  return `${kind}.${field}`;
}

export function registerMediaSettings(): void {
  const M = MEDIA_SETTINGS;

  registerFeatureProviderSettings("tts");
  registerFeatureProviderSettings("transcription");
  registerFeatureProviderSettings("music");
  registerFeatureProviderSettings("video");

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
  game.settings.register(MODULE_ID, M.ttsPitchSupported, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.ttsCreatureVoices, { ...worldStr, default: "{}" });

  // --- Image generators (scene / portrait / token / map) ---
  // Each kind carries a full, independent set of image params + its own provider + ledger.
  // The scene kind ("image") reuses the legacy "image.*" keys for back-compat.
  for (const kind of IMAGE_KINDS) {
    registerFeatureProviderSettings(kind);
    const meta = IMAGE_KIND_META[kind];
    const k = (field: string) => imageKey(kind, field);
    game.settings.register(MODULE_ID, k("systemPrompt"), { ...worldStr, default: "" });
    game.settings.register(MODULE_ID, k("expandPrompt"), { ...worldBool, default: true });
    game.settings.register(MODULE_ID, k("steps"), { ...worldNum, default: 20 });
    game.settings.register(MODULE_ID, k("cfg"), { ...worldNum, default: 7.0 });
    game.settings.register(MODULE_ID, k("sampler"), { ...worldStr, default: "Euler a" });
    game.settings.register(MODULE_ID, k("seed"), { ...worldNum, default: -1 });
    game.settings.register(MODULE_ID, k("positive"), { ...worldStr, default: "" });
    game.settings.register(MODULE_ID, k("negative"), { ...worldStr, default: "" });
    game.settings.register(MODULE_ID, k("aspect"), { ...worldStr, default: meta.defaultAspect });
    game.settings.register(MODULE_ID, k("persist"), { ...worldBool, default: true });
    game.settings.register(MODULE_ID, k("chatTrigger"), { ...worldBool, default: true });
    game.settings.register(MODULE_ID, k("allowPlayers"), { ...worldBool, default: false });
    game.settings.register(MODULE_ID, k("ledger"), { ...worldStr, default: "{}" });
  }
  // The base media output folder is shared; per-kind subfolders derive from it.
  game.settings.register(MODULE_ID, M.imageMediaFolder, {
    ...worldStr,
    default: "assets/noodlr-out",
  });

  // --- Push-to-log transcription ---
  game.settings.register(MODULE_ID, M.transcriptionEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.pushToLogPostChat, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.pushToLogIngest, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.pushToLogIngestInterval, { ...worldNum, default: 300 });
  game.settings.register(MODULE_ID, M.pushToLogSegmentSeconds, { ...worldNum, default: 20 });

  // --- Music (text-to-audio) ---
  game.settings.register(MODULE_ID, M.musicEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.musicChatTrigger, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.musicAllowPlayers, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.musicMinSec, { ...worldNum, default: 15 });
  game.settings.register(MODULE_ID, M.musicMaxSec, { ...worldNum, default: 300 });
  game.settings.register(MODULE_ID, M.musicPlaylist, { ...worldStr, default: "Noodlr Music" });

  // --- Video (text-to-video, experimental) ---
  game.settings.register(MODULE_ID, M.videoEnabled, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.videoChatTrigger, { ...worldBool, default: true });
  game.settings.register(MODULE_ID, M.videoAllowPlayers, { ...worldBool, default: false });
  game.settings.register(MODULE_ID, M.videoDuration, { ...worldNum, default: 8 });
  game.settings.register(MODULE_ID, M.videoResolution, { ...worldStr, default: "720p" });
  game.settings.register(MODULE_ID, M.videoAspect, { ...worldStr, default: "16:9" });
}

export const getTtsEnabled = () => Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsEnabled));
export const getTranscriptionEnabled = () =>
  Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.transcriptionEnabled));
export const getTtsVoice = () =>
  (game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsVoice) as string) ?? "";
export const getTtsAutoRead = () =>
  Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsAutoRead));

export function getImageParams(kind: ImageKind = "image"): {
  steps: number;
  cfg: number;
  sampler: string;
  seed: number;
  positive: string;
  negative: string;
  /** Aspect-ratio value (see ASPECT_RATIOS); "" means send no size (model's native). */
  aspect: string;
  expand: boolean;
  systemPrompt: string;
} {
  const meta = IMAGE_KIND_META[kind];
  const g = (field: string) => game.settings.get(MODULE_ID, imageKey(kind, field));
  return {
    steps: Number(g("steps")) || 20,
    cfg: Number(g("cfg")) || 7.0,
    sampler: (g("sampler") as string) || "Euler a",
    seed: Number(g("seed")),
    positive: (g("positive") as string) || "",
    negative: (g("negative") as string) || "",
    aspect: (g("aspect") as string) ?? meta.defaultAspect,
    expand: Boolean(g("expandPrompt")),
    systemPrompt: (g("systemPrompt") as string) || "",
  };
}

export const getImageChatTrigger = (kind: ImageKind = "image") =>
  Boolean(game.settings.get(MODULE_ID, imageKey(kind, "chatTrigger")));
export const getImageAllowPlayers = (kind: ImageKind = "image") =>
  Boolean(game.settings.get(MODULE_ID, imageKey(kind, "allowPlayers")));
export const getImagePersist = (kind: ImageKind = "image") =>
  Boolean(game.settings.get(MODULE_ID, imageKey(kind, "persist")));

export const getTtsPitchSupported = () =>
  Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsPitchSupported));

export function getMusicConfig(): {
  enabled: boolean;
  chatTrigger: boolean;
  allowPlayers: boolean;
  minSec: number;
  maxSec: number;
  playlist: string;
} {
  const g = (k: string) => game.settings.get(MODULE_ID, k);
  return {
    enabled: Boolean(g(MEDIA_SETTINGS.musicEnabled)),
    chatTrigger: Boolean(g(MEDIA_SETTINGS.musicChatTrigger)),
    allowPlayers: Boolean(g(MEDIA_SETTINGS.musicAllowPlayers)),
    minSec: Number(g(MEDIA_SETTINGS.musicMinSec)) || 15,
    maxSec: Number(g(MEDIA_SETTINGS.musicMaxSec)) || 300,
    playlist: (g(MEDIA_SETTINGS.musicPlaylist) as string) || "Noodlr Music",
  };
}

export function getVideoConfig(): {
  enabled: boolean;
  chatTrigger: boolean;
  allowPlayers: boolean;
  duration: number;
  resolution: string;
  aspect: string;
} {
  const g = (k: string) => game.settings.get(MODULE_ID, k);
  return {
    enabled: Boolean(g(MEDIA_SETTINGS.videoEnabled)),
    chatTrigger: Boolean(g(MEDIA_SETTINGS.videoChatTrigger)),
    allowPlayers: Boolean(g(MEDIA_SETTINGS.videoAllowPlayers)),
    duration: Number(g(MEDIA_SETTINGS.videoDuration)) || 8,
    resolution: (g(MEDIA_SETTINGS.videoResolution) as string) || "720p",
    aspect: (g(MEDIA_SETTINGS.videoAspect) as string) || "16:9",
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
