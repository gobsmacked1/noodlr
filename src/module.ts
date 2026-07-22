// Noodlr entry point. Wires lifecycle hooks, registers settings + keybindings, exposes a
// small module API, and provides launch points for the (stub) chat panel. Everything
// here is our own clean-room code written against Foundry v14's public API.

import { MODULE_ID, KEYBINDINGS, log } from "./constants";
import { registerSettings } from "./settings";
import { NoodlrChatPanel } from "./apps/chat-panel";
import { NoodlrSettingsApp } from "./apps/settings-app";

/** Public surface other code (macros, console, future features) can call. */
export interface NoodlrApi {
  openChat(): void;
  openSettings(): void;
}

const api: NoodlrApi = {
  openChat: () => {
    new NoodlrChatPanel().render({ force: true });
  },
  openSettings: () => {
    new NoodlrSettingsApp().render({ force: true });
  },
};

Hooks.once("init", () => {
  log(`initializing (Foundry ${game.version ?? "?"})`);
  registerSettings();
  registerKeybindings();

  // Expose the API on the module entry so it's reachable as
  // game.modules.get("noodlr").api during development.
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;
});

Hooks.once("ready", () => {
  log("ready");
});

// Add a scene-control button so a GM can open the panel from the canvas toolbar.
// Foundry v13+ passes controls as a keyed record; we add defensively to survive shape
// differences across point releases.
Hooks.on("getSceneControlButtons", (controls: any) => {
  const tool = {
    name: "noodlr-chat",
    title: "NOODLR.ChatPanel.Title",
    icon: "fa-solid fa-dragon",
    button: true,
    visible: true,
    onClick: () => api.openChat(),
    onChange: () => api.openChat(),
  };

  try {
    if (Array.isArray(controls)) {
      // Legacy array shape: attach to the token/notes group if present, else group 0.
      const group = controls.find((c: any) => c.name === "token") ?? controls[0];
      if (group) (group.tools ??= []).push(tool);
    } else if (controls && typeof controls === "object") {
      // v13+ record shape: controls keyed by name, each with a tools record.
      const group = controls.tokens ?? controls.token ?? Object.values(controls)[0];
      if (group) {
        group.tools ??= {};
        if (Array.isArray(group.tools)) group.tools.push(tool);
        else group.tools[tool.name] = tool;
      }
    }
  } catch (err) {
    log("could not add scene control button:", err);
  }
});

function registerKeybindings(): void {
  game.keybindings.register(MODULE_ID, KEYBINDINGS.toggleChatPanel, {
    name: "NOODLR.Keybindings.ToggleChatPanel.Name",
    hint: "NOODLR.Keybindings.ToggleChatPanel.Hint",
    editable: [{ key: "KeyN", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      NoodlrChatPanel.toggle();
      return true;
    },
    restricted: false,
  });
}
