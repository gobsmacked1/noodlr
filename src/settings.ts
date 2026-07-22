// Settings + settings-menu registration. Called once during the Foundry "init" hook.

import { MODULE_ID, MENUS, SETTINGS, log } from "./constants";
import { NoodlrSettingsApp } from "./apps/settings-app";
import { registerFeatureProviderSettings } from "./providers/config";

export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: "NOODLR.Settings.Enabled.Name",
    hint: "NOODLR.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Chat provider (OpenRouter / custom OpenAI-compatible). Shown in native settings.
  registerFeatureProviderSettings("chat");

  game.settings.register(MODULE_ID, SETTINGS.chatContinueAfterRoll, {
    name: "NOODLR.Settings.ChatContinueAfterRoll.Name",
    hint: "NOODLR.Settings.ChatContinueAfterRoll.Hint",
    scope: "world",
    config: true,
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

  // The dedicated configuration window (a "tab" in the settings sidebar).
  game.settings.registerMenu(MODULE_ID, MENUS.config, {
    name: "NOODLR.Settings.Menu.Name",
    label: "NOODLR.Settings.Menu.Label",
    hint: "NOODLR.Settings.Menu.Hint",
    icon: "fa-solid fa-dragon",
    type: NoodlrSettingsApp,
    restricted: true,
  });

  log("settings registered");
}
