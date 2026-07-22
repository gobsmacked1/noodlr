// Lorebook / World Info manager. List + add/edit/delete entries. Each entry has
// activation keys (plaintext or /regex/), content, position (top/bottom), order, and
// enabled/constant flags. Single-entry editing uses a DialogV2 form for reliability.

import { MODULE_ID } from "../constants";
import { loadLorebook, saveLorebook } from "../prompt/settings";
import { makeLorebookEntry, type LorebookEntry, type LorebookPosition } from "../prompt/types";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrLorebookApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-lorebook",
    tag: "div",
    classes: ["noodlr", "noodlr-lorebook"],
    window: { title: "NOODLR.Lorebook.Title", icon: "fa-solid fa-book", resizable: true },
    position: { width: 640, height: 640 },
    actions: {
      addEntry: NoodlrLorebookApp.#onAdd,
      editEntry: NoodlrLorebookApp.#onEdit,
      deleteEntry: NoodlrLorebookApp.#onDelete,
    },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/lorebook.hbs` } };

  async _prepareContext(): Promise<Record<string, unknown>> {
    const entries = loadLorebook()
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        id: e.id,
        name: e.name,
        keys: e.keys.join(", "),
        position: e.position,
        enabled: e.enabled,
        constant: e.constant,
      }));
    return { entries };
  }

  static async #onAdd(this: NoodlrLorebookApp): Promise<void> {
    const entry = await this.#openEditor(makeLorebookEntry());
    if (!entry) return;
    const entries = loadLorebook();
    entry.order = entries.reduce((m, e) => Math.max(m, e.order), 0) + 1;
    entries.push(entry);
    await saveLorebook(entries);
    this.render();
  }

  static async #onEdit(this: NoodlrLorebookApp, _event: Event, target: HTMLElement): Promise<void> {
    const id = target.dataset.id;
    const entries = loadLorebook();
    const existing = entries.find((e) => e.id === id);
    if (!existing) return;
    const updated = await this.#openEditor(existing);
    if (!updated) return;
    updated.id = existing.id;
    updated.order = existing.order;
    const idx = entries.findIndex((e) => e.id === id);
    entries[idx] = updated;
    await saveLorebook(entries);
    this.render();
  }

  static async #onDelete(
    this: NoodlrLorebookApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.id;
    const confirmed = await confirmDialog(
      game.i18n.localize("NOODLR.Lorebook.DeleteTitle"),
      game.i18n.localize("NOODLR.Lorebook.DeleteConfirm"),
    );
    if (!confirmed) return;
    await saveLorebook(loadLorebook().filter((e) => e.id !== id));
    this.render();
  }

  /** Open a single-entry editor dialog; resolves to the edited entry or null. */
  async #openEditor(entry: LorebookEntry): Promise<LorebookEntry | null> {
    const L = (s: string) => game.i18n.localize(`NOODLR.Lorebook.${s}`);
    const esc = (s: string) => foundry.utils.escapeHTML(s);
    const content = `
      <form class="noodlr-lorebook-editor">
        <div class="form-group"><label>${L("FieldName")}</label>
          <input type="text" name="name" value="${esc(entry.name)}" /></div>
        <div class="form-group"><label>${L("FieldKeys")}</label>
          <input type="text" name="keys" value="${esc(entry.keys.join(", "))}"
            placeholder="goblin, /thar[ao]s/i" /></div>
        <div class="form-group"><label>${L("FieldContent")}</label>
          <textarea name="content" rows="6">${esc(entry.content)}</textarea></div>
        <div class="form-group"><label>${L("FieldPosition")}</label>
          <select name="position">
            <option value="top" ${entry.position === "top" ? "selected" : ""}>top</option>
            <option value="bottom" ${entry.position === "bottom" ? "selected" : ""}>bottom</option>
          </select></div>
        <div class="form-group"><label>${L("FieldEnabled")}</label>
          <input type="checkbox" name="enabled" ${entry.enabled ? "checked" : ""} /></div>
        <div class="form-group"><label>${L("FieldConstant")}</label>
          <input type="checkbox" name="constant" ${entry.constant ? "checked" : ""} /></div>
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

    return makeLorebookEntry({
      id: entry.id,
      name: String(raw.name ?? "").trim() || "Untitled",
      keys: String(raw.keys ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      content: String(raw.content ?? ""),
      position: (raw.position === "bottom" ? "bottom" : "top") as LorebookPosition,
      enabled: Boolean(raw.enabled),
      constant: Boolean(raw.constant),
      order: entry.order,
      vector: entry.vector,
    });
  }
}

function readForm(form: HTMLFormElement | null | undefined): Record<string, unknown> {
  if (!form) return {};
  const FDE = foundry.applications?.ux?.FormDataExtended ?? (globalThis as any).FormDataExtended;
  if (FDE) return new FDE(form).object;
  // Fallback: manual read.
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
