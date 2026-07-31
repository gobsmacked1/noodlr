// Bot-driven memory writes (REMEMBER / UPDATE / FORGET), executed on the GM's client only and
// enforced against the access matrix (silos.ts). A bot can never mutate a silo it isn't entitled to;
// the players-bot in particular has zero write access to gm_*. Every write is audited to the GM.
//
// UPDATE/FORGET target a memory by a fuzzy `match` query (the model doesn't know internal ids): we
// retrieve the single best match in that silo and act on its id. If nothing matches, we no-op rather
// than guess — destructive actions never fall back to "delete something arbitrary".

import { getEmbedOverride, getRagClient, isRagEnabled } from "./config";
import { canWrite, isSiloId, writableSilos, type MemoryAudience } from "./silos";
import { RagClientError } from "./client";
import type { Directive } from "../players/directives";
import { auditToGM } from "../util/audit";
import { bumpStats } from "../util/stats";
import { sanitizeUserText } from "../util/sanitize";
import { log } from "../constants";

export interface WriteResult {
  ok: boolean;
  /** Short human summary (also audited). */
  message: string;
}

const MAX_WRITE_CHARS = 2000;

/**
 * Execute one memory directive with matrix enforcement + audit. `audience` is the bot acting
 * ("gm" or "player"). Returns a result; never throws (failures are logged/audited).
 */
export async function applyMemoryDirective(
  audience: MemoryAudience,
  directive: Directive,
): Promise<WriteResult> {
  if (!isRagEnabled()) return { ok: false, message: "memory disabled" };

  const data = directive.data ?? {};
  const siloRaw = String((data as any).silo ?? "");
  if (!isSiloId(siloRaw)) {
    return reject(`unknown silo "${siloRaw}"`, audience, directive.verb);
  }
  const silo = siloRaw;
  const op =
    directive.verb === "REMEMBER" ? "insert" : directive.verb === "UPDATE" ? "update" : "delete";

  if (!canWrite(audience, silo, op)) {
    return reject(`${audience} bot may not ${op} ${silo}`, audience, directive.verb);
  }

  const client = getRagClient();
  const embed = getEmbedOverride();
  const text = sanitizeUserText(String((data as any).text ?? ""), { maxLength: MAX_WRITE_CHARS });
  const match = sanitizeUserText(String((data as any).match ?? ""), {
    maxLength: 400,
    allowNewlines: false,
  });

  try {
    if (directive.verb === "REMEMBER") {
      if (!text) return reject("empty REMEMBER text", audience, directive.verb);
      const res = await client.ingest(
        silo,
        [{ text, metadata: { source: "bot-write", audience, ts: Date.now() } }],
        embed,
      );
      bumpStats({ ingestDocs: res?.inserted ?? 1, ingestChunks: res?.chunks ?? 0 });
      return audit(true, `${audience} remembered → ${silo}: ${clip(text)}`);
    }

    // UPDATE / FORGET both need to find the target row first.
    if (!match) return reject(`${directive.verb} requires "match"`, audience, directive.verb);
    const found = await client.query(
      { collections: [silo], searchText: match, topK: 1, hybrid: true, embed },
      undefined,
    );
    const hit = found.hits?.[0];
    if (!hit?.id)
      return audit(false, `${directive.verb} on ${silo}: no match for "${clip(match)}"`);

    if (directive.verb === "FORGET") {
      await client.delete(silo, { ids: [hit.id] });
      return audit(true, `${audience} forgot from ${silo}: ${clip(hit.text ?? match)}`);
    }

    // UPDATE = replace: delete the matched row, insert the new text.
    if (!text) return reject("empty UPDATE text", audience, directive.verb);
    await client.delete(silo, { ids: [hit.id] });
    const res = await client.ingest(
      silo,
      [{ text, metadata: { source: "bot-write", audience, ts: Date.now() } }],
      embed,
    );
    bumpStats({ ingestDocs: res?.inserted ?? 1, ingestChunks: res?.chunks ?? 0 });
    return audit(true, `${audience} updated ${silo}: ${clip(text)}`);
  } catch (err) {
    const msg = err instanceof RagClientError ? err.message : String(err);
    log("memory write failed:", msg);
    return audit(false, `${directive.verb} on ${silo} failed: ${msg}`);
  }
}

/** Apply every write directive in a list; adjudication/GM turns can produce several. */
export async function applyMemoryDirectives(
  audience: MemoryAudience,
  directives: Directive[],
): Promise<void> {
  for (const d of directives) {
    if (d.verb === "ADJUDICATE") continue; // not a write
    await applyMemoryDirective(audience, d);
  }
}

function reject(reason: string, audience: MemoryAudience, verb: string): WriteResult {
  return audit(false, `${audience} ${verb} denied: ${reason}`);
}

function audit(ok: boolean, message: string): WriteResult {
  void auditToGM(message);
  return { ok, message };
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

/**
 * A compact capability block telling a bot it MAY manage long-term memory via directives. Injected
 * as a separate system message (so the verbatim DM prompt is untouched). Only lists silos the given
 * audience can actually write, and stresses "durable state, not chatter/rules".
 */
export function buildMemoryToolsPrompt(audience: MemoryAudience): string {
  const silos = writableSilos(audience).join(", ");
  return (
    "# Memory tools (optional)\n" +
    "You may durably RECORD, REVISE, or REMOVE concrete world-state facts in long-term memory by " +
    "ending your reply with one or more directive lines. Players never see them (they are stripped " +
    "before display). Use these ONLY for durable state worth recalling across sessions — a fact " +
    "established, an item gained/lost, an NPC's status change, a quest step, a revealed or newly " +
    "hidden secret. NEVER for rules explanations, brainstorming, general chat, or transient narration.\n" +
    '- Record:  @@NOODLR REMEMBER {"silo":"<silo>","text":"<one concise fact>"}\n' +
    '- Revise:  @@NOODLR UPDATE {"silo":"<silo>","match":"<text identifying the fact>","text":"<corrected fact>"}\n' +
    '- Remove:  @@NOODLR FORGET {"silo":"<silo>","match":"<text identifying the fact>"}\n' +
    "Route by WHO KNOWS the fact: gm_* = no player knows it yet (secrets, villain plans, unrevealed " +
    "truths); player_* = at least one player already knows it. Emit nothing if there is no durable " +
    "change.\n" +
    `Writable silos: ${silos}.`
  );
}
