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
  /** Default size ("WxH" from IMAGE_SIZE_PRESETS; "" = model's native size). */
  defaultSize: string;
  /** Default positive/style prompt seeded for this kind (empty for most). */
  defaultPositive?: string;
  /** Keyed generators reuse a per-subject seed/appearance for continuity. */
  keyed: boolean;
  /** Scene-control (dragon menu) icon. */
  icon: string;
}

/**
 * Default battlemap style/scale prompt for the Map generator. Diffusion models have no metric
 * awareness (they can't honor "70px = 5ft"), so this cues top-down framing + relative scale
 * (human = one 5-ft square); exact scale is enforced later by Foundry's scene grid.
 */
export const MAP_DEFAULT_POSITIVE =
  "top-down orthographic battle map for a tabletop RPG, true bird's-eye view (no perspective, " +
  "no isometric tilt), consistent uniform scale across the entire map where a single " +
  "human-sized creature occupies one 5-foot grid square, standard doorways one square (5 ft) " +
  "wide, corridors two squares (10 ft) wide, furniture and objects sized to match";

export const IMAGE_KIND_META: Record<ImageKind, ImageKindMeta> = {
  image: {
    kind: "image",
    trigger: "image",
    subfolder: "images",
    ext: "webp",
    defaultSize: "1536x640",
    keyed: false,
    icon: "fa-solid fa-image",
  },
  portrait: {
    kind: "portrait",
    trigger: "portrait",
    subfolder: "portraits",
    ext: "webp",
    defaultSize: "896x1192",
    keyed: true,
    icon: "fa-solid fa-user",
  },
  token: {
    kind: "token",
    trigger: "token",
    subfolder: "tokens",
    ext: "webp",
    defaultSize: "512x512",
    keyed: true,
    icon: "fa-solid fa-chess-pawn",
  },
  map: {
    kind: "map",
    trigger: "map",
    subfolder: "maps",
    ext: "webp",
    defaultSize: "1024x1024",
    defaultPositive: MAP_DEFAULT_POSITIVE,
    keyed: false,
    icon: "fa-solid fa-map-location-dot",
  },
};

/**
 * Curated, known-good pixel sizes for image models (paired small/large per aspect ratio).
 * OpenRouter publishes no per-model resolution limits, so rather than guess, we offer this
 * vetted list; the size string is sent verbatim as `size`. The UI also offers a "" (native)
 * option and a free-form custom size for experimentation.
 */
export interface ImageSizePreset {
  /** "WxH" value sent to the model. */
  value: string;
  /** Human label, e.g. "1:1 (Square) - 512 x 512". */
  label: string;
}

export const IMAGE_SIZE_PRESETS: ImageSizePreset[] = [
  { value: "512x512", label: "1:1 (Square) - 512 x 512" },
  { value: "1024x1024", label: "1:1 (Square) - 1024 x 1024" },
  { value: "448x592", label: "3:4 (Portrait) - 448 x 592" },
  { value: "896x1192", label: "3:4 (Portrait) - 896 x 1192" },
  { value: "416x624", label: "2:3 (Portrait) - 416 x 624" },
  { value: "832x1248", label: "2:3 (Portrait) - 832 x 1248" },
  { value: "360x640", label: "9:16 (Tall) - 360 x 640" },
  { value: "768x1344", label: "9:16 (Tall) - 768 x 1344" },
  { value: "624x416", label: "3:2 (Landscape) - 624 x 416" },
  { value: "1248x832", label: "3:2 (Landscape) - 1248 x 832" },
  { value: "592x448", label: "4:3 (Landscape) - 592 x 448" },
  { value: "1192x896", label: "4:3 (Landscape) - 1192 x 896" },
  { value: "640x360", label: "16:9 (Widescreen) - 640 x 360" },
  { value: "1344x768", label: "16:9 (Widescreen) - 1344 x 768" },
  { value: "768x320", label: "21:9 (Ultrawide) - 768 x 320" },
  { value: "1536x640", label: "21:9 (Ultrawide) - 1536 x 640" },
];

/** True when a stored size string is a non-empty value that isn't one of the presets. */
export function isCustomSize(size: string): boolean {
  return size.trim() !== "" && !IMAGE_SIZE_PRESETS.some((p) => p.value === size);
}

/** Validate/normalize a free-form "WxH" (clamped 8..8192/side); "" if unparseable. */
export function normalizeCustomSize(raw: string): string {
  const m = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(String(raw));
  if (!m) return "";
  const clamp = (n: number) => Math.min(8192, Math.max(8, Math.round(n)));
  return `${clamp(Number(m[1]))}x${clamp(Number(m[2]))}`;
}

/** Per-kind image setting key: `${kind}.${field}` (scene kind reuses the legacy "image.*" keys). */
export function imageKey(kind: ImageKind, field: string): string {
  return `${kind}.${field}`;
}

/**
 * One-time seed: give existing worlds the Map generator's default style prompt if they don't
 * already have one. New worlds get it from the registration default; this covers upgrades.
 * Respects a deliberately-cleared prompt on subsequent loads (only runs once).
 */
export async function seedMapDefaults(): Promise<void> {
  if (game.settings.get(MODULE_ID, "map.positiveSeeded")) return;
  const cur = String(game.settings.get(MODULE_ID, imageKey("map", "positive")) ?? "");
  if (!cur.trim()) {
    await game.settings.set(MODULE_ID, imageKey("map", "positive"), MAP_DEFAULT_POSITIVE);
  }
  await game.settings.set(MODULE_ID, "map.positiveSeeded", true);
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
    game.settings.register(MODULE_ID, k("positive"), {
      ...worldStr,
      default: meta.defaultPositive ?? "",
    });
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

  // One-time seed marker for the Map generator's default style prompt (existing worlds).
  game.settings.register(MODULE_ID, "map.positiveSeeded", { ...worldBool, default: false });

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
  /** "WxH" size sent to the model; "" means send no size (use the model's native default). */
  size: string;
  expand: boolean;
  systemPrompt: string;
} {
  const meta = IMAGE_KIND_META[kind];
  const g = (field: string) => game.settings.get(MODULE_ID, imageKey(kind, field));
  const stored = g("size");
  return {
    steps: Number(g("steps")) || 20,
    cfg: Number(g("cfg")) || 7.0,
    sampler: (g("sampler") as string) || "Euler a",
    seed: Number(g("seed")),
    positive: (g("positive") as string) || "",
    negative: (g("negative") as string) || "",
    size: typeof stored === "string" ? stored : meta.defaultSize,
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
