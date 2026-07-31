// Players-only "Ask the Table" panel (Foundry roles Player / Trusted Player; the GM sees it too,
// to test). Distinct from the GM co-pilot (NoodlrChatPanel): this one is an input surface that
// relays each question to the GM's client (see players/relay.ts). The answer comes back as a public
// ChatMessage that Foundry mirrors to everyone; every open player panel "adopts" it so the shared
// table sees the same Q&A. Built on ApplicationV2 + Handlebars (Foundry v14).
//
// Phase P1: the GM side returns a placeholder answer; this panel proves the round trip (input ->
// socket -> GM -> mirrored result -> panel). Streaming, Retry/Reject, and real generation land in
// later phases.

import { MODULE_ID } from "../constants";
import { sanitizeUserText } from "../util/sanitize";
import { renderMarkdown } from "../util/markdown";
import { sendPlayerAsk, type PlayerBotFlag } from "../players/relay";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** One completed exchange, persisted statically so it survives closing/reopening the panel. */
interface PanelEntry {
  author: string;
  question: string;
  answer: string;
}

export class NoodlrPlayerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "noodlr-player-panel",
    tag: "div",
    classes: ["noodlr", "noodlr-chat-panel", "noodlr-player-panel"],
    window: {
      title: "NOODLR.Players.Title",
      icon: "fa-solid fa-masks-theater",
      resizable: true,
    },
    position: { width: 460, height: 600 },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/player-panel.hbs` },
  };

  // Shared across instances so the table's Q&A survives reopening the window.
  static #entries: PanelEntry[] = [];

  /** Optimistic pending bubbles for questions this client asked, keyed by requestId. */
  #pending = new Map<string, HTMLElement>();

  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  #log(): HTMLElement | null {
    return this.#root()?.querySelector<HTMLElement>('[data-role="log"]') ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    return { version: game.modules.get(MODULE_ID)?.version ?? "0.1.0" };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.element as HTMLElement;

    const logEl = root.querySelector<HTMLElement>('[data-role="log"]');
    if (logEl) {
      logEl.replaceChildren();
      this.#pending.clear();
      for (const entry of NoodlrPlayerPanel.#entries) this.#renderEntry(entry);
      this.#scrollToBottom();
    }

    const input = root.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    const sendBtn = root.querySelector<HTMLButtonElement>('[data-role="send"]');
    if (!input || !sendBtn) return;

    input.disabled = false;
    sendBtn.disabled = false;

    sendBtn.addEventListener("click", () => void this.#onSend());
    input.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        void this.#onSend();
      }
    });
  }

  async #onSend(): Promise<void> {
    const input = this.#root()?.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    if (!input) return;
    const text = sanitizeUserText(input.value, { maxLength: 4000 });
    if (!text) return;
    input.value = "";
    const payload = sendPlayerAsk(text);
    // Optimistic pending bubble on the asker's client; the answer fills in when it arrives.
    const el = this.#renderEntry(
      { author: game.user?.name ?? "You", question: text, answer: "" },
      true,
    );
    this.#pending.set(payload.requestId, el);
  }

  /**
   * Adopt a player-bot result posted by the GM. Called on every client via the createChatMessage
   * hook (see module.ts). If the panel is open, render it; otherwise record it so it shows on the
   * next open (so a player who opens the panel late still sees the shared table history).
   */
  static receive(flag: PlayerBotFlag): void {
    const inst = foundry.applications.instances?.get("noodlr-player-panel") as
      NoodlrPlayerPanel | undefined;
    if (inst?.rendered) {
      inst.#applyAnswer(flag);
    } else {
      NoodlrPlayerPanel.#entries.push({
        author: flag.askUserName,
        question: flag.question,
        answer: flag.answer,
      });
    }
  }

  #applyAnswer(flag: PlayerBotFlag): void {
    const pendingEl = this.#pending.get(flag.requestId);
    if (pendingEl) {
      this.#pending.delete(flag.requestId);
      const ans = pendingEl.querySelector<HTMLElement>('[data-role="answer"]');
      if (ans) ans.innerHTML = renderMarkdown(flag.answer);
      NoodlrPlayerPanel.#entries.push({
        author: flag.askUserName,
        question: flag.question,
        answer: flag.answer,
      });
    } else {
      const entry: PanelEntry = {
        author: flag.askUserName,
        question: flag.question,
        answer: flag.answer,
      };
      NoodlrPlayerPanel.#entries.push(entry);
      this.#renderEntry(entry);
    }
    this.#scrollToBottom();
  }

  /** Render one Q&A bubble. When `pending`, the answer area shows a spinner until it arrives. */
  #renderEntry(entry: PanelEntry, pending = false): HTMLElement {
    const log = this.#log();
    const wrap = document.createElement("div");
    wrap.className = "noodlr-chat__msg noodlr-chat__msg--assistant";

    const header = document.createElement("div");
    header.className = "noodlr-chat__author";
    const who = document.createElement("span");
    who.textContent = entry.author;
    header.append(who);

    const q = document.createElement("div");
    q.className = "noodlr-chat__body noodlr-player__q";
    q.textContent = entry.question;

    const a = document.createElement("div");
    a.className = "noodlr-chat__body noodlr-player__a";
    a.dataset.role = "answer";
    if (pending && !entry.answer) a.innerHTML = `<i class="fa-solid fa-ellipsis fa-fade"></i>`;
    else if (entry.answer) a.innerHTML = renderMarkdown(entry.answer);

    wrap.append(header, q, a);
    log?.append(wrap);
    this.#scrollToBottom();
    return wrap;
  }

  #scrollToBottom(): void {
    const log = this.#log();
    if (log) log.scrollTop = log.scrollHeight;
  }

  /** Convenience toggle used by the keybinding and scene-control button. */
  static toggle(): void {
    const existing = foundry.applications.instances?.get("noodlr-player-panel") as
      NoodlrPlayerPanel | undefined;
    if (existing?.rendered) void existing.close();
    else new NoodlrPlayerPanel().render({ force: true });
  }
}
