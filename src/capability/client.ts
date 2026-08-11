// A JSON completion client for compilation, deliberately separate from `providers/chat-client.ts`.
//
// That client streams a reply into a chat panel one token at a time, which is exactly right for a
// conversation and exactly wrong here: it has no JSON mode, no retry, and no rate-limit handling. A
// scene load fires tens of unattended calls at once, so the requirements invert — no streaming,
// strict JSON, and the patience to survive a 429 without losing the batch. Same conclusion the
// corpus miner reached against the same client, for the same reasons.
//
// Everything else is shared: the provider config, the resolved base URL, the OpenRouter attribution
// headers, the token counters. Only the request shape differs.

import { MODULE_TITLE, warn } from "../constants";
import { resolveBaseUrl, type ChatMessage, type FeatureProviderConfig } from "../providers/types";
import { bumpStats } from "../util/stats";

export class CompileError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfter: number;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; retryAfter?: number } = {},
  ) {
    super(message);
    this.name = "CompileError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter ?? 0;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A rate limit belongs to the account, so backing off from one has to as well.
 *
 * With several requests in flight a 429 means the key is over its limit, not that one request was
 * unlucky. Private backoff marches every worker into the same wall in lockstep and burns all their
 * retries at once. One gate: whoever is told to wait sets the time and everybody honours it.
 */
let pausedUntil = 0;

async function awaitGate(): Promise<void> {
  for (;;) {
    const remaining = pausedUntil - Date.now();
    if (remaining <= 0) return;
    await sleep(remaining);
  }
}

/**
 * Pull a JSON object out of a reply.
 *
 * Models fence their output even in JSON mode often enough that rejecting it would throw away good
 * work and pay to redo it. Fences come off, and a still-unparseable reply falls back to the
 * outermost brace pair before we give up.
 */
export function parseJsonReply(text: string): unknown {
  let body = String(text ?? "").trim();
  body = body.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(body);
  } catch {
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(body.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new CompileError(`the reply was not JSON: ${body.slice(0, 200)}`);
}

function headersFor(cfg: FeatureProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = cfg.apiKey.trim();
  if (key) headers["Authorization"] = `Bearer ${key}`;
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://math.secretdoor.app/gobsmacked1/noodlr";
    headers["X-Title"] = MODULE_TITLE;
  }
  return headers;
}

export interface CompleteJsonOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxRetries?: number;
  timeoutMs?: number;
}

/** One completion, parsed as JSON, with retries and a shared rate-limit gate. */
export async function completeJson(
  cfg: FeatureProviderConfig,
  options: CompleteJsonOptions,
): Promise<unknown> {
  const url = `${resolveBaseUrl(cfg)}/chat/completions`;
  const maxRetries = options.maxRetries ?? 4;
  const timeoutMs = options.timeoutMs ?? 180_000;

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: options.messages,
    // Compilation must be reproducible. The same wording read twice has to produce the same
    // descriptor, or a cache miss silently disagrees with the entry it is replacing.
    temperature: 0,
    response_format: { type: "json_object" },
  };
  // Same lesson as v0.4.2: an account-level Web Search default cannot be fully switched off in
  // OpenRouter's dashboard, and left alone it would run a search on every one of these calls — for
  // a job whose entire point is to read THIS sheet rather than what the internet says about the
  // monster. Custom endpoints do not understand `plugins`, so they never see it.
  if (cfg.provider === "openrouter") body.plugins = [{ id: "web", enabled: false }];

  for (let attempt = 1; ; attempt++) {
    await awaitGate();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: headersFor(cfg),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        // 429 is a rate limit and 5xx is the provider having a moment; both pass with time.
        // 400/401/402 is a fault in how we are asking and will never pass, so retrying only
        // multiplies the error.
        throw new CompileError(`HTTP ${res.status}: ${detail}`, {
          status: res.status,
          retryable: res.status === 429 || res.status >= 500,
          retryAfter: Number(res.headers.get("retry-after")) || 0,
        });
      }

      const payload = (await res.json()) as any;
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new CompileError("the reply had no content", { retryable: true });
      bumpStats({
        promptTokens: Number(payload?.usage?.prompt_tokens) || 0,
        completionTokens: Number(payload?.usage?.completion_tokens) || 0,
      });
      return parseJsonReply(String(content));
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      if (aborted && options.signal?.aborted) throw new CompileError("cancelled");
      const error = err as CompileError;
      // A TypeError from fetch is the network, not us, and is worth another go.
      const retryable = aborted || error?.retryable === true || (err as Error)?.name === "TypeError";
      if (!retryable || attempt > maxRetries) {
        throw err instanceof CompileError
          ? err
          : new CompileError(aborted ? `timed out after ${timeoutMs}ms` : String(err));
      }
      const wait = error?.retryAfter
        ? error.retryAfter * 1000
        : Math.min(60_000, 2 ** attempt * 1000) + Math.random() * 1000;
      warn(`compile retry ${attempt}/${maxRetries} in ${Math.round(wait / 1000)}s: ${error.message}`);
      // Only a rate limit is everybody's problem. Stalling the other workers for one 500 or one
      // timeout would throw away throughput for nothing.
      if (error?.status === 429) pausedUntil = Math.max(pausedUntil, Date.now() + wait);
      await sleep(wait);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
