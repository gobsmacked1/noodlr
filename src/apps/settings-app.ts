// Noodlr configuration window (opened from the module's settings menu). Phase 0 shows a
// single "General" pane confirming the module is wired up. The full tabbed application
// (Providers, Memory/RAG, Prompts, TTS, Image, Transcription) is built out in later
// phases; the tab scaffolding here is intentionally minimal but forward-shaped.

import { MODULE_ID, MODULE_TITLE, SETTINGS } from "../constants";

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
    position: {
      width: 560,
      height: "auto",
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/settings.hbs` },
  };

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    const enabled = game.settings.get(MODULE_ID, SETTINGS.enabled) as boolean;
    return { moduleId: MODULE_ID, moduleTitle: MODULE_TITLE, version, enabled };
  }
}
