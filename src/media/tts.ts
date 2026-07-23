// Text-to-speech via OpenAI-compatible /audio/speech (OpenRouter or custom, incl. local
// presets like openedai-speech). Dynamic voice listing tries the common /audio/voices
// endpoint and falls back to the standard OpenAI voice names.

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";
import { getTtsVoice } from "./config";

export const FALLBACK_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/** Parse the several shapes an /audio/voices response can take into a flat name list. */
function parseVoiceList(json: unknown): string[] {
  const j = json as { voices?: unknown; data?: unknown };
  const raw = j?.voices ?? j?.data ?? json;
  if (Array.isArray(raw)) {
    const names = raw
      .map((v: unknown) =>
        typeof v === "string" ? v : ((v as { id?: string; name?: string })?.id ?? (v as { name?: string })?.name),
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
  opts: { voice?: string; format?: string; signal?: AbortSignal } = {},
): Promise<Blob> {
  const cfg = getFeatureConfig("tts");
  if (!isConfigured(cfg)) throw new TtsError("TTS provider is not configured.");
  const url = `${resolveBaseUrl(cfg)}/audio/speech`;
  const body = {
    model: cfg.model,
    input: text,
    voice: opts.voice ?? getTtsVoice() ?? "alloy",
    response_format: opts.format ?? "mp3",
  };
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
export async function speak(text: string, voice?: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const blob = await synthesizeSpeech(trimmed, voice ? { voice } : {});
  stopSpeaking();
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  currentAudio = audio;
  audio.addEventListener("ended", () => URL.revokeObjectURL(objectUrl));
  await audio.play().catch(() => URL.revokeObjectURL(objectUrl));
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Retrieve available voices from the provider, or the standard fallback list. */
export async function listVoices(): Promise<string[]> {
  const cfg = getFeatureConfig("tts");
  if (!isConfigured(cfg)) return FALLBACK_VOICES;
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
