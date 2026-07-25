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
  /** Saved file format. */
  ext: "png" | "webp";
  /** When true, the size is fixed (not user-editable) and enforced on the output. */
  sizeLocked: boolean;
  defaultSize: string;
  /** Per-dimension clamp for user-editable sizes (maps). */
  minDim: number;
  maxDim: number;
  /** Keyed generators reuse a per-subject seed/appearance for continuity. */
  keyed: boolean;
  /** Scene-control (dragon menu) icon. */
  icon: string;
}

export const IMAGE_KIND_META: Record<ImageKind, ImageKindMeta> = {
  image: {
    kind: "image",
    trigger: "image",
    subfolder: "",
    ext: "png",
    sizeLocked: false,
    defaultSize: "1920x1080",
    minDim: 64,
    maxDim: 4096,
    keyed: false,
    icon: "fa-solid fa-image",
  },
  portrait: {
    kind: "portrait",
    trigger: "portrait",
    subfolder: "portraits",
    ext: "webp",
    sizeLocked: true,
    defaultSize: "1000x1000",
    minDim: 1000,
    maxDim: 1000,
    keyed: true,
    icon: "fa-solid fa-user",
  },
  token: {
    kind: "token",
    trigger: "token",
    subfolder: "tokens",
    ext: "webp",
    sizeLocked: true,
    defaultSize: "400x400",
    minDim: 400,
    maxDim: 400,
    keyed: true,
    icon: "fa-solid fa-chess-pawn",
  },
  map: {
    kind: "map",
    trigger: "map",
    subfolder: "maps",
    ext: "webp",
    sizeLocked: false,
    defaultSize: "4500x6000",
    minDim: 450,
    maxDim: 7800,
    keyed: false,
    icon: "fa-solid fa-map-location-dot",
  },
};

/** Per-kind image setting key: `${kind}.${field}` (scene kind reuses the legacy "image.*" keys). */
export function imageKey(kind: ImageKind, field: string): string {
  return `${kind}.${field}`;
}

/**
 * One-time migration: existing worlds have the scene size stored as the old default 1024x1024,
 * which changing the registration default won't update. Bump it to 1920x1080 once (GM only),
 * then never touch it again so deliberate edits are respected.
 */
export async function migrateImageDefaults(): Promise<void> {
  if (game.settings.get(MODULE_ID, "image.sizeMigratedV3")) return;
  const cur = String(game.settings.get(MODULE_ID, imageKey("image", "size")) ?? "");
  if (cur === "1024x1024") {
    await game.settings.set(MODULE_ID, imageKey("image", "size"), "1920x1080");
  }
  await game.settings.set(MODULE_ID, "image.sizeMigratedV3", true);
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
    game.settings.register(MODULE_ID, k("size"), { ...worldStr, default: meta.defaultSize });
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

  // One-time migration marker: bump the legacy Scene Art size (1024x1024) to 1920x1080.
  game.settings.register(MODULE_ID, "image.sizeMigratedV3", { ...worldBool, default: false });

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

/** Clamp a "WxH" string per-dimension into [minDim, maxDim]; fall back to the kind default. */
function clampImageSize(raw: string, meta: ImageKindMeta): string {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(String(raw).trim());
  if (!m) return meta.defaultSize;
  const clamp = (n: number) => Math.min(meta.maxDim, Math.max(meta.minDim, Math.round(n)));
  return `${clamp(Number(m[1]))}x${clamp(Number(m[2]))}`;
}

export function getImageParams(kind: ImageKind = "image"): {
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
  const meta = IMAGE_KIND_META[kind];
  const g = (field: string) => game.settings.get(MODULE_ID, imageKey(kind, field));
  // Locked kinds (portrait/token) always emit their fixed size; maps clamp to hidden bounds.
  const size = meta.sizeLocked
    ? meta.defaultSize
    : clampImageSize((g("size") as string) || meta.defaultSize, meta);
  return {
    steps: Number(g("steps")) || 20,
    cfg: Number(g("cfg")) || 7.0,
    sampler: (g("sampler") as string) || "Euler a",
    seed: Number(g("seed")),
    positive: (g("positive") as string) || "",
    negative: (g("negative") as string) || "",
    size,
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
