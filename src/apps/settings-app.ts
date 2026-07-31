// The main Noodlr configuration window ("Configure Noodlr").
//
// Everything a GM needs to wire up the AI features, grouped BY FEATURE so it's obvious what
// each field controls: each AI feature (Dungeon Master Chat, Voice/TTS, Scene Art, Voice
// Transcription) gets one block laid out Provider -> Model -> (custom URL) -> API key, with
// plain-language help. API keys are write-only: the stored key is never sent back to the
// browser; you only ever type a new one. OpenRouter model lists are fetched live.

import { MODULE_ID, MODULE_TITLE, SETTINGS, MEDIA_SETTINGS, COMBAT_SETTINGS } from "../constants";
import {
  DM_SYSTEM_PROMPT,
  SYSTEM_PROMPT_MAX_LENGTH,
  DEFAULT_COMBAT_REMINDER,
  DEFAULT_COMBAT_PROMPT,
} from "../prompts";
import { sanitizeUserText } from "../util/sanitize";
import {
  getFeatureConfig,
  getProviderView,
  saveProviderFromForm,
  saveOpenrouterKey,
  hasOpenrouterKey,
  type ProviderFormData,
} from "../providers/config";
import { chatCompletion, ChatClientError } from "../providers/chat-client";
import { isConfigured, resolveBaseUrl } from "../providers/types";
import { synthesizeSpeech, TtsError } from "../media/tts";
import {
  getImageParams,
  getTtsEnabled,
  getTtsVoice,
  getTtsAutoRead,
  getTtsPitchSupported,
  getImageChatTrigger,
  getImageAllowPlayers,
  getImagePersist,
  getMusicConfig,
  getVideoConfig,
  getTranscriptionEnabled,
  IMAGE_KINDS,
  IMAGE_KIND_META,
  IMAGE_SIZE_PRESETS,
  isCustomSize,
  normalizeCustomSize,
  imageKey,
  type ImageKind,
} from "../media/config";
import { getPushToLogConfig } from "../media/config";
import { getMediaFolder } from "../media/storage";
import { refreshPushToLogButton } from "../media/push-to-log";
import { NoodlrCreatureVoiceApp } from "./creature-voice-app";
import { getAuthorNote, getCombatReminder, getPostHistory } from "../prompt/settings";
import { getCombatSystemPrompt } from "../combat/config";
import { wireProviderBlocks } from "./provider-ui";
import { installHeaderSaveButton } from "./header-save";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Show/hide each image generator's free-form width/height inputs when "Custom…" is picked. */
function wireImageSizeSelects(root: HTMLElement): void {
  root.querySelectorAll<HTMLSelectElement>('select[data-role="image-size"]').forEach((sel) => {
    const custom = sel
      .closest(".noodlr-field")
      ?.querySelector<HTMLElement>('[data-role="custom-size"]');
    if (!custom) return;
    const apply = () => {
      custom.style.display = sel.value === "custom" ? "" : "none";
    };
    sel.addEventListener("change", apply);
    apply();
  });
}

/** Non-image provider features in this window (embeddings + rerank live in the Memory window). */
const FEATURE_IDS = ["chat", "tts", "transcription", "music", "video"] as const;
type MainFeatureId = (typeof FEATURE_IDS)[number];

/** Every provider block persisted from this window (image kinds carry provider config too). */
const ALL_PROVIDER_FEATURES = [...FEATURE_IDS, ...IMAGE_KINDS] as const;

