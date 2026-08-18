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
import { NoodlrMemoryApp, rebuildIngestTask } from "./apps/memory-app";
import { restoreIngestQueue } from "./rag/ingest-queue";
import { isRagEnabled } from "./rag/config";
import { isPrimaryGM } from "./util/gm";
import { NoodlrLorebookApp } from "./apps/lorebook-app";
import { NoodlrRagBrowserApp } from "./apps/rag-browser-app";
import { speak, stopSpeaking } from "./media/tts";
import { createAndShareImage } from "./media/scene-art";
import { createAndPlayMusic, createAndShareVideo } from "./media/av-gen";
import { ensureMediaFolder, scopeMediaFolder } from "./media/storage";
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
import { surveyPlayed } from "./util/played-survey";
import { exportPacks } from "./dev/pack-export";
import { loadBanter } from "./behavior/banter-library";
import { registerBehaviorHooks } from "./behavior/listen";
import { registerCapabilityCompiler } from "./capability/compile";
import { registerWatchListener } from "./watch/watch";
import { detectHooksModules } from "./integration/hooks-modules";
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
  surveyPlayed(): Record<string, unknown>;
  /** Every active `noodlr-hooks-*` rules module and what it says it enforces. */
  hooksModules(): unknown;
  /** Developer only: write compendiums to disk as JSONL for the offline rules miner. */
  exportPacks(packIds: string[]): Promise<unknown>;
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
  /** Which character each connected user is actually playing, versus the one Foundry falls back to. */
  surveyPlayed: () => surveyPlayed(),
  /** Which rules modules are installed, and what each declares. First stop when rules go unenforced. */
  hooksModules: () => detectHooksModules(),
  /**
   * Bulk export for the rules miner. Ticking sixty checkboxes is worse than one console call, and
   * this is the path a repeat run will actually use:
   *   api.exportPacks(game.packs.filter(p => p.metadata.packageName.startsWith("dnd-")).map(p => p.collection))
   */
  exportPacks: (packIds: string[]) =>
    exportPacks(packIds, (p) => log(`${p.pack}: ${p.processed}/${p.total}`)),
};

Hooks.once("init", () => {
  log(`initializing (Foundry ${game.version ?? "?"})`);
  registerSettings();
  registerStatsSettings();
  registerKeybindings();
  // Shared Handlebars partials for the config windows. Handlebars throws on a missing partial, so
  // this has to finish before a window can render — `init` is early enough that it always does.
  void registerNoodlrPartials();

  // Listen for whichever `noodlr-hooks-*` rules module the table has installed. Registered on every
  // client and at `init`, because a rules module may announce a turn before `ready` on a slow world,
  // and because the taunt has to be spoken by the client that hears the hook, GM or not.
  registerBehaviorHooks();

  // The other direction of the same seam: a rules module handing us prose it cannot interpret. The
  // listener declines on a non-GM client, so registering it everywhere is free.
  registerCapabilityCompiler();

  // And the same seam again for prose a PLAYER wrote: the trigger on a readied action. The rules
  // module routes the question to the GM before firing it, and this declines off-GM regardless.
  registerWatchListener();

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
    // Ordered: move a pre-0.7.5 world onto its own folder BEFORE creating one, or the first thing
    // this load does is create the shared folder we are moving away from. Primary GM only — it
    // writes two world settings, and once per table is the rule for those.
    void (async () => {
      if (isPrimaryGM()) await scopeMediaFolder();
      await ensureMediaFolder();
    })();
    // One-time: fill prompt fields left empty under the old "empty means use the default" rule.
    void seedPromptDefaults();
    // Native Foundry chat-log capture -> unfiltered_chat silo (only the primary GM records; the
    // handler self-gates on the enable toggle + primary-GM check).
    initChatSniffer();
    // Players-bot adjudication: capture player rolls from chat to resolve pending checks.
    initAdjudicationCapture();
    // Parsed once; a missing file just means silent monsters.
    void loadBanter();
    // Pick up an ingest queue that a reload interrupted. Primary GM only, and only when memory is
    // still switched on: the expected behaviour is a GM queueing a shelf of compendia and going off
    // to play, so a refresh hours later must not quietly abandon a half-ingested world. Silent
    // unless something was actually adopted — nobody needs a toast about an empty queue.
    if (isPrimaryGM() && isRagEnabled()) {
      const resumed = restoreIngestQueue(rebuildIngestTask);
      if (resumed > 0) {
        ui.notifications?.info(
          game.i18n.format("NOODLR.Rag.Queue.Resumed", { count: String(resumed) }),
        );
      }
    }
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
      // The Hide button moved out with the rules: declaring a Hide is a game-system question, so it
      // belongs to whichever `noodlr-hooks-*` module knows what hiding means in this system.
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
