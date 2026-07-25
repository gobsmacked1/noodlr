// Retry / Reject controls + deferred RAG commit for AI-generated media outputs (image, music,
// video). Each output is posted as a chat card carrying a `noodlr.artifact` flag, and because
// Foundry syncs chat messages to every client we get the cross-client coordination for free:
//
//  - Every client draws Retry/Reject on the card, but only for the DM or the user who generated
//    it (the author). Each client independently disables the controls at
//    `message.timestamp + RETRY_WINDOW_MS`, so the 60 s window starts the moment the finished
//    output is displayed and needs no broadcast.
//  - Only the GM writes to RAG, so only the GM schedules the deferred commit (from the
//    createChatMessage hook) and cancels it if the card is deleted (Reject / Retry-replace).
//  - Players can't delete chat messages or edit the GM's playlists, so a player's Retry/Reject
//    asks the GM to "retire" the card over the module socket; the GM performs the delete + any
//    cleanup (e.g. removing a generated music track).
//
// Retry = retire the current output + regenerate from the stored spec (a fresh card, fresh
// window). Reject = retire only, committing nothing. After the window closes the GM commits and
// the controls vanish; a DM can still prune RAG by hand afterwards.

import { MODULE_ID, SOCKET, RETRY_WINDOW_MS, log } from "../constants";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";
import type { SiloId } from "../rag/silos";
import { setLedgerEntry, type LedgerEntry } from "../media/storage";
import type { ImageKind } from "../media/config";
import { bumpStats } from "../util/stats";

/** Everything needed to reproduce an output when the user hits Retry. */
export interface RegenSpec {
  fn: "image" | "music" | "video";
  kind?: ImageKind;
  description: string;
  entityKey?: string;
  seconds?: number;
}

/** What the GM commits to memory when the window closes (all optional/best-effort). */
export interface ArtifactCommit {
  /** A document to ingest into a RAG silo (the prompt/seed metadata for continuity). */
  rag?: { silo: SiloId; text: string; metadata: Record<string, unknown> };
  /** A continuity-ledger entry to write (keyed images: portraits/tokens). */
  ledger?: { kind: ImageKind; entityKey: string; entry: LedgerEntry };
}

/** Resources to tear down when an output is rejected/retried (GM-side). */
export interface ArtifactCleanup {
  /** A generated PlaylistSound to remove (music). */
  playlist?: { playlistId: string; soundId: string };
}

/** The chat-card flag payload identifying a Noodlr output artifact. */
export interface ArtifactFlag {
  id: string;
  /** game.user.id of whoever generated it (governs who may Retry/Reject besides the GM). */
  authorId: string;
  gen: RegenSpec;
  commit?: ArtifactCommit;
  cleanup?: ArtifactCleanup;
}

/** Caller-supplied portion of the flag (author is filled in from the current user). */
export type ArtifactInput = Pick<ArtifactFlag, "gen" | "commit" | "cleanup">;

interface RetireSocket {
  type: "artifact-retire";
  messageId: string;
  by: string;
}

