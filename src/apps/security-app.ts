// Security: the credentials Noodlr stores.
//
// Only the shared OpenRouter key lives here today — it is the one secret used by every feature at
// once, so it belongs somewhere a GM can find and rotate it without hunting through feature pages.
// A custom endpoint's optional key stays with that endpoint's base URL, since the two are only
// meaningful as a pair. More providers can be added as further fieldsets.

import { MODULE_ID, MODULE_TITLE } from "../constants";
import { hasOpenrouterKey, saveOpenrouterKey } from "../providers/config";
import { CONFIG_WINDOW_DEFAULTS, NoodlrConfigApp } from "./config-base";

export class NoodlrSecurityApp extends NoodlrConfigApp {
  static DEFAULT_OPTIONS = {
    ...CONFIG_WINDOW_DEFAULTS,
    id: "noodlr-security",
    window: {
      title: "NOODLR.Security.Menu.Name",
      icon: "fa-solid fa-key",
      resizable: true,
    },
    position: { width: 640, height: 480 },
    form: {
      handler: NoodlrSecurityApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/security.hbs` },
  };

  async _prepareContext(): Promise<Record<string, unknown>> {
    return {
      moduleTitle: MODULE_TITLE,
      version: game.modules.get(MODULE_ID)?.version ?? "",
      hasOpenrouterKey: hasOpenrouterKey(),
    };
  }

  static async #onSubmit(
    this: NoodlrSecurityApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    await saveOpenrouterKey(String(o.openrouterApiKey ?? ""), Boolean(o.openrouterApiKeyClear));
    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }
}
