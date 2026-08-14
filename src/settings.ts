// Settings + settings-menu registration. Called once during the Foundry "init" hook.

import { MODULE_ID, MENUS, SETTINGS, log } from "./constants";
import { promptDefault } from "./prompts/fields";
import { DEFAULT_ASSISTANT_NAME } from "./chat/assistant";
import { NoodlrTextGenApp } from "./apps/text-gen-app";
import { NoodlrAudioGenApp } from "./apps/audio-gen-app";
import { NoodlrImageGenApp } from "./apps/image-gen-app";
import { NoodlrSecurityApp } from "./apps/security-app";
import { NoodlrMemoryConfigApp } from "./apps/memory-config-app";
import { registerFeatureProviderSettings } from "./providers/config";
import { registerRagSettings } from "./rag/config";
import { registerPromptSettings } from "./prompt/settings";
import { registerMediaSettings } from "./media/config";
import { registerBehaviorSettings } from "./behavior/config";
import { registerCapabilitySettings } from "./capability/config";
import { registerWatchSettings } from "./watch/watch";
import { registerRulesetSettings } from "./system/ruleset";

export function registerSettings(): void {
  // The single shared OpenRouter API key (every openrouter feature uses it). World-scoped,
  // write-only in the UI, rendered once on the main config window.
  game.settings.register(MODULE_ID, SETTINGS.openrouterApiKey, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

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

  // The three chat prompts. Each ships pre-filled with its default and is read verbatim
  // afterwards — see prompts/fields.ts for why an empty field now means "send nothing".
  for (const key of [
    SETTINGS.chatSystemPrompt,
    SETTINGS.playersSystemPrompt,
    SETTINGS.adjudicationPrompt,
  ]) {
    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: String,
      default: promptDefault(key),
    });
  }

  game.settings.register(MODULE_ID, SETTINGS.assistantName, {
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_ASSISTANT_NAME,
  });

  // Which rules system every bot plays by (never inferred from campaign content).
  registerRulesetSettings();

  game.settings.register(MODULE_ID, SETTINGS.promptDefaultsSeeded, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  // Memory (RAG) settings + the dedicated Memory window.
  registerRagSettings();

  // Prompt architecture (lorebook, author's note, post-history, chronicle).
  registerPromptSettings();

  // Media features (TTS, Image, push-to-log transcription).
  registerMediaSettings();

  // Behavioral automation: the voice given to a creature that flees, yields, or parleys.
  registerBehaviorSettings();

  // The capability compiler: reading a creature's own written abilities into rules a hooks module
  // can execute.
  registerCapabilitySettings();

  // Reading a Ready action's trigger, which a player writes in their own words.
  registerWatchSettings();

  // Five topic windows, registered in the order they should appear: memory, then the three
  // generation domains, then credentials. Each opens its own page rather than adding another
  // fieldset to one endless form.
  game.settings.registerMenu(MODULE_ID, MENUS.memory, {
    name: "NOODLR.Rag.Menu.Name",
    label: "NOODLR.Rag.Menu.Label",
    hint: "NOODLR.Rag.Menu.Hint",
    icon: "fa-solid fa-brain",
    type: NoodlrMemoryConfigApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, MENUS.textGen, {
    name: "NOODLR.TextGen.Menu.Name",
    label: "NOODLR.TextGen.Menu.Label",
    hint: "NOODLR.TextGen.Menu.Hint",
    icon: "fa-solid fa-comments",
    type: NoodlrTextGenApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, MENUS.audioGen, {
    name: "NOODLR.AudioGen.Menu.Name",
    label: "NOODLR.AudioGen.Menu.Label",
    hint: "NOODLR.AudioGen.Menu.Hint",
    icon: "fa-solid fa-volume-high",
    type: NoodlrAudioGenApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, MENUS.imageGen, {
    name: "NOODLR.ImageGen.Menu.Name",
    label: "NOODLR.ImageGen.Menu.Label",
    hint: "NOODLR.ImageGen.Menu.Hint",
    icon: "fa-solid fa-image",
    type: NoodlrImageGenApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, MENUS.security, {
    name: "NOODLR.Security.Menu.Name",
    label: "NOODLR.Security.Menu.Label",
    hint: "NOODLR.Security.Menu.Hint",
    icon: "fa-solid fa-key",
    type: NoodlrSecurityApp,
    restricted: true,
  });

  log("settings registered");
}
