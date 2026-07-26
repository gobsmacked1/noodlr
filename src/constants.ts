// Durable identifiers and keys. Keep this the single source of truth for the module id
// and setting/menu keys so nothing drifts between registration and lookup.

export const MODULE_ID = "noodlr" as const;
export const MODULE_TITLE = "Noodlr" as const;

/** World/client setting keys (values are the persisted keys — do not rename lightly). */
export const SETTINGS = {
  /** Whether the module's features are active in this world. */
  enabled: "enabled",
  /**
   * The single OpenRouter API key, shared by every feature whose provider is "openrouter".
   * World-scoped + write-only in the UI. Custom (local) endpoints keep their own optional key.
   */
  openrouterApiKey: "openrouterApiKey",
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

// Default combat prompts (DEFAULT_COMBAT_PROMPT / DEFAULT_COMBAT_REMINDER) now live with all
// other default prompt text in src/prompts/index.ts — the single file the maintainer edits.

/** Combat feature settings keys. */
export const COMBAT_SETTINGS = {
  systemPrompt: "combat.systemPrompt",
} as const;

/** Module socket name for client<->GM relay (push-to-log transcripts, artifact retire). */
export const SOCKET = "module.noodlr" as const;

/**
 * How long the Retry/Reject controls stay active on an AI-generated output before it's committed
 * to memory. The hidden timer starts once the finished output is displayed. After it elapses the
 * controls disable (capping repeat OpenRouter calls) and the GM commits the output to RAG.
 */
export const RETRY_WINDOW_MS = 60_000;

/** Media feature settings keys (TTS / Image / Transcription / push-to-log). */
export const MEDIA_SETTINGS = {
  // TTS
  ttsEnabled: "tts.enabled",
  ttsVoice: "tts.voice",
  ttsAutoRead: "tts.autoRead",
  // Whether this TTS endpoint accepts a `pitch` body field (only sent when true).
  ttsPitchSupported: "tts.pitchSupported",
  // Per-creature-type voice+pitch overrides: JSON map creatureTypeKey -> { voice, pitch }.
  ttsCreatureVoices: "tts.creatureVoices",
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
  transcriptionEnabled: "transcription.enabled",
  pushToLogPostChat: "transcription.postChat",
  pushToLogIngest: "transcription.ingest",
  pushToLogIngestInterval: "transcription.ingestInterval",
  pushToLogSegmentSeconds: "transcription.segmentSeconds",
  // Music (text-to-audio) generation
  musicEnabled: "music.enabled",
  musicChatTrigger: "music.chatTrigger",
  musicAllowPlayers: "music.allowPlayers",
  musicMinSec: "music.minSec",
  musicMaxSec: "music.maxSec",
  musicPlaylist: "music.playlist",
  // Video (text-to-video) generation
  videoEnabled: "video.enabled",
  videoChatTrigger: "video.chatTrigger",
  videoAllowPlayers: "video.allowPlayers",
  videoDuration: "video.duration",
  videoResolution: "video.resolution",
  videoAspect: "video.aspect",
} as const;

/** RAG (noodlr-memory) settings keys. */
export const RAG_SETTINGS = {
  // Which memory backend is active: "lite" (in-browser, zero-config) or "service" (noodlr-memory).
  backend: "rag.backend",
  serviceUrl: "rag.serviceUrl",
  secret: "rag.secret",
  enabled: "rag.enabled",
  hybrid: "rag.hybrid",
  agentMode: "rag.agentMode",
  sendEmbedConfig: "rag.sendEmbedConfig",
  tokenBudget: "rag.tokenBudget",
  topK: "rag.topK",
  querySilos: "rag.querySilos",
  // Rerank refinement (runs module-side, after /query, before injection).
  rerankEnabled: "rag.rerankEnabled",
  rerankTopN: "rag.rerankTopN",
  // Web-search fallback: when memory comes back empty/weak, let OpenRouter ground THIS request
  // with a one-shot web search. Off by default; OpenRouter chat provider only. (shared RAG setting)
  webFallbackEnabled: "rag.webFallbackEnabled",
  webFallbackMinScore: "rag.webFallbackMinScore",
  webFallbackMaxResults: "rag.webFallbackMaxResults",
} as const;

/** Keybinding action ids. */
export const KEYBINDINGS = {
  toggleChatPanel: "toggleChatPanel",
} as const;

/** Small helper for consistent, greppable console output. */
export function log(...args: unknown[]): void {
  console.log(`${MODULE_TITLE} |`, ...args);
}
