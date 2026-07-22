// Agent-Mode query decomposition (VectFox-inspired): an LLM turns one query into
// several focused sub-queries + salient entities, which the service fuses via multi-list
// RRF with entity soft-boosting. Best-effort: any failure falls back to the raw query.

import { getFeatureConfig } from "../providers/config";
import { isConfigured } from "../providers/types";
import { chatCompletion } from "../providers/chat-client";

export interface DecomposedQuery {
  searchTexts: string[];
  entities: string[];
}

const DECOMPOSE_SYSTEM =
  "You expand a tabletop RPG query into retrieval sub-queries. Respond with ONLY compact JSON of the form " +
  '{"subqueries":["...","..."],"entities":["Name","Place"]}. Provide 2-4 sub-queries covering distinct ' +
  "angles (facts, rules, relationships, history) and 0-6 proper-noun entities. No prose, no code fence.";

export async function decomposeQuery(query: string): Promise<DecomposedQuery> {
  const fallback: DecomposedQuery = { searchTexts: [query], entities: [] };
  const cfg = getFeatureConfig("chat");
  if (!isConfigured(cfg)) return fallback;

  try {
    const raw = await chatCompletion(cfg, {
      messages: [
        { role: "system", content: DECOMPOSE_SYSTEM },
        { role: "user", content: query },
      ],
      temperature: 0.2,
      maxTokens: 300,
    });
    const json = extractJson(raw);
    if (!json) return fallback;
    const parsed = JSON.parse(json);
    const searchTexts = toStringArray(parsed.subqueries);
    const entities = toStringArray(parsed.entities);
    return {
      searchTexts: searchTexts.length > 0 ? searchTexts : [query],
      entities,
    };
  } catch {
    return fallback;
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** Pull the first {...} JSON object out of a possibly-noisy model reply. */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
