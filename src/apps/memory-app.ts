// Manage Memory window: connection test, per-silo status + reset, a compendium ingest
// matrix (any pack -> chosen silo), and TXT/PDF upload. Connection/embedding/toggle
// settings live in the Memory & Knowledge window; this window handles the data actions.
// Opened from the Memory & Knowledge window's "Manage Memory" button.

import { MODULE_ID, isDeveloperMode, warn } from "../constants";
import { exportPacks, type ExportResult } from "../dev/pack-export";
import { getRagClient, isRagEnabled } from "../rag/config";
import { RagClientError } from "../rag/client";
import { SILOS, SILO_IDS, isSiloId, type SiloId } from "../rag/silos";
import { ingestCompendium, ingestUploadedFile } from "../rag/ingest";
import {
  cancelAllIngest,
  cancelIngest,
  clearFinishedIngest,
  enqueueIngest,
  ingestActive,
  ingestJobs,
  onIngestQueueChange,
  resumeIngest,
  type IngestJobView,
  type IngestSpec,
  type IngestTask,
  type StoredResume,
} from "../rag/ingest-queue";
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
      cancelJob: NoodlrMemoryApp.#onCancelJob,
      resumeJob: NoodlrMemoryApp.#onResumeJob,
      cancelAllJobs: NoodlrMemoryApp.#onCancelAll,
      clearFinishedJobs: NoodlrMemoryApp.#onClearFinished,
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

  /**
   * Queue a pack rather than ingesting it here.
   *
   * The button used to await the whole run behind a `#busy` flag, which made a large pack look like a
   * frozen window for several minutes and made a rate limit look like a failure. Queuing keeps
   * mashing harmless — six clicks are six jobs run one at a time — and the progress list is where the
   * run reports itself.
   */
  static #onIngestPack(this: NoodlrMemoryApp, _event: Event, target: HTMLElement): void {
    const packId = target.dataset.pack;
    if (!packId) return;
    const silo = this.#selectedSilo(`silo-${packId}`);
    if (!silo) return;
    const label = target.dataset.label || packId;

    const queued = enqueueIngest(packTask(packId, label, silo, 0));
    if (!queued) {
      ui.notifications?.warn(game.i18n.format("NOODLR.Rag.Queue.Duplicate", { label }));
      return;
    }
    ui.notifications?.info(game.i18n.format("NOODLR.Rag.Queue.Queued", { label }));
  }

  static #onCancelJob(this: NoodlrMemoryApp, _event: Event, target: HTMLElement): void {
    const id = target.dataset.job;
    if (id) cancelIngest(id);
  }

  static #onResumeJob(this: NoodlrMemoryApp, _event: Event, target: HTMLElement): void {
    const id = target.dataset.job;
    if (!id) return;
    if (!resumeIngest(id)) ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.Queue.NoResume"));
  }

  static #onCancelAll(this: NoodlrMemoryApp): void {
    cancelAllIngest();
  }

  static #onClearFinished(this: NoodlrMemoryApp): void {
    clearFinishedIngest();
  }

  /**
   * Queue an upload through the same single-flight queue as the packs.
   *
   * Not because a single file is slow, but because it embeds against the same key: an upload fired
   * while a compendium is running is a second stream of requests at a rate limit that counts them.
   */
  static #onIngestFile(this: NoodlrMemoryApp): void {
    const root = this.element as HTMLElement | null;
    const fileInput = root?.querySelector<HTMLInputElement>('[data-role="file"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Rag.NoFile"));
      return;
    }
    const silo = this.#selectedSilo("silo-file");
    if (!silo) return;

    const queued = enqueueIngest(fileTask(file, silo));
    if (!queued) {
      ui.notifications?.warn(game.i18n.format("NOODLR.Rag.Queue.Duplicate", { label: file.name }));
      return;
    }
    ui.notifications?.info(game.i18n.format("NOODLR.Rag.Queue.Queued", { label: file.name }));
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
    const list = root?.querySelector<HTMLElement>('[data-role="export-files"]');
    const say = (text: string) => {
      if (status) status.textContent = text;
    };

    this.#releaseExportUrls();
    if (list) list.replaceChildren();

    say(game.i18n.format("NOODLR.Dev.ExportStart", { count: checked.length }));
    try {
      const { results, failures } = await exportPacks(
        checked,
        (p) => say(`${p.pack}: ${p.processed}/${p.total}`),
        (result) => this.#addExportLink(list, result),
      );

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

  /** Object URLs handed to the export links, released when the window closes or a run restarts. */
  #exportUrls: string[] = [];

  /**
   * Hold the blobs until the window closes.
   *
   * Revoking on a timer would be simpler and wrong: an export is tens of megabytes per pack and the
   * GM may work through a dozen links at their own pace, so a link that expired while they were
   * still saving would fail with nothing to explain it.
   */
  _onClose(options?: unknown): void {
    this.#releaseExportUrls();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    (super._onClose as ((o?: unknown) => void) | undefined)?.call(this, options);
  }

  /**
   * Offer one finished pack as a link the GM clicks.
   *
   * A link rather than a scripted download, because a scripted one cannot be made to work: browsers
   * block a burst of programmatic saves, so only the first arrives, and the rest fail with no error
   * anywhere. A click on a real anchor carries a user gesture, so every file saves and every file
   * keeps the name in its `download` attribute.
   */
  #addExportLink(list: HTMLElement | null | undefined, result: ExportResult): void {
    if (!list) return;
    const url = URL.createObjectURL(result.blob);
    this.#exportUrls.push(url);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.file;
    anchor.className = "noodlr-memory__exportfile";
    anchor.append(
      Object.assign(document.createElement("i"), { className: "fa-solid fa-download" }),
      document.createTextNode(
        ` ${result.file} — ${result.records} records, ${(result.bytes / 1_048_576).toFixed(1)} MB`,
      ),
    );
    // A saved link dims, so a long list stays legible about what is still outstanding.
    anchor.addEventListener("click", () => anchor.classList.add("is-saved"));
    list.append(anchor);
  }

  #releaseExportUrls(): void {
    for (const url of this.#exportUrls) URL.revokeObjectURL(url);
    this.#exportUrls = [];
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

  /**
   * Paint the queue on every change, and never through `render()`.
   *
   * A re-render would rebuild the whole window — 60-odd pack rows, every silo select back to its
   * default, the scroll position lost — several times a second while a rate-limit countdown ticks.
   * Same reasoning as the chat panel's streaming: patch the DOM, do not re-render mid-run.
   */
  #unsubscribe?: () => void;

  _onRender(context: unknown, options: unknown): void {
    (super._onRender as ((c: unknown, o: unknown) => void) | undefined)?.call(
      this,
      context,
      options,
    );
    this.#unsubscribe?.();
    this.#unsubscribe = onIngestQueueChange(() => this.#paintQueue());
    this.#paintQueue();
  }

  #paintQueue(): void {
    const root = this.element as HTMLElement | null;
    if (!root) return;
    const list = root.querySelector<HTMLElement>('[data-role="queue"]');
    const jobs = ingestJobs();
    const active = ingestActive();

    // Everything that would embed against the same key, or move the ground under a running job, is
    // locked while the queue has work. The ingest buttons are deliberately NOT locked: they queue.
    for (const sel of ['[data-action="ingestFile"]', '[data-action="exportPacks"]']) {
      root.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => (b.disabled = active));
    }
    root
      .querySelectorAll<HTMLButtonElement>('[data-action="resetSilo"]')
      .forEach((b) => (b.disabled = active));
    root.classList.toggle("is-ingesting", active);

    const empty = root.querySelector<HTMLElement>('[data-role="queue-empty"]');
    if (empty) empty.hidden = jobs.length > 0;
    if (!list) return;

    list.replaceChildren(...jobs.map((job) => queueRow(job)));
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

