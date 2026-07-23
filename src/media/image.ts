// Image generation via OpenAI-compatible /images/generations (OpenRouter or custom,
// incl. Stable-Diffusion-compatible servers). SD-era params (steps, CFG, sampler, seed,
// negative prompt) are sent as extra body fields — ignored by strict OpenAI endpoints,
// consumed by SD-compatible ones. The scene prompt is optionally expanded by the chat
// model using the Image system-prompt override.

import { getFeatureConfig } from "../providers/config";
import { chatCompletion } from "../providers/chat-client";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";
import { getImageParams } from "./config";
import { getLedgerEntry } from "./storage";

export class ImageError extends Error {}

function authHeaders(cfg: FeatureProviderConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const key = cfg.apiKey.trim();
  if (key) h["Authorization"] = `Bearer ${key}`;
  return h;
}

/** Expand a scene description into a rich art prompt using the chat model, if enabled. */
async function expandPrompt(scene: string, systemPrompt: string): Promise<string> {
  const chatCfg = getFeatureConfig("chat");
  if (!isConfigured(chatCfg)) return scene;
  const sys =
    systemPrompt.trim() ||
    "You write concise, vivid text-to-image prompts for fantasy RPG scene art. Output only the prompt: subject, setting, lighting, mood, style. No preamble.";
  try {
    const out = await chatCompletion(chatCfg, {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: scene },
      ],
      temperature: 0.7,
      maxTokens: 200,
    });
    return out.trim() || scene;
  } catch {
    return scene;
  }
}

export interface GeneratedImage {
  /** A data: URL (from b64_json) or a remote URL, ready to display. */
  src: string;
  /** The final prompt used (post-expansion, incl. style prefix and any entity anchor). */
  prompt: string;
  /** The concrete seed sent to the provider (-1 means "provider randomized"). */
  seed: number;
  /** Model used. */
  model: string;
  /** The stable appearance/anchor text for the entity, if this was a keyed generation. */
  anchor?: string;
}

/**
 * Generate a scene image from a description. Returns a displayable src + the final prompt,
 * seed, and model so the caller can persist it.
 *
 * Continuity: when `entityKey` is supplied and the ledger already has that entity, we reuse
 * its stored appearance anchor + seed so a recurring character/location keeps a recognizable
 * look. A brand-new keyed entity gets a concrete random seed (not -1) so future reuse is
 * deterministic regardless of whether the provider echoes the seed back.
 */
export async function generateSceneImage(
  sceneDescription: string,
  opts: { signal?: AbortSignal; entityKey?: string } = {},
): Promise<GeneratedImage> {
  const cfg = getFeatureConfig("image");
  if (!isConfigured(cfg)) throw new ImageError("Image provider is not configured.");
  const params = getImageParams();

  const entry = opts.entityKey ? getLedgerEntry(opts.entityKey) : undefined;
  const anchor = entry?.prompt?.trim() ?? "";

  const baseSubject = params.expand
    ? await expandPrompt(sceneDescription, params.systemPrompt)
    : sceneDescription.trim();

  // Compose the subject: a keyed entity's stable appearance anchor leads, then this scene's
  // specifics (if any). Non-keyed generations are just the subject.
  let subject: string;
  if (anchor) subject = baseSubject ? `${anchor}. ${baseSubject}` : anchor;
  else subject = baseSubject;

  // Prepend the global positive/style prefix so all art shares a look (SD "style, subject").
  const style = params.positive.trim();
  const prompt = style ? `${style}, ${subject}` : subject;

  // Resolve the seed: reuse the entity's, else the global fixed seed, else a concrete random
  // seed for keyed entities (so it can be reused), else -1 for a one-off random image.
  let seed: number;
  if (entry) seed = entry.seed;
  else if (params.seed >= 0) seed = params.seed;
  else if (opts.entityKey) seed = Math.floor(Math.random() * 2 ** 31);
  else seed = -1;

  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt,
    n: 1,
    size: params.size,
    response_format: "b64_json",
    // SD-compatible extras (harmless to OpenAI):
    steps: params.steps,
    cfg_scale: params.cfg,
    sampler_name: params.sampler,
    negative_prompt: params.negative,
  };
  if (seed >= 0) body.seed = seed;

  const res = await fetch(`${resolveBaseUrl(cfg)}/images/generations`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new ImageError(`Image error (${res.status}): ${await res.text()}`);

  const json = await res.json();
  const first = json?.data?.[0];
  // The anchor to persist for a keyed entity: keep the first-captured appearance stable
  // (don't overwrite it with later scene-specific text).
  const newAnchor = opts.entityKey ? anchor || baseSubject : undefined;
  if (first?.b64_json) {
    return { src: `data:image/png;base64,${first.b64_json}`, prompt, seed, model: cfg.model, anchor: newAnchor };
  }
  if (first?.url) {
    return { src: String(first.url), prompt, seed, model: cfg.model, anchor: newAnchor };
  }
  throw new ImageError("Image response contained no image data.");
}
