// Push-to-log voice capture. Click-to-start/click-to-stop capture for any participant:
// MediaRecorder records ~N-second segments, each is transcribed via the Whisper-style
// endpoint, then (GM-side) posted to chat, appended to a session journal, and buffered
// for periodic RAG ingestion into the `chat` silo. Non-GM clients relay their transcript
// text to the GM over the module socket (players transcribe locally; only text crosses
// the wire — cheap and privacy-preserving).
//
// UNTESTED in a live Foundry world (needs mic permission + a transcription endpoint).
// Written defensively; verify getUserMedia/MediaRecorder cycling in-app.

import { MODULE_ID, SOCKET, log } from "../constants";
import { getPushToLogConfig, getTranscriptionEnabled } from "./config";
import { transcribeAudio } from "./transcription";
import { getEmbedOverride, getRagClient, isRagEnabled } from "../rag/config";
import { bumpStats } from "../util/stats";

export interface TranscriptPayload {
  type: "transcript";
  speaker: string;
  text: string;
  ts: number;
}

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  const MR = (globalThis as any).MediaRecorder;
  if (MR?.isTypeSupported) {
    for (const c of candidates) if (MR.isTypeSupported(c)) return c;
  }
  return "";
}

class PushToLogController {
  #active = false;
  #recorder: MediaRecorder | null = null;
  #stream: MediaStream | null = null;
  #chunks: Blob[] = [];
  #segTimer: number | null = null;
  #ingestTimer: number | null = null;
  #buffer: string[] = [];
  #mime = "";
  #stopResolve: (() => void) | null = null;

  get active(): boolean {
    return this.#active;
  }

  async start(): Promise<void> {
    if (this.#active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      ui.notifications?.error(game.i18n.localize("NOODLR.Media.NoMic"));
      return;
    }
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      log("microphone access denied:", err);
      ui.notifications?.error(game.i18n.localize("NOODLR.Media.MicDenied"));
      return;
    }
    this.#mime = pickMimeType();
    this.#active = true;
    this.#beginSegment();

    if (game.user?.isGM) {
      const { ingestInterval } = getPushToLogConfig();
      this.#ingestTimer = window.setInterval(() => void this.#flushIngest(), ingestInterval * 1000);
    }
    updateButton(this.#active);
    ui.notifications?.info(game.i18n.localize("NOODLR.Media.PushStarted"));
  }

  #beginSegment(): void {
    if (!this.#active || !this.#stream) return;
    const rec = this.#mime
      ? new MediaRecorder(this.#stream, { mimeType: this.#mime })
      : new MediaRecorder(this.#stream);
    this.#recorder = rec;
    this.#chunks = [];

    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.#chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(this.#chunks, { type: this.#mime || "audio/webm" });
      if (blob.size > 0) void this.#handleSegment(blob);
      if (this.#active) this.#beginSegment();
      else this.#stopResolve?.();
    };

    rec.start();
    const { segmentSeconds } = getPushToLogConfig();
    this.#segTimer = window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, segmentSeconds * 1000);
  }

  async #handleSegment(blob: Blob): Promise<void> {
    let text = "";
    try {
      const ext = this.#mime.includes("ogg") ? "ogg" : this.#mime.includes("mp4") ? "mp4" : "webm";
      text = await transcribeAudio(blob, `segment.${ext}`);
    } catch (err) {
      log("transcription failed for a segment:", err);
      return;
    }
    if (!text) return;
    const payload: TranscriptPayload = {
      type: "transcript",
      speaker: game.user?.name ?? "Player",
      text,
      ts: Date.now(),
    };
    if (game.user?.isGM) this.handleTranscript(payload);
    else game.socket?.emit(SOCKET, payload);
  }

  /** GM-side handling of a transcript (local or relayed). */
  handleTranscript(p: TranscriptPayload): void {
    if (!game.user?.isGM) return;
    const { postChat, ingest } = getPushToLogConfig();
    if (postChat) void this.#postChat(p);
    void this.#appendJournal(p);
    if (ingest) this.#buffer.push(`${p.speaker}: ${p.text}`);
  }

  async #postChat(p: TranscriptPayload): Promise<void> {
    try {
      const ChatMessage = (globalThis as any).ChatMessage;
      const content = `<span class="noodlr-transcript"><strong>${foundry.utils.escapeHTML(
        p.speaker,
      )}:</strong> ${foundry.utils.escapeHTML(p.text)}</span>`;
      await ChatMessage.create({ content, flags: { [MODULE_ID]: { transcript: true } } });
    } catch (err) {
      log("could not post transcript to chat:", err);
    }
  }

