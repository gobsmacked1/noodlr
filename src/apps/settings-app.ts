// Noodlr configuration window. Phase 1: a working Chat system-prompt editor (65k cap,
// spellcheck, reset-to-default) and a live provider "test connection". The full tabbed
// application (Providers, Memory/RAG, Prompts, TTS, Image, Transcription) grows from
// here in later phases.

import { MODULE_ID, MODULE_TITLE, SETTINGS, DEFAULT_COMBAT_REMINDER } from "../constants";
import { DM_SYSTEM_PROMPT, SYSTEM_PROMPT_MAX_LENGTH } from "../prompts/dm-system-prompt";
import { getFeatureConfig } from "../providers/config";
import { chatCompletion, ChatClientError } from "../providers/chat-client";
import { isConfigured } from "../providers/types";
import { getAuthorNote, getCombatReminder, getPostHistory } from "../prompt/settings";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    position: { width: 640, height: "auto" as const },
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

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    const override = (game.settings.get(MODULE_ID, SETTINGS.chatSystemPrompt) as string) ?? "";
    return {
      moduleId: MODULE_ID,
      moduleTitle: MODULE_TITLE,
      version,
      enabled: game.settings.get(MODULE_ID, SETTINGS.enabled) as boolean,
      // Show the override if set, else the built-in DM prompt as an editable starting point.
      systemPrompt: override.trim().length > 0 ? override : DM_SYSTEM_PROMPT,
      usingDefault: override.trim().length === 0,
      maxLength: SYSTEM_PROMPT_MAX_LENGTH,
      authorNote: getAuthorNote(),
      postHistory: getPostHistory(),
      combatReminder: getCombatReminder(),
    };
  }

  static async #onSubmit(
    this: NoodlrSettingsApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const raw = String(formData.object.systemPrompt ?? "");
    const trimmed = raw.slice(0, SYSTEM_PROMPT_MAX_LENGTH);
    // Storing empty means "use the built-in default"; collapse an unmodified default too.
    const toStore = trimmed.trim() === DM_SYSTEM_PROMPT.trim() ? "" : trimmed;
    await game.settings.set(MODULE_ID, SETTINGS.chatSystemPrompt, toStore);

    await game.settings.set(
      MODULE_ID,
      SETTINGS.authorNote,
      String(formData.object.authorNote ?? ""),
    );
    await game.settings.set(
      MODULE_ID,
      SETTINGS.postHistory,
      String(formData.object.postHistory ?? ""),
    );
    const reminder = String(formData.object.combatReminder ?? "").trim();
    await game.settings.set(
      MODULE_ID,
      SETTINGS.combatReminder,
      reminder.length > 0 ? reminder : DEFAULT_COMBAT_REMINDER,
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
