// Noodlr entry point. Wires lifecycle hooks, registers settings + keybindings, exposes a
// small module API, and provides launch points for the (stub) chat panel. Everything
// here is our own clean-room code written against Foundry v14's public API.

import { MODULE_ID, KEYBINDINGS, SOCKET, log } from "./constants";
import { registerSettings } from "./settings";
import { registerStatsSettings } from "./util/stats";
import { NoodlrChatPanel } from "./apps/chat-panel";
import { NoodlrSettingsApp } from "./apps/settings-app";
import { NoodlrMemoryApp } from "./apps/memory-app";
import { NoodlrLorebookApp } from "./apps/lorebook-app";
import { NoodlrChronicleApp } from "./apps/chronicle-app";
import { speak, stopSpeaking } from "./media/tts";
import { createAndShareImage } from "./media/scene-art";
import { createAndPlayMusic, createAndShareVideo } from "./media/av-gen";
import { ensureMediaFolder } from "./media/storage";
import {
  getImageChatTrigger,
  getImageAllowPlayers,
  getMusicConfig,
  getVideoConfig,
} from "./media/config";
import { refreshPushToLogButton, pushToLog, type TranscriptPayload } from "./media/push-to-log";
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
  generateMusic(description: string): Promise<void>;
  generateVideo(description: string): Promise<void>;
  togglePushToLog(): void;
  runNpcTurn(): Promise<void>;
}

