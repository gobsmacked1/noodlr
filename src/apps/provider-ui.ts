// Shared client-side behavior for the "provider block" markup used in both the main config
// window and the Memory & Knowledge window: toggling the custom-base-URL row per provider
// and populating the live OpenRouter model datalist. Kept in one place so the two windows
// stay consistent.

import { fetchOpenRouterModels } from "../providers/models";

/** Wire every `[data-role="provider"]` select in a rendered window + fill the model list. */
export function wireProviderBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLSelectElement>('select[data-role="provider"]').forEach((sel) => {
    const apply = () => applyProviderVisibility(sel);
    sel.addEventListener("change", apply);
    apply();
  });
  void populateOpenRouterModels(root);
}

function applyProviderVisibility(sel: HTMLSelectElement): void {
  const block = sel.closest<HTMLElement>("[data-feature]");
  if (!block) return;
  const isCustom = sel.value === "custom";
  block.querySelectorAll<HTMLElement>(".noodlr-custom-only").forEach((el) => {
    el.style.display = isCustom ? "" : "none";
  });
  // Only offer OpenRouter's catalog when OpenRouter is the selected provider.
  const model = block.querySelector<HTMLInputElement>('input[data-role="model"]');
  if (model) {
    if (isCustom) model.removeAttribute("list");
    else model.setAttribute("list", "noodlr-or-models");
  }
}

async function populateOpenRouterModels(root: HTMLElement): Promise<void> {
  const datalist = root.querySelector<HTMLDataListElement>("#noodlr-or-models");
  if (!datalist || datalist.childElementCount > 0) return;
  const models = await fetchOpenRouterModels();
  if (models.length === 0) return;
  const frag = document.createDocumentFragment();
  for (const id of models) {
    const opt = document.createElement("option");
    opt.value = id;
    frag.append(opt);
  }
  datalist.append(frag);
}
