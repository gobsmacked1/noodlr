// Noodlr entry point. Wires lifecycle hooks, registers settings + keybindings, exposes a
// small module API, and provides launch points for the (stub) chat panel. Everything
// here is our own clean-room code written against Foundry v14's public API.

import { MODULE_ID, KEYBINDINGS, SOCKET, log } from "./constants";
import { registerSettings } from "./settings";
import { NoodlrChatPanel } from "./apps/chat-panel";
import { NoodlrSettingsApp } from "./apps/settings-app";
import { NoodlrMemoryApp } from "./apps/memory-app";
import { NoodlrLorebookApp } from "./apps/lorebook-app";
import { NoodlrChronicleApp } from "./apps/chronicle-app";
import { speak, stopSpeaking } from "./media/tts";
import { generateSceneImage } from "./media/image";
import { createPushToLogButton, pushToLog, type TranscriptPayload } from "./media/push-to-log";
import { showSceneImage } from "./media/display";
import { runCurrentNpcTurn } from "./combat/npc-turn";

/** Public surface other code (macros, console, future features) can call. */
export interface NoodlrApi {
  openChat(): void;
  openSettings(): void;
  openMemory(): void;
  openLorebook(): void;
  openChronicle(): void;
  speak(text: string): void;
  stopSpeaking(): void;
  generateSceneImage(description: string): Promise<void>;
  togglePushToLog(): void;
  runNpcTurn(): Promise<void>;
}

const api: NoodlrApi = {
  openChat: () => {
    new NoodlrChatPanel().render({ force: true });
  },
  openSettings: () => {
    new NoodlrSettingsApp().render({ force: true });
  },
  openMemory: () => {
    new NoodlrMemoryApp().render({ force: true });
  },
  openLorebook: () => {
    new NoodlrLorebookApp().render({ force: true });
  },
  openChronicle: () => {
    new NoodlrChronicleApp().render({ force: true });
  },
  speak: (text: string) => void speak(text),
  stopSpeaking: () => stopSpeaking(),
  generateSceneImage: async (description: string) => {
    const img = await generateSceneImage(description);
    await showSceneImage(img.src, img.prompt);
  },
  togglePushToLog: () => pushToLog.toggle(),
  runNpcTurn: () => runCurrentNpcTurn(),
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

  // GM receives relayed push-to-log transcripts from player clients.
  game.socket?.on(SOCKET, (data: TranscriptPayload) => {
    if (game.user?.isGM && data?.type === "transcript") pushToLog.handleTranscript(data);
  });

  // Floating push-to-log button (bottom-center) for every participant.
  createPushToLogButton();
});

// Add a scene-control button so a GM can open the panel from the canvas toolbar.
// Foundry v13+ passes controls as a keyed record; we add defensively to survive shape
// differences across point releases.
Hooks.on("getSceneControlButtons", (controls: any) => {
  const tools = [
    {
      name: "noodlr-chat",
      title: "NOODLR.ChatPanel.Title",
      icon: "fa-solid fa-dragon",
      button: true,
      visible: true,
      onClick: () => api.openChat(),
      onChange: () => api.openChat(),
    },
    {
      name: "noodlr-image",
      title: "NOODLR.Media.SceneArtTitle",
      icon: "fa-solid fa-image",
      button: true,
      visible: Boolean(game.user?.isGM),
      onClick: () => void promptSceneImage(),
      onChange: () => void promptSceneImage(),
    },
    {
      name: "noodlr-npc-turn",
      title: "NOODLR.Combat.RunTurn",
      icon: "fa-solid fa-hand-fist",
      button: true,
      visible: Boolean(game.user?.isGM),
      onClick: () => void runCurrentNpcTurn(),
      onChange: () => void runCurrentNpcTurn(),
    },
  ];

  try {
    if (Array.isArray(controls)) {
      // Legacy array shape: attach to the token/notes group if present, else group 0.
      const group = controls.find((c: any) => c.name === "token") ?? controls[0];
      if (group) for (const tool of tools) (group.tools ??= []).push(tool);
    } else if (controls && typeof controls === "object") {
      // v13+ record shape: controls keyed by name, each with a tools record.
      const group = controls.tokens ?? controls.token ?? Object.values(controls)[0];
      if (group) {
        group.tools ??= {};
        for (const tool of tools) {
          if (Array.isArray(group.tools)) group.tools.push(tool);
          else group.tools[tool.name] = tool;
        }
      }
    }
  } catch (err) {
    log("could not add scene control buttons:", err);
  }
});

/** Prompt the GM for a scene description, then generate + display art. */
async function promptSceneImage(): Promise<void> {
  try {
    const description = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("NOODLR.Media.SceneArtTitle") },
      content: `<p>${game.i18n.localize("NOODLR.Media.SceneArtPrompt")}</p><textarea name="desc" rows="3" style="width:100%"></textarea>`,
      ok: {
        label: game.i18n.localize("NOODLR.Media.SceneArtButton"),
        callback: (_ev: Event, button: any) => button.form?.elements?.desc?.value ?? "",
      },
    });
    const text = String(description ?? "").trim();
    if (!text) return;
    ui.notifications?.info("Noodlr: generating scene art…");
    await api.generateSceneImage(text);
  } catch (err) {
    log("scene image generation cancelled/failed:", err);
  }
}

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
