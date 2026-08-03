// Noodlr entry point. Wires lifecycle hooks, registers settings + keybindings, exposes a
// small module API, and provides launch points for the (stub) chat panel. Everything
// here is our own clean-room code written against Foundry v14's public API.

import { MODULE_ID, KEYBINDINGS, SOCKET, debug, log } from "./constants";
import { registerSettings } from "./settings";
import { registerStatsSettings } from "./util/stats";
import { sanitizeUserText } from "./util/sanitize";
import { NoodlrChatPanel } from "./apps/chat-panel";
import { NoodlrPlayerPanel } from "./apps/player-panel";
import { localizeWithAssistant } from "./chat/assistant";
import { NoodlrTextGenApp } from "./apps/text-gen-app";
import { NoodlrAudioGenApp } from "./apps/audio-gen-app";
import { NoodlrImageGenApp } from "./apps/image-gen-app";
import { NoodlrSecurityApp } from "./apps/security-app";
import { registerNoodlrPartials } from "./apps/partials";
import { seedPromptDefaults } from "./prompts/fields";
import { NoodlrMemoryApp } from "./apps/memory-app";
import { NoodlrLorebookApp } from "./apps/lorebook-app";
import { NoodlrRagBrowserApp } from "./apps/rag-browser-app";
import { speak, stopSpeaking } from "./media/tts";
import { createAndShareImage } from "./media/scene-art";
import { createAndPlayMusic, createAndShareVideo } from "./media/av-gen";
import { ensureMediaFolder } from "./media/storage";
import {
  getImageChatTrigger,
  getImageAllowPlayers,
  getMusicConfig,
  getVideoConfig,
  IMAGE_KINDS,
  IMAGE_KIND_META,
  type ImageKind,
} from "./media/config";
import { refreshPushToLogButton, pushToLog, type TranscriptPayload } from "./media/push-to-log";
import { registerArtifactHooks, handleArtifactSocket } from "./output/artifacts";
import { initChatSniffer } from "./log/chat-sniffer";
import { initAdjudicationCapture } from "./players/adjudication";
import { registerDossierCleanup } from "./combat/dossier";
import { getCombatAutomation } from "./combat/config";
import { toggleSelectedCombatantAutomation } from "./combat/auto/control";
import { registerAutomationCleanup } from "./combat/auto/registry";
import { registerAutomationTurnHook } from "./combat/auto/hooks";
import { registerEncounterTracking } from "./combat/auto/encounter";
import { explainTurn } from "./combat/auto/explain";
import { surveyActions } from "./combat/survey";
import { restoreForfeited } from "./combat/systems/dnd5e-rewards";
import { loadBanter } from "./combat/banter/library";
import { runCurrentNpcTurn } from "./combat/npc-turn";
import {
  PLAYER_ASK,
  PLAYER_ACK,
  PLAYER_ACK_HOOK,
  handlePlayerAsk,
  handlePlayerAckSocket,
  type PlayerAskPayload,
  type PlayerAckPayload,
  type PlayerBotFlag,
} from "./players/relay";

/** Public surface other code (macros, console, future features) can call. */
export interface NoodlrApi {
  openChat(): void;
  openPlayerChat(): void;
  /** Alias for `openTextGen()` — kept so existing macros keep working. */
  openSettings(): void;
  openTextGen(): void;
  openAudioGen(): void;
  openImageGen(): void;
  openSecurity(): void;
  openMemory(): void;
  openLorebook(): void;
  openRagBrowser(): void;
  speak(text: string): void;
  stopSpeaking(): void;
  generateSceneImage(description: string): Promise<void>;
  generateMusic(description: string): Promise<void>;
  generateVideo(description: string): Promise<void>;
  togglePushToLog(): void;
  runNpcTurn(): Promise<void>;
  restoreForfeitedGear(): Promise<number>;
  explainTurn(): void;
  surveyActions(opts?: { saveToFile?: boolean; max?: number }): Promise<unknown>;
}

