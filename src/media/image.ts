// Image generation via OpenAI-compatible /images/generations (OpenRouter or custom,
// incl. Stable-Diffusion-compatible servers). SD-era params (steps, CFG, sampler, seed,
// negative prompt) are sent as extra body fields — ignored by strict OpenAI endpoints,
// consumed by SD-compatible ones. The scene prompt is optionally expanded by the chat
// model using the Image system-prompt override.

import { getFeatureConfig } from "../providers/config";
import { chatCompletion } from "../providers/chat-client";
import { isConfigured, resolveBaseUrl, type FeatureProviderConfig } from "../providers/types";
import { getImageParams } from "./config";

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
  /** The final prompt used (post-expansion). */
  prompt: string;
}

/** Generate a scene image from a description. Returns a displayable src + final prompt. */
export async function generateSceneImage(
  sceneDescription: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GeneratedImage> {
  const cfg = getFeatureConfig("image");
  if (!isConfigured(cfg)) throw new ImageError("Image provider is not configured.");
  const params = getImageParams();

  const subject = params.expand
    ? await expandPrompt(sceneDescription, params.systemPrompt)
    : sceneDescription;

  // Prepend the positive/style prefix so every image shares a consistent look, followed by
  // the specific subject for this scene. (Style prefix + subject is a common SD technique.)
  const style = params.positive.trim();
  const prompt = style ? `${style}, ${subject}` : subject;

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
  if (params.seed >= 0) body.seed = params.seed;

  const res = await fetch(`${resolveBaseUrl(cfg)}/images/generations`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new ImageError(`Image error (${res.status}): ${await res.text()}`);

  const json = await res.json();
  const first = json?.data?.[0];
  if (first?.b64_json) return { src: `data:image/png;base64,${first.b64_json}`, prompt };
  if (first?.url) return { src: String(first.url), prompt };
  throw new ImageError("Image response contained no image data.");
}
