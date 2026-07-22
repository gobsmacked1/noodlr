// Speech-to-text via OpenAI-compatible /audio/transcriptions (multipart). Used by the
// push-to-log capture loop. Whisper-style default model.

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";

export class TranscriptionError extends Error {}

function authHeaders(cfg: FeatureProviderConfig): Record<string, string> {
  const h: Record<string, string> = {};
  const key = cfg.apiKey.trim();
  if (key) h["Authorization"] = `Bearer ${key}`;
  return h; // NOTE: no Content-Type — the browser sets the multipart boundary.
}

/** Transcribe an audio blob to text. */
export async function transcribeAudio(
  blob: Blob,
  filename = "segment.webm",
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const cfg = getFeatureConfig("transcription");
  if (!isConfigured(cfg)) throw new TranscriptionError("Transcription provider is not configured.");

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", cfg.model);
  form.append("response_format", "json");

  const res = await fetch(`${resolveBaseUrl(cfg)}/audio/transcriptions`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: form,
    signal: opts.signal,
  });
  if (!res.ok)
    throw new TranscriptionError(`Transcription error (${res.status}): ${await res.text()}`);

  const json = await res.json();
  return typeof json?.text === "string" ? json.text.trim() : "";
}
