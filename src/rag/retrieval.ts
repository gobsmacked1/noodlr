// Retrieval at prompt-assembly time: query the configured silos, budget the results by
// token estimate, and format a single labeled context block. Degrades gracefully — if
// the service is unreachable the module keeps playing (no memory) and says so once.

import { MODULE_ID, RAG_SETTINGS, log } from "../constants";
import {
  getEmbedOverride,
  getQuerySilos,
  getRagClient,
  getRagTuning,
  isRagEnabled,
  isRerankEnabled,
  getRerankTopN,
} from "./config";
import { decomposeQuery } from "./agent-mode";
import { rerankDocuments } from "../providers/rerank";
import { bumpStats } from "../util/stats";
import type { RagHit } from "./client";
import { isCombatActive } from "../combat/tracker";
import { isSiloId } from "./silos";

/** Rough token estimate (~4 chars/token) — good enough for budgeting. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

let offlineNotified = false;

/**
 * Result of a retrieval pass. `block` is the labeled context (null when nothing usable was
 * produced). `queried` distinguishes "we actually ran a query" from "we skipped it" (disabled,
 * not GM, empty query, or the service was offline) — the web-search fallback must only consider
 * confidence when we genuinely queried and came up short.
 */
export interface RetrievalResult {
  block: string | null;
  /** Best relevance score among returned hits (backend-scaled); null when there were no hits. */
  topScore: number | null;
  hitCount: number;
  queried: boolean;
}

const NOT_QUERIED: RetrievalResult = { block: null, topScore: null, hitCount: 0, queried: false };

/**
 * Retrieve a labeled memory block for the given query. See {@link RetrievalResult}. Degrades
 * gracefully — a disabled/offline/empty case returns a not-queried result and the caller plays on.
 */
export async function retrieveContext(
  query: string,
  signal?: AbortSignal,
): Promise<RetrievalResult> {
  if (!isRagEnabled()) return NOT_QUERIED;
  // GM-only gate: memory is a GM-gated resource. Only the GM's client ever contacts
  // noodlr-memory, so the shared secret stays off player machines and shared chat isn't
  // written N times over. A player-initiated generation simply runs without a memory block.
  if (!game.user?.isGM) return NOT_QUERIED;
  const trimmed = query.trim();
  if (!trimmed) return NOT_QUERIED;

  const client = getRagClient();
  const silos = getQuerySilos();
  // During combat, always consult the rules silo (adjudication is frequent).
  if (isCombatActive() && isSiloId("rules") && !silos.includes("rules")) silos.push("rules");
  const { topK, hybrid, tokenBudget } = getRagTuning();
  const embed = getEmbedOverride();
  const agentMode = (game.settings.get(MODULE_ID, RAG_SETTINGS.agentMode) as boolean) ?? false;

  let searchTexts = [trimmed];
  let entities: string[] = [];
  if (agentMode) {
    const decomposed = await decomposeQuery(trimmed);
    searchTexts = decomposed.searchTexts;
    entities = decomposed.entities;
  }

  let hits: RagHit[];
  try {
    const result = await client.query(
      { collections: silos, searchTexts, entities, topK, hybrid, embed },
      signal,
    );
    hits = result.hits ?? [];
    bumpStats({ ragQueries: 1, ragHits: hits.length });
    offlineNotified = false;
  } catch (err) {
    if (!offlineNotified) {
      offlineNotified = true;
      log("memory service unreachable; continuing without long-term memory:", err);
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.Offline"));
    }
    return NOT_QUERIED;
  }

  // Confidence signal for the web-search fallback: the best raw hit score (pre-budget/pre-dedupe).
  const topScore = hits.length
    ? Math.max(...hits.map((h) => Number(h.score) || 0))
    : null;

  if (hits.length === 0) {
    return { block: null, topScore: null, hitCount: 0, queried: true };
  }
  hits = await maybeRerank(trimmed, hits, signal);
  const block = formatContextBlock(hits, tokenBudget);
  if (block) bumpStats({ ragInjectedChars: block.length });
  return { block, topScore, hitCount: hits.length, queried: true };
}

/**
 * Refine hit ordering with a cross-encoder rerank model (if enabled), keeping the top N. A
 * failed/absent rerank leaves the original hybrid ranking untouched.
 */
async function maybeRerank(
  query: string,
  hits: RagHit[],
  signal?: AbortSignal,
): Promise<RagHit[]> {
  if (!isRerankEnabled() || hits.length <= 1) return hits;
  const docs = hits.map((h) => (h.text ?? "").trim());
  const ranked = await rerankDocuments(query, docs, getRerankTopN(), signal);
  if (!ranked || ranked.length === 0) return hits;
  const kept = ranked.map((r) => hits[r.index]).filter((h): h is RagHit => Boolean(h));
  bumpStats({ rerankCalls: 1, rerankKept: kept.length });
  return kept;
}

function formatContextBlock(hits: RagHit[], tokenBudget: number): string | null {
  const header =
    "# Retrieved campaign memory\n" +
    "Authoritative reference retrieved from the campaign's memory. Use it to stay consistent; quote only when it matters.\n";
  let used = estimateTokens(header);
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const text = (hit.text ?? "").trim();
    if (!text || seen.has(text)) continue;
    const source =
      typeof hit.metadata?.sourceName === "string" ? ` (${hit.metadata.sourceName})` : "";
    const line = `- ${text}${source}`;
    const cost = estimateTokens(line);
    if (used + cost > tokenBudget) break;
    used += cost;
    seen.add(text);
    lines.push(line);
  }

  if (lines.length === 0) return null;
  return `${header}\n${lines.join("\n")}`;
}