/**
 * One compendium pack, resumable from a document index.
 *
 * `key` deliberately omits `from`, so a resume of the same pack into the same silo is still
 * recognised as the same work and cannot be queued twice.
 */
export function packTask(packId: string, label: string, silo: SiloId, from: number): IngestTask {
  return {
    kind: "pack",
    label,
    silo,
    key: `pack:${packId}:${silo}`,
    spec: { type: "pack", pack: packId },
    startAt: from,
    run: (report, signal) => ingestCompendium(packId, silo, { from, report, signal }),
    resume: (next) => packTask(packId, label, silo, next),
  };
}

/**
 * Rebuild a persisted job after a page load.
 *
 * The pack label is re-read from Foundry rather than trusted from the setting: a renamed or
 * uninstalled module would otherwise leave a queue row naming something that no longer exists, and
 * an absent pack is a job to drop rather than one to run and fail.
 */
export function rebuildIngestTask(spec: IngestSpec, stored: StoredResume): IngestTask | null {
  if (spec.type !== "pack") return null;
  const pack = game.packs?.get(spec.pack);
  if (!pack) {
    warn(`stored ingest job dropped: compendium ${spec.pack} is not installed`);
    return null;
  }
  const label = pack.metadata?.label ?? stored.label ?? spec.pack;
  return packTask(spec.pack, label, stored.silo, stored.from);
}

