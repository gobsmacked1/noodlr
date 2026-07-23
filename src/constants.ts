// Durable identifiers and keys. Keep this the single source of truth for the module id
// and setting/menu keys so nothing drifts between registration and lookup.

export const MODULE_ID = "noodlr" as const;
export const MODULE_TITLE = "Noodlr" as const;

/** World/client setting keys (values are the persisted keys — do not rename lightly). */
export const SETTINGS = {
  /** Whether the module's features are active in this world. */
  enabled: "enabled",
  /** Chat feature system-prompt override (the DM prompt is the default). */
  chatSystemPrompt: "chatSystemPrompt",
  /** After a turn with dice rolls, auto-continue once so the DM reacts to results. */
  chatContinueAfterRoll: "chatContinueAfterRoll",

  // --- Prompt architecture (Phase 3) ---
  /** Author's-note text: a session anchor injected at a configurable depth. */
  authorNote: "authorNote",
  /** How many messages from the end the author's note is injected before. */
  authorNoteDepth: "authorNoteDepth",
  /** Post-history instructions: a short always-last injection slot. */
  postHistory: "postHistory",
  /** The 2-line combat reminder swapped into post-history while combat is active. */
  combatReminder: "combatReminder",
  /** Overall context token budget for the assembled prompt. */
  contextTokenBudget: "contextTokenBudget",
  /** Auto-parse 📜 Chronicle lines from DM output into the review queue. */
  chronicleAutoParse: "chronicleAutoParse",
  /** Persisted lorebook entries (JSON array; world-scoped). */
  lorebook: "lorebook",
  /** Persisted Chronicle review queue (JSON array; world-scoped). */
  chronicleQueue: "chronicleQueue",
} as const;

/** Settings-menu keys (open dedicated ApplicationV2 config windows). */
export const MENUS = {
  config: "noodlrConfig",
  memory: "noodlrMemory",
  lorebook: "noodlrLorebook",
  chronicle: "noodlrChronicle",
} as const;

/** Default 2-line combat reminder (post-history) — see the DM prompt design notes. */
export const DEFAULT_COMBAT_REMINDER =
  "COMBAT ACTIVE — review the latest ⚔️ tracker block, rebuild it every turn with arithmetic shown inline, and track HP, conditions, and resources exactly.\n" +
  "Player characters can die; honor fair outcomes and never fudge dice or soften failure.";

/** Default system prompt for AI-run NPC/monster turns (Combat feature). */
export const DEFAULT_COMBAT_PROMPT =
  "You are the Dungeon Master resolving a single non-player combatant's turn in a tactical, stateful combat.\n" +
  "- Decide a sensible, in-character action for THIS combatant only; never act, decide, or roll for a player character.\n" +
  "- The injected ⚔️ state block is authoritative ground truth. Read it before acting.\n" +
  "- State the target and intent, then emit dice as {{roll:...}} macros (e.g. {{roll:1d20+5}}); NEVER invent dice results in prose.\n" +
  "- Do not apply damage or conditions yourself — narrate the intent and let the table's automation resolve mechanics.\n" +
  "- Keep it to 1–2 tight paragraphs and end by yielding the turn. Enemy HP stays as tiers unless already revealed.";

/** Combat feature settings keys. */
export const COMBAT_SETTINGS = {
  systemPrompt: "combat.systemPrompt",
} as const;

/** Module socket name for client<->GM relay (push-to-log transcripts). */
export const SOCKET = "module.noodlr" as const;

/** Media feature settings keys (TTS / Image / Transcription / push-to-log). */
export const MEDIA_SETTINGS = {
  // TTS
  ttsEnabled: "tts.enabled",
  ttsVoice: "tts.voice",
  ttsAutoRead: "tts.autoRead",
  // Image
  imageSystemPrompt: "image.systemPrompt",
  imageExpandPrompt: "image.expandPrompt",
  imageSteps: "image.steps",
  imageCfg: "image.cfg",
  imageSampler: "image.sampler",
  imageSeed: "image.seed",
  imagePositive: "image.positive",
  imageNegative: "image.negative",
  imageSize: "image.size",
  // Where generated images are written (relative to Foundry's data root). Default is an
  // allowed top-level upload target in v13 (assets/…), created on load if missing.
  imageMediaFolder: "image.mediaFolder",
  // Persist generated images to disk + record their prompt/seed for continuity.
  imagePersist: "image.persist",
  // Enable the "Generate Image:" / "Generate Portrait:" chat-command trigger.
  imageChatTrigger: "image.chatTrigger",
  // Allow non-GM players to fire the chat trigger (off by default — it costs API money).
  imageAllowPlayers: "image.allowPlayers",
  // Continuity ledger: JSON map of entityKey -> { seed, prompt, model, path, ts }.
  imageLedger: "image.ledger",
  // Push-to-log transcription
  pushToLogPostChat: "transcription.postChat",
  pushToLogIngest: "transcription.ingest",
  pushToLogIngestInterval: "transcription.ingestInterval",
  pushToLogSegmentSeconds: "transcription.segmentSeconds",
} as const;

/** RAG (noodlr-memory) settings keys. */
export const RAG_SETTINGS = {
  serviceUrl: "rag.serviceUrl",
  secret: "rag.secret",
  enabled: "rag.enabled",
  hybrid: "rag.hybrid",
  agentMode: "rag.agentMode",
  sendEmbedConfig: "rag.sendEmbedConfig",
  tokenBudget: "rag.tokenBudget",
  topK: "rag.topK",
  querySilos: "rag.querySilos",
} as const;

/** Keybinding action ids. */
export const KEYBINDINGS = {
  toggleChatPanel: "toggleChatPanel",
} as const;

/** Small helper for consistent, greppable console output. */
export function log(...args: unknown[]): void {
  console.log(`${MODULE_TITLE} |`, ...args);
}
