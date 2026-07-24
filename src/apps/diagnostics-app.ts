// Diagnostics window: turns the "trust me, it's helping" features into numbers. Shows live
// noodlr-memory silo document counts (proves writes are landing), a self-test round-trip
// (ingest a marker -> query it back), and session usage counters (chat turns, tokens, memory
// retrieved vs. injected, rerank trim, ingests). GM-only in practice (memory is GM-gated).

import { MODULE_ID, MODULE_TITLE } from "../constants";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";
import { RagClientError } from "../rag/client";
import { SILOS } from "../rag/silos";
import { snapshotStats, resetStats } from "../util/stats";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrDiagnosticsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-diagnostics",
    tag: "div",
    classes: ["noodlr", "noodlr-settings"],
    window: {
      title: "NOODLR.Diagnostics.Title",
      icon: "fa-solid fa-chart-line",
      resizable: true,
    },
    position: { width: 560, height: 700 },
    actions: {
      refreshDiag: NoodlrDiagnosticsApp.#onRefresh,
      resetDiag: NoodlrDiagnosticsApp.#onReset,
      selfTest: NoodlrDiagnosticsApp.#onSelfTest,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/diagnostics.hbs` },
  };

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const s = snapshotStats();
    const derived = {
      totalTokens: s.promptTokens + s.completionTokens,
      hitsPerQuery: s.ragQueries > 0 ? (s.ragHits / s.ragQueries).toFixed(1) : "—",
      keptPerRerank: s.rerankCalls > 0 ? (s.rerankKept / s.rerankCalls).toFixed(1) : "—",
      injectedTokens: Math.round(s.ragInjectedChars / 4),
      since: new Date(s.since).toLocaleString(),
    };

    // Live silo document counts (validates that ingestion actually committed rows to LanceDB).
    const rag: {
      enabled: boolean;
      online: boolean;
      backend?: string;
      error?: string;
      silos: { label: string; count: string }[];
    } = { enabled: isRagEnabled(), online: false, silos: [] };

    if (rag.enabled) {
      try {
        const client = getRagClient();
        const info = await client.collections();
        rag.online = true;
        const stats = (info.stats ?? {}) as Record<string, unknown>;
        rag.silos = Object.entries(info.collections ?? {}).map(([id, physical]) => ({
          label: (SILOS as Record<string, string>)[id] ?? id,
          count: formatSiloCount(stats[id] ?? stats[String(physical)]),
        }));
      } catch (err) {
        rag.error = err instanceof RagClientError ? err.message : String(err);
      }
    }

    return { moduleTitle: MODULE_TITLE, stats: s, derived, rag };
  }

  static async #onRefresh(this: NoodlrDiagnosticsApp): Promise<void> {
    await this.render();
  }

  static async #onReset(this: NoodlrDiagnosticsApp): Promise<void> {
    await resetStats();
    await this.render();
    ui.notifications?.info(game.i18n.localize("NOODLR.Diagnostics.ResetDone"));
  }

  static async #onSelfTest(this: NoodlrDiagnosticsApp): Promise<void> {
    const statusEl = this.#root()?.querySelector<HTMLElement>('[data-role="selftest"]');
    const setStatus = (msg: string, ok?: boolean) => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.classList.toggle("is-ok", ok === true);
      statusEl.classList.toggle("is-bad", ok === false);
    };

    if (!isRagEnabled()) {
      setStatus(game.i18n.localize("NOODLR.Diagnostics.SelfTest.Disabled"), false);
      return;
    }
    setStatus(game.i18n.localize("NOODLR.Diagnostics.SelfTest.Running"));

    const marker = `noodlr-selftest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const client = getRagClient();
      const embed = getEmbedOverride();
      // 1) Write a uniquely-tagged document into the `docs` silo.
      const ing = await client.ingest(
        "docs",
        [{ text: `Noodlr self-test marker: ${marker}. Safe to delete.`, metadata: { selftest: true } }],
        embed,
      );
      // 2) Read it back by searching for the unique token.
      const res = await client.query({ collections: ["docs"], searchText: marker, topK: 5 }, undefined);
      const found = (res.hits ?? []).some((h) => (h.text ?? "").includes(marker));
      if (found) {
        setStatus(
          game.i18n.format("NOODLR.Diagnostics.SelfTest.Ok", {
            inserted: ing.inserted ?? 0,
            mode: res.mode ?? "hybrid",
          }),
          true,
        );
      } else {
        setStatus(game.i18n.localize("NOODLR.Diagnostics.SelfTest.NotFound"), false);
      }
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      setStatus(game.i18n.format("NOODLR.Diagnostics.SelfTest.Fail", { error: msg }), false);
    }
  }
}

/** Silo stats can be a plain count, or an object like { count: n }. Render a readable value. */
function formatSiloCount(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const n = o.count ?? o.rows ?? o.documents ?? o.size;
    if (typeof n === "number") return String(n);
  }
  return String(v);
}