const api: NoodlrApi = {
  openChat: () => {
    // Reuse the existing panel (bring to front) instead of stacking duplicates.
    const existing = foundry.applications.instances?.get("noodlr-chat-panel");
    if (existing) void existing.render({ force: true });
    else new NoodlrChatPanel().render({ force: true });
  },
  openPlayerChat: () => {
    const existing = foundry.applications.instances?.get("noodlr-player-panel");
    if (existing) void existing.render({ force: true });
    else new NoodlrPlayerPanel().render({ force: true });
  },
  openSettings: () => {
    new NoodlrTextGenApp().render({ force: true });
  },
  openTextGen: () => {
    new NoodlrTextGenApp().render({ force: true });
  },
  openAudioGen: () => {
    new NoodlrAudioGenApp().render({ force: true });
  },
  openImageGen: () => {
    new NoodlrImageGenApp().render({ force: true });
  },
  openSecurity: () => {
    new NoodlrSecurityApp().render({ force: true });
  },
  openMemory: () => {
    new NoodlrMemoryApp().render({ force: true });
  },
  openLorebook: () => {
    new NoodlrLorebookApp().render({ force: true });
  },
  openRagBrowser: () => {
    new NoodlrRagBrowserApp().render({ force: true });
  },
  speak: (text: string) => void speak(text),
  stopSpeaking: () => stopSpeaking(),
  generateSceneImage: (description: string) => createAndShareImage({ description }),
  generateMusic: (description: string) => createAndPlayMusic({ description }),
  generateVideo: (description: string) => createAndShareVideo({ description }),
  togglePushToLog: () => pushToLog.toggle(),
  runNpcTurn: () => runCurrentNpcTurn(),
  /** Undo a mercy forfeiture from the console, if the chat card has scrolled away. */
  restoreForfeitedGear: () => restoreForfeited(),
  /** Dump what the planner can read off the selected combatant, and how it scored its options. */
  explainTurn: () => explainTurn(),
  /** Census every NPC sheet in the world, so data shapes are observed rather than assumed. */
  surveyActions: (opts) => surveyActions(opts),
};

Hooks.once("init", () => {
  log(`initializing (Foundry ${game.version ?? "?"})`);
  registerSettings();
  registerStatsSettings();
  registerKeybindings();
  // Shared Handlebars partials for the config windows. Handlebars throws on a missing partial, so
  // this has to finish before a window can render — `init` is early enough that it always does.
  void registerNoodlrPartials();

  // Expose the API on the module entry so it's reachable as
  // game.modules.get("noodlr").api during development.
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;
});

