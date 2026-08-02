// Text Generation: the chat provider, the assistant's name, every text prompt, and the context
// controls that shape what gets sent with each request.
//
// This window owns the three chat prompts (GM co-pilot, players' bot, and the GM-side adjudicator)
// plus the injection slots. The scalars and toggles here used to sit in Foundry's own settings list,
// where they were separated from the prompts they modify.

import { MODULE_ID, MODULE_TITLE, SETTINGS, COMBAT_SETTINGS } from "../constants";
import { promptFieldView } from "../prompts/fields";
import { ASSISTANT_NAME_MAX_LENGTH, getAssistantName } from "../chat/assistant";
import { sanitizeUserText } from "../util/sanitize";
import { getProviderView, saveProviderFromForm, type ProviderFormData } from "../providers/config";
import { getFeatureConfig } from "../providers/config";
import { chatCompletion, ChatClientError } from "../providers/chat-client";
import { isConfigured } from "../providers/types";
import {
  getAuthorNoteDepth,
  getContextBudget,
  isChatMemoryWritesEnabled,
  isTipsterEnabled,
} from "../prompt/settings";
import { CONFIG_WINDOW_DEFAULTS, NoodlrConfigApp } from "./config-base";
import {
  detectedSystemLabel,
  getRulesetName,
  RULESET_AUTO,
  RULESET_CHOICES,
  RULESET_CUSTOM,
  RULESET_DEFAULT,
  RULESET_NAME_MAX_LENGTH,
} from "../system/ruleset";

export class NoodlrTextGenApp extends NoodlrConfigApp {
  static DEFAULT_OPTIONS = {
    ...CONFIG_WINDOW_DEFAULTS,
    id: "noodlr-text-gen",
    window: {
      title: "NOODLR.TextGen.Menu.Name",
      icon: "fa-solid fa-comments",
      resizable: true,
    },
    form: {
      handler: NoodlrTextGenApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      resetPromptField: NoodlrConfigApp.onResetPromptField,
      testConnection: NoodlrTextGenApp.#onTestConnection,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/text-gen.hbs` },
  };

  override _onRender(context: unknown, options: unknown): void {
    super._onRender(context, options);
    const root = this.rootEl();
    const select = root?.querySelector<HTMLSelectElement>('[data-role="ruleset-choice"]');
    const custom = root?.querySelector<HTMLElement>('[data-role="ruleset-custom"]');
    if (!select || !custom) return;
    const apply = () => {
      custom.style.display = select.value === "custom" ? "" : "none";
    };
    apply();
    select.addEventListener("change", apply);
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const p = "NOODLR.Feature.Chat";
    const choice = String(game.settings.get(MODULE_ID, SETTINGS.rulesetChoice) ?? RULESET_DEFAULT);
    return {
      moduleTitle: MODULE_TITLE,
      version: game.modules.get(MODULE_ID)?.version ?? "",

      chat: {
        id: "chat",
        ...getProviderView("chat"),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
      },
      continueAfterRoll: game.settings.get(MODULE_ID, SETTINGS.chatContinueAfterRoll) as boolean,

      assistantName: getAssistantName(),
      assistantNameMax: ASSISTANT_NAME_MAX_LENGTH,

      ruleset: {
        choice,
        custom: game.settings.get(MODULE_ID, SETTINGS.rulesetCustom) as string,
        customMax: RULESET_NAME_MAX_LENGTH,
        detected: detectedSystemLabel(),
        resolved: getRulesetName(),
        // Marked so the picker can pre-select without a Handlebars equality helper.
        options: RULESET_CHOICES.map((name) => ({ name, selected: name === choice })),
        isAuto: choice === RULESET_AUTO,
        isCustom: choice === RULESET_CUSTOM,
      },

      chatPrompt: promptFieldView(SETTINGS.chatSystemPrompt),
      playersPrompt: promptFieldView(SETTINGS.playersSystemPrompt),
      adjudicationPrompt: promptFieldView(SETTINGS.adjudicationPrompt),
      authorNote: promptFieldView(SETTINGS.authorNote),
      postHistory: promptFieldView(SETTINGS.postHistory),
      combatReminder: promptFieldView(SETTINGS.combatReminder),
      combatPrompt: promptFieldView(COMBAT_SETTINGS.systemPrompt),

      authorNoteDepth: getAuthorNoteDepth(),
      contextTokenBudget: getContextBudget(),
      memoryWrites: isChatMemoryWritesEnabled(),
      tipsterGm: isTipsterEnabled("gm"),
      tipsterPlayers: isTipsterEnabled("players"),
    };
  }

  static async #onSubmit(
    this: NoodlrTextGenApp,
    _event: SubmitEvent,
    form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    const set = (k: string, v: unknown) => game.settings.set(MODULE_ID, k, v);

    await saveProviderFromForm("chat", o.chat as ProviderFormData | undefined);
    await set(SETTINGS.chatContinueAfterRoll, Boolean(o.chat?.continueAfterRoll));

    // ASCII only: this string lands in window titles and ChatMessage speaker aliases.
    const name = sanitizeUserText(o.assistantName, {
      maxLength: ASSISTANT_NAME_MAX_LENGTH,
      allowNewlines: false,
    }).replace(/[^\x20-\x7e]/g, "");
    await set(SETTINGS.assistantName, name);

    const choice = String(o.rulesetChoice ?? RULESET_DEFAULT);
    const known: string[] = [RULESET_AUTO, RULESET_CUSTOM, ...RULESET_CHOICES];
    await set(SETTINGS.rulesetChoice, known.includes(choice) ? choice : RULESET_DEFAULT);
    await set(
      SETTINGS.rulesetCustom,
      sanitizeUserText(o.rulesetCustom, {
        maxLength: RULESET_NAME_MAX_LENGTH,
        allowNewlines: false,
      }).replace(/[^\x20-\x7e]/g, ""),
    );

    await this.savePromptFields(form);

    const depth = Number(o.authorNoteDepth);
    await set(SETTINGS.authorNoteDepth, depth >= 0 && depth <= 50 ? Math.round(depth) : 3);
    const budget = Number(o.contextTokenBudget);
    await set(
      SETTINGS.contextTokenBudget,
      budget >= 1000 && budget <= 1_000_000 ? Math.round(budget) : 64000,
    );
    await set(SETTINGS.chatMemoryWrites, Boolean(o.memoryWrites));
    await set(SETTINGS.tipsterGm, Boolean(o.tipsterGm));
    await set(SETTINGS.tipsterPlayers, Boolean(o.tipsterPlayers));

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  static async #onTestConnection(this: NoodlrTextGenApp): Promise<void> {
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
