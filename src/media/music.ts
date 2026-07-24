// Music (text-to-audio) generation. OpenRouter has no dedicated music endpoint: music models
// (e.g. google/lyria-3-*) run through /chat/completions with `modalities:["text","audio"]` and
// `stream:true`, delivering base64 audio incrementally in `delta.audio.data`. We concatenate all
// base64 chunks and decode once (chunk boundaries aren't 4-char aligned, so per-chunk decode
// would corrupt the file). Verified against OpenRouter's audio-output docs.

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl } from "../providers/types";

export class MusicError extends Error {}

export interface GeneratedMusic {
  blob: Blob;
  format: string;
  transcript?: string;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function mimeFor(format: string): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "pcm16":
      return "audio/wav";
    default:
      return "audio/mpeg";
  }
}

/** Generate music from a text prompt. Returns an audio Blob. Throws MusicError on failure. */
export async function generateMusic(
  prompt: string,
  opts: { signal?: AbortSignal; format?: string } = {},
): Promise<GeneratedMusic> {
  const cfg = getFeatureConfig("music");
  if (!isConfigured(cfg)) throw new MusicError("Music provider is not configured.");
  const format = opts.format ?? "mp3";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey.trim()) headers["Authorization"] = `Bearer ${cfg.apiKey.trim()}`;

  const res = await fetch(`${resolveBaseUrl(cfg)}/chat/completions`, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["text", "audio"],
      audio: { format },
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new MusicError(`Music error (${res.status}): ${await safeText(res)}`);
  }

  const b64parts: string[] = [];
  let transcript = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const audio = json?.choices?.[0]?.delta?.audio;
          if (audio?.data) b64parts.push(String(audio.data));
          if (audio?.transcript) transcript += String(audio.transcript);
        } catch {
          /* keepalive / partial frame — ignore */
        }
      }
    }
  }

  if (b64parts.length === 0) throw new MusicError("Music response contained no audio data.");
  const bytes = base64ToBytes(b64parts.join(""));
  return {
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: mimeFor(format) }),
    format,
    transcript: transcript || undefined,
  };
}
