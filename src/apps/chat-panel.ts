// GM co-pilot chat panel: streaming DM chat with real Foundry dice. Built on
// ApplicationV2 + Handlebars (Foundry v14). The Handlebars template renders the static
// shell once; message bubbles and streaming deltas are applied to the DOM imperatively
// so we never re-render (and lose) the live transcript.
//
// The latest DM turn carries Retry/Reject controls with a 60 s window (see RETRY_WINDOW_MS):
// Retry regenerates the last prompt, Reject drops the exchange, and — on the GM's panel only —
// the turn is committed to the `chat` RAG silo when the window closes (players never write RAG).

import { MODULE_ID, RETRY_WINDOW_MS } from "../constants";
import { Conversation } from "../chat/conversation";
import { ChatClientError } from "../providers/chat-client";
import { getFeatureConfig } from "../providers/config";
import { isConfigured } from "../providers/types";
import { renderMarkdown } from "../util/markdown";
import { sanitizeUserText } from "../util/sanitize";
import type { ResolvedRoll } from "../dice/roll-macros";
import { getTtsAutoRead } from "../media/config";
import { speak } from "../media/tts";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";
import { bumpStats } from "../util/stats";
import { log } from "../constants";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** One rendered line of the visible transcript (kept separately from the model message list, which
 *  also contains internal roll-continuation turns we don't want to show). */
interface TranscriptEntry {
  role: "user" | "assistant" | "error";
  author: string;
  /** Rendered HTML when `html` is true, otherwise plain text. */
  content: string;
  html: boolean;
}

/** Mutable state for the most-recent (retry-able) turn. */
interface ActiveTurn {
  /** #transcript length and log child count captured before the user bubble was appended. */
  startTranscriptLen: number;
  startChildCount: number;
  /** The human prompt that produced this turn (for Retry + RAG commit). */
  promptText: string;
  promptAuthor: string;
  /** Latest assistant final text (a roll continuation can produce more than one). */
  finalText: string;
  /** Latest assistant bubble container (where the controls are attached). */
  assistantMsgEl: HTMLElement | null;
  actionsEl: HTMLElement | null;
  disableTimer: number | null;
  commitTimer: number | null;
  /** GM-prep mode: keep this turn's output in the panel only (don't mirror to players). */
  hidden: boolean;
  /** The public chat-log message mirroring this turn's narration to players (null if hidden). */
  mirrorMsgId: string | null;
  /** Accumulated narration mirrored to players (grows across roll continuations). */
  mirrorText: string;
  /** Serializes create/update of the mirror message so rapid turns can't double-post. */
  mirrorChain: Promise<void>;
  /** Set when the turn is retried/rejected so an in-flight mirror create self-deletes. */
  retired: boolean;
}

export class NoodlrChatPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-chat-panel",
    tag: "div",
    classes: ["noodlr", "noodlr-chat-panel"],
    window: {
      title: "NOODLR.ChatPanel.Title",
      icon: "fa-solid fa-dragon",
      resizable: true,
      controls: [
        {
          icon: "fa-solid fa-trash",
          label: "NOODLR.ChatPanel.Clear",
          action: "clearConversation",
        },
      ],
    },
    position: { width: 480, height: 640 },
    actions: {
      clearConversation: NoodlrChatPanel.#onClearConversation,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/chat-panel.hbs` },
  };

  // Shared across panel instances so history survives closing/reopening the window (e.g. after
  // clicking another scene-control tool). The class is loaded once, so statics persist.
  static #conversation = new Conversation();
  static #transcript: TranscriptEntry[] = [];
  /** All pending GM commit timers, so Clear can cancel every scheduled memory write. */
  static #commitTimers = new Set<number>();

  #abort: AbortController | null = null;
  #streaming = false;
  /** The transcript entry for the assistant reply currently streaming (for live updates). */
  #liveEntry: TranscriptEntry | null = null;
  /** The current retry-able turn (only the latest turn carries controls). */
  #turn: ActiveTurn | null = null;

  /** Typed accessor for the root element (base `element` is loosely typed `any`). */
  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  #log(): HTMLElement | null {
    return this.#root()?.querySelector<HTMLElement>('[data-role="log"]') ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    return {
      moduleId: MODULE_ID,
      version,
      configured: isConfigured(getFeatureConfig("chat")),
      isGM: Boolean(game.user?.isGM),
    };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.element as HTMLElement;

    // Rebuild the visible transcript from the persisted store (survives reopen). Controls are
    // NOT restored — the retry window is bound to the live turn, not to reopened history.
    const logEl = root.querySelector<HTMLElement>('[data-role="log"]');
    if (logEl) {
      logEl.replaceChildren();
      for (const entry of NoodlrChatPanel.#transcript) this.#renderBubble(entry);
      this.#scrollToBottom();
    }

    const input = root.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    const sendBtn = root.querySelector<HTMLButtonElement>('[data-role="send"]');
    if (!input || !sendBtn) return;

    input.disabled = false;
    sendBtn.disabled = false;

    sendBtn.addEventListener("click", () => {
      if (this.#streaming) this.#abort?.abort();
      else void this.#onSend();
    });

    input.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        if (!this.#streaming) void this.#onSend();
      }
    });
  }

  static #onClearConversation(this: NoodlrChatPanel): void {
    if (this.#streaming) this.#abort?.abort();
    // Cancel every pending memory write and the live turn's timers.
    for (const t of NoodlrChatPanel.#commitTimers) clearTimeout(t);
    NoodlrChatPanel.#commitTimers.clear();
    this.#clearTurnTimers();
    this.#turn = null;
    NoodlrChatPanel.#conversation.reset();
    NoodlrChatPanel.#transcript.length = 0;
    this.#log()?.replaceChildren();
  }

  async #onSend(): Promise<void> {
    const input = this.#root()?.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    if (!input) return;
    const text = sanitizeUserText(input.value, { maxLength: 8000 });
    if (!text) return;
    input.value = "";
    await this.#runSend(text);
  }

  /** Run one turn: append the user prompt, stream the reply, and attach Retry/Reject at the end. */
  async #runSend(text: string): Promise<void> {
    if (this.#streaming) return;

    // Starting a new turn seals the previous one: strip its controls (you can only retry the
    // latest turn) but leave its commit timer to fire on schedule.
    this.#sealActiveTurn();

    // "Hide output" (GM only): keep this turn in the panel; don't mirror it to players.
    const hideBox = this.#root()?.querySelector<HTMLInputElement>('[data-role="hide-output"]');
    const hidden = Boolean(game.user?.isGM && hideBox?.checked);

    const logEl = this.#log();
    const turn: ActiveTurn = {
      startTranscriptLen: NoodlrChatPanel.#transcript.length,
      startChildCount: logEl?.children.length ?? 0,
      promptText: text,
      promptAuthor: game.user?.name ?? "You",
      finalText: "",
      assistantMsgEl: null,
      actionsEl: null,
      disableTimer: null,
      commitTimer: null,
      hidden,
      mirrorMsgId: null,
      mirrorText: "",
      mirrorChain: Promise.resolve(),
      retired: false,
    };
    this.#turn = turn;

    this.#appendMessage({ role: "user", author: turn.promptAuthor, content: text, html: false });

    this.#setStreaming(true);
    this.#abort = new AbortController();

    let bodyEl: HTMLElement | null = null;
    let raw = "";
    try {
      await NoodlrChatPanel.#conversation.send(text, {
        speakerName: game.user?.name,
        signal: this.#abort.signal,
        onAssistantStart: () => {
          raw = "";
          this.#liveEntry = { role: "assistant", author: "Dungeon Master", content: "", html: false };
          const rendered = this.#appendMessage(this.#liveEntry);
          bodyEl = rendered.bodyEl;
          turn.assistantMsgEl = rendered.msgEl;
        },
        onDelta: (delta: string) => {
          raw += delta;
          if (this.#liveEntry) this.#liveEntry.content = raw;
          if (bodyEl) bodyEl.textContent = raw;
          this.#scrollToBottom();
        },
        onAssistantDone: (finalText: string, _rolls: ResolvedRoll[]) => {
          const html = renderMarkdown(finalText);
          if (this.#liveEntry) {
            this.#liveEntry.content = html;
            this.#liveEntry.html = true;
          }
          if (bodyEl) bodyEl.innerHTML = html;
          this.#scrollToBottom();
          if (getTtsAutoRead()) void speak(finalText);
          // Attach/refresh controls on the latest assistant bubble. The 60 s window (re)starts
          // here, so it always begins once the final rendered output is displayed.
          turn.finalText = finalText;
          this.#attachTurnControls(turn);
          // Mirror the narration to the players' shared chat log (unless the GM hid this turn).
          if (game.user?.isGM && !turn.hidden) this.#mirrorNarration(turn, finalText);
        },
      });
    } catch (err) {
      const msg = err instanceof ChatClientError ? err.message : String(err);
      this.#appendMessage({ role: "error", author: "Error", content: msg, html: false });
      this.#turn = null;
    } finally {
      this.#liveEntry = null;
      this.#setStreaming(false);
      this.#abort = null;
    }
  }

  /** Persist a transcript entry and render its bubble; returns its elements. */
  #appendMessage(entry: TranscriptEntry): { msgEl: HTMLElement; bodyEl: HTMLElement } {
    NoodlrChatPanel.#transcript.push(entry);
    return this.#renderBubble(entry);
  }

  /** Build a message bubble from an entry (no persistence); returns its elements. */
  #renderBubble(entry: TranscriptEntry): { msgEl: HTMLElement; bodyEl: HTMLElement } {
    const log = this.#log();
    const msg = document.createElement("div");
    msg.className = `noodlr-chat__msg noodlr-chat__msg--${entry.role}`;

    const header = document.createElement("div");
    header.className = "noodlr-chat__author";
    const authorSpan = document.createElement("span");
    authorSpan.textContent = entry.author;
    header.append(authorSpan);

    const body = document.createElement("div");
    body.className = "noodlr-chat__body";
    if (entry.html) body.innerHTML = entry.content;
    else body.textContent = entry.content;

    // Copy-to-clipboard button (assistant + user turns).
    if (entry.role !== "error") {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "noodlr-chat__copy";
      copyBtn.title = game.i18n.localize("NOODLR.ChatPanel.Copy");
      copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i>`;
      copyBtn.addEventListener("click", () => {
        void navigator.clipboard?.writeText(body.innerText ?? body.textContent ?? "");
        ui.notifications?.info(game.i18n.localize("NOODLR.ChatPanel.Copied"));
      });
      header.append(copyBtn);
    }

    msg.append(header, body);
    log?.append(msg);
    this.#scrollToBottom();
    return { msgEl: msg, bodyEl: body };
  }

  // ---- Retry / Reject controls --------------------------------------------------------------

  /** Attach (or move) the Retry/Reject controls to the current turn's latest assistant bubble. */
  #attachTurnControls(turn: ActiveTurn): void {
    if (!turn.assistantMsgEl) return;
    // Remove any prior controls (e.g. from a roll continuation's earlier assistant message).
    turn.actionsEl?.remove();
    if (turn.disableTimer !== null) clearTimeout(turn.disableTimer);

    const actions = document.createElement("div");
    actions.className = "noodlr-artifact-actions";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "noodlr-artifact-btn noodlr-artifact-btn--retry";
    retry.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${game.i18n.localize("NOODLR.Artifact.Retry")}`;
    retry.title = game.i18n.localize("NOODLR.Artifact.RetryHint");
    retry.addEventListener("click", () => void this.#retryTurn());

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "noodlr-artifact-btn noodlr-artifact-btn--reject";
    reject.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${game.i18n.localize("NOODLR.Artifact.Reject")}`;
    reject.title = game.i18n.localize("NOODLR.Artifact.RejectHint");
    reject.addEventListener("click", () => void this.#rejectTurn());

    actions.append(retry, reject);
    turn.assistantMsgEl.append(actions);
    turn.actionsEl = actions;

    // Disable the controls when the window closes.
    turn.disableTimer = window.setTimeout(() => {
      turn.actionsEl?.remove();
      turn.actionsEl = null;
      turn.disableTimer = null;
      if (this.#turn === turn) this.#turn = null;
    }, RETRY_WINDOW_MS);

    // GM only: commit the turn to memory when the window closes (players never write RAG).
    if (turn.commitTimer !== null) {
      clearTimeout(turn.commitTimer);
      NoodlrChatPanel.#commitTimers.delete(turn.commitTimer);
      turn.commitTimer = null;
    }
    if (game.user?.isGM && isRagEnabled()) {
      const timer = window.setTimeout(() => {
        NoodlrChatPanel.#commitTimers.delete(timer);
        turn.commitTimer = null;
        void this.#commitTurn(turn);
      }, RETRY_WINDOW_MS);
      turn.commitTimer = timer;
      NoodlrChatPanel.#commitTimers.add(timer);
    }
  }

  /** Clear the live turn's disable/commit timers (used before discarding the turn). */
  #clearTurnTimers(): void {
    const turn = this.#turn;
    if (!turn) return;
    if (turn.disableTimer !== null) clearTimeout(turn.disableTimer);
    if (turn.commitTimer !== null) {
      clearTimeout(turn.commitTimer);
      NoodlrChatPanel.#commitTimers.delete(turn.commitTimer);
    }
    turn.disableTimer = null;
    turn.commitTimer = null;
  }

  /** Seal the previous turn: drop its controls and disable timer; let its commit timer stand. */
  #sealActiveTurn(): void {
    const turn = this.#turn;
    if (!turn) return;
    turn.actionsEl?.remove();
    turn.actionsEl = null;
    if (turn.disableTimer !== null) clearTimeout(turn.disableTimer);
    turn.disableTimer = null;
    this.#turn = null;
  }

  /** Remove every bubble/transcript entry belonging to the current turn. */
  #removeTurnDom(turn: ActiveTurn): void {
    NoodlrChatPanel.#transcript.length = Math.min(
      turn.startTranscriptLen,
      NoodlrChatPanel.#transcript.length,
    );
    const log = this.#log();
    if (log) while (log.children.length > turn.startChildCount) log.lastElementChild?.remove();
  }

  async #retryTurn(): Promise<void> {
    const turn = this.#turn;
    if (!turn || this.#streaming) return;
    this.#clearTurnTimers();
    this.#removeTurnDom(turn);
    void this.#deleteMirror(turn);
    this.#turn = null;
    const text = NoodlrChatPanel.#conversation.popLastUserTurn() ?? turn.promptText;
    await this.#runSend(text);
  }

  async #rejectTurn(): Promise<void> {
    const turn = this.#turn;
    if (!turn) return;
    this.#clearTurnTimers();
    this.#removeTurnDom(turn);
    void this.#deleteMirror(turn);
    NoodlrChatPanel.#conversation.popLastUserTurn();
    this.#turn = null;
  }

  // ---- Mirroring the narration to players ---------------------------------------------------

  /**
   * Mirror this turn's narration to the shared Foundry chat log so players see it (the DM's typed
   * prompt stays private). Serialized via the turn's promise chain so a roll continuation's second
   * chunk can't race the first into two separate messages; both accumulate into one message.
   */
  #mirrorNarration(turn: ActiveTurn, text: string): void {
    turn.mirrorChain = turn.mirrorChain.then(async () => {
      if (turn.retired) return;
      turn.mirrorText = turn.mirrorText ? `${turn.mirrorText}\n\n${text}` : text;
      const content = `<div class="noodlr-dm-narration">${renderMarkdown(turn.mirrorText)}</div>`;
      const ChatMessage = (globalThis as any).ChatMessage;
      try {
        if (turn.mirrorMsgId) {
          await (game.messages as any)?.get(turn.mirrorMsgId)?.update({ content });
          return;
        }
        const msg = await ChatMessage.create({
          content,
          speaker: { alias: "Dungeon Master" },
          flags: { [MODULE_ID]: { dmNarration: true } },
        });
        turn.mirrorMsgId = msg?.id ?? null;
        // If the turn was retired while the create was in flight, remove the orphan now.
        if (turn.retired && turn.mirrorMsgId) {
          await msg.delete();
          turn.mirrorMsgId = null;
        }
      } catch (err) {
        log("chat narration mirror failed:", err);
      }
    });
  }

  /** Remove the mirrored public message (Retry/Reject within the window). */
  async #deleteMirror(turn: ActiveTurn): Promise<void> {
    turn.retired = true;
    await turn.mirrorChain.catch(() => undefined);
    if (!turn.mirrorMsgId) return;
    try {
      await (game.messages as any)?.get(turn.mirrorMsgId)?.delete();
    } catch (err) {
      log("chat narration mirror delete failed:", err);
    }
    turn.mirrorMsgId = null;
  }

  /** GM-only: ingest the accepted DM turn (prompt + reply) into the `gm_chat` silo. */
  async #commitTurn(turn: ActiveTurn): Promise<void> {
    if (!game.user?.isGM || !isRagEnabled() || !turn.finalText.trim()) return;
    try {
      // GM co-pilot dialogue is GM-only prep (no player present) -> gm_chat.
      const text = `${turn.promptAuthor}: ${turn.promptText}\nDungeon Master: ${turn.finalText}`;
      const res = await getRagClient().ingest(
        "gm_chat",
        [{ text, metadata: { source: "chat", ts: Date.now() } }],
        getEmbedOverride(),
      );
      bumpStats({ ingestDocs: res?.inserted ?? 1, ingestChunks: res?.chunks ?? 0 });
    } catch (err) {
      console.warn(`${MODULE_ID} | chat turn RAG commit failed:`, err);
    }
  }

  #setStreaming(streaming: boolean): void {
    this.#streaming = streaming;
    const sendBtn = this.#root()?.querySelector<HTMLButtonElement>('[data-role="send"]');
    const icon = sendBtn?.querySelector("i");
    if (icon) {
      icon.className = streaming ? "fa-solid fa-stop" : "fa-solid fa-paper-plane";
    }
  }

  #scrollToBottom(): void {
    const log = this.#log();
    if (log) log.scrollTop = log.scrollHeight;
  }

  /** Convenience toggle used by the keybinding and scene-control button. */
  static toggle(): void {
    const existing = foundry.applications.instances?.get("noodlr-chat-panel") as
      | NoodlrChatPanel
      | undefined;
    if (existing?.rendered) void existing.close();
    else new NoodlrChatPanel().render({ force: true });
  }
}
