// The memory-backend contract. Both the remote noodlr-memory HTTP client (RagClient) and the
// in-browser LocalMemory ("RAG Lite") implement this identical surface, so retrieval, ingest,
// diagnostics, and the Manage-Memory UI call the same methods regardless of which is active.

import type {
  CollectionsInfo,
  EmbedOverride,
  IngestDocument,
  QueryOptions,
  RagHit,
} from "./client";
import type { SiloId } from "./silos";

export type { CollectionsInfo, EmbedOverride, IngestDocument, QueryOptions, RagHit };

export interface MemoryBackend {
  health(signal?: AbortSignal): Promise<{ ok: boolean; backend: string }>;
  collections(signal?: AbortSignal): Promise<CollectionsInfo>;
  query(opts: QueryOptions, signal?: AbortSignal): Promise<{ hits: RagHit[]; mode: string }>;
  ingest(
    collection: SiloId,
    documents: IngestDocument[],
    embed?: EmbedOverride,
    signal?: AbortSignal,
  ): Promise<{ inserted: number; chunks: number }>;
  ingestFile(
    collection: SiloId,
    filename: string,
    payload: { fileType: "text"; text: string } | { fileType: "pdf"; data: string },
    embed?: EmbedOverride,
    signal?: AbortSignal,
    importance?: number,
  ): Promise<{ inserted: number; chunks: number }>;
  purge(collection: SiloId, signal?: AbortSignal): Promise<{ ok: boolean; purged: string }>;
  /** Delete specific rows by id and/or content hash (bot-driven UPDATE/FORGET). */
  delete(
    collection: SiloId,
    sel: { ids?: string[]; hashes?: number[] },
    signal?: AbortSignal,
  ): Promise<{ ok: boolean }>;
}
