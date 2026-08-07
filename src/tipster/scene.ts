// Tipster (T1): live, on-demand scene briefing injected into the prompt.
//
// Design decisions (see AGENTS.md "Tipster"):
//   - NOT RAG-backed. Live scene state is already authoritative in Foundry and readable
//     synchronously; RAG retrieval is semantic/top-k (wrong for exact facts), costs an embedding
//     call per write, and is async where prompt assembly is synchronous.
//   - Ephemeral by construction: this module only ever RETURNS a string. Nothing is cached and
//     nothing is written to conversation history, so a briefing cannot leak into a later turn.
//     A cached block would be a *wrong* block the moment anything in the scene moves.
//   - The header line is "Token/Object Speaking:" because the caller may be a player, the GM, or
//     (later) an internal automation such as an NPC-movement AI.
//
// Scope so far:
//   T1 — scene ambience + world time. Nothing there is secret.
//   T2 — the roster of who is present, which IS privilege-bearing: the GM sees hidden tokens,
//        secret-disposition tokens, and HP; a player sees none of the three (a hidden token is
//        omitted entirely, not marked as concealed — its existence is the secret).
// Still to come: per-token perception, so a player only learns about tokens their own token could
// actually see (line of sight / senses) rather than everything unhidden on the map (T3).

import { log } from "../constants";
import { playedTokens } from "../util/speaker";
import { readHp, hpTier } from "../combat/tracker";

/** Who requested the briefing. Drives the header line and (from T3) the visibility filter. */
export type TipsterCaller = "player" | "gm" | "automation";

export interface TipsterInput {
  caller: TipsterCaller;
  /** Display name of the requesting user, when there is one. */
  userName?: string;
  /**
   * The token whose perspective the briefing is built from. T1 only uses it for the header line;
   * T2/T3 will read position, senses, and perception from it.
   */
  token?: any;
}

/** Round a number to at most one decimal place, without trailing ".0". */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Scene dimensions expressed in grid units rather than pixels, because "40x30 squares, 5 ft/square"
 * is meaningful to a model and "4000x3000 pixels" is not. Gridless scenes report pixels honestly.
 */
function describeDimensions(scene: any): string {
  const gridSize = Number(scene?.grid?.size) || 0;
  const w = Number(scene?.width) || 0;
  const h = Number(scene?.height) || 0;
  if (!w || !h) return "";
  // grid.type 0 === GRIDLESS; avoid inventing square counts when there is no grid.
  const gridless = Number(scene?.grid?.type ?? 0) === 0;
  if (gridless || !gridSize) return `${w}x${h} px (gridless)`;

  const cols = Math.round(w / gridSize);
  const rows = Math.round(h / gridSize);
  const distance = Number(scene?.grid?.distance) || 0;
  const units = String(scene?.grid?.units ?? "").trim();
  const scale = distance && units ? `, ${distance} ${units}/square` : "";
  return `${cols}x${rows} squares${scale}`;
}

/**
 * Illumination as a phrase, from environment.darknessLevel (0 = full light, 1 = full dark) plus
 * globalLight. v13 nests these under `environment`; older data kept them at the top level, so read
 * both. Best-effort: an unreadable value simply omits the line.
 */
function describeLight(scene: any): string {
  const env = scene?.environment ?? {};
  const raw = env.darknessLevel ?? scene?.darkness;
  if (typeof raw !== "number") return "";

  const d = Math.max(0, Math.min(1, raw));
  const phrase =
    d >= 0.9
      ? "pitch dark"
      : d >= 0.6
        ? "dark"
        : d >= 0.35
          ? "dim"
          : d > 0.05
            ? "well lit"
            : "bright daylight";
  const global = env.globalLight?.enabled ?? scene?.globalLight;
  const globalStr =
    global === false ? "no ambient light" : global === true ? "ambient light on" : "";
  return globalStr
    ? `${phrase} (darkness ${round1(d)}, ${globalStr})`
    : `${phrase} (darkness ${round1(d)})`;
}

/** Count of lights that are actually contributing (not hidden), for a one-line summary. */
function describeLights(scene: any): string {
  const lights = scene?.lights;
  if (!lights || typeof lights.filter !== "function") return "";
  const lit = [...lights].filter((l: any) => !l?.hidden);
  if (lit.length === 0) return "";
  return `${lit.length} light source${lit.length === 1 ? "" : "s"} placed`;
}

