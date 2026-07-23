// Manage Memory window: connection test, per-silo status + reset, a compendium ingest
// matrix (any pack -> chosen silo), and TXT/PDF upload. Connection/embedding/toggle
// settings live in the Memory & Knowledge window; this window handles the data actions.
// Opened from the Memory & Knowledge window's "Manage Memory" button.

import { MODULE_ID } from "../constants";
import { getEmbedOverride, getRagClient, isRagEnabled } from "../rag/config";
import { RagClientError } from "../rag/client";
import { SILOS, SILO_IDS, isSiloId, type SiloId } from "../rag/silos";
import { ingestCompendium } from "../rag/ingest";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoodlrMemoryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-memory",
    tag: "div",
    classes: ["noodlr", "noodlr-memory"],
    window: { title: "NOODLR.Rag.WindowTitle", icon: "fa-solid fa-brain", resizable: true },
    position: { width: 720, height: 720 },
    actions: {
      testConnection: NoodlrMemoryApp.#onTest,
      refresh: NoodlrMemoryApp.#onRefresh,
      resetSilo: NoodlrMemoryApp.#onResetSilo,
      ingestPack: NoodlrMemoryApp.#onIngestPack,
      ingestFile: NoodlrMemoryApp.#onIngestFile,
    },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/memory.hbs` } };

  #busy = false;

  async _prepareContext(): Promise<Record<string, unknown>> {
    const enabled = isRagEnabled();
    let online = false;
    let backend = "";
    let stats: Record<string, unknown> = {};

    if (enabled) {
      try {
        const client = getRagClient();
        const health = await client.health();
        online = Boolean(health.ok);
        backend = health.backend ?? "";
        const info = await client.collections();
        stats = info.stats ?? {};
      } catch {
        online = false;
      }
    }

    const silos = SILO_IDS.map((id) => ({
      id,
      label: SILOS[id],
      count: formatCount(stats[id]),
    }));

    const siloOptions = SILO_IDS.map((id) => ({ id, label: SILOS[id] }));

    const packs = [...(game.packs ?? [])].map((p: any) => ({
      id: p.collection ?? p.metadata?.id,
      label: p.metadata?.label ?? p.collection,
      type: p.metadata?.type ?? "?",
      locked: Boolean(p.locked),
    }));

    return { enabled, online, backend, silos, siloOptions, packs };
  }

  static async #onTest(this: NoodlrMemoryApp): Promise<void> {
    if (!isRagEnabled()) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.NotEnabled"));
      return;
    }
    try {
      const health = await getRagClient().health();
      ui.notifications?.info(
        game.i18n.format("NOODLR.Rag.TestOk", { backend: health.backend ?? "?" }),
      );
      this.render();
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(game.i18n.format("NOODLR.Rag.TestFail", { error: msg }));
    }
  }

  static #onRefresh(this: NoodlrMemoryApp): void {
    this.render();
  }

  static async #onResetSilo(
    this: NoodlrMemoryApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const silo = target.dataset.silo;
    if (!silo || !isSiloId(silo)) return;
    const confirmed = await confirmDialog(
      game.i18n.localize("NOODLR.Rag.ResetConfirmTitle"),
      game.i18n.format("NOODLR.Rag.ResetConfirm", { silo: SILOS[silo] }),
    );
    if (!confirmed) return;
    try {
      await getRagClient().purge(silo);
      ui.notifications?.info(game.i18n.format("NOODLR.Rag.ResetDone", { silo: SILOS[silo] }));
      this.render();
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(msg);
    }
  }

  static async #onIngestPack(
    this: NoodlrMemoryApp,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    if (this.#busy) return;
    const packId = target.dataset.pack;
    if (!packId) return;
    const silo = this.#selectedSilo(`silo-${packId}`);
    if (!silo) return;

    this.#busy = true;
    ui.notifications?.info(game.i18n.localize("NOODLR.Rag.IngestStart"));
    try {
      const res = await ingestCompendium(packId, silo, (p) => {
        if (p.processed % 100 === 0) {
          ui.notifications?.info(`${p.processed}/${p.total} → ${p.inserted} chunks`);
        }
      });
      ui.notifications?.info(
        game.i18n.format("NOODLR.Rag.IngestDone", {
          docs: res.documents,
          chunks: res.inserted,
          silo: SILOS[silo],
        }),
      );
      this.render();
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(game.i18n.format("NOODLR.Rag.IngestFail", { error: msg }));
    } finally {
      this.#busy = false;
    }
  }

  static async #onIngestFile(this: NoodlrMemoryApp): Promise<void> {
    if (this.#busy) return;
    const root = this.element as HTMLElement | null;
    const fileInput = root?.querySelector<HTMLInputElement>('[data-role="file"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.NoFile"));
      return;
    }
    const silo = this.#selectedSilo("silo-file");
    if (!silo) return;

    this.#busy = true;
    try {
      const client = getRagClient();
      const embed = getEmbedOverride();
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      let res: { inserted: number; chunks: number };
      if (isPdf) {
        const data = await fileToBase64(file);
        res = await client.ingestFile(silo, file.name, { fileType: "pdf", data }, embed);
      } else {
        const text = await file.text();
        res = await client.ingestFile(silo, file.name, { fileType: "text", text }, embed);
      }
      ui.notifications?.info(
        game.i18n.format("NOODLR.Rag.IngestDone", {
          docs: 1,
          chunks: res.inserted,
          silo: SILOS[silo],
        }),
      );
      this.render();
    } catch (err) {
      const msg = err instanceof RagClientError ? err.message : String(err);
      ui.notifications?.error(game.i18n.format("NOODLR.Rag.IngestFail", { error: msg }));
    } finally {
      this.#busy = false;
    }
  }

  #selectedSilo(selectName: string): SiloId | null {
    const root = this.element as HTMLElement | null;
    const select = root?.querySelector<HTMLSelectElement>(`select[name="${selectName}"]`);
    const value = select?.value ?? "";
    return isSiloId(value) ? value : null;
  }
}

function formatCount(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "count" in (v as any)) return String((v as any).count);
  return "—";
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}
