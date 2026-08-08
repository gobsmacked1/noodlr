// Manage Memory window: connection test, per-silo status + reset, a compendium ingest
// matrix (any pack -> chosen silo), and TXT/PDF upload. Connection/embedding/toggle
// settings live in the Memory & Knowledge window; this window handles the data actions.
// Opened from the Memory & Knowledge window's "Manage Memory" button.

import { MODULE_ID, isDeveloperMode } from "../constants";
import { exportPacks } from "../dev/pack-export";
import { getEmbedOverride, getRagClient, isRagEnabled } from "../rag/config";
import { IMPORTANCE, withImportance } from "../rag/importance";
import { RagClientError } from "../rag/client";
import { SILOS, SILO_IDS, isSiloId, type SiloId } from "../rag/silos";
import { ingestCompendium } from "../rag/ingest";
import { parseStructuredFile, structuredFormatFor } from "../rag/parse-structured";
import { bumpStats } from "../util/stats";

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
      exportPacks: NoodlrMemoryApp.#onExportPacks,
      selectAllPacks: NoodlrMemoryApp.#onSelectAllPacks,
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

    // Prefix each compendium with its folder path (as shown in Foundry's compendium sidebar) so
    // similarly/duplicately-named packs from different content creators are disambiguated, then sort
    // by that composite label so packs from the same folder cluster together.
    const packs = [...(game.packs ?? [])]
      .map((p: any) => {
        const base = p.metadata?.label ?? p.collection;
        const path = packFolderPath(p);
        return {
          id: p.collection ?? p.metadata?.id,
          label: path ? `${path} / ${base}` : base,
          type: p.metadata?.type ?? "?",
          locked: Boolean(p.locked),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      enabled,
      online,
      backend,
      silos,
      siloOptions,
      packs,
      developer: isDeveloperMode(),
    };
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
      const structured = structuredFormatFor(file.name, file.type);
      let res: { inserted: number; chunks: number };
      if (structured) {
        // JSON/YAML/CSV: parse client-side into per-record documents so BOTH backends handle them
        // identically (no server/Lite change). Empty/garbage files surface a clear error.
        const docs = await parseStructuredFile(file);
        if (docs.length === 0) {
          ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.StructuredEmpty"));
          return;
        }
        res = await client.ingest(
          silo,
          docs.map((d) => ({ ...d, metadata: withImportance(d.metadata, IMPORTANCE.ingested) })),
          embed,
        );
      } else if (isPdf) {
        const data = await fileToBase64(file);
        res = await client.ingestFile(
          silo,
          file.name,
          { fileType: "pdf", data },
          embed,
          undefined,
          IMPORTANCE.ingested,
        );
      } else {
        const text = await file.text();
        res = await client.ingestFile(
          silo,
          file.name,
          { fileType: "text", text },
          embed,
          undefined,
          IMPORTANCE.ingested,
        );
      }
      bumpStats({ ingestDocs: res.inserted ?? 0, ingestChunks: res.chunks ?? 0 });
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

  /**
   * Export the ticked packs as JSONL for the offline rules miner.
   *
   * Separate from ingest on purpose: this writes complete, untruncated documents to disk and sends
   * nothing anywhere, whereas ingest summarizes and embeds. Sharing a button would eventually mean
   * sharing an extraction path, and a truncated export silently produces a wrong gap inventory.
   */
  static async #onExportPacks(this: NoodlrMemoryApp): Promise<void> {
    if (this.#busy) return;
    const root = this.element as HTMLElement | null;
    const checked = [
      ...(root?.querySelectorAll<HTMLInputElement>('[data-role="export-pack"]') ?? []),
    ]
      .filter((box) => box.checked)
      .map((box) => box.value);

    if (checked.length === 0) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Dev.ExportNoPacks"));
      return;
    }

    this.#busy = true;
    const status = root?.querySelector<HTMLElement>('[data-role="export-status"]');
    const say = (text: string) => {
      if (status) status.textContent = text;
    };

    say(game.i18n.format("NOODLR.Dev.ExportStart", { count: checked.length }));
    try {
      const { results, failures } = await exportPacks(checked, (p) => {
        say(`${p.pack}: ${p.processed}/${p.total}`);
      });

      const documents = results.reduce((sum, r) => sum + r.documents, 0);
      // Records outnumber documents wherever a creature carries features: each trait, action,
      // reaction and legendary action is its own mining unit, because that is what holds one rule.
      const records = results.reduce((sum, r) => sum + r.records, 0);
      const megabytes = (results.reduce((sum, r) => sum + r.bytes, 0) / 1_048_576).toFixed(1);
      say(
        game.i18n.format("NOODLR.Dev.ExportDone", {
          packs: results.length,
          documents,
          records,
          size: megabytes,
        }),
      );
      for (const failure of failures) {
        ui.notifications?.error(`${failure.packId}: ${failure.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      say(msg);
      ui.notifications?.error(msg);
    } finally {
      this.#busy = false;
    }
  }

  /** Tick or untick every pack checkbox at once; 60-odd packs is too many to click through. */
  static #onSelectAllPacks(this: NoodlrMemoryApp, _event: Event, target: HTMLElement): void {
    const root = this.element as HTMLElement | null;
    const boxes = [
      ...(root?.querySelectorAll<HTMLInputElement>('[data-role="export-pack"]') ?? []),
    ];
    const turnOn = boxes.some((box) => !box.checked);
    boxes.forEach((box) => (box.checked = turnOn));
    target.textContent = game.i18n.localize(
      turnOn ? "NOODLR.Dev.ExportSelectNone" : "NOODLR.Dev.ExportSelectAll",
    );
  }

  #selectedSilo(selectName: string): SiloId | null {
    const root = this.element as HTMLElement | null;
    const select = root?.querySelector<HTMLSelectElement>(`select[name="${selectName}"]`);
    const value = select?.value ?? "";
    return isSiloId(value) ? value : null;
  }
}

/**
 * Build a compendium pack's folder path ("Parent / Child") by walking its compendium-folder chain.
 * Best-effort: `pack.folder` is a Folder document in v13; if the API shape differs or the pack is
 * unfiled, returns "" and the pack shows unprefixed.
 */
function packFolderPath(pack: any): string {
  const names: string[] = [];
  let f = pack?.folder;
  let guard = 0;
  while (f && typeof f === "object" && guard++ < 20) {
    if (f.name) names.unshift(String(f.name));
    f = f.folder;
  }
  return names.join(" / ");
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
