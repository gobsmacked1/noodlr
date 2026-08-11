// The noodlr-memory collections ("silos"). Mirror of the service's COLLECTIONS map
// (noodlr-memory/src/collections.js). Kept here so the module can label + target silos without a
// round-trip. If the service adds/renames a collection, mirror it here too.
//
// SCHEMA (2026-07-27): 35 silos — system_rules, 16 topics each split player_/gm_ (what at least
// one player knows vs. what no player knows), plus docs and unfiltered_chat. The player_/gm_ split
// is the security boundary for the two chatbots; see GM_QUERY_SILOS / PLAYER_QUERY_SILOS below and
// noodlr-memory/scripts/RAG_Collections_Access-Order-Intent.csv for the authoritative access matrix.

export const SILOS = {
  system_rules: "current game system rules",
  player_locations: "scene location and status of which at least one player has knowledge",
  gm_locations:
    "scene location and status of which no player has knowledge, e.g., traps, secret doors, etc",
  player_npc_state: "NPC location and status of which at least one player has knowledge",
  gm_npc_state:
    "NPC location and status of which no player has knowledge, e.g., merchants, slain/living quest-givers, etc",
  player_calendar: "calendar events of which at least one player has knowledge",
  gm_calendar:
    "calendar events of which no player has knowledge, e.g., holidays, cult ritual ceremonies, etc",
  player_chat: "text and audio transcription which contain at least one player",
  gm_chat:
    "text and audio transcription which include no player, e.g., encounter planning, plot twists, villain motivations, etc",
  player_history: "events that unfolded of which at least one player has knowledge",
  gm_history:
    "events that unfolded of which no player has knowledge, e.g., abducted princesses, murdered hobos, etc",
  player_lore: "world lore of which at least one player has knowledge",
  gm_lore:
    "world lore of which no player has knowledge, e.g., haunted mansion, disease blighted orchard, etc",
  player_quests: "quest progress of which at least one player has accepted",
  gm_quests:
    "quest progress of which no player has accepted, e.g., 6 of 7 cellar rats slain, missing potion ingredient search, etc",
  player_macguffin: "quest goal of which at least one player has knowledge",
  gm_macguffin:
    "quest goal of which no player has knowledge, e.g., Excalibur, the Arkenstone, a horcrux, a lich's phylactery, etc",
  player_puzzle: "challenge or mystery of which at least one player has knowledge",
  gm_puzzle:
    "challenge or mystery of which no player has knowledge, e.g., townsfolk disappearances, floating lights in the forest, etc",
  player_goals: "personal goals of which at least one player has knowledge",
  gm_goals:
    "personal goals of which no player has knowledge, e.g., birthright claim to a lost throne, best swordsman in the realm, etc",
  player_story_arc: "campaign story arc of which at least one player has knowledge",
  gm_story_arc:
    "campaign story arc of which no player has knowledge, e.g., liberate the land from an evil arch made, stop a planar incursion, etc",
  player_factions: "organizations of which at least one player has knowledge",
  gm_factions:
    "organizations of which no player has knowledge, e.g., The Harpers, The Zhentarim, The Cobalt Soul, etc",
  player_reputations: "attitudes towards the player of which at least one player has knowledge",
  gm_reputations:
    "attitudes towards the player of which no player has knowledge, e.g., aasimars killed on sight by demons, wood-elves more trusted by beasts, etc",
  player_effects: "boons and banes of which at least one player has knowledge",
  gm_effects:
    "boons and banes of which no player has knowledge, e.g., blessed by Mystra, infected by Lycanthropy, etc",
  player_sheets: "skills and abilities of which at least one player has knowledge",
  gm_sheets:
    "skills and abilities of which no player has knowledge, e.g., exhibited innate sorcery for first time, made an unknowing pact with a demon, etc",
  player_inventory: "items of which at least one player has knowledge",
  gm_inventory:
    "items of which no player has knowledge, e.g., learned a new weapon mastery, attuned to a cursed item, etc",
  docs: "misc imported documents, e.g., TXT, PDF, CSV, JSON, and YAML",
  unfiltered_chat:
    "unfiltered native Foundry logs, e.g., combat tracking, player chat, dice rolls, etc",
} as const;

export type SiloId = keyof typeof SILOS;

export const SILO_IDS = Object.keys(SILOS) as SiloId[];

export function isSiloId(id: string): id is SiloId {
  return Object.prototype.hasOwnProperty.call(SILOS, id);
}

