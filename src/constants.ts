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
  /** GM-chat system prompt. Ships pre-filled with the DM prompt; stored value is authoritative. */
  chatSystemPrompt: "chatSystemPrompt",
  /** Players-only bot's system prompt. */
  playersSystemPrompt: "playersSystemPrompt",
  /** The GM-side adjudicator's prompt (resolves a player's check against GM-secret memory). */
  adjudicationPrompt: "adjudicationPrompt",
  /** Display name for the AI assistant, shown in both chat panels and its chat messages. */
  assistantName: "assistantName",
  /**
   * The rules system every bot must play by: a name from the curated list, "auto" (whatever Foundry
   * reports), or "custom" (see rulesetCustom). Never inferred from campaign content.
   */
  rulesetChoice: "rulesetChoice",
  /** Free-text system name, used when rulesetChoice is "custom". */
  rulesetCustom: "rulesetCustom",
  /** After a turn with dice rolls, auto-continue once so the DM reacts to results. */
  chatContinueAfterRoll: "chatContinueAfterRoll",
  /**
   * Marks the one-time migration that filled empty prompt fields with their shipped defaults, for
   * worlds created while an empty setting still meant "use the embedded default".
   */
  promptDefaultsSeeded: "promptDefaultsSeeded",

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
  /** Let the GM co-pilot autonomously write memory via @@NOODLR directives (REMEMBER/UPDATE/FORGET). */
  chatMemoryWrites: "chatMemoryWrites",
  /** Persisted lorebook entries (JSON array; world-scoped). */
  lorebook: "lorebook",

  /** Verbose console diagnostics for both chatbots (prompt payloads, relay round trip). */
  debugLogging: "debugLogging",

  /** Reveal developer-only tools (compendium export for the offline rules miner). */
  developerMode: "developerMode",

  // --- Tipster: live scene briefing (T1) ---
  /** Inject the live scene briefing into the GM chatbot's prompts. */
  tipsterGm: "tipster.gm",
  /** Inject the live scene briefing into the players-only chatbot's prompts. */
  tipsterPlayers: "tipster.players",
} as const;

/**
 * Settings-menu keys (each opens a dedicated ApplicationV2 config window).
 *
 * Five topic-scoped windows rather than one long form: a single scrolling page had grown past the
 * point where a non-technical GM could find anything in it. Registration order in `settings.ts` is
 * the order the buttons appear.
 */
export const MENUS = {
  memory: "noodlrMemory",
  textGen: "noodlrTextGen",
  audioGen: "noodlrAudioGen",
  imageGen: "noodlrImageGen",
  security: "noodlrSecurity",
} as const;

// Default prompt text lives in src/prompts/index.ts — the single file the maintainer edits.

/**
 * Behavioral automation: giving a voice to creatures that decide to talk instead of fight.
 *
 * Everything that used to sit under `COMBAT_SETTINGS` moved to `noodlr-hooks-55e` with the rules
 * engine it configured. Two keys stayed, and both keep their `combat.` prefix on purpose: renaming a
 * persisted key resets it, and a GM who tuned banter should not lose that to a refactor they never
 * asked for. The prefix is history, not a statement about where the feature lives.
 */
export const BEHAVIOR_SETTINGS = {
  /** Whether Noodlr answers FLEE / MERCY / SURRENDER and their kin from a hooks module. */
  enabled: "behavior.enabled",
  /** How the AI is told to voice one of those moves. */
  systemPrompt: "behavior.systemPrompt",
  /** Whether automated creatures get a spoken/typed line of flavor with their turn. */
  banter: "combat.banter",
} as const;

/**
 * The capability compiler: turning a creature's written abilities into rules a hooks module can run.
 *
 * Noodlr's half of the `noodlrHooks.compile` contract. The rules module has its own switch for this
 * and ships it OFF, so both ends have to agree before a single request is paid for — deliberate for
 * a feature that spends the GM's credit on scene load. Ours defaults ON because it is the answer to
 * "somebody asked": with no rules module installed nothing ever fires it.
 */
export const CAPABILITY_SETTINGS = {
  /** Whether Noodlr answers a compile request at all. */
  enabled: "capability.enabled",
  /** The doctrine half of the compiler's system message; the vocabulary is generated, not stored. */
  systemPrompt: "capability.systemPrompt",
  /** Model slug for compilation. Blank means "whatever Chat uses". */
  model: "capability.model",
  /** How many features to compile at once. */
  concurrency: "capability.concurrency",
} as const;

