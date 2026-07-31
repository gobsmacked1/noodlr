// Memory browser (RAG): a GM-only, search-driven CRUD window over any memory collection. SELECT
// via a hybrid query, then UPDATE (delete + re-ingest) or DELETE individual records, or INSERT new
// ones by hand. Backed by the shared MemoryBackend, so it works against both noodlr-memory and RAG
// Lite. There is no "list everything" here on purpose: collections can hold tens of thousands of
// rows, so browsing is anchored to a search term.

import { MODULE_ID } from "../constants";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";
import { RagClientError, type RagHit } from "../rag/client";
import { groupedSilos, isSiloId, type SiloId } from "../rag/silos";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrRagBrowserApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-rag-browser",
    tag: "div",
    classes: ["noodlr", "noodlr-rag-browser"],
    window: {
      title: "NOODLR.RagBrowser.Title",
      icon: "fa-solid fa-magnifying-glass-chart",
      resizable: true,
    },
    position: { width: 720, height: 700 },
    actions: {
      search: NoodlrRagBrowserApp.#onSearch,
      addRecord: NoodlrRagBrowserApp.#onAdd,
      editRecord: NoodlrRagBrowserApp.#onEdit,
      deleteRecord: NoodlrRagBrowserApp.#onDelete,
    },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/rag-browser.hbs` } };

  #silo: SiloId | null = null;
  #query = "";
  #hits: RagHit[] = [];
  #searched = false;

  async _prepareContext(): Promise<Record<string, unknown>> {
    const groups = groupedSilos().map((g) => ({
      label: game.i18n.localize(g.labelKey),
      silos: g.silos.map((s) => ({ ...s, selected: s.id === this.#silo })),
    }));
    const hits = this.#hits.map((h) => ({
      id: h.id,
      text: h.text,
      score: typeof h.score === "number" ? h.score.toFixed(3) : "",
    }));
    return {
      enabled: isRagEnabled(),
      groups,
      query: this.#query,
      hits,
      hasHits: hits.length > 0,
      searched: this.#searched,
      silo: this.#silo,
    };
  }

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  #readControls(): { silo: SiloId | null; query: string } {
    const root = this.#root();
    const rawSilo =
      root?.querySelector<HTMLSelectElement>('select[name="collection"]')?.value ?? "";
    const query = root?.querySelector<HTMLInputElement>('input[name="query"]')?.value?.trim() ?? "";
    return { silo: isSiloId(rawSilo) ? rawSilo : null, query };
  }

  static async #onSearch(this: NoodlrRagBrowserApp): Promise<void> {
    if (!isRagEnabled()) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.RagBrowser.Disabled"));
      return;
    }
    const { silo, query } = this.#readControls();
    this.#silo = silo;
    this.#query = query;
    if (!silo || !query) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.RagBrowser.Prompt"));
      return;
    }
    try {
      const res = await getRagClient().query({
        collections: [silo],
        searchText: query,
        topK: 25,
        hybrid: true,
        embed: getEmbedOverride(),
      });
      this.#hits = res.hits ?? [];
      this.#searched = true;
      this.render();
    } catch (err) {
      ui.notifications?.error(errMsg(err));
    }
  }

  static async #onAdd(this: NoodlrRagBrowserApp): Promise<void> {
    if (!isRagEnabled()) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.RagBrowser.Disabled"));
      return;
    }
    // Default the add-dialog collection to whatever is selected in the search bar.
    const { silo } = this.#readControls();
    const result = await this.#openEditor({ text: "", silo: silo ?? this.#silo, pickSilo: true });
    if (!result || !result.silo) return;
    try {
      await getRagClient().ingest(
        result.silo,
        [{ text: result.text, metadata: { source: "rag-browser", ts: Date.now() } }],
        getEmbedOverride(),
      );
      ui.notifications?.info(game.i18n.format("NOODLR.RagBrowser.Added", { silo: result.silo }));
      // Re-run the current search so the new record shows up if it matches.
      if (this.#silo && this.#query) await NoodlrRagBrowserApp.#onSearch.call(this);
      else this.render();
    } catch (err) {
      ui.notifications?.error(errMsg(err));
    }
  }

  static async #onEdit(
    this: NoodlrRagBrowserApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.id;
    const hit = this.#hits.find((h) => h.id === id);
    if (!hit || !this.#silo) return;
    const result = await this.#openEditor({ text: hit.text, silo: this.#silo, pickSilo: false });
    if (!result) return;
    // UPDATE = delete the old row, then ingest the corrected text into the same collection.
    try {
      await getRagClient().delete(this.#silo, { ids: [hit.id] });
      await getRagClient().ingest(
        this.#silo,
        [{ text: result.text, metadata: { source: "rag-browser", ts: Date.now() } }],
        getEmbedOverride(),
      );
      ui.notifications?.info(game.i18n.format("NOODLR.RagBrowser.Updated", { silo: this.#silo }));
      await NoodlrRagBrowserApp.#onSearch.call(this);
    } catch (err) {
      ui.notifications?.error(errMsg(err));
    }
  }

  static async #onDelete(
    this: NoodlrRagBrowserApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.id;
    const hit = this.#hits.find((h) => h.id === id);
    if (!hit || !this.#silo) return;
    const confirmed = await confirmDialog(
      game.i18n.localize("NOODLR.RagBrowser.DeleteTitle"),
      game.i18n.localize("NOODLR.RagBrowser.DeleteConfirm"),
    );
    if (!confirmed) return;
    try {
      await getRagClient().delete(this.#silo, { ids: [hit.id] });
      this.#hits = this.#hits.filter((h) => h.id !== hit.id);
      ui.notifications?.info(game.i18n.format("NOODLR.RagBrowser.Deleted", { silo: this.#silo }));
      this.render();
    } catch (err) {
      ui.notifications?.error(errMsg(err));
    }
  }

  /** Editor dialog for add/edit. When `pickSilo`, shows a grouped collection picker. */
  async #openEditor(opts: {
    text: string;
    silo: SiloId | null;
    pickSilo: boolean;
  }): Promise<{ text: string; silo: SiloId | null } | null> {
    const L = (s: string) => game.i18n.localize(`NOODLR.RagBrowser.${s}`);
    const esc = (s: string) => foundry.utils.escapeHTML(s);

    let picker = "";
    if (opts.pickSilo) {
      const groups = groupedSilos()
        .map((g) => {
          const options = g.silos
            .map(
              (s) =>
                `<option value="${s.id}" ${s.id === opts.silo ? "selected" : ""}>${esc(s.label)}</option>`,
            )
            .join("");
          return `<optgroup label="${esc(game.i18n.localize(g.labelKey))}">${options}</optgroup>`;
        })
        .join("");
      picker = `<div class="form-group"><label>${L("Collection")}</label>
        <select name="silo">${groups}</select></div>`;
    }

    const content = `
      <form class="noodlr-rag-editor">
        ${picker}
        <div class="form-group"><label>${L("FieldText")}</label>
          <textarea name="text" rows="8">${esc(opts.text)}</textarea></div>
      </form>`;

    let raw: any;
    try {
      raw = await foundry.applications.api.DialogV2.wait({
        window: { title: L("EditorTitle") },
        content,
        buttons: [
          {
            action: "save",
            label: L("Save"),
            default: true,
            callback: (_ev: Event, button: any, dialog: any) => {
              const form = dialog?.element?.querySelector("form") ?? button?.form;
              return readForm(form);
            },
          },
          { action: "cancel", label: L("Cancel") },
        ],
      });
    } catch {
      return null;
    }
    if (!raw || typeof raw !== "object") return null;

    const text = String(raw.text ?? "").trim();
    if (!text) return null;
    const siloVal = opts.pickSilo ? String(raw.silo ?? "") : (opts.silo ?? "");
    return { text, silo: isSiloId(siloVal) ? siloVal : null };
  }
}

function readForm(form: HTMLFormElement | null | undefined): Record<string, unknown> {
  if (!form) return {};
  const FDE = foundry.applications?.ux?.FormDataExtended ?? (globalThis as any).FormDataExtended;
  if (FDE) return new FDE(form).object;
  const out: Record<string, unknown> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return out;
}

async function confirmDialog(title: string, content: string): Promise<boolean> {
  try {
    return await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content: `<p>${content}</p>`,
      modal: true,
    });
  } catch {
    return globalThis.confirm(`${title}\n\n${content}`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof RagClientError ? err.message : String(err);
}
