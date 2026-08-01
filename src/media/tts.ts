// Text-to-speech via OpenAI-compatible /audio/speech (OpenRouter or custom, incl. local
// presets like openedai-speech). Dynamic voice listing tries the common /audio/voices
// endpoint and falls back to the standard OpenAI voice names.

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";
import { getTtsVoice, getTtsPitchSupported, getTtsBroadcast } from "./config";
import { fetchOpenRouterVoices } from "../providers/models";
import { saveMedia, extForType } from "./storage";
import { log } from "../constants";

export const FALLBACK_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/** Parse the several shapes an /audio/voices response can take into a flat name list. */
function parseVoiceList(json: unknown): string[] {
  const j = json as { voices?: unknown; data?: unknown };
  const raw = j?.voices ?? j?.data ?? json;
  if (Array.isArray(raw)) {
    const names = raw
      .map((v: unknown) =>
        typeof v === "string"
          ? v
          : ((v as { id?: string; name?: string })?.id ?? (v as { name?: string })?.name),
      )
      .filter((v: unknown): v is string => typeof v === "string");
    if (names.length > 0) return names;
  }
  return [];
}

/**
 * Fetch voices from an explicit OpenAI-compatible base URL (used by the config "Fetch voices"
 * button, which reads the values currently typed in the form). Falls back to the standard voice
 * names on any failure. OpenRouter has no /audio/voices, so callers use the fallback there.
 */
export async function fetchVoiceList(baseUrl: string, apiKey?: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/?$/, "");
  if (!base) return FALLBACK_VOICES;
  try {
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    const res = await fetch(`${base}/audio/voices`, { headers });
    if (!res.ok) return FALLBACK_VOICES;
    const names = parseVoiceList(await res.json());
    return names.length > 0 ? names : FALLBACK_VOICES;
  } catch {
    return FALLBACK_VOICES;
  }
}

function authHeaders(cfg: FeatureProviderConfig): Record<string, string> {
  const h: Record<string, string> = {};
  const key = cfg.apiKey.trim();
  if (key) h["Authorization"] = `Bearer ${key}`;
  return h;
}

export class TtsError extends Error {}

/** Synthesize speech to an audio Blob. */
export async function synthesizeSpeech(
  text: string,
  opts: { voice?: string; format?: string; pitch?: number; signal?: AbortSignal } = {},
): Promise<Blob> {
  const cfg = getFeatureConfig("tts");
  if (!isConfigured(cfg)) throw new TtsError("TTS provider is not configured.");
  const url = `${resolveBaseUrl(cfg)}/audio/speech`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    input: text,
    voice: opts.voice ?? getTtsVoice() ?? "alloy",
    response_format: opts.format ?? "mp3",
  };
  // Pitch is non-standard for OpenAI /audio/speech; only send it when the user has confirmed
  // their endpoint accepts it, so strict servers don't reject the request.
  if (typeof opts.pitch === "number" && opts.pitch !== 0 && getTtsPitchSupported()) {
    body.pitch = opts.pitch;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(cfg) },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new TtsError(`TTS error (${res.status}): ${await res.text()}`);
  return res.blob();
}

let currentAudio: HTMLAudioElement | null = null;

/** Synthesize and play. Stops any currently-playing Noodlr speech first. */
export async function speak(
  text: string,
  voiceOrOpts?: string | { voice?: string; pitch?: number },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const opts = typeof voiceOrOpts === "string" ? { voice: voiceOrOpts } : (voiceOrOpts ?? {});
  const blob = await synthesizeSpeech(trimmed, opts);
  await playLocal(blob);
}

/** Play an audio Blob in this browser only. Blob URLs are tab-scoped and cannot be shared. */
async function playLocal(blob: Blob): Promise<void> {
  stopSpeaking();
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  currentAudio = audio;
  audio.addEventListener("ended", () => URL.revokeObjectURL(objectUrl));
  await audio.play().catch(() => URL.revokeObjectURL(objectUrl));
}

/**
 * Rotating slot count for broadcast speech files. Foundry has no delete API, so writing a uniquely
 * named file per spoken line would grow the world's data folder without bound. Reusing a small ring
 * of names caps it at N files while leaving enough headroom that a slot is never overwritten while
 * a client is still fetching it.
 */
const BROADCAST_SLOTS = 8;
let broadcastSlot = 0;

/**
 * Speak so the whole table hears it, not just this browser.
 *
 * Playing a Blob URL only works in the tab that created it, so remote players heard nothing from
 * the local `speak()`. The GM synthesizes once (the credentials are here), writes the audio to the
 * world's data folder, then hands the path to Foundry's own AudioHelper socket, which plays it on
 * every connected client through their normal volume controls.
 *
 * Falls back to local-only playback if the upload fails, so speech never disappears entirely just
 * because the server rejected a write.
 */
export async function speakShared(
  text: string,
  voiceOrOpts?: string | { voice?: string; pitch?: number },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!getTtsBroadcast()) return speak(trimmed, voiceOrOpts);

  const opts = typeof voiceOrOpts === "string" ? { voice: voiceOrOpts } : (voiceOrOpts ?? {});
  const blob = await synthesizeSpeech(trimmed, opts);

  const slot = broadcastSlot++ % BROADCAST_SLOTS;
  const path = await saveMedia(blob, "speech", {
    subfolder: "speech",
    fileName: `noodlr-speech-${slot}.${extForType(blob.type)}`,
  });
  if (!path) {
    log("tts: could not store audio for broadcast; playing locally only");
    return playLocal(blob);
  }

  const helper = (foundry as any).audio?.AudioHelper ?? (globalThis as any).AudioHelper;
  if (!helper?.play) {
    log("tts: AudioHelper unavailable; playing locally only");
    return playLocal(blob);
  }

  // Slot names are reused, so a bare path would let a client replay a cached earlier line.
  const src = `${path}?t=${Date.now()}`;
  stopSpeaking();
  // `true` = also emit to every other connected client.
  helper.play({ src, volume: 1.0, autoplay: true, loop: false }, true);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/**
 * Retrieve available voices for the configured TTS model.
 *  - OpenRouter: read the model's `supported_voices` metadata (per-model, correct names).
 *  - Custom: try the endpoint's /audio/voices, else the standard OpenAI names.
 * Returns [] for an OpenRouter model with no listed voices (rather than the misleading OpenAI
 * six) — except for models that genuinely use the OpenAI names (kept as a last resort).
 */
export async function listVoices(): Promise<string[]> {
  const cfg = getFeatureConfig("tts");
  if (!isConfigured(cfg)) return FALLBACK_VOICES;
  if (cfg.provider === "openrouter") {
    const voices = await fetchOpenRouterVoices(cfg.model);
    return voices.length > 0 ? voices : FALLBACK_VOICES;
  }
  try {
    const res = await fetch(`${resolveBaseUrl(cfg)}/audio/voices`, {
      headers: authHeaders(cfg),
    });
    if (!res.ok) return FALLBACK_VOICES;
    const names = parseVoiceList(await res.json());
    return names.length > 0 ? names : FALLBACK_VOICES;
  } catch {
    return FALLBACK_VOICES;
  }
}