export class NoodlrSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-settings",
    tag: "form",
    classes: ["noodlr", "noodlr-settings"],
    window: {
      title: "NOODLR.Settings.Title",
      icon: "fa-solid fa-gears",
      resizable: true,
    },
    position: { width: 680, height: 760 },
    form: {
      handler: NoodlrSettingsApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      resetPrompt: NoodlrSettingsApp.#onResetPrompt,
      testConnection: NoodlrSettingsApp.#onTestConnection,
      testTts: NoodlrSettingsApp.#onTestTts,
      browseMediaFolder: NoodlrSettingsApp.#onBrowseMediaFolder,
      openCreatureVoices: NoodlrSettingsApp.#onOpenCreatureVoices,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/settings.hbs` },
  };

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    const override = (game.settings.get(MODULE_ID, SETTINGS.chatSystemPrompt) as string) ?? "";

    // Per-feature provider views (never include the stored key — see getProviderView).
    // Each carries its own layman help answering: what does it do? what does it require?
    // what happens if you don't use it?
    const labelKey: Record<MainFeatureId, string> = {
      chat: "Chat",
      tts: "Tts",
      transcription: "Transcription",
      music: "Music",
      video: "Video",
    };
    const view = (id: MainFeatureId) => {
      const p = `NOODLR.Feature.${labelKey[id]}`;
      return {
        id,
        ...getProviderView(id),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
      };
    };

    // One view model per image generator (scene art, portrait, token, map). Each is a full,
    // independent block: provider + prompts + SD params + delivery/trigger options.
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const imageKinds = IMAGE_KINDS.map((kind: ImageKind) => {
      const meta = IMAGE_KIND_META[kind];
      const params = getImageParams(kind);
      const p = `NOODLR.Media.Kind.${cap(kind)}`;
      return {
        id: kind,
        ...getProviderView(kind),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
        icon: meta.icon,
        isScene: kind === "image",
        isMap: kind === "map",
        subfolder: meta.subfolder,
        ext: meta.ext,
        positive: params.positive,
        negative: params.negative,
        expand: params.expand,
        steps: params.steps,
        cfg: params.cfg,
        sampler: params.sampler,
        seed: params.seed,
        sizeNull: params.size.trim() === "",
        sizeCustom: isCustomSize(params.size),
        customW: isCustomSize(params.size) ? params.size.split(/[x×]/i)[0] : "",
        customH: isCustomSize(params.size) ? params.size.split(/[x×]/i)[1] : "",
        sizeOptions: IMAGE_SIZE_PRESETS.map((s) => ({
          value: s.value,
          label: s.label,
          selected: s.value === params.size,
        })),
        persist: getImagePersist(kind),
        chatTrigger: getImageChatTrigger(kind),
        allowPlayers: getImageAllowPlayers(kind),
        mediaFolder: getMediaFolder(),
      };
    });

    const music = getMusicConfig();
    const video = getVideoConfig();

    return {
      moduleTitle: MODULE_TITLE,
      version,
      hasOpenrouterKey: hasOpenrouterKey(),

      chat: view("chat"),
      tts: view("tts"),
      transcription: view("transcription"),
      music: view("music"),
      video: view("video"),
      imageKinds,
      imageMediaFolder: getMediaFolder(),

      // Chat options
      continueAfterRoll: game.settings.get(MODULE_ID, SETTINGS.chatContinueAfterRoll) as boolean,
      systemPrompt: override.trim().length > 0 ? override : DM_SYSTEM_PROMPT,
      usingDefault: override.trim().length === 0,
      maxLength: SYSTEM_PROMPT_MAX_LENGTH,

      // TTS options
      ttsEnabled: getTtsEnabled(),
      ttsVoice: getTtsVoice(),
      ttsAutoRead: getTtsAutoRead(),
      ttsPitchSupported: getTtsPitchSupported(),

      // Music options
      musicEnabled: music.enabled,
      musicChatTrigger: music.chatTrigger,
      musicAllowPlayers: music.allowPlayers,
      musicMinSec: music.minSec,
      musicMaxSec: music.maxSec,
      musicPlaylist: music.playlist,

      // Video options
      videoEnabled: video.enabled,
      videoChatTrigger: video.chatTrigger,
      videoAllowPlayers: video.allowPlayers,
      videoDuration: video.duration,
      videoResolution: video.resolution,
      videoAspect: video.aspect,

      // Transcription capture options (ingest-to-memory lives in the Memory window)
      transcriptEnabled: getTranscriptionEnabled(),
      transcriptPostChat: getPushToLogConfig().postChat,
      transcriptSegment: getPushToLogConfig().segmentSeconds,

      // Prompt architecture
      authorNote: getAuthorNote(),
      postHistory: getPostHistory(),
      combatReminder: getCombatReminder(),
      combatPrompt: getCombatSystemPrompt(),
    };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.#root();
    if (root) {
      wireProviderBlocks(root);
      wireImageSizeSelects(root);
    }
    installHeaderSaveButton(this);
  }

  static async #onSubmit(
    this: NoodlrSettingsApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    // expandObject makes dotted field names (chat.provider, ...) nested regardless of
    // whether FormDataExtended already expanded them — bulletproof across versions.
    const o = foundry.utils.expandObject(formData.object ?? {});
    const set = (k: string, v: unknown) => game.settings.set(MODULE_ID, k, v);

    // The single shared OpenRouter key (write-only).
    await saveOpenrouterKey(String(o.openrouterApiKey ?? ""), Boolean(o.openrouterApiKeyClear));

    // Provider blocks (write-only custom keys handled inside saveProviderFromForm).
    for (const id of ALL_PROVIDER_FEATURES) {
      await saveProviderFromForm(id, o[id] as ProviderFormData | undefined);
    }

    // Chat options
    await set(SETTINGS.chatContinueAfterRoll, Boolean(o.chat?.continueAfterRoll));
    const raw = String(o.systemPrompt ?? "").slice(0, SYSTEM_PROMPT_MAX_LENGTH);
    const toStore = raw.trim() === DM_SYSTEM_PROMPT.trim() ? "" : raw;
    await set(SETTINGS.chatSystemPrompt, toStore);

    // TTS options
    await set(MEDIA_SETTINGS.ttsEnabled, Boolean(o.tts?.enabled));
    await set(MEDIA_SETTINGS.ttsVoice, String(o.tts?.voice ?? "").trim());
    await set(MEDIA_SETTINGS.ttsAutoRead, Boolean(o.tts?.autoRead));
    await set(MEDIA_SETTINGS.ttsPitchSupported, Boolean(o.tts?.pitchSupported));

    // Music options
    await set(MEDIA_SETTINGS.musicEnabled, Boolean(o.music?.enabled));
    await set(MEDIA_SETTINGS.musicChatTrigger, Boolean(o.music?.chatTrigger));
    await set(MEDIA_SETTINGS.musicAllowPlayers, Boolean(o.music?.allowPlayers));
    await set(MEDIA_SETTINGS.musicMinSec, Math.max(1, Number(o.music?.minSec) || 15));
    await set(MEDIA_SETTINGS.musicMaxSec, Math.max(1, Number(o.music?.maxSec) || 300));
    await set(
      MEDIA_SETTINGS.musicPlaylist,
      String(o.music?.playlist ?? "Noodlr Music").trim() || "Noodlr Music",
    );

    // Video options
    await set(MEDIA_SETTINGS.videoEnabled, Boolean(o.video?.enabled));
    await set(MEDIA_SETTINGS.videoChatTrigger, Boolean(o.video?.chatTrigger));
    await set(MEDIA_SETTINGS.videoAllowPlayers, Boolean(o.video?.allowPlayers));
    await set(MEDIA_SETTINGS.videoDuration, Math.max(1, Number(o.video?.duration) || 8));
    await set(
      MEDIA_SETTINGS.videoResolution,
      String(o.video?.resolution ?? "720p").trim() || "720p",
    );
    await set(MEDIA_SETTINGS.videoAspect, String(o.video?.aspect ?? "16:9").trim() || "16:9");

    // Image options — one full set per generator (scene / portrait / token / map).
    for (const kind of IMAGE_KINDS) {
      const meta = IMAGE_KIND_META[kind];
      const d = (o[kind] ?? {}) as Record<string, unknown>;
      const ik = (field: string) => imageKey(kind, field);
      await set(ik("expandPrompt"), Boolean(d.expand));
      await set(ik("steps"), Number(d.steps) || 20);
      await set(ik("cfg"), Number(d.cfg) || 7.0);
      await set(ik("sampler"), String(d.sampler ?? "Euler a").trim());
      await set(ik("seed"), Number.isFinite(Number(d.seed)) ? Number(d.seed) : -1);
      await set(ik("positive"), sanitizeUserText(d.positive, { maxLength: 2000 }));
      await set(ik("negative"), sanitizeUserText(d.negative, { maxLength: 2000 }));
      // Size: a preset "WxH", "" (native), or "custom" -> build from the width/height inputs.
      const sizeSel = String(d.size ?? meta.defaultSize);
      let size = sizeSel;
      if (sizeSel === "custom") {
        size = normalizeCustomSize(`${d.customW ?? ""}x${d.customH ?? ""}`) || meta.defaultSize;
      }
      await set(ik("size"), size);
      await set(ik("persist"), Boolean(d.persist));
      await set(ik("chatTrigger"), Boolean(d.chatTrigger));
      await set(ik("allowPlayers"), Boolean(d.allowPlayers));
    }
    const folder = String(o.image?.mediaFolder ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    await set(MEDIA_SETTINGS.imageMediaFolder, folder || "assets/noodlr-out");

    // Transcription capture options
    await set(MEDIA_SETTINGS.transcriptionEnabled, Boolean(o.transcription?.enabled));
    await set(MEDIA_SETTINGS.pushToLogPostChat, Boolean(o.transcription?.postChat));
    const seg = Number(o.transcription?.segment);
    await set(MEDIA_SETTINGS.pushToLogSegmentSeconds, seg >= 5 && seg <= 60 ? seg : 20);
    // Show/hide the floating mic button to match the toggle without a reload.
    refreshPushToLogButton();

    // Prompt architecture
    await set(SETTINGS.authorNote, String(o.authorNote ?? ""));
    await set(SETTINGS.postHistory, String(o.postHistory ?? ""));
    const reminder = String(o.combatReminder ?? "").trim();
    await set(SETTINGS.combatReminder, reminder.length > 0 ? reminder : DEFAULT_COMBAT_REMINDER);
    const combatPrompt = String(o.combatPrompt ?? "").trim();
    await set(
      COMBAT_SETTINGS.systemPrompt,
      combatPrompt === DEFAULT_COMBAT_PROMPT.trim() ? "" : combatPrompt,
    );

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  static #onOpenCreatureVoices(): void {
    new NoodlrCreatureVoiceApp().render({ force: true });
  }

  static async #onResetPrompt(this: NoodlrSettingsApp): Promise<void> {
    await game.settings.set(MODULE_ID, SETTINGS.chatSystemPrompt, "");
    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.PromptReset"));
    this.render();
  }

  static async #onTestConnection(this: NoodlrSettingsApp): Promise<void> {
    const cfg = getFeatureConfig("chat");
    if (!isConfigured(cfg)) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Settings.TestNotConfigured"));
      return;
    }
    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Testing"));
    try {
      const reply = await chatCompletion(cfg, {
        messages: [{ role: "user", content: "Reply with the single word: pong." }],
        maxTokens: 16,
      });
      if (reply.trim().length > 0) {
        ui.notifications?.info(game.i18n.format("NOODLR.Settings.TestOk", { model: cfg.model }));
      } else {
        ui.notifications?.warn(game.i18n.localize("NOODLR.Settings.TestEmpty"));
      }
    } catch (err) {
      const msg = err instanceof ChatClientError ? err.message : String(err);
      ui.notifications?.error(game.i18n.format("NOODLR.Settings.TestFail", { error: msg }));
    }
  }

  /**
   * Open Foundry's FilePicker in folder mode to choose/create the media output folder. The
   * FilePicker is constrained to the "data" source, so users can't traverse above the data
   * root — and v13 only permits uploads to allowed folders (assets/… or new top-level dirs).
   */
  static async #onBrowseMediaFolder(this: NoodlrSettingsApp): Promise<void> {
    const input = this.#root()?.querySelector<HTMLInputElement>('input[name="image.mediaFolder"]');
    const FP =
      (foundry as unknown as { applications?: { apps?: { FilePicker?: unknown } } }).applications
        ?.apps?.FilePicker ?? (globalThis as unknown as { FilePicker?: unknown }).FilePicker;
    if (!FP || !input) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Media.ImageFolder.NoPicker"));
      return;
    }
    const picker = new (FP as new (opts: Record<string, unknown>) => unknown)({
      type: "folder",
      source: "data",
      current: input.value.trim() || "assets/noodlr-out",
      callback: (path: string) => {
        input.value = String(path ?? "").replace(/^\/+|\/+$/g, "");
      },
    });
    (picker as { render: (force: boolean) => void }).render(true);
  }

  /**
   * Synthesize a short phrase with the SAVED TTS config and report the outcome inline under
   * the field. TTS breaks in ways the provider can't tell you about from the browser — a
   * local endpoint that "works on its own" often fails here on mixed content (HTTPS page ->
   * HTTP endpoint) or CORS, so we detect the tell-tale fetch TypeError and explain it.
   */
  static async #onTestTts(this: NoodlrSettingsApp): Promise<void> {
    const root = this.#root();
    const statusEl = root?.querySelector<HTMLElement>('[data-role="tts-test-status"]');
    const input = root?.querySelector<HTMLInputElement>('[data-role="tts-test-input"]');
    const setStatus = (kind: "pending" | "ok" | "warn" | "error", msg: string) => {
      if (!statusEl) return;
      statusEl.className = `noodlr-test-status noodlr-test-status--${kind}`;
      statusEl.textContent = msg;
    };

    const cfg = getFeatureConfig("tts");
    if (!isConfigured(cfg)) {
      setStatus("warn", game.i18n.localize("NOODLR.Media.TtsTest.NotConfigured"));
      return;
    }

    const text =
      sanitizeUserText(input?.value, { maxLength: 140, allowNewlines: false }) ||
      game.i18n.localize("NOODLR.Media.TtsTest.Sample");
    const endpoint = `${resolveBaseUrl(cfg)}/audio/speech`;
    setStatus("pending", game.i18n.format("NOODLR.Media.TtsTest.Working", { endpoint }));

    try {
      const blob = await synthesizeSpeech(text);
      const kb = Math.max(1, Math.round(blob.size / 1024));
      // Play it so the audio path is exercised end-to-end too.
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.addEventListener("ended", () => URL.revokeObjectURL(objectUrl));
      void audio.play().catch(() => URL.revokeObjectURL(objectUrl));
      setStatus(
        "ok",
        game.i18n.format("NOODLR.Media.TtsTest.Ok", { kb, type: blob.type || "audio" }),
      );
    } catch (err) {
      if (err instanceof TtsError) {
        setStatus("error", err.message);
      } else if (err instanceof TypeError) {
        // fetch() rejects with TypeError for CORS / mixed-content / DNS / connection refused.
        setStatus("error", game.i18n.format("NOODLR.Media.TtsTest.Network", { endpoint }));
      } else {
        setStatus("error", String(err));
      }
    }
  }
}
