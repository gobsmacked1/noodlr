// Streaming chat client for OpenAI-compatible /chat/completions endpoints
// (OpenRouter or any custom base URL). Parses Server-Sent Events incrementally and
// surfaces errors clearly. Runs in Foundry's browser context: uses fetch + ReadableStream.

import { type ChatMessage, type FeatureProviderConfig, resolveBaseUrl } from "./types";
import { MODULE_TITLE } from "../constants";

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  /** Sampling temperature; omitted from the body when undefined. */
  temperature?: number;
  /** Max tokens to generate; omitted when undefined. */
  maxTokens?: number;
  /** Abort signal to cancel an in-flight stream. */
  signal?: AbortSignal;
}

/** Error carrying the HTTP status (when the failure came from the endpoint). */
export class ChatClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ChatClientError";
  }
}

function buildHeaders(cfg: FeatureProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = cfg.apiKey.trim();
  if (key) headers["Authorization"] = `Bearer ${key}`;
  if (cfg.provider === "openrouter") {
    // Optional attribution headers OpenRouter uses for ranking; harmless elsewhere.
    headers["HTTP-Referer"] = "https://math.secretdoor.app/gobsmacked1/noodlr";
    headers["X-Title"] = MODULE_TITLE;
  }
  return headers;
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText;
    try {
      const json = JSON.parse(text);
      return json?.error?.message ?? json?.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return res.statusText;
  }
}

/**
 * Stream a chat completion. Yields incremental content deltas as they arrive.
 * Throws ChatClientError on any failure (network, HTTP, or malformed stream).
 */
export async function* streamChatCompletion(
  cfg: FeatureProviderConfig,
  options: ChatCompletionOptions,
): AsyncGenerator<string, void, void> {
  const url = `${resolveBaseUrl(cfg)}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: options.messages,
    stream: true,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(cfg),
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw new ChatClientError(`Network error contacting ${url}: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new ChatClientError(await readErrorBody(res), res.status);
  }
  if (!res.body) {
    throw new ChatClientError("Response contained no body to stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Process complete frames only.
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const delta = parseSseFrame(frame);
        if (delta === DONE) return;
        if (delta) yield delta;
      }
    }
    // Flush any trailing frame without a terminating blank line.
    const delta = parseSseFrame(buffer);
    if (delta && delta !== DONE) yield delta;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw new ChatClientError(`Error reading stream: ${(err as Error).message}`);
  } finally {
    reader.releaseLock();
  }
}

const DONE = Symbol("sse-done");

/** Parse a single SSE frame; returns the content delta, DONE, or null. */
function parseSseFrame(frame: string): string | typeof DONE | null {
  let content = "";
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) continue; // comment / keep-alive
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return DONE;
    try {
      const json = JSON.parse(data);
      const piece = json?.choices?.[0]?.delta?.content;
      if (typeof piece === "string") content += piece;
    } catch {
      // Ignore unparseable keep-alive/partial lines.
    }
  }
  return content || null;
}

/** Non-streaming convenience wrapper: accumulate the full completion text. */
export async function chatCompletion(
  cfg: FeatureProviderConfig,
  options: ChatCompletionOptions,
): Promise<string> {
  let out = "";
  for await (const delta of streamChatCompletion(cfg, options)) out += delta;
  return out;
}