  async #appendJournal(p: TranscriptPayload): Promise<void> {
    try {
      const entry = await getOrCreateSessionJournal();
      const page = entry.pages?.contents?.[0];
      if (!page) return;
      const stamp = new Date(p.ts).toLocaleTimeString();
      const prev = page.text?.content ?? "";
      const line = `<p><strong>${foundry.utils.escapeHTML(p.speaker)}</strong> <em>[${stamp}]</em>: ${foundry.utils.escapeHTML(p.text)}</p>`;
      await page.update({ "text.content": prev + line });
    } catch (err) {
      log("could not append to session journal:", err);
    }
  }

  async #flushIngest(): Promise<void> {
    if (this.#buffer.length === 0 || !isRagEnabled()) return;
    const text = this.#buffer.join("\n");
    this.#buffer = [];
    try {
      const res = await getRagClient().ingest(
        "chat",
        [{ text, metadata: { source: "push-to-log", ts: Date.now() } }],
        getEmbedOverride(),
      );
      bumpStats({ ingestDocs: res.inserted ?? 0, ingestChunks: res.chunks ?? 0 });
    } catch (err) {
      log("push-to-log ingest failed (will retry next interval):", err);
    }
  }

  async stop(): Promise<void> {
    if (!this.#active) return;
    this.#active = false;
    if (this.#segTimer !== null) window.clearTimeout(this.#segTimer);
    if (this.#ingestTimer !== null) window.clearInterval(this.#ingestTimer);
    this.#segTimer = null;
    this.#ingestTimer = null;

    await new Promise<void>((resolve) => {
      this.#stopResolve = resolve;
      if (this.#recorder && this.#recorder.state !== "inactive") this.#recorder.stop();
      else resolve();
    });

    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
    this.#recorder = null;
    await this.#flushIngest();
    updateButton(this.#active);
    ui.notifications?.info(game.i18n.localize("NOODLR.Media.PushStopped"));
  }

  toggle(): void {
    if (this.#active) void this.stop();
    else void this.start();
  }
}

export const pushToLog = new PushToLogController();

async function getOrCreateSessionJournal(): Promise<any> {
  const existing = game.journal?.find((j: any) => j.getFlag?.(MODULE_ID, "sessionLog"));
  if (existing) return existing;
  const JournalEntry = (globalThis as any).JournalEntry;
  return JournalEntry.create({
    name: `Noodlr Session Log — ${new Date().toLocaleDateString()}`,
    flags: { [MODULE_ID]: { sessionLog: true } },
    pages: [{ name: "Transcript", type: "text", text: { content: "" } }],
  });
}

// ---- floating button (bottom-center) ----

const BUTTON_ID = "noodlr-ptl-button";

export function createPushToLogButton(): void {
  if (document.getElementById(BUTTON_ID)) return;
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.className = "noodlr-ptl-button";
  btn.title = game.i18n.localize("NOODLR.Media.PushButton");
  btn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
  btn.addEventListener("click", () => pushToLog.toggle());
  document.body.appendChild(btn);
}

/** Add or remove the floating mic button to match the transcription-enabled setting. */
export function refreshPushToLogButton(): void {
  const enabled = getTranscriptionEnabled();
  const existing = document.getElementById(BUTTON_ID);
  if (enabled && !existing) createPushToLogButton();
  else if (!enabled && existing) {
    if (pushToLog.active) pushToLog.toggle();
    existing.remove();
  }
}

function updateButton(active: boolean): void {
  const btn = document.getElementById(BUTTON_ID);
  if (!btn) return;
  btn.classList.toggle("is-recording", active);
  btn.innerHTML = active
    ? `<i class="fa-solid fa-stop"></i>`
    : `<i class="fa-solid fa-microphone"></i>`;
}