/** One uploaded file. No `resume`: it is a single indivisible request with no index to restart at. */
function fileTask(file: File, silo: SiloId): IngestTask {
  return {
    kind: "file",
    label: file.name,
    silo,
    key: `file:${file.name}:${file.size}:${silo}`,
    run: (report, signal) => ingestUploadedFile(file, silo, { report, signal }),
  };
}

/** One row of the queue: a bar, a state line, and whichever of cancel/resume applies. */
function queueRow(job: IngestJobView): HTMLElement {
  const row = document.createElement("li");
  row.className = `noodlr-queue__job is-${job.status}`;

  const head = document.createElement("div");
  head.className = "noodlr-queue__head";
  const name = document.createElement("span");
  name.className = "noodlr-queue__label";
  name.textContent = `${job.label} → ${SILOS[job.silo]}`;
  head.append(name);

  if (job.status === "queued" || job.status === "running") {
    head.append(queueButton("cancelJob", job.id, "NOODLR.Rag.Queue.Cancel", "fa-xmark"));
  } else if (job.status !== "done" && job.resumable && job.resumeAt > 0) {
    head.append(queueButton("resumeJob", job.id, "NOODLR.Rag.Queue.Resume", "fa-rotate-right"));
  }
  row.append(head);

  // The bar is driven by documents processed, not by chunks inserted: chunk counts are unbounded
  // (one statblock can be several chunks) so they cannot express a fraction of the work.
  const pct = job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const track = document.createElement("div");
  track.className = "noodlr-queue__track";
  const fill = document.createElement("div");
  fill.className = "noodlr-queue__fill";
  fill.style.width = `${pct}%`;
  track.append(fill);
  row.append(track);

  const status = document.createElement("div");
  status.className = "noodlr-queue__status";
  status.textContent = queueStatusText(job, pct);
  row.append(status);
  return row;
}

function queueButton(action: string, id: string, key: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "noodlr-queue__btn";
  button.dataset.action = action;
  button.dataset.job = id;
  button.title = game.i18n.localize(key);
  button.append(Object.assign(document.createElement("i"), { className: `fa-solid ${icon}` }));
  return button;
}

function queueStatusText(job: IngestJobView, pct: number): string {
  const counts = game.i18n.format("NOODLR.Rag.Queue.Counts", {
    processed: job.processed,
    total: job.total || "?",
    chunks: job.inserted,
    percent: pct,
  });
  const state = game.i18n.localize(
    `NOODLR.Rag.Queue.Status.${job.status[0].toUpperCase()}${job.status.slice(1)}`,
  );
  // Skips are shown only when there are some, and they are the difference between "did nothing" and
  // "already had it": re-ingesting a stored pack now costs no embeddings and so reports 0 chunks.
  const reused =
    job.skipped > 0 ? game.i18n.format("NOODLR.Rag.Queue.Reused", { chunks: job.skipped }) : "";
  // The note carries the rate-limit countdown and the failure reason, which are the two things a GM
  // actually needs; it goes last so it is not truncated first when the window is narrow.
  return [state, counts, reused, job.note].filter(Boolean).join(" · ");
}