export function makeArtifactId(): string {
  return `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build the flags object for a media chat card, stamping the current user as the author. */
export function artifactFlags(input: ArtifactInput): Record<string, unknown> {
  const flag: ArtifactFlag = {
    id: makeArtifactId(),
    authorId: game.user?.id ?? "",
    gen: input.gen,
    commit: input.commit,
    cleanup: input.cleanup,
  };
  return { [MODULE_ID]: { sceneArt: true, artifact: flag } };
}

function getArtifact(message: any): ArtifactFlag | undefined {
  return message?.getFlag?.(MODULE_ID, "artifact") as ArtifactFlag | undefined;
}

function canControl(art: ArtifactFlag): boolean {
  return Boolean(game.user?.isGM) || game.user?.id === art.authorId;
}

// ---- GM-side deferred commit ----------------------------------------------------------------

const commitTimers = new Map<string, number>();

function scheduleCommit(messageId: string, commit: ArtifactCommit, startedAt: number): void {
  if (commitTimers.has(messageId)) return;
  const delay = Math.max(0, startedAt + RETRY_WINDOW_MS - Date.now());
  const t = window.setTimeout(() => {
    commitTimers.delete(messageId);
    void doCommit(commit);
  }, delay);
  commitTimers.set(messageId, t);
}

function cancelCommit(messageId: string): void {
  const t = commitTimers.get(messageId);
  if (t !== undefined) {
    clearTimeout(t);
    commitTimers.delete(messageId);
  }
}

async function doCommit(commit: ArtifactCommit): Promise<void> {
  try {
    if (commit.ledger) {
      await setLedgerEntry(commit.ledger.kind, commit.ledger.entityKey, commit.ledger.entry);
    }
    if (commit.rag && isRagEnabled()) {
      const res = await getRagClient().ingest(
        commit.rag.silo,
        [{ text: commit.rag.text, metadata: commit.rag.metadata }],
        getEmbedOverride(),
      );
      bumpStats({ ingestDocs: res?.inserted ?? 1, ingestChunks: res?.chunks ?? 0 });
    }
  } catch (err) {
    log("artifact commit failed:", err);
  }
}

// ---- Retire (delete card + cleanup) ---------------------------------------------------------

async function runCleanup(cleanup: ArtifactCleanup): Promise<void> {
  if (cleanup.playlist && game.user?.isGM) {
    try {
      const pl = game.playlists?.get(cleanup.playlist.playlistId);
      await pl?.deleteEmbeddedDocuments("PlaylistSound", [cleanup.playlist.soundId]);
    } catch (err) {
      log("artifact music cleanup failed:", err);
    }
  }
}

/** GM-authoritative retire: cancel the pending commit, tear down resources, delete the card. */
async function retireLocal(message: any): Promise<void> {
  cancelCommit(message.id);
  const art = getArtifact(message);
  if (art?.cleanup) await runCleanup(art.cleanup);
  try {
    await message.delete();
  } catch (err) {
    log("artifact retire delete failed:", err);
  }
}

/** Retire from the clicking client: GM does it directly; a player asks the GM over the socket. */
async function requestRetire(message: any): Promise<void> {
  if (game.user?.isGM) {
    await retireLocal(message);
    return;
  }
  const payload: RetireSocket = { type: "artifact-retire", messageId: message.id, by: game.user?.id ?? "" };
  game.socket?.emit(SOCKET, payload);
  // Optimistically drop the controls locally so the player gets immediate feedback.
  removeActions(message.id);
}

/** GM handler for a player's socket retire request. Verifies the requester is the author. */
export function handleArtifactSocket(data: unknown): void {
  if (!game.user?.isGM) return;
  const d = data as Partial<RetireSocket> | undefined;
  if (d?.type !== "artifact-retire" || !d.messageId) return;
  const message = (game.messages as any)?.get(d.messageId);
  if (!message) return;
  const art = getArtifact(message);
  // Only the author may retire via socket (the GM never uses the socket — it retires locally).
  if (art && d.by && art.authorId !== d.by) return;
  void retireLocal(message);
}

// ---- Regeneration (Retry) -------------------------------------------------------------------

async function regenerate(gen: RegenSpec): Promise<void> {
  try {
    if (gen.fn === "image") {
      const { createAndShareImage } = await import("../media/scene-art");
      await createAndShareImage(
        { description: gen.description, entityKey: gen.entityKey, title: gen.entityKey },
        gen.kind ?? "image",
      );
    } else if (gen.fn === "music") {
      const { createAndPlayMusic } = await import("../media/av-gen");
      await createAndPlayMusic({ description: gen.description, seconds: gen.seconds });
    } else if (gen.fn === "video") {
      const { createAndShareVideo } = await import("../media/av-gen");
      await createAndShareVideo({ description: gen.description, seconds: gen.seconds });
    }
  } catch (err) {
    log("artifact regenerate failed:", err);
  }
}

async function onRetry(message: any): Promise<void> {
  const art = getArtifact(message);
  if (!art || !canControl(art)) return;
  await requestRetire(message);
  void regenerate(art.gen);
}

async function onReject(message: any): Promise<void> {
  const art = getArtifact(message);
  if (!art || !canControl(art)) return;
  await requestRetire(message);
}

// ---- Rendering the controls -----------------------------------------------------------------

/** Remove any Retry/Reject controls currently drawn for a given message id. */
function removeActions(messageId: string): void {
  document
    .querySelectorAll(`[data-message-id="${messageId}"] .noodlr-artifact-actions`)
    .forEach((el) => el.remove());
}

function buildActions(message: any): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "noodlr-artifact-actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "noodlr-artifact-btn noodlr-artifact-btn--retry";
  retry.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${game.i18n.localize("NOODLR.Artifact.Retry")}`;
  retry.title = game.i18n.localize("NOODLR.Artifact.RetryHint");
  retry.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void onRetry(message);
  });

  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "noodlr-artifact-btn noodlr-artifact-btn--reject";
  reject.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${game.i18n.localize("NOODLR.Artifact.Reject")}`;
  reject.title = game.i18n.localize("NOODLR.Artifact.RejectHint");
  reject.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void onReject(message);
  });

  wrap.append(retry, reject);
  return wrap;
}

/** renderChatMessage(HTML) hook: inject the controls for the DM/author while the window is open. */
function onRenderChatMessage(message: any, html: unknown): void {
  const art = getArtifact(message);
  if (!art || !canControl(art)) return;

  // The hook passes an HTMLElement (v13 `renderChatMessageHTML`) or a jQuery object (legacy
  // `renderChatMessage`); normalize to the message root element.
  const root: HTMLElement | undefined =
    html instanceof HTMLElement ? html : ((html as any)?.[0] as HTMLElement | undefined);
  if (!root) return;
  if (root.querySelector(".noodlr-artifact-actions")) return;

  const startedAt = Number(message.timestamp ?? Date.now());
  const remaining = startedAt + RETRY_WINDOW_MS - Date.now();
  if (remaining <= 0) return; // window already closed — output is committed, no controls

  const container = root.querySelector(".message-content") ?? root;
  const actions = buildActions(message);
  container.appendChild(actions);
  // Independently disable on every client when the shared window elapses.
  window.setTimeout(() => actions.remove(), remaining);
}

/** Register all artifact hooks. Call once on ready. */
export function registerArtifactHooks(): void {
  // Both hook names are registered for v13/v14 compatibility; the double-injection guard in
  // onRenderChatMessage prevents duplicate controls if both fire.
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("renderChatMessage", onRenderChatMessage);

  Hooks.on("createChatMessage", (message: any) => {
    if (!game.user?.isGM) return;
    const art = getArtifact(message);
    if (!art?.commit) return;
    scheduleCommit(message.id, art.commit, Number(message.timestamp ?? Date.now()));
  });

  Hooks.on("deleteChatMessage", (message: any) => {
    if (!game.user?.isGM) return;
    cancelCommit(message.id);
  });
}
