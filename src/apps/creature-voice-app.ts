// Pop-out editor for per-creature-type TTS voices + pitch. Lists every creature type/subtype
// with a voice field (fed by the endpoint's voice list) and a pitch %; the GM assigns voices so
// NPCs/monsters speak distinctly. Its own window because the table is 30+ rows.

import { MODULE_ID, MODULE_TITLE } from "../constants";
import {
  CREATURE_TYPES,
  getCreatureVoiceTable,
  setCreatureVoiceTable,
  normalizeTypeKey,
  type CreatureVoice,
} from "../media/creature-voice";
import { listVoices } from "../media/tts";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrCreatureVoiceApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-creature-voices",
    tag: "form",
    classes: ["noodlr", "noodlr-settings"],
    window: {
      title: "NOODLR.Media.CreatureVoices.Title",
      icon: "fa-solid fa-masks-theater",
      resizable: true,
    },
    position: { width: 560, height: 720 },
    form: {
      handler: NoodlrCreatureVoiceApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/creature-voices.hbs` },
  };

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const table = getCreatureVoiceTable();
    const creatures = CREATURE_TYPES.map((type, i) => {
      const match = Object.entries(table).find(([k]) => normalizeTypeKey(k) === normalizeTypeKey(type));
      return { i, type, voice: match?.[1]?.voice ?? "", pitch: match?.[1]?.pitch ?? 0 };
    });
    return { moduleTitle: MODULE_TITLE, creatures };
  }

  _onRender(_context: unknown, _options: unknown): void {
    // Fill the shared voice datalist from the TTS endpoint (or the standard fallback names).
    void listVoices().then((voices) => {
      const dl = this.#root()?.querySelector<HTMLDataListElement>("#noodlr-creature-voices-list");
      if (!dl) return;
      dl.replaceChildren();
      for (const v of voices) {
        const opt = document.createElement("option");
        opt.value = v;
        dl.append(opt);
      }
    });
  }

  static async #onSubmit(
    this: NoodlrCreatureVoiceApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    const rows = Array.isArray(o.creature) ? o.creature : [];
    const table: Record<string, CreatureVoice> = {};
    for (const row of rows) {
      const type = String(row?.type ?? "").trim();
      const voice = String(row?.voice ?? "").trim();
      if (!type || !voice) continue; // only store assigned rows
      table[normalizeTypeKey(type)] = { voice, pitch: Number(row?.pitch) || 0 };
    }
    await setCreatureVoiceTable(table);
    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
  }
}
