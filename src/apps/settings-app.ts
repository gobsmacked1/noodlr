// The main Noodlr configuration window ("Configure Noodlr").
//
// Everything a GM needs to wire up the AI features, grouped BY FEATURE so it's obvious what
// each field controls: each AI feature (Dungeon Master Chat, Voice/TTS, Scene Art, Voice
// Transcription) gets one block laid out Provider -> Model -> (custom URL) -> API key, with
// plain-language help. API keys are write-only: the stored key is never sent back to the
// browser; you only ever type a new one. OpenRouter model lists are fetched live.

import {
  MODULE_ID,
  MODULE_TITLE,
  SETTINGS,
  MEDIA_SETTINGS,
  COMBAT_SETTINGS,
  DEFAULT_COMBAT_REMINDER,
  DEFAULT_COMBAT_PROMPT,
} from "../constants";
import { DM_SYSTEM_PROMPT, SYSTEM_PROMPT_MAX_LENGTH } from "../prompts/dm-system-prompt";
import {
  getFeatureConfig,
  getProviderView,
  saveProviderFromForm,
  type ProviderFormData,
} from "../providers/config";
import { chatCompletion, ChatClientError } from "../providers/chat-client";
import { isConfigured } from "../providers/types";
import { getImageParams, getTtsEnabled, getTtsVoice, getTtsAutoRead } from "../media/config";
import { getPushToLogConfig } from "../media/config";
import { getAuthorNote, getCombatReminder, getPostHistory } from "../prompt/settings";
import { getCombatSystemPrompt } from "../combat/config";
import { wireProviderBlocks } from "./provider-ui";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The provider-carrying features surfaced in this window (embeddings live in Memory). */
const FEATURE_IDS = ["chat", "tts", "image", "transcription"] as const;
type MainFeatureId = (typeof FEATURE_IDS)[number];

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
    const img = getImageParams();

    // Per-feature provider views (never include the stored key — see getProviderView).
    // Each carries its own layman help answering: what does it do? what does it require?
    // what happens if you don't use it?
    const labelKey: Record<MainFeatureId, string> = {
      chat: "Chat",
      tts: "Tts",
      image: "Image",
      transcription: "Transcription",
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

    return {
      moduleTitle: MODULE_TITLE,
      version,

      chat: view("chat"),
      tts: view("tts"),
      image: view("image"),
      transcription: view("transcription"),

      // Chat options
      continueAfterRoll: game.settings.get(MODULE_ID, SETTINGS.chatContinueAfterRoll) as boolean,
      systemPrompt: override.trim().length > 0 ? override : DM_SYSTEM_PROMPT,
      usingDefault: override.trim().length === 0,
      maxLength: SYSTEM_PROMPT_MAX_LENGTH,

      // TTS options
      ttsEnabled: getTtsEnabled(),
      ttsVoice: getTtsVoice(),
      ttsAutoRead: getTtsAutoRead(),

      // Image options
      imageExpand: img.expand,
      imageSteps: img.steps,
      imageCfg: img.cfg,
      imageSampler: img.sampler,
      imageSeed: img.seed,
      imagePositive: img.positive,
      imageNegative: img.negative,
      imageSize: img.size,

      // Transcription capture options (ingest-to-memory lives in the Memory window)
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
    if (root) wireProviderBlocks(root);
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

    // Provider blocks (write-only keys handled inside saveProviderFromForm).
    for (const id of FEATURE_IDS) {
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

    // Image options
    await set(MEDIA_SETTINGS.imageExpandPrompt, Boolean(o.image?.expand));
    await set(MEDIA_SETTINGS.imageSteps, Number(o.image?.steps) || 20);
    await set(MEDIA_SETTINGS.imageCfg, Number(o.image?.cfg) || 7.0);
    await set(MEDIA_SETTINGS.imageSampler, String(o.image?.sampler ?? "Euler a").trim());
    await set(
      MEDIA_SETTINGS.imageSeed,
      Number.isFinite(Number(o.image?.seed)) ? Number(o.image?.seed) : -1,
    );
    await set(MEDIA_SETTINGS.imagePositive, String(o.image?.positive ?? ""));
    await set(MEDIA_SETTINGS.imageNegative, String(o.image?.negative ?? ""));
    await set(MEDIA_SETTINGS.imageSize, String(o.image?.size ?? "1024x1024").trim() || "1024x1024");

    // Transcription capture options
    await set(MEDIA_SETTINGS.pushToLogPostChat, Boolean(o.transcription?.postChat));
    const seg = Number(o.transcription?.segment);
    await set(MEDIA_SETTINGS.pushToLogSegmentSeconds, seg >= 5 && seg <= 60 ? seg : 20);

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
}