// Per-bot retrieval SELECT scope, transcribed from the access matrix
// (noodlr-memory/scripts/RAG_Collections_Access-Order-Intent.csv). The order below is the matrix's
// stated intent and nothing more: all of these ids go into ONE fused query, so what comes back is
// ranked by score and the array order never reaches the model. Injection precedence is decided by
// `precedenceRank` at the bottom of this file.
//
// SECURITY: PLAYER_QUERY_SILOS is also the hard whitelist for the players-only chatbot. Its
// RagClient must be constrained to exactly these ids so a prompt-injecting player physically
// cannot retrieve gm_* content — the guardrail is at the retrieval layer, not the prompt.

/** GM co-pilot: reads everything. gm_* truth is prioritized above the player-visible mirror. */
export const GM_QUERY_SILOS: SiloId[] = [
  "system_rules",
  "gm_chat",
  "gm_effects",
  "gm_sheets",
  "gm_inventory",
  "gm_reputations",
  "gm_factions",
  "gm_locations",
  "gm_quests",
  "gm_macguffin",
  "gm_puzzle",
  "gm_goals",
  "gm_story_arc",
  "gm_npc_state",
  "gm_lore",
  "gm_history",
  "gm_calendar",
  "player_chat",
  "player_effects",
  "player_sheets",
  "player_inventory",
  "player_reputations",
  "player_factions",
  "player_locations",
  "player_quests",
  "player_macguffin",
  "player_puzzle",
  "player_goals",
  "player_story_arc",
  "player_npc_state",
  "player_lore",
  "player_history",
  "player_calendar",
  "unfiltered_chat",
  "docs",
];

/** Players-only bot: player-visible knowledge only. NO gm_* access (enforced whitelist). */
export const PLAYER_QUERY_SILOS: SiloId[] = [
  "system_rules",
  "player_chat",
  "player_effects",
  "player_sheets",
  "player_inventory",
  "player_reputations",
  "player_factions",
  "player_locations",
  "player_quests",
  "player_macguffin",
  "player_puzzle",
  "player_goals",
  "player_story_arc",
  "player_npc_state",
  "player_lore",
  "player_history",
  "player_calendar",
  "unfiltered_chat",
  "docs",
];

/** Default silos queried at prompt-assembly time = the GM co-pilot scope. */
export const DEFAULT_QUERY_SILOS: SiloId[] = GM_QUERY_SILOS;

// A creature's own sheet outranks the rulebook (user's edict, 2026-08-10).
//
// A GM who gave a goblin 40 hit points and a fear aura has stated a fact about that goblin. A
// retrieved rulebook paragraph describing the published goblin is a weaker claim about the same
// creature, not a correction to be applied — and the bot that "corrects" it is the same failure as
// the v0.4.20 wrong-system ruling: confident, plausible, and wrong about the only thing that
// mattered.
//
// NOTE the ordering of GM_QUERY_SILOS / PLAYER_QUERY_SILOS does NOT implement this, despite what
// their header comment has always claimed. Every silo goes into ONE fused query and the results come
// back ranked by score, so the array order is documentation. These helpers are the mechanism: they
// label each hit by what it is and hoist sheets in the block the model actually reads.

/** Silos holding a specific creature's own data, as opposed to the rules it is played by. */
export const SHEET_SILOS: SiloId[] = ["gm_sheets", "player_sheets"];

/** What a retrieved hit IS, which decides how it is labelled and whether it can be trimmed. */
export type RetrievalKind = "sheet" | "rules" | "memory";

/**
 * Classify a hit by the silo it came from. An unknown or missing silo is "memory" — the neutral
 * answer, since claiming a hit is a sheet would grant it precedence it was never given.
 */
export function retrievalKind(silo: string | undefined): RetrievalKind {
  if (!silo) return "memory";
  if ((SHEET_SILOS as string[]).includes(silo)) return "sheet";
  if (silo === "system_rules") return "rules";
  return "memory";
}

/** How a kind is named to the model. Short: this rides on every retrieved line. */
export const RETRIEVAL_KIND_LABEL: Record<RetrievalKind, string> = {
  sheet: "character sheet",
  rules: "rulebook",
  memory: "campaign memory",
};

/**
 * Sort key for the injected block; lower comes first. Sheets are hoisted so that a tight token
 * budget trims published rules rather than this table's own customizations — precedence that only
 * held when everything happened to fit would be no precedence at all.
 */
export function precedenceRank(silo: string | undefined): number {
  return retrievalKind(silo) === "sheet" ? 0 : 1;
}

