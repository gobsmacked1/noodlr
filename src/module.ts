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
  seedMapDefaults,
  IMAGE_KINDS,
  IMAGE_KIND_META,
  type ImageKind,
} from "./media/config";
import { refreshPushToLogButton, pushToLog, type TranscriptPayload } from "./media/push-to-log";
import { registerArtifactHooks, handleArtifactSocket } from "./output/artifacts";
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

  // GM receives relayed messages from player clients: push-to-log transcripts, and requests to
  // retire (delete + clean up) an AI-output artifact card the player generated.
  game.socket?.on(SOCKET, (data: { type?: string } & Record<string, unknown>) => {
    if (!game.user?.isGM) return;
    if (data?.type === "transcript") pushToLog.handleTranscript(data as unknown as TranscriptPayload);
    else if (data?.type === "artifact-retire") handleArtifactSocket(data);
  });

  // Retry/Reject controls + deferred RAG commit for AI-generated media outputs.
  registerArtifactHooks();

  // Floating push-to-log button (bottom-center) — only when transcription is enabled.
  refreshPushToLogButton();

  // Ensure the media output folder exists (GM only — creating dirs needs upload permission).
  if (game.user?.isGM) {
    void ensureMediaFolder();
    void seedMapDefaults();
  }
});

// Chat-command triggers for generative media. Returning false swallows the command so the
// literal text isn't posted as a chat message.
//   "Generate Image: <scene>"      -> one-off scene art (broadcast to all)
//   "Generate Portrait: <subject>" -> waist-up portrait (keyed for continuity, .webp)
//   "Generate Token: <subject>"    -> top-down actor token (keyed, 400x400 .webp)
//   "Generate Map: <scene>"        -> walkable map (.webp)
//   "Generate Music: <mood>"       -> music to a Foundry Playlist
//   "Generate Video: <scene>"      -> short clip broadcast to all
Hooks.on("chatMessage", (_log: unknown, message: string): boolean => {
  const text = (message ?? "").trim();

  const gate = (allowPlayers: boolean): boolean => {
    if (game.user?.isGM || allowPlayers) return true;
    ui.notifications?.warn(game.i18n.localize("NOODLR.Media.Image.GMOnly"));
    return false;
  };

  // --- Image generators (scene / portrait / token / map) ---
  for (const kind of IMAGE_KINDS) {
    const meta = IMAGE_KIND_META[kind];
    const re = new RegExp(`^generate\\s+${meta.trigger}\\s*:`, "i");
    if (!re.test(text)) continue;
    if (!getImageChatTrigger(kind)) return true;
    if (!gate(getImageAllowPlayers(kind))) return false;
    const desc = text.replace(re, "").trim();
    if (desc) {
      // Keyed kinds (portrait/token) use the subject text as the continuity key + title.
      const entityKey = meta.keyed ? desc : undefined;
      void createAndShareImage({ description: desc, entityKey, title: entityKey }, kind);
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
      // One button per image generator (scene art, portrait, token, map), each with its icon.
      let order = 2;
      for (const kind of IMAGE_KINDS) {
        const meta = IMAGE_KIND_META[kind];
        tools[`image-${kind}`] = {
          name: `image-${kind}`,
          title: `NOODLR.Media.Kind.${cap(kind)}.Title`,
          icon: meta.icon,
          order: order++,
          button: true,
          visible: true,
          onChange: () => void promptImage(kind),
        };
      }
      tools.npcTurn = {
        name: "npcTurn",
        title: "NOODLR.Combat.RunTurn",
        icon: "fa-solid fa-hand-fist",
        order: order++,
        button: true,
        visible: true,
        onChange: () => void runCurrentNpcTurn(),
      };
      if (getMusicConfig().enabled) {
        tools.music = {
          name: "music",
          title: "NOODLR.Media.MusicPromptTitle",
          icon: "fa-solid fa-music",
          order: order++,
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
          order: order++,
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

/** Capitalize an image-kind id for its localization key ("portrait" -> "Portrait"). */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Prompt the GM for a subject/scene description, then generate + display art for `kind`. */
async function promptImage(kind: ImageKind): Promise<void> {
  const meta = IMAGE_KIND_META[kind];
  const { text, hideOutput } = await promptDescription(
    `NOODLR.Media.Kind.${cap(kind)}.Title`,
    `NOODLR.Media.Kind.${cap(kind)}.Prompt`,
    `NOODLR.Media.Kind.${cap(kind)}.Button`,
  );
  if (!text) return;
  const entityKey = meta.keyed ? text : undefined;
  await createAndShareImage({ description: text, entityKey, title: entityKey, hidden: hideOutput }, kind);
}

/**
 * Prompt for a description in a DialogV2 textarea with a "Hide output" toggle (off by default —
 * output normally mirrors to all players; checking it keeps the result GM-only for prep). Returns
 * the trimmed text ("" if cancelled) and the hide flag.
 */
async function promptDescription(
  titleKey: string,
  hintKey: string,
  okKey: string,
): Promise<{ text: string; hideOutput: boolean }> {
  try {
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize(titleKey) },
      content:
        `<p>${game.i18n.localize(hintKey)}</p>` +
        `<textarea name="desc" rows="3" style="width:100%"></textarea>` +
        `<label class="noodlr-hide-output"><input type="checkbox" name="hideOutput" /> ` +
        `${game.i18n.localize("NOODLR.Media.HideOutput")}</label>` +
        `<p class="notes">${game.i18n.localize("NOODLR.Media.HideOutputHint")}</p>`,
      ok: {
        label: game.i18n.localize(okKey),
        callback: (_ev: Event, button: any) => ({
          text: button.form?.elements?.desc?.value ?? "",
          hideOutput: Boolean(button.form?.elements?.hideOutput?.checked),
        }),
      },
    });
    return {
      text: String((value as any)?.text ?? "").trim(),
      hideOutput: Boolean((value as any)?.hideOutput),
    };
  } catch {
    return { text: "", hideOutput: false };
  }
}

/** Prompt the GM for a music description, then generate + play it via a Foundry Playlist. */
async function promptMusic(): Promise<void> {
  const { text, hideOutput } = await promptDescription(
    "NOODLR.Media.MusicPromptTitle",
    "NOODLR.Media.MusicPromptHint",
    "NOODLR.Media.MusicPromptButton",
  );
  if (text) await createAndPlayMusic({ description: text, hidden: hideOutput });
}

/** Prompt the GM for a video description, then generate + broadcast it. */
async function promptVideo(): Promise<void> {
  const { text, hideOutput } = await promptDescription(
    "NOODLR.Media.VideoPromptTitle",
    "NOODLR.Media.VideoPromptHint",
    "NOODLR.Media.VideoPromptButton",
  );
  if (text) await createAndShareVideo({ description: text, hidden: hideOutput });
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