/** Named regions are the closest thing core Foundry has to labeled terrain. */
function describeRegions(scene: any): string {
  const regions = scene?.regions;
  if (!regions || typeof regions.forEach !== "function") return "";
  const names = [...regions]
    .map((r: any) => String(r?.name ?? "").trim())
    .filter((n) => n.length > 0);
  if (names.length === 0) return "";
  return names.slice(0, 8).join(", ") + (names.length > 8 ? `, +${names.length - 8} more` : "");
}

/**
 * In-world date/time. v13+ exposes a real calendar (`game.time.calendar` + `.components`), which
 * gives day/month names and a season; worlds without one still have `worldTime` seconds. Everything
 * is optional-chained because calendar support and shapes vary, and a wrong date is worse than none.
 */
function describeTime(): string {
  const time = (game as any).time;
  if (!time) return "";

  try {
    const c = time.components;
    const cal = time.calendar;
    if (c && typeof c === "object") {
      const hour = Number(c.hour ?? 0);
      const minute = Number(c.minute ?? 0);
      const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const partOfDay =
        hour < 5
          ? "night"
          : hour < 8
            ? "dawn"
            : hour < 12
              ? "morning"
              : hour < 17
                ? "afternoon"
                : hour < 20
                  ? "evening"
                  : "night";

      // Prefer the calendar's own formatting when available: it knows month/day names.
      let date = "";
      const monthName = cal?.months?.values?.[Number(c.month ?? 0)]?.name;
      const dayOfMonth = c.dayOfMonth ?? c.day;
      if (monthName && dayOfMonth != null) {
        date = `${Number(dayOfMonth) + 1} ${monthName}`;
        if (c.year != null) date += `, year ${c.year}`;
      } else if (c.year != null) {
        date = `year ${c.year}, day ${Number(c.day ?? 0) + 1}`;
      }

      const season = cal?.seasons?.values?.[Number(c.season ?? -1)]?.name;
      const seasonStr = season ? `, ${String(season).toLowerCase()}` : "";
      return date
        ? `${date}, ${clock} (${partOfDay}${seasonStr})`
        : `${clock} (${partOfDay}${seasonStr})`;
    }

    // No calendar components: report elapsed world time only if the GM has actually advanced it.
    const secs = Number(time.worldTime);
    if (Number.isFinite(secs) && secs > 0) {
      const days = Math.floor(secs / 86400);
      const hour = Math.floor((secs % 86400) / 3600);
      const minute = Math.floor((secs % 3600) / 60);
      const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return days > 0 ? `day ${days + 1}, ${clock} (world clock)` : `${clock} (world clock)`;
    }
  } catch (err) {
    log("tipster: world time unreadable", err);
  }
  return "";
}

const DISPOSITION_LABEL: Record<number, string> = {
  [-2]: "Secret",
  [-1]: "Hostile",
  0: "Neutral",
  1: "Friendly",
};

/** Print order for the roster buckets: the party first, threats last but for the GM's hidden set. */
const BUCKET_ORDER = ["Party", "Friendly", "Neutral", "Hostile", "Secret", "Hidden from players"];

/** Distinct entries per bucket before truncating; a crowd scene must not eat the context budget. */
const MAX_PER_BUCKET = 20;

/**
 * Who is actually standing in the scene. Read from `scene.tokens` (the authoritative embedded
 * collection) rather than `canvas.tokens.placeables`, so the roster does not depend on what the
 * calling client happens to have drawn.
 *
 * Identical tokens are grouped and counted ("Skeleton x3") instead of repeated: three copies of one
 * stat block is what the GM placed, and a bare repeated name reads to a model like a mistake.
 * Grouping is by everything we would print, so a wounded Skeleton separates from its fresh kin.
 *
 * `forGm` is the privilege switch. A player briefing never mentions hidden tokens (not even that
 * they exist), never reveals secret-disposition tokens, and carries no HP.
 */
function describeTokens(scene: any, forGm: boolean): string[] {
  const tokens = scene?.tokens;
  if (!tokens || typeof tokens.forEach !== "function") return [];

  const buckets = new Map<string, Map<string, number>>();
  for (const t of [...tokens] as any[]) {
    const hidden = Boolean(t?.hidden);
    if (hidden && !forGm) continue;
    const disposition = Number(t?.disposition ?? 0);
    if (disposition === -2 && !forGm) continue;

    const actor = t?.actor;
    const isPC = Boolean(actor?.hasPlayerOwner);
    const name = String(t?.name || actor?.name || "").trim() || "unnamed token";

    let entry = name;
    if (forGm) {
      const hp = readHp(actor);
      if (hp) entry += isPC ? ` (HP ${hp.value}/${hp.max})` : ` (${hpTier(hp)})`;
    }

    const bucket = hidden
      ? "Hidden from players"
      : isPC
        ? "Party"
        : (DISPOSITION_LABEL[disposition] ?? "Neutral");

    const seen = buckets.get(bucket) ?? new Map<string, number>();
    seen.set(entry, (seen.get(entry) ?? 0) + 1);
    buckets.set(bucket, seen);
  }

  const lines: string[] = [];
  for (const bucket of BUCKET_ORDER) {
    const seen = buckets.get(bucket);
    if (!seen || seen.size === 0) continue;
    const parts = [...seen.entries()].map(([entry, n]) => (n > 1 ? `${entry} x${n}` : entry));
    const shown = parts.slice(0, MAX_PER_BUCKET);
    const overflow = parts.length - shown.length;
    lines.push(`${bucket}: ${shown.join(", ")}${overflow > 0 ? `, +${overflow} more` : ""}`);
  }
  return lines;
}

