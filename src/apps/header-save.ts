// Injects a persistent "Save" button into a windowed ApplicationV2's title bar (right side, next
// to the window controls) so users of long config pop-outs don't have to scroll to the footer.
// The button also reflects unsaved-changes state: it highlights ("• Save") once the form is edited
// and returns to its resting state after a successful submit.
//
// Works for form apps (tag: "form"): the root element IS the form and persists across PART
// re-renders, so the header button + listeners survive. Call from `_onRender` (idempotent).

/** Resolve the form element for an app whose root is (or contains) a <form>. */
function findForm(root: HTMLElement): HTMLFormElement | null {
  if (root.tagName === "FORM") return root as HTMLFormElement;
  return root.querySelector<HTMLFormElement>("form");
}

/**
 * Ensure a header Save button exists and is wired to the current form.
 * @param app  the ApplicationV2 instance (uses `app.element`)
 * @param labelKey  i18n key for the button label (default "Save")
 */
export function installHeaderSaveButton(app: unknown, labelKey = "NOODLR.Settings.Save"): void {
  const root = (app as { element?: HTMLElement | null })?.element ?? null;
  if (!root) return;
  const header =
    root.querySelector<HTMLElement>(".window-header") ??
    root.closest?.(".application")?.querySelector<HTMLElement>(".window-header") ??
    null;
  const form = findForm(root);
  if (!header || !form) return;

  const label = game.i18n.localize(labelKey);
  let btn = header.querySelector<HTMLButtonElement>(".noodlr-header-save");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "noodlr-header-save";
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i><span>${label}</span>`;
    btn.setAttribute("aria-label", label);
    // Sit just before the first window control (e.g. the close button) at the right edge.
    const firstControl = header.querySelector<HTMLElement>(
      '.header-control, [data-action="close"], .window-controls',
    );
    if (firstControl) header.insertBefore(btn, firstControl);
    else header.appendChild(btn);
    btn.addEventListener("click", () => {
      const f = findForm(root);
      f?.requestSubmit();
    });
  }
  const saveBtn = btn;

  const setDirty = (dirty: boolean) => saveBtn.classList.toggle("is-dirty", dirty);

  // (Re)wire the CURRENT form each render — PART re-renders replace inner content, so a fresh
  // render starts pristine. Guard against double-binding the same form element.
  if (!form.dataset.noodlrSaveWired) {
    form.dataset.noodlrSaveWired = "1";
    form.addEventListener("input", () => setDirty(true));
    form.addEventListener("change", () => setDirty(true));
    form.addEventListener("submit", () => setDirty(false));
  }
  setDirty(false);
}
