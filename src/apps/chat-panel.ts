// Stub GM co-pilot chat panel. Phase 0 deliverable: it opens and renders. Streaming
// chat, history, markdown, {{roll:...}} macros, and RAG-assembled context arrive in
// Phase 1+. Built on ApplicationV2 + Handlebars (Foundry v14 standard).

import { MODULE_ID } from "../constants";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrChatPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-chat-panel",
    tag: "div",
    classes: ["noodlr", "noodlr-chat-panel"],
    window: {
      title: "NOODLR.ChatPanel.Title",
      icon: "fa-solid fa-dragon",
      resizable: true,
    },
    position: {
      width: 480,
      height: 640,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/chat-panel.hbs` },
  };

  /** Data handed to the Handlebars template. */
  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    return { moduleId: MODULE_ID, version };
  }

  /** Convenience toggle: open if closed, close if already rendered. */
  static toggle(): void {
    const existing = foundry.applications.instances?.get("noodlr-chat-panel") as
      NoodlrChatPanel | undefined;
    if (existing?.rendered) {
      void existing.close();
    } else {
      new NoodlrChatPanel().render({ force: true });
    }
  }
}
