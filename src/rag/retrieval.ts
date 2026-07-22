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
} from "./config";
import { decomposeQuery } from "./agent-mode";
import type { RagHit } from "./client";
import { isCombatActive } from "../combat/tracker";
import { isSiloId } from "./silos";

/** Rough token estimate (~4 chars/token) — good enough for budgeting. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

let offlineNotified = false;

/**
 * Retrieve a labeled memory block for the given query, or null when RAG is disabled,
 * returns nothing, or the service is unreachable.
 */
export async function retrieveContext(query: string, signal?: AbortSignal): Promise<string | null> {
  if (!isRagEnabled()) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

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
    offlineNotified = false;
  } catch (err) {
    if (!offlineNotified) {
      offlineNotified = true;
      log("memory service unreachable; continuing without long-term memory:", err);
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.Offline"));
    }
    return null;
  }

  if (hits.length === 0) return null;
  return formatContextBlock(hits, tokenBudget);
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
