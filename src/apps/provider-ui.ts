// Shared client-side behavior for the "provider block" markup used in both the main config
// window and the Memory & Knowledge window: toggling the custom-base-URL row per provider,
// populating the live OpenRouter model datalist, and adding per-feature "Fetch models" / (TTS)
// "Fetch voices" buttons that read the values CURRENTLY TYPED in the form (no save needed —
// the key is already in the field) so non-technical users can pick from a list instead of
// hand-typing opaque slugs.

import { fetchOpenRouterModels, fetchCustomModels } from "../providers/models";
import { fetchVoiceList, FALLBACK_VOICES } from "../media/tts";

/** Wire every `[data-role="provider"]` select in a rendered window + fill the model list. */
export function wireProviderBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLSelectElement>('select[data-role="provider"]').forEach((sel) => {
    const apply = () => applyProviderVisibility(sel);
    sel.addEventListener("change", apply);
    apply();
  });
  void populateOpenRouterModels(root);
  root.querySelectorAll<HTMLElement>("[data-feature]").forEach((block) => addFetchControls(block));
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
  fillDatalist(datalist, models);
}

// ---- Fetch buttons -------------------------------------------------------------------------

/** Read the provider/base-URL/api-key currently entered in a feature block. */
function readBlockConfig(block: HTMLElement): {
  provider: string;
  baseUrl: string;
  apiKey: string;
} {
  const provider =
    block.querySelector<HTMLSelectElement>('select[data-role="provider"]')?.value ?? "openrouter";
  const baseUrl =
    block.querySelector<HTMLInputElement>('input[name$=".baseUrl"]')?.value?.trim() ?? "";
  const apiKey =
    block.querySelector<HTMLInputElement>('input[name$=".apiKey"]')?.value?.trim() ?? "";
  return { provider, baseUrl, apiKey };
}

function fillDatalist(dl: HTMLDataListElement, values: string[]): void {
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    frag.append(opt);
  }
  dl.replaceChildren(frag);
}

/** Build a compact "[button] [status]" row appended after a field's input. */
function makeFetchRow(labelKey: string, role: string): { button: HTMLButtonElement; status: HTMLElement } {
  const button = document.createElement("button");
  button.type = "button"; // never submit the settings form
  button.dataset.role = role;
  button.className = "noodlr-fetch-btn";
  button.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${game.i18n.localize(labelKey)}`;
  const status = document.createElement("span");
  status.className = "noodlr-fetch-status";
  status.dataset.role = `${role}-status`;
  return { button, status };
}

function addFetchControls(block: HTMLElement): void {
  const feature = block.getAttribute("data-feature") ?? "";

  // Fetch models (all provider features).
  const modelInput = block.querySelector<HTMLInputElement>('input[data-role="model"]');
  if (modelInput && !block.querySelector('[data-role="fetch-models"]')) {
    const { button, status } = makeFetchRow("NOODLR.Provider.FetchModels", "fetch-models");
    const dl = document.createElement("datalist");
    dl.id = `noodlr-models-${feature}`;
    modelInput.insertAdjacentElement("afterend", status);
    modelInput.insertAdjacentElement("afterend", button);
    block.append(dl);
    button.addEventListener("click", () => void onFetchModels(block, modelInput, dl, status));
  }

  // Fetch voices (TTS only).
  if (feature === "tts") {
    const voiceInput = block.querySelector<HTMLInputElement>('input[name="tts.voice"]');
    if (voiceInput && !block.querySelector('[data-role="fetch-voices"]')) {
      const { button, status } = makeFetchRow("NOODLR.Provider.FetchVoices", "fetch-voices");
      const dl = document.createElement("datalist");
      dl.id = "noodlr-voices-tts";
      voiceInput.insertAdjacentElement("afterend", status);
      voiceInput.insertAdjacentElement("afterend", button);
      block.append(dl);
      button.addEventListener("click", () => void onFetchVoices(block, voiceInput, dl, status));
    }
  }
}

async function onFetchModels(
  block: HTMLElement,
  input: HTMLInputElement,
  dl: HTMLDataListElement,
  status: HTMLElement,
): Promise<void> {
  const { provider, baseUrl, apiKey } = readBlockConfig(block);
  status.textContent = game.i18n.localize("NOODLR.Provider.Fetching");
  const models =
    provider === "custom" ? await fetchCustomModels(baseUrl, apiKey) : await fetchOpenRouterModels();
  if (models.length === 0) {
    status.textContent = game.i18n.localize("NOODLR.Provider.FetchNone");
    return;
  }
  fillDatalist(dl, models);
  input.setAttribute("list", dl.id);
  status.textContent = game.i18n.format("NOODLR.Provider.FetchOk", { count: models.length });
}

async function onFetchVoices(
  block: HTMLElement,
  input: HTMLInputElement,
  dl: HTMLDataListElement,
  status: HTMLElement,
): Promise<void> {
  const { provider, baseUrl, apiKey } = readBlockConfig(block);
  status.textContent = game.i18n.localize("NOODLR.Provider.Fetching");
  // OpenRouter has no voice-list endpoint; offer the standard names. Custom endpoints (e.g.
  // openedai-speech) usually expose /audio/voices.
  const voices = provider === "custom" ? await fetchVoiceList(baseUrl, apiKey) : FALLBACK_VOICES;
  fillDatalist(dl, voices);
  input.setAttribute("list", dl.id);
  status.textContent = game.i18n.format("NOODLR.Provider.FetchOk", { count: voices.length });
}
