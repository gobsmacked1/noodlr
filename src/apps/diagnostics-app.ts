// Diagnostics window: turns the "trust me, it's helping" features into numbers. Shows live
// noodlr-memory silo document counts (proves writes are landing), a self-test round-trip
// (ingest a marker -> query it back), and session usage counters (chat turns, tokens, memory
// retrieved vs. injected, rerank trim, ingests). GM-only in practice (memory is GM-gated).

import { MODULE_ID, MODULE_TITLE } from "../constants";
import {
  getRagClient,
  getRagBackend,
  isRagEnabled,
  getEmbedOverride,
  getQuerySilos,
  getRagTuning,
} from "../rag/config";
import { RagClientError, type RagHit } from "../rag/client";
import { SILOS, isSiloId } from "../rag/silos";
import { snapshotStats, resetStats } from "../util/stats";
import { getContextBudget } from "../prompt/settings";

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
      embedTest: NoodlrDiagnosticsApp.#onEmbedTest,
      copyDiag: NoodlrDiagnosticsApp.#onCopy,
      ragQuery: NoodlrDiagnosticsApp.#onRagQuery,
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
    const budget = getContextBudget();
    const avgCtx = s.ctxSentCount > 0 ? Math.round(s.ctxSentSum / s.ctxSentCount) : 0;
    const derived = {
      totalTokens: s.promptTokens + s.completionTokens,
      hitsPerQuery: s.ragQueries > 0 ? (s.ragHits / s.ragQueries).toFixed(1) : "—",
      keptPerRerank: s.rerankCalls > 0 ? (s.rerankKept / s.rerankCalls).toFixed(1) : "—",
      injectedTokens: Math.round(s.ragInjectedChars / 4),
      since: new Date(s.since).toLocaleString(),
      contextBudget: budget,
      avgCtxSent: s.ctxSentCount > 0 ? avgCtx : "—",
      peakCtxSent: s.ctxSentPeak > 0 ? s.ctxSentPeak : "—",
      // Fraction of the budget the peak turn used (helps decide whether to raise it).
      peakPct: s.ctxSentPeak > 0 && budget > 0 ? Math.round((s.ctxSentPeak / budget) * 100) : "—",
    };

    // Silo picker options for the raw-query review tool (an "all" default + each silo).
    const siloOptions = Object.entries(SILOS).map(([id, label]) => ({ id, label }));

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

    // Only surface the test relevant to the configured backend, so a nontechnical user never sees
    // a failing test for a RAG type they aren't using (the embedder probe is Memory-Lite-specific;
    // the LanceDB wording is service-specific).
    const backend = getRagBackend();

    return {
      moduleTitle: MODULE_TITLE,
      stats: s,
      derived,
      rag,
      backend,
      backendLite: backend === "lite",
      backendService: backend === "service",
      siloOptions,
    };
  }

  static async #onRefresh(this: NoodlrDiagnosticsApp): Promise<void> {
    await this.render();
  }

  /**
   * Raw RAG query inspector: run the DM's text against the configured backend and show the raw
   * hits (score, silo/source, full text) with no LLM in the loop. Lets a GM see exactly what
   * retrieval would feed the model. GM-only in practice (memory is GM-gated).
   */
  static async #onRagQuery(this: NoodlrDiagnosticsApp): Promise<void> {
    const root = this.#root();
    if (!root) return;
    const input = root.querySelector<HTMLInputElement>('[data-role="ragq-input"]');
    const siloSel = root.querySelector<HTMLSelectElement>('[data-role="ragq-silo"]');
    const topkEl = root.querySelector<HTMLInputElement>('[data-role="ragq-topk"]');
    const out = root.querySelector<HTMLElement>('[data-role="ragq-results"]');
    if (!out) return;

    const q = (input?.value ?? "").trim();
    if (!q) {
      out.textContent = game.i18n.localize("NOODLR.Diagnostics.RagQuery.NoQuery");
      return;
    }
    if (!isRagEnabled()) {
      out.textContent = game.i18n.localize("NOODLR.Diagnostics.RagDisabled");
      return;
    }
    out.textContent = game.i18n.localize("NOODLR.Diagnostics.RagQuery.Running");
    try {
      const client = getRagClient();
      const embed = getEmbedOverride();
      const chosen = siloSel?.value ?? "__all__";
      const collections = chosen !== "__all__" && isSiloId(chosen) ? [chosen] : getQuerySilos();
      const topK = Math.max(1, Math.min(50, Number(topkEl?.value) || 10));
      const { hybrid } = getRagTuning();
      const res = await client.query(
        { collections, searchText: q, topK, hybrid, embed },
        undefined,
      );
      renderQueryHits(out, res.hits ?? [], res.mode ?? "hybrid");
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      out.textContent = game.i18n.format("NOODLR.Diagnostics.RagQuery.Fail", { error: msg });
    }
  }

  /** Copy the whole diagnostics report to the clipboard (reliable regardless of text selection). */
  static async #onCopy(this: NoodlrDiagnosticsApp): Promise<void> {
    const root = this.#root();
    if (!root) return;
    const lines: string[] = [];
    root.querySelectorAll(".noodlr-diag-table").forEach((tbl) => {
      tbl.querySelectorAll("tr").forEach((tr) => {
        const cells = [...tr.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim());
        if (cells.some(Boolean)) lines.push(cells.join("\t"));
      });
      lines.push("");
    });
    const selftest = root.querySelector('[data-role="selftest"]')?.textContent?.trim();
    if (selftest) lines.push(`Self-test: ${selftest}`);
    const text = lines.join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
      ui.notifications?.info(game.i18n.localize("NOODLR.Diagnostics.Copied"));
    } catch {
      // Clipboard API can be blocked (insecure context). Fall back to a selectable prompt.
      window.prompt(game.i18n.localize("NOODLR.Diagnostics.CopyManual"), text);
    }
  }

  /**
   * Load the bundled in-browser embedding model and embed one probe sentence. This validates
   * that transformers.js + the ORT WASM + the offline weights all load under Foundry's CSP —
   * the prerequisite for Memory Lite. First run is slow (model load); later runs are instant.
   */
  static async #onEmbedTest(this: NoodlrDiagnosticsApp): Promise<void> {
    const el = this.#root()?.querySelector<HTMLElement>('[data-role="embedtest"]');
    const set = (msg: string, ok?: boolean) => {
      if (!el) return;
      el.textContent = msg;
      el.classList.toggle("is-ok", ok === true);
      el.classList.toggle("is-bad", ok === false);
    };
    if (getRagBackend() !== "lite") {
      set(game.i18n.localize("NOODLR.Diagnostics.EmbedTest.NotLite"), false);
      return;
    }
    set(game.i18n.localize("NOODLR.Diagnostics.EmbedTest.Running"));
    try {
      const { selfTestEmbedder, EMBED_DIM } = await import("../rag/local/embedder");
      const { dims, ms } = await selfTestEmbedder();
      const ok = dims === EMBED_DIM;
      set(game.i18n.format("NOODLR.Diagnostics.EmbedTest.Ok", { dims, ms }), ok);
    } catch (err) {
      set(game.i18n.format("NOODLR.Diagnostics.EmbedTest.Fail", { error: String(err) }), false);
    }
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
    // Ingest and query with the SAME distinctive text: self-similarity is ~1.0, so the marker is
    // guaranteed to top the dense candidate pool even when `docs` already holds many documents.
    // (Querying with a bare token embeds very differently from the stored sentence and can miss
    // the candidate cut entirely — that was the earlier false negative.)
    const markerText = `Noodlr diagnostics self-test ${marker}. This is a throwaway document safe to delete.`;
    try {
      const client = getRagClient();
      const embed = getEmbedOverride();
      // 1) Write the tagged document into the `docs` silo.
      const ing = await client.ingest(
        "docs",
        [{ text: markerText, metadata: { selftest: true } }],
        embed,
      );
      // 2) Read it back. CRITICAL: pass the SAME embedding override used for ingest — otherwise
      // the server embeds the query with a different model (different vector space).
      const res = await client.query(
        { collections: ["docs"], searchText: markerText, topK: 5, embed },
        undefined,
      );
      const hits = res.hits ?? [];
      const found = hits.some((h) => (h.text ?? "").includes(marker));
      if (found) {
        setStatus(
          game.i18n.format("NOODLR.Diagnostics.SelfTest.Ok", {
            inserted: ing.inserted ?? 0,
            mode: res.mode ?? "hybrid",
          }),
          true,
        );
      } else {
        setStatus(
          game.i18n.format("NOODLR.Diagnostics.SelfTest.NotFound", { hits: hits.length }),
          false,
        );
      }
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      setStatus(game.i18n.format("NOODLR.Diagnostics.SelfTest.Fail", { error: msg }), false);
    }
  }
}

/** Render raw query hits into the results container as selectable/copyable DOM (no HTML injection). */
function renderQueryHits(out: HTMLElement, hits: RagHit[], mode: string): void {
  out.textContent = "";
  const header = document.createElement("p");
  header.className = "notes";
  header.textContent = game.i18n.format("NOODLR.Diagnostics.RagQuery.Summary", {
    count: hits.length,
    mode,
  });
  out.appendChild(header);
  if (hits.length === 0) return;

  const list = document.createElement("ol");
  list.className = "noodlr-ragq-hits";
  for (const h of hits) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "noodlr-ragq-hit__meta";
    const md = (h.metadata ?? {}) as Record<string, unknown>;
    const silo = typeof md.collection === "string" ? md.collection : (md.silo as string) || "";
    const source = typeof md.sourceName === "string" ? md.sourceName : "";
    const bits = [`score ${Number(h.score).toFixed(3)}`];
    if (silo) bits.push(silo);
    if (source) bits.push(source);
    meta.textContent = bits.join(" · ");
    const body = document.createElement("div");
    body.className = "noodlr-ragq-hit__text";
    body.textContent = (h.text ?? "").trim();
    li.append(meta, body);
    list.appendChild(li);
  }
  out.appendChild(list);
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
