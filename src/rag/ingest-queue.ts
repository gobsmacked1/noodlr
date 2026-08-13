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
//
// It also survives a RELOAD, which is the interruption the work is most likely to meet: the expected
// behaviour is a GM ticking a shelf of compendia and then going off to play, and a page refresh
// hours later must not silently abandon a half-ingested world. Outstanding jobs are written to a
// world setting and picked up on the next load, resuming from the last STORED batch so no embedding
// is paid for twice.

import { MODULE_ID, RAG_SETTINGS, debug, warn } from "../constants";
import { isPrimaryGM } from "../util/gm";
import { ingestFailureAdvice } from "./failure";
import { isSiloId, type SiloId } from "./silos";

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
  /**
   * Chunks the service already had and did not re-embed.
   *
   * Shown because a re-ingest is now honestly free: without this the row reads "0 chunks" and looks
   * like a run that did nothing, which is the same failure as a stand-aside that does not announce
   * itself. A GM who re-ticks a pack should be told it was already stored, not left guessing.
   */
  skipped: number;
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
  skipped?: number;
  note?: string;
  /** Documents confirmed stored, so an interrupted run can be resumed rather than repeated. */
  resumeAt?: number;
}

export interface IngestOutcome {
  documents: number;
  inserted: number;
  skipped?: number;
}

/**
 * The serializable half of a task: enough to rebuild it after a reload, and nothing else.
 *
 * A task's `run` is a closure and a file upload holds a `File`, neither of which crosses a page
 * load, so this is the only thing persistence can store. A task that omits it is simply not
 * persisted — which is the honest outcome for an upload, since the bytes are gone with the page.
 */
export interface IngestSpec {
  /** Which rebuilder to call. Today only `"pack"` can be reconstructed from a setting. */
  type: "pack";
  /** Compendium pack id. */
  pack: string;
}

export interface IngestTask {
  kind: IngestJobKind;
  label: string;
  silo: SiloId;
  /** Stable identity, so mashing the same button twice does not queue the same work twice. */
  key: string;
  /** Present when the job can be rebuilt on a later page load. */
  spec?: IngestSpec;
  /**
   * Where this task already starts from, for a resumed job.
   *
   * Without it a queued resume reads as `resumeAt: 0` until its first batch lands, so a reload (or a
   * cancel) in that window would throw away progress the run had already been given.
   */
  startAt?: number;
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
  /** The client that queued it, so a reload elsewhere does not steal a running job. */
  owner: string;
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
  schedulePersist();
}

// --- Persistence -------------------------------------------------------------------------------
//
// Written on change and read once at load. Two deliberate shapes:
//
// - Only the OUTSTANDING jobs are stored. A finished list is session furniture; restoring it would
//   put a "done" row in front of a GM who has since ingested and reset the silo twice.
// - The write is debounced, because `changed()` also fires on every progress report — once a second
//   during a rate-limit countdown. A world setting is a socket round trip and a database write, so a
//   per-tick save would spend the GM's Foundry server on a progress bar. A structural change
//   (enqueue, cancel, finish) flushes immediately, since that is the state worth not losing.
// - Only the PRIMARY GM writes. Assistant GMs pass `isGM` too, so several clients can hold a queue,
//   and each would serialize its own view over the other's — one setting, last writer wins, neither
//   with the whole picture. Single-writer avoids inventing a merge protocol for one string. The cost
//   is real and small: an assistant GM's own queue is not resumable across their reload, so their
//   rows are carried through untouched (below) rather than deleted by somebody else's save.

interface StoredJob {
  key: string;
  kind: IngestJobKind;
  label: string;
  silo: SiloId;
  spec: IngestSpec;
  resumeAt: number;
  /**
   * The client that owns the run.
   *
   * Assistant GMs also pass `isGM`, so two GM clients can both hold a queue. On load we only adopt a
   * job whose owner is us or is no longer connected: adopting one that another GM is actively
   * running would put two ingests on the same key, which is exactly what this queue exists to stop.
   */
  owner: string;
}

const PERSIST_DEBOUNCE_MS = 3000;
let persistTimer: number | undefined;
/**
 * What the setting already holds, so a redundant save is skipped.
 *
 * Seeded from disk during restore rather than left empty: otherwise a stored queue whose every job
 * was dropped (uninstalled compendium, or another GM still running it) compares equal to the empty
 * string and is never cleared, so the same dead rows are re-examined on every load forever.
 */
let lastWritten = "";
/** Suppresses the per-enqueue flush while restore is adopting a batch; one write covers all of it. */
let restoring = false;
/**
 * Stored rows belonging to another GM client that is still connected and running them.
 *
 * Carried through every later save so this client's view does not delete work it can see but must
 * not touch. They are adopted normally on a load where that client is gone, which makes an abandoned
 * job self-healing rather than orphaned.
 */
let foreign: StoredJob[] = [];

