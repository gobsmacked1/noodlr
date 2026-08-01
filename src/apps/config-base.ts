// Shared behavior for the five Noodlr configuration windows.
//
// The module's settings used to be one endless scrolling form. It is now split by topic (memory,
// text, audio, image, credentials) so a GM can find a field without reading everything. All of the
// generation windows share the same plumbing, which lives here: provider-block wiring, the header
// Save button, image-size toggles, and the prompt-field Reset action.

import { MODULE_ID } from "../constants";
import { promptDefault, PROMPT_FIELDS } from "../prompts/fields";
import { sanitizeUserText } from "../util/sanitize";
import { wireProviderBlocks } from "./provider-ui";
import { installHeaderSaveButton } from "./header-save";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Show/hide each image generator's free-form width/height inputs when "Custom…" is picked. */
function wireImageSizeSelects(root: HTMLElement): void {
  root.querySelectorAll<HTMLSelectElement>('select[data-role="image-size"]').forEach((sel) => {
    const custom = sel
      .closest(".noodlr-field")
      ?.querySelector<HTMLElement>('[data-role="custom-size"]');
    if (!custom) return;
    const apply = () => {
      custom.style.display = sel.value === "custom" ? "" : "none";
    };
    sel.addEventListener("change", apply);
    apply();
  });
}

/**
 * Options every config window shares. Spread into each subclass's DEFAULT_OPTIONS rather than
 * inherited: ApplicationV2 does merge DEFAULT_OPTIONS down the class hierarchy, but `tag: "form"` is
 * what makes these windows submit at all, so it's stated where it's used.
 */
export const CONFIG_WINDOW_DEFAULTS = {
  tag: "form",
  classes: ["noodlr", "noodlr-settings"],
  position: { width: 700, height: 780 },
};

export class NoodlrConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  protected rootEl(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.rootEl();
    if (root) {
      wireProviderBlocks(root);
      wireImageSizeSelects(root);
    }
    installHeaderSaveButton(this);
  }

  /**
   * Restore one prompt field's shipped default.
   *
   * Rewrites the textarea and stops there: persisting immediately would mean re-rendering the form,
   * throwing away whatever the GM has typed in the other fields but not yet saved. The visible text
   * change is the feedback, and Save commits it like any other edit.
   */
  static onResetPromptField(this: NoodlrConfigApp, _event: Event, target: HTMLElement): void {
    const key = target?.dataset?.field ?? "";
    if (!key) return;
    const escape = (globalThis as any).CSS?.escape ?? ((s: string) => s);
    const ta = this.rootEl()?.querySelector<HTMLTextAreaElement>(
      `[data-prompt-field="${escape(key)}"]`,
    );
    if (!ta) return;
    ta.value = promptDefault(key);
    // Let the header Save button notice there's something to save.
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * Persist every prompt textarea in this window.
   *
   * Prompt fields are collected from the DOM rather than the serialized form because their settings
   * keys contain dots; as form field names they would expand into nested objects and collide with
   * the provider fields. Values are stored verbatim (an emptied field means "send nothing").
   */
  protected async savePromptFields(form: HTMLFormElement): Promise<void> {
    const fields = form.querySelectorAll<HTMLTextAreaElement>("[data-prompt-field]");
    for (const ta of fields) {
      const key = ta.dataset.promptField ?? "";
      if (!key) continue;
      const maxLength = PROMPT_FIELDS[key]?.maxLength ?? 4000;
      await game.settings.set(
        MODULE_ID,
        key,
        sanitizeUserText(ta.value, { maxLength, preserveLayout: true }),
      );
    }
  }
}