/**
 * Module socket name for client<->GM relay (push-to-log transcripts, artifact retire, player asks).
 *
 * REQUIRES `"socket": true` in module.json. Without it the server never grants the package a socket
 * namespace and silently discards every emission on this name — no error on either end. The manifest
 * is read at server start, so that flag only takes effect after a world restart, not a page reload.
 */
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
  // Play generated speech on every connected client, not just the one that synthesized it.
  ttsBroadcast: "tts.broadcast",
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
  // How the browser reaches noodlr-memory: "proxy" (a path on Foundry's own origin, which is how a
  // Unix-socket deployment is reachable at all) or "direct" (a full URL to a TCP listener).
  targetMode: "rag.targetMode",
  servicePath: "rag.servicePath",
  serviceUrl: "rag.serviceUrl",
  secret: "rag.secret",
  enabled: "rag.enabled",
  hybrid: "rag.hybrid",
  agentMode: "rag.agentMode",
  sendEmbedConfig: "rag.sendEmbedConfig",
  // Embedding throttle, sent with every request whether or not the provider block is shared: a rate
  // limit counts REQUESTS, so batch size is the largest lever against one and the pace is the
  // gentlest. 0 on either means "leave the service's own .env value alone", so a server admin who
  // tuned it is not silently overruled by a form default. (noodlr-memory only)
  embedBatchSize: "rag.embedBatchSize",
  embedPaceMs: "rag.embedPaceMs",
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
  // Native Foundry chat-log capture: distill each chat message to timestamped text and ingest it
  // into the `unfiltered_chat` silo. Off by default; only the primary GM records. (shared RAG setting)
  chatLogEnabled: "rag.chatLog.enabled",
  chatLogInterval: "rag.chatLog.interval",
  chatLogWhispers: "rag.chatLog.whispers",
  // The unfinished ingest queue, so a run survives the reload it is most likely to meet: a GM
  // queues a shelf of compendia and goes to play. World scope because the work is the world's, and
  // because a GM who reloads into a different browser profile should still find their queue.
  ingestQueue: "rag.ingestQueue",
} as const;

/** Keybinding action ids. */
export const KEYBINDINGS = {
  toggleChatPanel: "toggleChatPanel",
} as const;

/** Small helper for consistent, greppable console output. */
export function log(...args: unknown[]): void {
  console.log(`${MODULE_TITLE} |`, ...args);
}

/**
 * Always-on warning channel. Use for conditions the user needs to know about even with debug
 * logging off (a swallowed request failure, an unconfigured provider, a dropped relay).
 */
export function warn(...args: unknown[]): void {
  console.warn(`${MODULE_TITLE} |`, ...args);
}

/**
 * Verbose diagnostics, gated on the `debugLogging` setting. Reads the setting defensively because
 * this is called from paths that can run before settings are registered (early hooks, failures).
 *
 * Groups are used so a full prompt payload collapses to one console line instead of flooding.
 */
export function debug(label: string, ...args: unknown[]): void {
  try {
    if (!game?.settings?.get(MODULE_ID, SETTINGS.debugLogging)) return;
  } catch {
    return;
  }
  console.debug(`${MODULE_TITLE} debug | ${label}`, ...args);
}

/** True when verbose diagnostics are on. Guard expensive log-only work with this. */
export function isDebugEnabled(): boolean {
  try {
    return Boolean(game?.settings?.get(MODULE_ID, SETTINGS.debugLogging));
  } catch {
    return false;
  }
}

/** True when developer-only tools should be shown. Read defensively, like isDebugEnabled. */
export function isDeveloperMode(): boolean {
  try {
    return Boolean(game?.settings?.get(MODULE_ID, SETTINGS.developerMode));
  } catch {
    return false;
  }
}

/**
 * Log a full chat payload as a collapsed console group: per-message role, token estimate, and the
 * text. This is the main tool for verifying what each bot actually received — including whether the
 * Tipster and RAG blocks were injected.
 */
export function debugPayload(label: string, messages: { role: string; content: string }[]): void {
  if (!isDebugEnabled()) return;
  const total = messages.reduce((n, m) => n + Math.ceil((m.content?.length ?? 0) / 4) + 4, 0);
  console.groupCollapsed(
    `${MODULE_TITLE} debug | ${label} — ${messages.length} messages, ~${total} tokens`,
  );
  for (const m of messages) {
    const est = Math.ceil((m.content?.length ?? 0) / 4);
    const head = (m.content ?? "").split("\n", 1)[0]?.slice(0, 80) ?? "";
    console.groupCollapsed(`[${m.role}] ~${est} tok — ${head}`);
    console.log(m.content);
    console.groupEnd();
  }
  console.groupEnd();
}
