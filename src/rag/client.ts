// Thin HTTP wrapper around the noodlr-memory service. One class, no state beyond
// connection config. All requests carry the shared secret header when set. Errors are
// surfaced as RagClientError so callers can degrade gracefully (the module must keep
// working — sans long-term memory — when the service is down).

import type { SiloId } from "./silos";

export interface RagConnection {
  /** Base service URL, e.g. http://127.0.0.1:3010 (no trailing slash needed). */
  serviceUrl: string;
  /** Shared secret (x-noodlr-secret); empty when the service runs without one. */
  secret: string;
}

/** Optional per-request embedding override (keeps keys server-side when omitted). */
export interface EmbedOverride {
  provider: "openrouter" | "custom" | "mock";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface RagHit {
  id: string;
  score: number;
  text: string;
  hash?: number | string;
  metadata?: Record<string, unknown>;
}

export interface QueryOptions {
  collections: SiloId[];
  searchText?: string;
  searchTexts?: string[];
  entities?: string[];
  topK?: number;
  threshold?: number;
  hybrid?: boolean;
  weights?: { cosine?: number; bm25?: number; importance?: number; recency?: number };
  embed?: EmbedOverride;
}

export interface IngestDocument {
  text: string;
  kind?: "prose" | "table" | "event";
  metadata?: Record<string, unknown>;
}

export interface CollectionsInfo {
  collections: Record<string, string>;
  stats: Record<string, unknown>;
}

export class RagClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RagClientError";
  }
}

export class RagClient {
  constructor(private readonly conn: RagConnection) {}

  private base(): string {
    return this.conn.serviceUrl.trim().replace(/\/+$/, "");
  }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    const secret = this.conn.secret.trim();
    if (secret) h["x-noodlr-secret"] = secret;
    return h;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.base()}/v1${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers(body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      throw new RagClientError(`Cannot reach memory service at ${url}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const txt = await res.text();
        const json = JSON.parse(txt);
        detail = json?.error ?? json?.message ?? txt ?? detail;
      } catch {
        /* keep statusText */
      }
      throw new RagClientError(`Memory service error (${res.status}): ${detail}`, res.status);
    }
    return (await res.json()) as T;
  }

  health(signal?: AbortSignal): Promise<{ ok: boolean; backend: string }> {
    return this.request("GET", "/health", undefined, signal);
  }

  collections(signal?: AbortSignal): Promise<CollectionsInfo> {
    return this.request("GET", "/collections", undefined, signal);
  }

  query(opts: QueryOptions, signal?: AbortSignal): Promise<{ hits: RagHit[]; mode: string }> {
    const body: Record<string, unknown> = {
      collections: opts.collections,
      topK: opts.topK ?? 5,
      hybrid: opts.hybrid ?? true,
    };
    if (opts.searchTexts?.length) body.searchTexts = opts.searchTexts;
    else if (opts.searchText) body.searchText = opts.searchText;
    if (opts.entities?.length) body.entities = opts.entities;
    if (opts.threshold !== undefined) body.threshold = opts.threshold;
    if (opts.weights) body.weights = opts.weights;
    if (opts.embed) body.embed = opts.embed;
    return this.request("POST", "/query", body, signal);
  }

  ingest(
    collection: SiloId,
    documents: IngestDocument[],
    embed?: EmbedOverride,
    signal?: AbortSignal,
  ): Promise<{ inserted: number; chunks: number }> {
    return this.request("POST", "/ingest", { collection, documents, embed }, signal);
  }

  ingestFile(
    collection: SiloId,
    filename: string,
    payload: { fileType: "text"; text: string } | { fileType: "pdf"; data: string },
    embed?: EmbedOverride,
    signal?: AbortSignal,
  ): Promise<{ inserted: number; chunks: number }> {
    return this.request(
      "POST",
      "/ingest-file",
      { collection, filename, ...payload, embed },
      signal,
    );
  }

  purge(collection: SiloId, signal?: AbortSignal): Promise<{ ok: boolean; purged: string }> {
    return this.request("POST", "/purge", { collection }, signal);
  }
}