function serialize(): string {
  const rows: StoredJob[] = [];
  for (const job of jobs) {
    if (job.status !== "queued" && job.status !== "running") continue;
    const spec = job.task.spec;
    if (!spec) continue;
    rows.push({
      key: job.key,
      kind: job.kind,
      label: job.label,
      silo: job.silo,
      spec,
      resumeAt: job.resumeAt,
      owner: job.owner,
    });
  }
  const mine = new Set(rows.map((r) => r.key));
  for (const row of foreign) if (!mine.has(row.key)) rows.push(row);
  return rows.length > 0 ? JSON.stringify(rows) : "";
}

function writeNow(): void {
  if (restoring) return;
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (!isPrimaryGM()) return;
  const payload = serialize();
  if (payload === lastWritten) return;
  lastWritten = payload;
  // Fire and forget: a failed save costs the resume, never the run in progress.
  void Promise.resolve(game.settings.set(MODULE_ID, RAG_SETTINGS.ingestQueue, payload)).catch(
    (err: unknown) => warn(`could not save the ingest queue: ${(err as Error).message}`),
  );
}

function schedulePersist(): void {
  if (persistTimer !== undefined) return;
  persistTimer = globalThis.setTimeout(() => {
    persistTimer = undefined;
    writeNow();
  }, PERSIST_DEBOUNCE_MS) as unknown as number;
}

/**
 * Re-queue whatever was outstanding when the page went away.
 *
 * `rebuild` is passed in rather than looked up from a registry so this module stays ignorant of what
 * a compendium is; `memory-app.ts` owns the task shapes and hands over the one function that can
 * reconstruct them. Returns the number of jobs adopted.
 */
export function restoreIngestQueue(
  rebuild: (spec: IngestSpec, stored: StoredResume) => IngestTask | null,
): number {
  let raw = "";
  try {
    raw = (game.settings.get(MODULE_ID, RAG_SETTINGS.ingestQueue) as string) ?? "";
  } catch {
    return 0;
  }
  if (!raw.trim()) return 0;

  let rows: StoredJob[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) rows = parsed as StoredJob[];
  } catch (err) {
    warn(`stored ingest queue is unreadable, discarding it: ${(err as Error).message}`);
    lastWritten = "";
    writeNow();
    return 0;
  }

  // What was on disk, so the write below is skipped when nothing has actually changed — and so a
  // stored queue whose every row was dropped IS cleared rather than re-examined on every load.
  lastWritten = raw;
  foreign = [];

  let adopted = 0;
  restoring = true;
  try {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      if (!isSiloId(row.silo) || row.spec?.type !== "pack") continue;
      // Leave a job alone while the client that started it is still connected and running it.
      if (row.owner && row.owner !== game.user?.id && game.users?.get?.(row.owner)?.active) {
        debug("ingest queue: leaving a job with its owner", row.key, row.owner);
        foreign.push(row);
        continue;
      }
      const task = rebuild(row.spec, {
        label: String(row.label ?? row.spec.pack),
        silo: row.silo,
        from: Math.max(0, Number(row.resumeAt) || 0),
      });
      if (!task) continue;
      if (enqueueIngest(task)) adopted++;
    }
  } finally {
    restoring = false;
  }
  if (adopted > 0) debug("ingest queue: resumed", adopted, "job(s) after reload");
  writeNow();
  return adopted;
}

/** The stored state a rebuilt task needs: where to start, and what to call it. */
export interface StoredResume {
  label: string;
  silo: SiloId;
  from: number;
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
    owner: game.user?.id ?? "",
    kind: task.kind,
    label: task.label,
    silo: task.silo,
    status: "queued",
    phase: "idle",
    processed: 0,
    total: 0,
    inserted: 0,
    skipped: 0,
    note: "",
    resumeAt: Math.max(0, task.startAt ?? 0),
    resumable: typeof task.resume === "function",
  };
  jobs.push(job);
  changed();
  writeNow();
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
    writeNow();
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
        if (r.skipped !== undefined) job.skipped = r.skipped;
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
        job.skipped = outcome.skipped ?? job.skipped;
        job.note = "";
      } catch (err) {
        const aborted = job.controller.signal.aborted;
        job.status = aborted ? "cancelled" : "failed";
        const raw = (err as Error).message ?? String(err);
        // A known cause is reported in the operator's terms, not the wire's. The job kept its resume
        // index, so a refusal needs to say "press Resume in a minute" rather than quote a 429 body
        // that reads like the memory service broke — and on Lite, where no provider exists to refuse,
        // the same slot carries Lite's own diagnosis. Full detail still goes to the console.
        job.note = aborted ? "" : ingestFailureAdvice(err) || raw;
        if (!aborted) warn(`ingest failed (${job.label}): ${raw}`);
      } finally {
        job.phase = "idle";
        job.finishedAt = Date.now();
        job.controller = undefined;
        debug("ingest job finished", job.id, job.status, job.processed, job.inserted);
        changed();
        // Immediately, not on the debounce: a reload in the next three seconds must not re-queue a
        // pack that has just finished, and a failure's resumeAt is the one number worth keeping.
        writeNow();
      }
    }
  } finally {
    pumping = false;
  }
}
