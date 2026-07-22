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
} as const;

/** Settings-menu keys (open dedicated ApplicationV2 config windows). */
export const MENUS = {
  config: "noodlrConfig",
  memory: "noodlrMemory",
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