Hooks.once("ready", () => {
  log("ready");

  // GM receives relayed messages from player clients: push-to-log transcripts, requests to retire
  // (delete + clean up) an AI-output artifact card, and players-only "Ask the Table" requests.
  game.socket?.on(SOCKET, (data: { type?: string } & Record<string, unknown>) => {
    // The GM's receipt for a player question is handled on EVERY client (the asking player needs it
    // to know the request crossed the socket), so it must be routed before the GM-only gate.
    if (data?.type === PLAYER_ACK) {
      handlePlayerAckSocket(data as unknown as PlayerAckPayload);
      return;
    }
    if (!game.user?.isGM) return;
    debug("socket received", { type: data?.type });
    if (data?.type === "transcript")
      pushToLog.handleTranscript(data as unknown as TranscriptPayload);
    else if (data?.type === "artifact-retire") handleArtifactSocket(data);
    else if (data?.type === PLAYER_ASK) {
      // Deliberately not debug-gated: whether a player's question reaches the GM at all is the one
      // fact worth having in the log by default when this feature misbehaves.
      log(`player question relayed from ${String(data.userName ?? "a player")}`);
      void handlePlayerAsk(data as unknown as PlayerAskPayload);
    }
  });

  Hooks.on(PLAYER_ACK_HOOK, (requestId: string) => NoodlrPlayerPanel.acknowledged(requestId));

  // Adopt players-only "Ask the Table" results into any open player panel (all clients). The
  // result rides a public ChatMessage (Foundry mirrors it), so this fires everywhere.
  Hooks.on("createChatMessage", (message: any) => {
    const flag =
      message?.getFlag?.(MODULE_ID, "playerBot") ?? message?.flags?.[MODULE_ID]?.playerBot;
    if (flag) NoodlrPlayerPanel.receive(flag as PlayerBotFlag);
  });

  // Retry/Reject controls + deferred RAG commit for AI-generated media outputs.
  registerArtifactHooks();

  // Floating push-to-log button (bottom-center) — only when transcription is enabled.
  refreshPushToLogButton();

  // Ensure the media output folder exists (GM only — creating dirs needs upload permission).
  if (game.user?.isGM) {
    void ensureMediaFolder();
    // One-time: fill prompt fields left empty under the old "empty means use the default" rule.
    void seedPromptDefaults();
    // Native Foundry chat-log capture -> unfiltered_chat silo (only the primary GM records; the
    // handler self-gates on the enable toggle + primary-GM check).
    initChatSniffer();
    // Players-bot adjudication: capture player rolls from chat to resolve pending checks.
    initAdjudicationCapture();
    // Combat dossiers live only for the skirmish: forget a creature's turn history when it dies
    // or the fight ends.
    registerDossierCleanup();
    // Automation opt-ins are per-encounter too; released when combat ends.
    registerAutomationCleanup();
    registerAutomationTurnHook();
    // Watches whether the party is still swinging, which is what mercy hangs on.
    registerEncounterTracking();
    // Parsed once; a missing file just means silent monsters.
    void loadBanter();
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
    const desc = sanitizeUserText(text.replace(re, ""), { maxLength: 2000 });
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
    const desc = sanitizeUserText(text.match(/^generate\s+music\s*:\s*([\s\S]+)$/i)?.[1], {
      maxLength: 2000,
    });
    if (desc) void createAndPlayMusic({ description: desc });
    return false;
  }

  // --- Video ---
  if (/^generate\s+video\s*:/i.test(text)) {
    const cfg = getVideoConfig();
    if (!cfg.enabled || !cfg.chatTrigger) return true;
    if (!gate(cfg.allowPlayers)) return false;
    const desc = sanitizeUserText(text.match(/^generate\s+video\s*:\s*([\s\S]+)$/i)?.[1], {
      maxLength: 2000,
    });
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

    // Each role gets exactly one chat entry point: GMs the co-pilot, players the table bot. A GM
    // who wants to inspect the players' panel can still call api.openPlayerChat() from the console.
    const tools: Record<string, any> = {
      // Not rendered (visible: false), but still the group's activeTool. Foundry requires activeTool
      // to name a tool that exists, and it must not be one of the real buttons: whichever tool is
      // active is skipped on click, so the chat button would stop re-opening a panel you had closed.
      // Keeping it hidden removes the dead dragon icon from the flyout without giving that up.
      home: {
        name: "home",
        title: "NOODLR.Controls.GroupTitle",
        icon: "fa-solid fa-dragon",
        order: 0,
        visible: false,
        onChange: () => {},
      },
      chat: {
        name: "chat",
        title: localizeWithAssistant("NOODLR.ChatPanel.Title"),
        icon: "fa-solid fa-comments",
        order: 1,
        button: true,
        visible: isGM,
        onChange: () => api.openChat(),
      },
      playerChat: {
        name: "playerChat",
        title: localizeWithAssistant("NOODLR.Players.Tool"),
        icon: "fa-solid fa-masks-theater",
        order: 2,
        button: true,
        visible: !isGM,
        onChange: () => api.openPlayerChat(),
      },
    };
    if (isGM) {
      // One button per image generator (scene art, portrait, token, map), each with its icon.
      let order = 3;
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
      // Only offered in "partial" automation: in "full" every creature is played anyway, and in
      // "off" the GM has said they want the fight in their own hands.
      if (getCombatAutomation() === "partial") {
        tools.npcTurn = {
          name: "npcTurn",
          title: "NOODLR.Combat.ToggleAutomation",
          icon: "fa-solid fa-hand-fist",
          order: order++,
          button: true,
          visible: true,
          onChange: () => void toggleSelectedCombatantAutomation(),
        };
      }
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
      // Session-time knowledge tools (periodic use → toolbar, not buried in config).
      tools.lorebook = {
        name: "lorebook",
        title: "NOODLR.Lorebook.Title",
        icon: "fa-solid fa-book",
        order: order++,
        button: true,
        visible: true,
        onChange: () => api.openLorebook(),
      };
      tools.ragBrowser = {
        name: "ragBrowser",
        title: "NOODLR.RagBrowser.Title",
        icon: "fa-solid fa-magnifying-glass-chart",
        order: order++,
        button: true,
        visible: true,
        onChange: () => api.openRagBrowser(),
      };
    }

    controls.noodlr = {
      name: "noodlr",
      title: "NOODLR.Controls.GroupTitle",
      icon: "fa-solid fa-dragon",
      order: Object.keys(controls).length,
      visible: true,
      activeTool: "home",
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
  await createAndShareImage(
    { description: text, entityKey, title: entityKey, hidden: hideOutput },
    kind,
  );
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
      text: sanitizeUserText((value as any)?.text, { maxLength: 2000 }),
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
      // Open the chatbot appropriate to this user's role: GM/AGM get the co-pilot; Players and
      // Trusted Players get the players-only "Ask the Table" panel.
      if (game.user?.isGM) NoodlrChatPanel.toggle();
      else NoodlrPlayerPanel.toggle();
      return true;
    },
    restricted: false,
  });
}
