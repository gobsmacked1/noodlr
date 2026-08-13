// One ingest at a time, with a visible queue.
//
// Ingest was fire-and-forget behind a `#busy` flag on the window, which is not the same thing: the
// flag only guarded re-entry into one handler, so nothing stopped a second window (or a reload
// mid-run) from starting a parallel ingest against the same API key. Two ingests do not go twice as
// fast — they halve the per-request budget of a rate limit that counts requests, so a table with a
// modest key can reach a state where nothing ever finishes. Serializing them is therefore a
// correctness measure, not merely tidiness.
//
// The queue is module-level, deliberately: a run must survive the GM closing the window, and both
// the Manage Memory window and any future caller have to see the same one. Memory access is
// GM-gated (see retrieval.ts), so there is exactly one client doing this.

import { debug, warn } from "../constants";
import type { SiloId } from "./silos";

export type IngestJobKind = "pack" | "file";
export type IngestJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** What a running job is doing right now. `waiting` is the rate limit, and it has to be visible. */
export type IngestPhase = "loading" | "sending" | "waiting" | "idle";

export interface IngestJobView {
  id: string;
  kind: IngestJobKind;
  label: string;
  silo: SiloId;
  status: IngestJobStatus;
  phase: IngestPhase;
  processed: number;
  total: number;
  inserted: number;
  /** Human-readable detail for the current phase (the wait remaining, the failure reason). */
  note: string;
  /** Document index a resume would start from; 0 when nothing has landed yet. */
  resumeAt: number;
  /** Whether this job can be picked up where it stopped (a pack can; a single upload cannot). */
  resumable: boolean;
  startedAt?: number;
  finishedAt?: number;
}

export interface IngestReport {
  phase?: IngestPhase;
  processed?: number;
  total?: number;
  inserted?: number;
  note?: string;
  /** Documents confirmed stored, so an interrupted run can be resumed rather than repeated. */
  resumeAt?: number;
}

export interface IngestOutcome {
  documents: number;
  inserted: number;
}

export interface IngestTask {
  kind: IngestJobKind;
  label: string;
  silo: SiloId;
  /** Stable identity, so mashing the same button twice does not queue the same work twice. */
  key: string;
  run(report: (r: IngestReport) => void, signal: AbortSignal): Promise<IngestOutcome>;
  /**
   * Build the same task again, starting from `from`.
   *
   * Present only where resuming is meaningful: a compendium is an ordered list of documents, so
   * picking up where it stopped skips exactly the embeddings already paid for. An uploaded file is
   * one indivisible request and has nothing to resume from, so it omits this and no button appears.
   */
  resume?(from: number): IngestTask;
}

interface QueuedJob extends IngestJobView {
  key: string;
  task: IngestTask;
  controller?: AbortController;
}

const jobs: QueuedJob[] = [];
const listeners = new Set<() => void>();
let pumping = false;
let counter = 0;

function changed(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      warn(`ingest queue listener failed: ${(err as Error).message}`);
    }
  }
}

/** Subscribe to any queue change; returns an unsubscribe. */
export function onIngestQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function ingestJobs(): IngestJobView[] {
  return jobs.map((job) => ({ ...job }));
}

/** True while anything is queued or running — the signal the window uses to lock competing actions. */
export function ingestActive(): boolean {
  return jobs.some((job) => job.status === "queued" || job.status === "running");
}

/**
 * Add a job, unless the same work is already queued or running.
 *
 * The duplicate guard is on `key` rather than on a busy flag because queueing is the right answer to
 * a GM clicking six packs: they all get done, one after another, and the interface says so. What
 * must not happen is the *same* pack being ingested twice, which doubles the rows for no benefit.
 * Returns the job id, or null when it was a duplicate.
 */
export function enqueueIngest(task: IngestTask): string | null {
  const existing = jobs.find(
    (job) => job.key === task.key && (job.status === "queued" || job.status === "running"),
  );
  if (existing) return null;

  const job: QueuedJob = {
    id: `job-${++counter}`,
    key: task.key,
    task,
    kind: task.kind,
    label: task.label,
    silo: task.silo,
    status: "queued",
    phase: "idle",
    processed: 0,
    total: 0,
    inserted: 0,
    note: "",
    resumeAt: 0,
    resumable: typeof task.resume === "function",
  };
  jobs.push(job);
  changed();
  void pump();
  return job.id;
}

/**
 * Stop a job. A queued one is dropped; a running one is aborted where it stands.
 *
 * A cancelled run keeps its `resumeAt`, because the rows already written are real: re-ingesting them
 * would duplicate work the GM has already paid an embedding provider for.
 */
export function cancelIngest(id: string): void {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  if (job.status === "queued") {
    job.status = "cancelled";
    job.note = game.i18n?.localize("NOODLR.Rag.Queue.Cancelled") ?? "cancelled";
    job.finishedAt = Date.now();
    changed();
    return;
  }
  if (job.status === "running") job.controller?.abort();
}

/** Cancel everything outstanding — the panic button when a provider is refusing work. */
export function cancelAllIngest(): void {
  for (const job of [...jobs]) {
    if (job.status === "queued" || job.status === "running") cancelIngest(job.id);
  }
}

/**
 * Queue the unfinished remainder of a stopped job, starting at the last STORED batch.
 *
 * That index is the whole reason the ingest loop reports one: a pack that stopped 3,000 documents
 * into a rate limit should cost the remaining documents, not all of them again.
 */
export function resumeIngest(id: string): string | null {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.status === "queued" || job.status === "running") return null;
  const next = job.task.resume?.(job.resumeAt);
  if (!next) return null;
  return enqueueIngest(next);
}

/** Drop finished rows so the list stays readable across a long session. */
export function clearFinishedIngest(): void {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].status !== "queued" && jobs[i].status !== "running") jobs.splice(i, 1);
  }
  changed();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const job = jobs.find((j) => j.status === "queued");
      if (!job) return;

      job.status = "running";
      job.phase = "loading";
      job.startedAt = Date.now();
      job.controller = new AbortController();
      changed();

      // Coalesce the reports: a batch of 25 documents fires one, and a rate-limit countdown fires
      // one a second, so a listener that re-renders is called at a sane rate either way.
      const report = (r: IngestReport) => {
        if (r.phase !== undefined) job.phase = r.phase;
        if (r.processed !== undefined) job.processed = r.processed;
        if (r.total !== undefined) job.total = r.total;
        if (r.inserted !== undefined) job.inserted = r.inserted;
        if (r.resumeAt !== undefined) job.resumeAt = r.resumeAt;
        if (r.note !== undefined) job.note = r.note;
        changed();
      };

      try {
        const outcome = await job.task.run(report, job.controller.signal);
        job.status = job.controller.signal.aborted ? "cancelled" : "done";
        job.processed = Math.max(job.processed, outcome.documents);
        job.total = Math.max(job.total, outcome.documents);
        job.inserted = outcome.inserted;
        job.note = "";
      } catch (err) {
        const aborted = job.controller.signal.aborted;
        job.status = aborted ? "cancelled" : "failed";
        job.note = aborted ? "" : ((err as Error).message ?? String(err));
        if (!aborted) warn(`ingest failed (${job.label}): ${job.note}`);
      } finally {
        job.phase = "idle";
        job.finishedAt = Date.now();
        job.controller = undefined;
        debug("ingest job finished", job.id, job.status, job.processed, job.inserted);
        changed();
      }
    }
  } finally {
    pumping = false;
  }
}