/** gm_* secret silos (+ system_rules) — the adjudication scope the GM bot consults to decide a
 *  player check's outcome. Never queried on a player's behalf directly. */
export const GM_SECRET_SILOS: SiloId[] = [
  "system_rules",
  ...SILO_IDS.filter((id) => id.startsWith("gm_")),
];

// ---- Write-permission matrix (SELECT/INSERT/UPDATE/DELETE per bot) ----
// Transcribed from RAG_Collections_Access-Order-Intent.csv. Enforced at the write layer so a bot
// can never mutate a silo it isn't entitled to (the players-bot has NO access to gm_* at all).

export type MemoryOp = "select" | "insert" | "update" | "delete";
export type MemoryAudience = "gm" | "player";

const READ: MemoryOp[] = ["select"];
const APPEND: MemoryOp[] = ["select", "insert"];
const EDIT: MemoryOp[] = ["select", "insert", "update"];
const FULL: MemoryOp[] = ["select", "insert", "update", "delete"];
const NONE: MemoryOp[] = [];

// [gm rights, player rights] per silo.
const RIGHTS: Record<SiloId, [MemoryOp[], MemoryOp[]]> = {
  system_rules: [READ, READ],
  unfiltered_chat: [READ, READ],
  docs: [READ, READ],
  // chat/history are append-only for their owner; the other bot only reads (or, for gm_*, nothing).
  gm_chat: [APPEND, NONE],
  player_chat: [READ, APPEND],
  gm_history: [APPEND, NONE],
  player_history: [READ, APPEND],
  // story arc is edit (no delete) for its owner.
  gm_story_arc: [EDIT, NONE],
  player_story_arc: [READ, EDIT],
  // everything else: full CRUD for the owner; the GM reads the player mirror; players get no gm_*.
  gm_effects: [FULL, NONE],
  player_effects: [READ, FULL],
  gm_sheets: [FULL, NONE],
  player_sheets: [READ, FULL],
  gm_inventory: [FULL, NONE],
  player_inventory: [READ, FULL],
  gm_reputations: [FULL, NONE],
  player_reputations: [READ, FULL],
  gm_factions: [FULL, NONE],
  player_factions: [READ, FULL],
  gm_locations: [FULL, NONE],
  player_locations: [READ, FULL],
  gm_quests: [FULL, NONE],
  player_quests: [READ, FULL],
  gm_macguffin: [FULL, NONE],
  player_macguffin: [READ, FULL],
  gm_puzzle: [FULL, NONE],
  player_puzzle: [READ, FULL],
  gm_goals: [FULL, NONE],
  player_goals: [READ, FULL],
  gm_npc_state: [FULL, NONE],
  player_npc_state: [READ, FULL],
  gm_lore: [FULL, NONE],
  player_lore: [READ, FULL],
  gm_calendar: [FULL, NONE],
  player_calendar: [READ, FULL],
};

/** True if `audience` may perform `op` on `silo` per the access matrix. */
export function canWrite(audience: MemoryAudience, silo: SiloId, op: MemoryOp): boolean {
  const pair = RIGHTS[silo];
  if (!pair) return false;
  return (audience === "gm" ? pair[0] : pair[1]).includes(op);
}

/** Silos an audience may write (insert) — used to hint the model which silos it can target. */
export function writableSilos(audience: MemoryAudience): SiloId[] {
  return SILO_IDS.filter((id) => canWrite(audience, id, "insert"));
}

export interface SiloGroup {
  /** i18n key for the group heading. */
  labelKey: string;
  silos: { id: SiloId; label: string }[];
}

/**
 * Silos grouped for human pickers: player-visible vs GM-secret vs shared/system. `label` is the
 * silo id plus its short description, so the GM sees both the machine name and what it holds.
 */
export function groupedSilos(): SiloGroup[] {
  const shared: SiloId[] = ["system_rules", "unfiltered_chat", "docs"];
  const mk = (id: SiloId) => ({ id, label: `${id} — ${SILOS[id]}` });
  const player = SILO_IDS.filter((id) => id.startsWith("player_")).map(mk);
  const gm = SILO_IDS.filter((id) => id.startsWith("gm_")).map(mk);
  return [
    { labelKey: "NOODLR.RagBrowser.GroupPlayer", silos: player },
    { labelKey: "NOODLR.RagBrowser.GroupGm", silos: gm },
    { labelKey: "NOODLR.RagBrowser.GroupShared", silos: shared.map(mk) },
  ];
}
