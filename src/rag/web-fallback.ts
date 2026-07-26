// Confidence-gated web-search fallback. When campaign memory comes back empty (or weak), and the
// GM has opted in, we let OpenRouter ground THIS single chat request with a one-shot web search
// instead of leaving the DM to answer from the model's parametric memory alone.
//
// Deliberately module-controlled (not the OpenRouter account-level "default plugin"): the account
// default would fire a web search on EVERY request, bloating tokens and cost and pulling irrelevant
// web content into a fictional campaign. Here it fires only as a last resort, under our threshold,
// and only for the OpenRouter chat provider (the `web` plugin is an OpenRouter feature; custom /
// local OpenAI-compatible endpoints ignore it).
//
// NOTE: OpenRouter marks the `web` plugin deprecated in favor of the `openrouter:web_search`
// *server tool*. We intentionally use the plugin here because it runs EXACTLY ONCE per request and
// streams its results inline — a deterministic "search now" that fits a confidence gate. The server
// tool lets the model decide whether to search at all, which defeats the purpose of a fallback and
// complicates our SSE stream. If the plugin is ever removed, swap the body built below.

import type { FeatureProviderConfig } from "../providers/types";
import { getWebFallbackConfig } from "./config";
import type { RetrievalResult } from "./retrieval";

/** OpenRouter `web` plugin descriptor (loose shape; only what we send). */
interface WebPlugin {
  id: "web";
  max_results: number;
  search_prompt: string;
}

const SEARCH_PROMPT =
  "A web search was run because the campaign's own memory had no confident answer. Use these " +
  "results ONLY if they are relevant to the question; prefer established campaign canon over the " +
  "open web, and never contradict prior fiction. Cite sources as markdown links named by domain, " +
  "e.g. [example.com](https://example.com/page).";

/** Whether retrieval came back weak enough to warrant a web search (given the opt-in threshold). */
export function isLowConfidence(rag: RetrievalResult, minScore: number): boolean {
  if (!rag.queried) return false;
  if (rag.hitCount === 0) return true;
  return rag.topScore != null && rag.topScore <= minScore;
}

/**
 * Build the `plugins` array for a chat request, or undefined when the fallback should not fire.
 * Fires only when: the feature is on, the provider is OpenRouter, we actually queried memory, and
 * the result was low-confidence.
 */
export function buildWebFallbackPlugins(
  cfg: FeatureProviderConfig,
  rag: RetrievalResult,
): unknown[] | undefined {
  if (cfg.provider !== "openrouter") return undefined;
  const wf = getWebFallbackConfig();
  if (!wf.enabled) return undefined;
  if (!isLowConfidence(rag, wf.minScore)) return undefined;

  const plugin: WebPlugin = {
    id: "web",
    max_results: wf.maxResults,
    search_prompt: SEARCH_PROMPT,
  };
  return [plugin];
}
