// The consolidated "Memory & Knowledge" window: one place for everything about long-term
// memory. Connection to the noodlr-memory service (URL + write-only shared secret), what to
// retrieve and how (hybrid / Agent Mode / budget), the embedding settings, session
// transcript ingestion, and buttons that open the Manage Memory (silos/ingest), Lorebook,
// and Chronicle sub-windows.

import { MODULE_ID, MODULE_TITLE, RAG_SETTINGS, MEDIA_SETTINGS } from "../constants";
import {
  getRagConnection,
  getRagClient,
  getRagBackend,
  isRagEnabled,
  hasRagSecret,
  saveRagSecret,
  getRagTuning,
  isRerankEnabled,
  getRerankTopN,
  getWebFallbackConfig,
} from "../rag/config";
import { RagClientError } from "../rag/client";
import { getProviderView, saveProviderFromForm, type ProviderFormData } from "../providers/config";
import { getPushToLogConfig } from "../media/config";
import { wireProviderBlocks } from "./provider-ui";
import { installHeaderSaveButton } from "./header-save";
import { NoodlrMemoryApp } from "./memory-app";
import { NoodlrLorebookApp } from "./lorebook-app";
import { NoodlrChronicleApp } from "./chronicle-app";
import { NoodlrDiagnosticsApp } from "./diagnostics-app";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrMemoryConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-memory-config",
    tag: "form",
    classes: ["noodlr", "noodlr-settings", "noodlr-memory-config"],
    window: {
      title: "NOODLR.Rag.ConfigTitle",
      icon: "fa-solid fa-brain",
      resizable: true,
    },
    position: { width: 680, height: 760 },
    form: {
      handler: NoodlrMemoryConfigApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      testConnection: NoodlrMemoryConfigApp.#onTest,
      openManage: NoodlrMemoryConfigApp.#openManage,
      openLorebook: NoodlrMemoryConfigApp.#openLorebook,
      openChronicle: NoodlrMemoryConfigApp.#openChronicle,
      openDiagnostics: NoodlrMemoryConfigApp.#openDiagnostics,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/memory-config.hbs` },
  };

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    const g = (k: string) => game.settings.get(MODULE_ID, k);
    const tuning = getRagTuning();
    const push = getPushToLogConfig();
    const backend = getRagBackend();

    return {
      moduleTitle: MODULE_TITLE,
      version,

      backend,
      backendLite: backend === "lite",
      backendService: backend === "service",

      enabled: Boolean(g(RAG_SETTINGS.enabled)),
      serviceUrl: getRagConnection().serviceUrl,
      hasSecret: hasRagSecret(),

      hybrid: tuning.hybrid,
      agentMode: Boolean(g(RAG_SETTINGS.agentMode)),
      tokenBudget: tuning.tokenBudget,
      topK: tuning.topK,

      sendEmbedConfig: Boolean(g(RAG_SETTINGS.sendEmbedConfig)),
      embeddings: { id: "embeddings", ...getProviderView("embeddings") },

      webFallbackEnabled: getWebFallbackConfig().enabled,
      webFallbackMinScore: getWebFallbackConfig().minScore,
      webFallbackMaxResults: getWebFallbackConfig().maxResults,

      rerankEnabled: isRerankEnabled(),
      rerankTopN: getRerankTopN(),
      rerank: {
        id: "rerank",
        ...getProviderView("rerank"),
        title: game.i18n.localize("NOODLR.Feature.Rerank.Title"),
        what: game.i18n.localize("NOODLR.Feature.Rerank.What"),
        requires: game.i18n.localize("NOODLR.Feature.Rerank.Requires"),
        without: game.i18n.localize("NOODLR.Feature.Rerank.Without"),
      },

      transcriptIngest: push.ingest,
      transcriptIngestInterval: push.ingestInterval,
    };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.#root();
    if (root) {
      wireProviderBlocks(root);
      wireBackendGraying(root);
    }
    installHeaderSaveButton(this);
  }

  static async #onSubmit(
    this: NoodlrMemoryConfigApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    const set = (k: string, v: unknown) => game.settings.set(MODULE_ID, k, v);

    // Connection
    await set(RAG_SETTINGS.backend, o.backend === "service" ? "service" : "lite");
    await set(RAG_SETTINGS.enabled, Boolean(o.enabled));
    await set(RAG_SETTINGS.serviceUrl, String(o.serviceUrl ?? "").trim());
    await saveRagSecret(String(o.secret ?? ""), Boolean(o.secretClear));

    // Retrieval tuning
    await set(RAG_SETTINGS.hybrid, Boolean(o.hybrid));
    await set(RAG_SETTINGS.agentMode, Boolean(o.agentMode));
    await set(RAG_SETTINGS.tokenBudget, Number(o.tokenBudget) || 1500);
    await set(RAG_SETTINGS.topK, Number(o.topK) || 5);

    // Web-search fallback (OpenRouter chat only)
    await set(RAG_SETTINGS.webFallbackEnabled, Boolean(o.webFallbackEnabled));
    const minScore = Number(o.webFallbackMinScore);
    await set(RAG_SETTINGS.webFallbackMinScore, minScore >= 0 && minScore <= 1 ? minScore : 0);
    const maxRes = Number(o.webFallbackMaxResults);
    await set(RAG_SETTINGS.webFallbackMaxResults, maxRes >= 1 && maxRes <= 10 ? maxRes : 3);

    // Embeddings
    await set(RAG_SETTINGS.sendEmbedConfig, Boolean(o.sendEmbedConfig));
    await saveProviderFromForm("embeddings", o.embeddings as ProviderFormData | undefined);

    // Rerank refinement
    await set(RAG_SETTINGS.rerankEnabled, Boolean(o.rerankEnabled));
    await set(RAG_SETTINGS.rerankTopN, Number(o.rerankTopN) || 5);
    await saveProviderFromForm("rerank", o.rerank as ProviderFormData | undefined);

    // Session transcript ingestion
    await set(MEDIA_SETTINGS.pushToLogIngest, Boolean(o.transcriptIngest));
    const interval = Number(o.transcriptIngestInterval);
    await set(
      MEDIA_SETTINGS.pushToLogIngestInterval,
      interval >= 60 && interval <= 3600 ? interval : 300,
    );

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  static async #onTest(this: NoodlrMemoryConfigApp): Promise<void> {
    if (!isRagEnabled()) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.NotEnabled"));
      return;
    }
    try {
      const health = await getRagClient().health();
      ui.notifications?.info(
        game.i18n.format("NOODLR.Rag.TestOk", { backend: health.backend ?? "?" }),
      );
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(game.i18n.format("NOODLR.Rag.TestFail", { error: msg }));
    }
  }

  static #openManage(): void {
    new NoodlrMemoryApp().render({ force: true });
  }
  static #openLorebook(): void {
    new NoodlrLorebookApp().render({ force: true });
  }
  static #openChronicle(): void {
    new NoodlrChronicleApp().render({ force: true });
  }
  static #openDiagnostics(): void {
    new NoodlrDiagnosticsApp().render({ force: true });
  }
}

/**
 * Dim the options that don't apply to the currently-selected backend so the GM can see at a
 * glance which RAG provider/db is in force. We keep inputs enabled (never `disabled`) so the
 * inactive backend's stored values still round-trip through the form and aren't wiped on save;
 * the graying is purely a "this setting isn't active right now" signal. Reacts live to the
 * backend <select> without needing a save/re-render.
 */
function wireBackendGraying(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('select[name="backend"]');
  const apply = (backend: string) => {
    root.querySelectorAll<HTMLElement>("[data-backend]").forEach((el) => {
      const active = el.dataset.backend === backend;
      el.classList.toggle("noodlr-disabled", !active);
    });
  };
  apply(select?.value ?? "lite");
  select?.addEventListener("change", () => apply(select.value));
}
