// Video (text-to-video) generation. OpenRouter's /videos endpoint is ASYNCHRONOUS: POST returns
// a job { id, polling_url, status }, which we poll until status=completed, then read the finished
// clip URL from `unsigned_urls[0]`. Verified against OpenRouter's video-generation API schema
// (statuses: pending | in_progress | completed | failed | cancelled | expired).

import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl } from "../providers/types";

export class VideoError extends Error {}

export interface GeneratedVideo {
  url: string;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve a (possibly relative) polling URL against the API origin. */
function resolvePollUrl(base: string, job: { polling_url?: string; id?: string }): string {
  const p = job.polling_url || `/api/v1/videos/${job.id ?? ""}`;
  if (/^https?:\/\//i.test(p)) return p;
  try {
    const origin = new URL(base).origin;
    return origin + (p.startsWith("/") ? p : `/${p}`);
  } catch {
    return `${base}/videos/${job.id ?? ""}`;
  }
}

interface VideoJob {
  id?: string;
  polling_url?: string;
  status?: string;
  unsigned_urls?: string[];
  error?: string;
}

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);

/**
 * Generate a video from a text prompt. Submits, then polls (~4s cadence, 5-min cap) until the
 * clip is ready. Returns its URL. Throws VideoError on failure/timeout.
 */
export async function generateVideo(
  prompt: string,
  opts: {
    duration?: number;
    resolution?: string;
    aspect?: string;
    seed?: number;
    signal?: AbortSignal;
    onStatus?: (status: string) => void;
  } = {},
): Promise<GeneratedVideo> {
  const cfg = getFeatureConfig("video");
  if (!isConfigured(cfg)) throw new VideoError("Video provider is not configured.");
  const base = resolveBaseUrl(cfg);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey.trim()) headers["Authorization"] = `Bearer ${cfg.apiKey.trim()}`;

  const body: Record<string, unknown> = { model: cfg.model, prompt };
  if (opts.duration && opts.duration > 0) body.duration = opts.duration;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.aspect) body.aspect_ratio = opts.aspect;
  if (typeof opts.seed === "number" && opts.seed >= 0) body.seed = opts.seed;

  const res = await fetch(`${base}/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new VideoError(`Video error (${res.status}): ${await safeText(res)}`);

  let job: VideoJob = await res.json();
  const pollUrl = resolvePollUrl(base, job);
  const deadline = Date.now() + 5 * 60 * 1000;

  while (job?.status && !TERMINAL.has(job.status)) {
    if (Date.now() > deadline) throw new VideoError("Video generation timed out.");
    opts.onStatus?.(job.status);
    await sleep(4000);
    const pr = await fetch(pollUrl, { headers, signal: opts.signal });
    if (!pr.ok) throw new VideoError(`Video poll error (${pr.status})`);
    job = await pr.json();
  }

  if (job?.status !== "completed") {
    throw new VideoError(`Video ${job?.status ?? "failed"}${job?.error ? `: ${job.error}` : ""}`);
  }
  const url = Array.isArray(job.unsigned_urls) ? job.unsigned_urls[0] : undefined;
  if (!url) throw new VideoError("Video completed but returned no URL.");
  return { url: String(url) };
}