const api: NoodlrApi = {
  openChat: () => {
    // Reuse the existing panel (bring to front) instead of stacking duplicates.
    const existing = foundry.applications.instances?.get("noodlr-chat-panel");
    if (existing) void existing.render({ force: true });
    else new NoodlrChatPanel().render({ force: true });
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
  generateSceneImage: (description: string) => createAndShareImage({ description }),
  generateMusic: (description: string) => createAndPlayMusic({ description }),
  generateVideo: (description: string) => createAndShareVideo({ description }),
  togglePushToLog: () => pushToLog.toggle(),
  runNpcTurn: () => runCurrentNpcTurn(),
};

Hooks.once("init", () => {
  log(`initializing (Foundry ${game.version ?? "?"})`);
  registerSettings();
  registerStatsSettings();
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

  // Floating push-to-log button (bottom-center) — only when transcription is enabled.
  refreshPushToLogButton();

  // Ensure the media output folder exists (GM only — creating dirs needs upload permission).
  if (game.user?.isGM) void ensureMediaFolder();
});

// Chat-command triggers for generative media. Returning false swallows the command so the
// literal text isn't posted as a chat message.
//   "Generate Image: <scene>"           -> one-off scene art (broadcast to all)
//   "Generate Portrait: <Name>: <desc>" -> keyed to <Name> for continuity (reuses seed/look)
//   "Generate Music: <mood>"            -> music to a Foundry Playlist
//   "Generate Video: <scene>"           -> short clip broadcast to all
Hooks.on("chatMessage", (_log: unknown, message: string): boolean => {
  const text = (message ?? "").trim();

  const gate = (allowPlayers: boolean): boolean => {
    if (game.user?.isGM || allowPlayers) return true;
    ui.notifications?.warn(game.i18n.localize("NOODLR.Media.Image.GMOnly"));
    return false;
  };

  // --- Image / Portrait ---
  if (/^generate\s+(image|portrait)\s*:/i.test(text)) {
    if (!getImageChatTrigger()) return true;
    if (!gate(getImageAllowPlayers())) return false;
    if (/^generate\s+portrait\s*:/i.test(text)) {
      const m = text.match(/^generate\s+portrait\s*:\s*([^:]+?)(?::\s*([\s\S]+))?\s*$/i);
      const name = (m?.[1] ?? "").trim();
      const desc = (m?.[2] ?? "").trim();
      if (!name) {
        ui.notifications?.warn(game.i18n.localize("NOODLR.Media.Image.NeedName"));
        return false;
      }
      void createAndShareImage({ description: desc, entityKey: name, title: name });
    } else {
      const desc = (text.match(/^generate\s+image\s*:\s*([\s\S]+)$/i)?.[1] ?? "").trim();
      if (desc) void createAndShareImage({ description: desc });
    }
    return false;
  }

  // --- Music ---
  if (/^generate\s+music\s*:/i.test(text)) {
    const cfg = getMusicConfig();
    if (!cfg.enabled || !cfg.chatTrigger) return true;
    if (!gate(cfg.allowPlayers)) return false;
    const desc = (text.match(/^generate\s+music\s*:\s*([\s\S]+)$/i)?.[1] ?? "").trim();
    if (desc) void createAndPlayMusic({ description: desc });
    return false;
  }

  // --- Video ---
  if (/^generate\s+video\s*:/i.test(text)) {
    const cfg = getVideoConfig();
    if (!cfg.enabled || !cfg.chatTrigger) return true;
    if (!gate(cfg.allowPlayers)) return false;
    const desc = (text.match(/^generate\s+video\s*:\s*([\s\S]+)$/i)?.[1] ?? "").trim();
    if (desc) void createAndShareVideo({ description: desc });
    return false;
  }

  return true;
});

// Add a dedicated Noodlr control group (dragon icon) to the canvas toolbar.
//
// Foundry v13+ passes `controls` as a Record<string, SceneControl> keyed by name. A custom
// group MUST define `activeTool` (a valid tool name) or Foundry throws when switching
// controls; each tool needs an `order` and uses `onChange` (buttons resolve immediately).
// (min compatibility is v13, so we target the record shape only.)
Hooks.on("getSceneControlButtons", (controls: Record<string, any>) => {
  if (!controls || typeof controls !== "object") return;
  try {
    const isGM = Boolean(game.user?.isGM);

    const tools: Record<string, any> = {
      chat: {
        name: "chat",
        title: "NOODLR.ChatPanel.Title",
        icon: "fa-solid fa-comments",
        order: 1,
        button: true,
        visible: true,
        onChange: () => api.openChat(),
      },
    };
    if (isGM) {
      tools.sceneArt = {
        name: "sceneArt",
        title: "NOODLR.Media.SceneArtTitle",
        icon: "fa-solid fa-image",
        order: 2,
        button: true,
        visible: true,
        onChange: () => void promptSceneImage(),
      };
      tools.npcTurn = {
        name: "npcTurn",
        title: "NOODLR.Combat.RunTurn",
        icon: "fa-solid fa-hand-fist",
        order: 3,
        button: true,
        visible: true,
        onChange: () => void runCurrentNpcTurn(),
      };
      if (getMusicConfig().enabled) {
        tools.music = {
          name: "music",
          title: "NOODLR.Media.MusicPromptTitle",
          icon: "fa-solid fa-music",
          order: 4,
          button: true,
          visible: true,
          onChange: () => void promptMusic(),
        };
      }
      if (getVideoConfig().enabled) {
        tools.video = {
          name: "video",
          title: "NOODLR.Media.VideoPromptTitle",
          icon: "fa-solid fa-film",
          order: 5,
          button: true,
          visible: true,
          onChange: () => void promptVideo(),
        };
      }
    }

    controls.noodlr = {
      name: "noodlr",
      title: "NOODLR.Controls.GroupTitle",
      icon: "fa-solid fa-dragon",
      order: Object.keys(controls).length,
      visible: true,
      // Buttons never become "active", but Foundry requires a valid tool name here.
      activeTool: "chat",
      tools,
    };
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
    await createAndShareImage({ description: text });
  } catch (err) {
    log("scene image generation cancelled/failed:", err);
  }
}

/** Small helper: prompt for a description in a DialogV2 textarea; returns trimmed text or "". */
async function promptDescription(titleKey: string, hintKey: string, okKey: string): Promise<string> {
  try {
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize(titleKey) },
      content: `<p>${game.i18n.localize(hintKey)}</p><textarea name="desc" rows="3" style="width:100%"></textarea>`,
      ok: {
        label: game.i18n.localize(okKey),
        callback: (_ev: Event, button: any) => button.form?.elements?.desc?.value ?? "",
      },
    });
    return String(value ?? "").trim();
  } catch {
    return "";
  }
}

/** Prompt the GM for a music description, then generate + play it via a Foundry Playlist. */
async function promptMusic(): Promise<void> {
  const text = await promptDescription(
    "NOODLR.Media.MusicPromptTitle",
    "NOODLR.Media.MusicPromptHint",
    "NOODLR.Media.MusicPromptButton",
  );
  if (text) await createAndPlayMusic({ description: text });
}

/** Prompt the GM for a video description, then generate + broadcast it. */
async function promptVideo(): Promise<void> {
  const text = await promptDescription(
    "NOODLR.Media.VideoPromptTitle",
    "NOODLR.Media.VideoPromptHint",
    "NOODLR.Media.VideoPromptButton",
  );
  if (text) await createAndShareVideo({ description: text });
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
