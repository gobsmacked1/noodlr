// Shared client-side behavior for the "provider block" markup used in both the main config
// window and the Memory & Knowledge window:
//  - toggle the custom-base-URL row per provider,
//  - populate a PER-FEATURE, modality-filtered OpenRouter model dropdown (so a TTS field offers
//    ~15 speech models, not all ~343 text models), and
//  - add "Fetch models" / (TTS) "Fetch voices" buttons that read the values CURRENTLY TYPED in
//    the form (no save needed) so non-technical users pick from a list instead of hand-typing.

import { fetchOpenRouterModels, fetchCustomModels } from "../providers/models";
import { fetchVoiceList, FALLBACK_VOICES } from "../media/tts";

/**
 * Map each feature's `data-feature` to the OpenRouter output modality + sort that surfaces its
 * viable slugs. Verified live against /api/v1/models. Unknown features fall back to text.
 */
const FEATURE_QUERY: Record<string, { modality: string; sort: string }> = {
  chat: { modality: "text", sort: "context-high-to-low" },
  tts: { modality: "speech", sort: "newest" },
  image: { modality: "image", sort: "newest" },
  transcription: { modality: "transcription", sort: "newest" },
  embeddings: { modality: "embeddings", sort: "newest" },
  // Reserved for upcoming pillars so their dropdowns filter correctly once wired:
  music: { modality: "audio", sort: "newest" },
  video: { modality: "video", sort: "newest" },
  rerank: { modality: "rerank", sort: "newest" },
};

function featureQuery(feature: string): { modality: string; sort: string } {
  return FEATURE_QUERY[feature] ?? { modality: "text", sort: "newest" };
}

/** Wire every feature block in a rendered window. */
export function wireProviderBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-feature]").forEach((block) => setupBlock(block));
}

function setupBlock(block: HTMLElement): void {
  const feature = block.getAttribute("data-feature") ?? "";

  const modelInput = block.querySelector<HTMLInputElement>('input[data-role="model"]');
  const modelDl = modelInput ? ensureDatalist(block, `noodlr-models-${feature}`) : null;
  if (modelInput && modelDl) {
    addFetchButton(modelInput, "NOODLR.Provider.FetchModels", "fetch-models", (status) =>
      onFetchModels(block, feature, modelInput, modelDl, status),
    );
  }

  // TTS-only: a voice picker fed by the endpoint's /audio/voices (or standard names).
  if (feature === "tts") {
    const voiceInput = block.querySelector<HTMLInputElement>('input[name="tts.voice"]');
    const voiceDl = voiceInput ? ensureDatalist(block, "noodlr-voices-tts") : null;
    if (voiceInput && voiceDl) {
      addFetchButton(voiceInput, "NOODLR.Provider.FetchVoices", "fetch-voices", (status) =>
        onFetchVoices(block, voiceInput, voiceDl, status),
      );
    }
  }

  const sel = block.querySelector<HTMLSelectElement>('select[data-role="provider"]');
  if (sel) {
    const apply = () => applyProviderVisibility(block, sel, feature, modelInput, modelDl);
    sel.addEventListener("change", apply);
    apply();
  }
}

function applyProviderVisibility(
  block: HTMLElement,
  sel: HTMLSelectElement,
  feature: string,
  modelInput: HTMLInputElement | null,
  modelDl: HTMLDataListElement | null,
): void {
  const isCustom = sel.value === "custom";
  block.querySelectorAll<HTMLElement>(".noodlr-custom-only").forEach((el) => {
    el.style.display = isCustom ? "" : "none";
  });
  if (!modelInput || !modelDl) return;
  if (isCustom) {
    // Custom endpoints vary; the user fetches on demand with the button.
    modelInput.removeAttribute("list");
  } else {
    modelInput.setAttribute("list", modelDl.id);
    void autoPopulateModels(feature, modelDl);
  }
}

/** Auto-fill the feature's OpenRouter dropdown (cached) when OpenRouter is selected. */
async function autoPopulateModels(feature: string, dl: HTMLDataListElement): Promise<void> {
  if (dl.childElementCount > 0) return;
  const { modality, sort } = featureQuery(feature);
  const models = await fetchOpenRouterModels(modality, sort);
  if (models.length > 0) fillDatalist(dl, models);
}

// ---- helpers -------------------------------------------------------------------------------

function ensureDatalist(block: HTMLElement, id: string): HTMLDataListElement {
  let dl = block.querySelector<HTMLDataListElement>(`#${CSS.escape(id)}`);
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = id;
    block.append(dl);
  }
  return dl;
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

/** Read the provider/base-URL/api-key currently entered in a feature block. */
function readBlockConfig(block: HTMLElement): { provider: string; baseUrl: string; apiKey: string } {
  const provider =
    block.querySelector<HTMLSelectElement>('select[data-role="provider"]')?.value ?? "openrouter";
  const baseUrl =
    block.querySelector<HTMLInputElement>('input[name$=".baseUrl"]')?.value?.trim() ?? "";
  const apiKey =
    block.querySelector<HTMLInputElement>('input[name$=".apiKey"]')?.value?.trim() ?? "";
  return { provider, baseUrl, apiKey };
}

/** Insert a "[button] [status]" row after a field's input and wire its click. */
function addFetchButton(
  input: HTMLInputElement,
  labelKey: string,
  role: string,
  onClick: (status: HTMLElement) => Promise<void>,
): void {
  const block = input.closest<HTMLElement>("[data-feature]");
  if (!block || block.querySelector(`[data-role="${role}"]`)) return;
  const button = document.createElement("button");
  button.type = "button"; // never submit the settings form
  button.dataset.role = role;
  button.className = "noodlr-fetch-btn";
  button.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${game.i18n.localize(labelKey)}`;
  const status = document.createElement("span");
  status.className = "noodlr-fetch-status";
  input.insertAdjacentElement("afterend", status);
  input.insertAdjacentElement("afterend", button);
  button.addEventListener("click", () => void onClick(status));
}

async function onFetchModels(
  block: HTMLElement,
  feature: string,
  input: HTMLInputElement,
  dl: HTMLDataListElement,
  status: HTMLElement,
): Promise<void> {
  const { provider, baseUrl, apiKey } = readBlockConfig(block);
  status.textContent = game.i18n.localize("NOODLR.Provider.Fetching");
  const { modality, sort } = featureQuery(feature);
  const models =
    provider === "custom"
      ? await fetchCustomModels(baseUrl, apiKey)
      : await fetchOpenRouterModels(modality, sort);
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
