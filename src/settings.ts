// Settings + settings-menu registration. Called once during the Foundry "init" hook.

import { MODULE_ID, MENUS, SETTINGS, log } from "./constants";
import { NoodlrSettingsApp } from "./apps/settings-app";
import { NoodlrMemoryConfigApp } from "./apps/memory-config-app";
import { registerFeatureProviderSettings } from "./providers/config";
import { registerRagSettings } from "./rag/config";
import { registerPromptSettings } from "./prompt/settings";
import { registerMediaSettings } from "./media/config";
import { registerCombatSettings } from "./combat/config";

export function registerSettings(): void {
  // Chat provider (OpenRouter / custom OpenAI-compatible). Rendered in the config window.
  registerFeatureProviderSettings("chat");

  game.settings.register(MODULE_ID, SETTINGS.chatContinueAfterRoll, {
    name: "NOODLR.Settings.ChatContinueAfterRoll.Name",
    hint: "NOODLR.Settings.ChatContinueAfterRoll.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  // Chat system-prompt override. Empty string means "use the built-in DM prompt".
  // The 65k cap and spellcheck textarea UI land with the Prompts tab in a later phase;
  // here we just persist the string.
  game.settings.register(MODULE_ID, SETTINGS.chatSystemPrompt, {
    name: "NOODLR.Settings.ChatSystemPrompt.Name",
    hint: "NOODLR.Settings.ChatSystemPrompt.Hint",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  // Memory (RAG) settings + the dedicated Memory window.
  registerRagSettings();

  // Prompt architecture (lorebook, author's note, post-history, chronicle).
  registerPromptSettings();

  // Media features (TTS, Image, push-to-log transcription).
  registerMediaSettings();

  // Combat co-pilot (AI-run NPC turn prompt).
  registerCombatSettings();

  // Two sidebar menus only: the main config window, and the consolidated Memory & Knowledge
  // window (which itself opens the Manage Memory, Lorebook, and Chronicle sub-windows).
  game.settings.registerMenu(MODULE_ID, MENUS.config, {
    name: "NOODLR.Settings.Menu.Name",
    label: "NOODLR.Settings.Menu.Label",
    hint: "NOODLR.Settings.Menu.Hint",
    icon: "fa-solid fa-dragon",
    type: NoodlrSettingsApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, MENUS.memory, {
    name: "NOODLR.Rag.Menu.Name",
    label: "NOODLR.Rag.Menu.Label",
    hint: "NOODLR.Rag.Menu.Hint",
    icon: "fa-solid fa-brain",
    type: NoodlrMemoryConfigApp,
    restricted: true,
  });

  log("settings registered");
}
