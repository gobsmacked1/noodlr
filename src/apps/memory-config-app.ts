// The consolidated "Memory & Knowledge" window: one place for everything about long-term
// memory. Connection to the noodlr-memory service (URL + write-only shared secret), what to
// retrieve and how (hybrid / Agent Mode / budget), the embedding settings, session
// transcript ingestion, and buttons that open the Manage Memory (silos/ingest) and Diagnostics
// sub-windows. (Lorebook + the Memory browser live on the Dungeon Master toolbar.)

import { MODULE_ID, MODULE_TITLE, RAG_SETTINGS, MEDIA_SETTINGS } from "../constants";
import {
  getRagClient,
  getRagBackend,
  isRagEnabled,
  hasRagSecret,
  saveRagSecret,
  getRagTuning,
  isRerankEnabled,
  getRerankTopN,
  getWebFallbackConfig,
  getChatLogConfig,
} from "../rag/config";
import { RagClientError } from "../rag/client";
import {
  getRagTarget,
  inspectRagTarget,
  normalizeServicePath,
  normalizeServiceUrl,
  ragFailureAdvice,
} from "../rag/target";
import { getProviderView, saveProviderFromForm, type ProviderFormData } from "../providers/config";
import { getPushToLogConfig } from "../media/config";
import { wireProviderBlocks } from "./provider-ui";
import { installHeaderSaveButton } from "./header-save";
import { NoodlrMemoryApp } from "./memory-app";
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
    const chatLog = getChatLogConfig();
    const backend = getRagBackend();
    const target = getRagTarget();

    return {
      moduleTitle: MODULE_TITLE,
      version,

      backend,
      backendLite: backend === "lite",
      backendService: backend === "service",

      enabled: Boolean(g(RAG_SETTINGS.enabled)),
      target: {
        ...target,
        isProxy: target.mode === "proxy",
        isDirect: target.mode === "direct",
        origin: globalThis.location?.origin ?? "",
        warning: backend === "service" ? inspectRagTarget(target) : null,
      },
      hasSecret: hasRagSecret(),

      hybrid: tuning.hybrid,
      agentMode: Boolean(g(RAG_SETTINGS.agentMode)),
      tokenBudget: tuning.tokenBudget,
      topK: tuning.topK,

      sendEmbedConfig: Boolean(g(RAG_SETTINGS.sendEmbedConfig)),
      embeddings: { id: "embeddings", ...getProviderView("embeddings") },
      embedBatchSize: Number(g(RAG_SETTINGS.embedBatchSize)) || 0,
      embedPaceMs: Number(g(RAG_SETTINGS.embedPaceMs)) || 0,

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

      chatLogEnabled: chatLog.enabled,
      chatLogWhispers: chatLog.includeWhispers,
      chatLogInterval: chatLog.intervalSec,
    };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.#root();
    if (root) {
      wireProviderBlocks(root);
      wireBackendGraying(root);
      wireTargetMode(root);
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
    await set(RAG_SETTINGS.targetMode, o.targetMode === "proxy" ? "proxy" : "direct");
    // Both fields are kept whatever the mode, so flipping the picker back and forth doesn't erase
    // the address you're not currently using.
    await set(RAG_SETTINGS.servicePath, normalizeServicePath(String(o.servicePath ?? "")));
    await set(RAG_SETTINGS.serviceUrl, normalizeServiceUrl(String(o.serviceUrl ?? "")));
    await saveRagSecret(String(o.secret ?? ""), Boolean(o.secretClear));

    // Retrieval tuning
    await set(RAG_SETTINGS.hybrid, Boolean(o.hybrid));
    await set(RAG_SETTINGS.agentMode, Boolean(o.agentMode));
    await set(RAG_SETTINGS.tokenBudget, Number(o.tokenBudget) || 1500);
    await set(RAG_SETTINGS.topK, Number(o.topK) || 5);

    // Embedding throttle. Clamped rather than rejected: a 0 means "let the service decide", which is
    // the documented default, so a blanked field has to survive a save.
    await set(RAG_SETTINGS.embedBatchSize, clampNumber(o.embedBatchSize, 0, 256));
    await set(RAG_SETTINGS.embedPaceMs, clampNumber(o.embedPaceMs, 0, 10_000));

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

    // Native Foundry chat-log capture
    await set(RAG_SETTINGS.chatLogEnabled, Boolean(o.chatLogEnabled));
    await set(RAG_SETTINGS.chatLogWhispers, Boolean(o.chatLogWhispers));
    const clInterval = Number(o.chatLogInterval);
    await set(
      RAG_SETTINGS.chatLogInterval,
      clInterval >= 30 && clInterval <= 3600 ? clInterval : 300,
    );

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  static async #onTest(this: NoodlrMemoryConfigApp): Promise<void> {
    // Results also land in a status line inside the window: a notification toast disappears before
    // you can read a CORS explanation, let alone copy it.
    const status = this.#root()?.querySelector<HTMLElement>('[data-role="rag-test-status"]');
    const setStatus = (kind: "pending" | "ok" | "warn" | "error", text: string) => {
      if (!status) return;
      status.className = `noodlr-test-status noodlr-test-status--${kind}`;
      status.textContent = text;
    };

    // A missing or nonsensical address reads as "not enabled" through isRagEnabled(), which is not
    // what's wrong — say what's actually missing instead.
    const target = getRagTarget();
    const problem =
      getRagBackend() === "service" && !target.effectiveUrl ? inspectRagTarget(target) : null;
    if (problem || !isRagEnabled()) {
      const msg = problem ?? game.i18n.localize("NOODLR.Rag.NotEnabled");
      setStatus("warn", msg);
      ui.notifications?.warn(msg);
      return;
    }

    setStatus("pending", game.i18n.format("NOODLR.Rag.Testing", { url: target.effectiveUrl }));
    try {
      const health = await getRagClient().health();
      const msg = game.i18n.format("NOODLR.Rag.TestOk", { backend: health.backend ?? "?" });
      setStatus("ok", msg);
      ui.notifications?.info(msg);
    } catch (err) {
      const detail = err instanceof RagClientError ? err.message : String(err);
      // Unreachable is the interesting case: say which address was tried and why it may be wrong.
      const advice =
        err instanceof RagClientError && !err.status ? ` ${ragFailureAdvice(target)}` : "";
      setStatus("error", `${detail}${advice}`);
      ui.notifications?.error(game.i18n.format("NOODLR.Rag.TestFail", { error: detail }));
    }
  }

  static #openManage(): void {
    new NoodlrMemoryApp().render({ force: true });
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
/**
 * Show only the address field that the selected target mode uses, and keep the resolved URL preview
 * honest as the GM types — "what will actually be fetched" is the question the old single URL box
 * couldn't answer.
 */
/** A blank or nonsense field reads as 0, which every consumer treats as "use the default". */
function clampNumber(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function wireTargetMode(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('select[name="targetMode"]');
  const pathInput = root.querySelector<HTMLInputElement>('input[name="servicePath"]');
  const preview = root.querySelector<HTMLElement>('[data-role="target-preview"]');
  if (!select) return;

  const apply = () => {
    root.querySelectorAll<HTMLElement>("[data-target-mode]").forEach((el) => {
      el.style.display = el.dataset.targetMode === select.value ? "" : "none";
    });
    if (preview) {
      const origin = globalThis.location?.origin ?? "";
      const path = normalizeServicePath(pathInput?.value ?? "");
      preview.textContent = path ? `${origin}${path}/v1/health` : origin;
    }
  };
  apply();
  select.addEventListener("change", apply);
  pathInput?.addEventListener("input", apply);
}

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
