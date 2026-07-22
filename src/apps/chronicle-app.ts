// Chronicle review queue. The DM appends "📜 Chronicle:" facts; they land here for GM
// review. From each item the GM can promote to a lorebook entry, ingest as a structured
// event memory (into a chosen silo), or dismiss.

import { MODULE_ID } from "../constants";
import { loadChronicleQueue } from "../prompt/settings";
import { dismissChronicleItem, ingestChronicleEvent, promoteToLorebook } from "../prompt/chronicle";
import { SILOS, SILO_IDS, isSiloId, type SiloId } from "../rag/silos";
import { RagClientError } from "../rag/client";
import type { ChronicleItem } from "../prompt/types";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrChronicleApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-chronicle",
    tag: "div",
    classes: ["noodlr", "noodlr-chronicle"],
    window: { title: "NOODLR.Chronicle.Title", icon: "fa-solid fa-scroll", resizable: true },
    position: { width: 640, height: 620 },
    actions: {
      promoteLorebook: NoodlrChronicleApp.#onPromoteLorebook,
      ingestEvent: NoodlrChronicleApp.#onIngestEvent,
      dismiss: NoodlrChronicleApp.#onDismiss,
    },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/chronicle.hbs` } };

  async _prepareContext(): Promise<Record<string, unknown>> {
    const items = loadChronicleQueue()
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .map((i) => ({ id: i.id, text: i.text, when: new Date(i.ts).toLocaleString() }));
    const siloOptions = SILO_IDS.map((id) => ({ id, label: SILOS[id] }));
    return { items, siloOptions, hasItems: items.length > 0 };
  }

  #find(id: string | undefined): ChronicleItem | undefined {
    return loadChronicleQueue().find((i) => i.id === id);
  }

  static async #onPromoteLorebook(
    this: NoodlrChronicleApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const item = this.#find(target.dataset.id);
    if (!item) return;
    await promoteToLorebook(item);
    await dismissChronicleItem(item.id);
    ui.notifications?.info(game.i18n.localize("NOODLR.Chronicle.PromotedLorebook"));
    this.render();
  }

  static async #onIngestEvent(
    this: NoodlrChronicleApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const item = this.#find(target.dataset.id);
    if (!item) return;
    const silo = this.#selectedSilo(`silo-${item.id}`) ?? "lore";
    try {
      await ingestChronicleEvent(item, silo);
      await dismissChronicleItem(item.id);
      ui.notifications?.info(
        game.i18n.format("NOODLR.Chronicle.IngestedEvent", { silo: SILOS[silo] }),
      );
      this.render();
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(msg);
    }
  }

  static async #onDismiss(
    this: NoodlrChronicleApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (!target.dataset.id) return;
    await dismissChronicleItem(target.dataset.id);
    this.render();
  }

  #selectedSilo(name: string): SiloId | null {
    const root = this.element as HTMLElement | null;
    const value = root?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
    return isSiloId(value) ? value : null;
  }
}
