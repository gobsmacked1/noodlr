// Text-to-speech via OpenAI-compatible /audio/speech (OpenRouter or custom, incl. local
// presets like openedai-speech). Dynamic voice listing tries the common /audio/voices
// endpoint and falls back to the standard OpenAI voice names.

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";
import { getTtsVoice, getTtsPitchSupported, getTtsBroadcast } from "./config";
import { fetchOpenRouterVoices } from "../providers/models";
import { saveMedia } from "./storage";
import { log, debug, warn } from "../constants";

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

/**
 * Speech is queued rather than fired immediately: two replies finishing close together used to talk
 * over each other, which at a table is worse than a delay. Each line waits for the previous one to
 * finish. Bumped by `stopSpeaking()` so anything still queued is abandoned instead of played after
 * the GM has explicitly silenced it.
 */
let speechChain: Promise<void> = Promise.resolve();
let speechEpoch = 0;

/** Run `job` after all previously queued speech, unless Stop was pressed in the meantime. */
function enqueueSpeech(job: () => Promise<void>): Promise<void> {
  const epoch = speechEpoch;
  const run = async (): Promise<void> => {
    if (epoch !== speechEpoch) return;
    await job();
  };
  // Chain through failures too, or one bad line would wedge the queue for the whole session.
  const next = speechChain.then(run, run);
  speechChain = next.catch(() => undefined);
  return next;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

/** Gap between queued lines, so the next does not clip the tail of the last on slower clients. */
const SPEECH_GAP_MS = 250;

/**
 * Playable length of an audio Blob in seconds, or 0 if the browser cannot tell us. Needed because a
 * broadcast plays on other machines: we cannot await their playback, so the queue paces itself by
 * the clip's own duration.
 */
function blobDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (seconds: number): void => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => done(audio.duration));
    audio.addEventListener("error", () => done(0));
    audio.src = url;
  });
}

/** Synthesize and play on THIS client only. Queued behind any speech already in flight. */
export async function speak(
  text: string,
  voiceOrOpts?: string | { voice?: string; pitch?: number },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const opts = typeof voiceOrOpts === "string" ? { voice: voiceOrOpts } : (voiceOrOpts ?? {});
  return enqueueSpeech(async () => {
    const blob = await synthesizeSpeech(trimmed, opts);
    await playLocal(blob);
  });
}

/**
 * Play an audio Blob in this browser only, resolving when playback actually ends. Blob URLs are
 * tab-scoped, so nothing written here is reachable by any other client — which is exactly why secret
 * narration uses this path instead of the broadcast one.
 */
async function playLocal(blob: Blob): Promise<void> {
  stopCurrentAudio();
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  currentAudio = audio;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      URL.revokeObjectURL(objectUrl);
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.play().catch(finish);
  });
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
 * Per-GM prefix for the slot names above. The counter is per-client and starts at zero, so with two
 * GMs connected the first line each of them speaks claims the same slot — the second write lands on
 * the file clients are still fetching for the first. Foundry user ids are alphanumeric, but the id
 * is filtered anyway rather than trusting that for a filename.
 */
function speakerTag(): string {
  const id = (game.user?.id ?? "").replace(/[^A-Za-z0-9]/g, "");
  return id ? `${id}-` : "";
}

/**
 * File extension for a synthesized clip. Deliberately NOT `extForType()`, whose fallthrough is
 * `png` because the image path is its common case — speech written as `.png` is served back as
 * `image/png` and refused by every client's audio decoder, which reads as "the TTS just didn't
 * play". Anything unrecognized (a missing Content-Type, `application/octet-stream`) is far more
 * likely to be MP3 than an image here.
 */
function speechExt(mime: string): string {
  const t = (mime || "").toLowerCase();
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg") || t.includes("opus")) return "ogg";
  if (t.includes("flac")) return "flac";
  if (t.includes("webm")) return "webm";
  if (t.includes("aac") || t.includes("m4a") || t.includes("mp4")) return "m4a";
  return "mp3";
}

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
  return enqueueSpeech(async () => {
    const blob = await synthesizeSpeech(trimmed, opts);

    // A provider that answers 200 with a JSON error, or with no Content-Type at all, yields a Blob
    // that is not audio. Saying so beats a clip that silently refuses to play on every client.
    if (blob.type && !blob.type.toLowerCase().startsWith("audio/")) {
      warn(`tts: provider returned "${blob.type}" instead of audio; playback will likely fail`);
    }

    const slot = broadcastSlot++ % BROADCAST_SLOTS;
    const path = await saveMedia(blob, "speech", {
      subfolder: "speech",
      fileName: `noodlr-speech-${speakerTag()}${slot}.${speechExt(blob.type)}`,
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
    debug("tts: broadcasting speech", { src, type: blob.type || "(none)", bytes: blob.size });
    stopCurrentAudio();
    // `true` = also emit to every other connected client.
    const sound: any = helper.play({ src, volume: 1.0, autoplay: true, loop: false }, true);

    // Other clients' playback can't be awaited, so hold the queue for the clip's own length.
    const seconds = await blobDuration(blob);
    // Whether the clip actually started, reported once rather than left to inference. A player
    // reporting silence while the GM hears the line is otherwise indistinguishable from a socket
    // that never arrived — and Firefox's own "Load of media resource failed" says nothing about
    // which of the two happened. Diagnostic only: no behaviour hangs off it. (2026-08-03)
    if (sound) {
      const state = { loaded: sound.loaded, failed: sound.failed, playing: sound.playing };
      if (state.failed || (!state.playing && !state.loaded)) {
        warn(`tts: local playback did not start (${JSON.stringify(state)}) for ${src}`);
      } else {
        debug("tts: local playback state", state);
      }
    }
    await sleep(seconds * 1000 + SPEECH_GAP_MS);
  });
}

/** Halt local playback without touching the queue. */
function stopCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Silence current speech AND abandon anything still queued behind it. */
export function stopSpeaking(): void {
  speechEpoch += 1;
  stopCurrentAudio();
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