/** Currently playing track — a strong, cheap mood signal the GM already curated. */
function describeAudio(scene: any): string {
  const parts: string[] = [];
  const sound = scene?.playlistSound;
  const list = scene?.playlist;
  if (sound?.name) parts.push(`"${sound.name}"`);
  else if (list?.name) parts.push(`playlist "${list.name}"`);
  const ambient = scene?.sounds;
  if (ambient && typeof ambient.filter === "function") {
    const active = [...ambient].filter((s: any) => !s?.hidden);
    if (active.length > 0)
      parts.push(`${active.length} ambient sound${active.length === 1 ? "" : "s"}`);
  }
  return parts.join("; ");
}

/**
 * Which token this user is speaking as: their selection first (what they just clicked is the strongest
 * signal of intent), then their assigned character's token on this scene, then anything else they own here.
 * Returns undefined for a GM who has nothing selected — the briefing is still useful scene-wide.
 *
 * The ordering lives in `util/speaker.ts`'s `playedTokens`, which returns the whole list because a player
 * may legitimately be driving two characters at once. A briefing is written from one point of view, so
 * this takes the head; T3's per-token perception filter should read the whole list.
 */
export function resolvePerspectiveToken(user: any): any {
  return playedTokens(user)[0];
}

/** The "Token/Object Speaking:" line. T2 will extend this with position, senses, and vitals. */
function describeSpeaker(input: TipsterInput): string {
  const tokenName = input.token?.name ? String(input.token.name) : "";
  const who =
    input.caller === "automation"
      ? tokenName || "internal automation"
      : tokenName || (input.caller === "gm" ? "Gamemaster (no token selected)" : "unknown token");

  const bits: string[] = [];
  if (input.userName)
    bits.push(input.caller === "gm" ? `GM: ${input.userName}` : `player: ${input.userName}`);
  else if (input.caller === "automation") bits.push("automation");
  return bits.length > 0 ? `${who} (${bits.join(", ")})` : who;
}

/**
 * Build the live scene briefing, or null when there is nothing useful to say (no active scene, or
 * every field unreadable). The returned string is meant to be injected once and discarded.
 *
 * Never throws: a briefing is a nice-to-have, so any unexpected API shape degrades to a shorter
 * block (or null) rather than breaking the user's chat turn.
 */
export function buildTipsterBlock(input: TipsterInput): string | null {
  try {
    const scene = (canvas as any)?.scene ?? (game as any).scenes?.active;
    if (!scene) return null;

    const lines: string[] = [`Token/Object Speaking: ${describeSpeaker(input)}`];

    const name = String(scene.navName || scene.name || "").trim();
    const dims = describeDimensions(scene);
    if (name || dims) lines.push(`Scene: ${name || "(unnamed)"}${dims ? ` (${dims})` : ""}`);

    const time = describeTime();
    if (time) lines.push(`Time: ${time}`);

    const light = describeLight(scene);
    const lights = describeLights(scene);
    if (light || lights) lines.push(`Light: ${[light, lights].filter(Boolean).join("; ")}`);

    const audio = describeAudio(scene);
    if (audio) lines.push(`Ambience: ${audio}`);

    const regions = describeRegions(scene);
    if (regions) lines.push(`Regions: ${regions}`);

    // Who is present. The GM sees hidden/secret tokens and HP; a player sees neither.
    const roster = describeTokens(scene, input.caller !== "player");
    if (roster.length > 0) lines.push("Present in scene:", ...roster.map((l) => `  ${l}`));

    // Only the header line means we learned nothing about the scene; not worth the tokens.
    if (lines.length < 2) return null;

    return `# Current situation (live from Foundry — trust this over any earlier description)\n${lines.join("\n")}`;
  } catch (err) {
    log("tipster: scene briefing failed", err);
    return null;
  }
}
