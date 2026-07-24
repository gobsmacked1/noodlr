// GM co-pilot chat panel: streaming DM chat with real Foundry dice. Built on
// ApplicationV2 + Handlebars (Foundry v14). The Handlebars template renders the static
// shell once; message bubbles and streaming deltas are applied to the DOM imperatively
// so we never re-render (and lose) the live transcript.

import { MODULE_ID } from "../constants";
import { Conversation } from "../chat/conversation";
import { ChatClientError } from "../providers/chat-client";
import { getFeatureConfig } from "../providers/config";
import { isConfigured } from "../providers/types";
import { renderMarkdown } from "../util/markdown";
import type { ResolvedRoll } from "../dice/roll-macros";
import { getTtsAutoRead } from "../media/config";
import { speak } from "../media/tts";

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

  #abort: AbortController | null = null;
  #streaming = false;
  /** The transcript entry for the assistant reply currently streaming (for live updates). */
  #liveEntry: TranscriptEntry | null = null;

  /** Typed accessor for the root element (base `element` is loosely typed `any`). */
  #root(): HTMLElement | null {
    return (this.element as HTMLElement | null) ?? null;
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const version = game.modules.get(MODULE_ID)?.version ?? "0.1.0";
    return {
      moduleId: MODULE_ID,
      version,
      configured: isConfigured(getFeatureConfig("chat")),
    };
  }

  _onRender(_context: unknown, _options: unknown): void {
    const root = this.element as HTMLElement;

    // Rebuild the visible transcript from the persisted store (survives reopen).
    const log = root.querySelector<HTMLElement>('[data-role="log"]');
    if (log) {
      log.replaceChildren();
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
    NoodlrChatPanel.#conversation.reset();
    NoodlrChatPanel.#transcript.length = 0;
    const log = this.#root()?.querySelector<HTMLElement>('[data-role="log"]');
    if (log) log.replaceChildren();
  }

  async #onSend(): Promise<void> {
    if (this.#streaming) return;
    const root = this.element as HTMLElement;
    const input = root.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    this.#appendMessage({ role: "user", author: game.user?.name ?? "You", content: text, html: false });

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
          bodyEl = this.#appendMessage(this.#liveEntry);
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
        },
      });
    } catch (err) {
      const msg = err instanceof ChatClientError ? err.message : String(err);
      this.#appendMessage({ role: "error", author: "Error", content: msg, html: false });
    } finally {
      this.#liveEntry = null;
      this.#setStreaming(false);
      this.#abort = null;
    }
  }

  /** Persist a transcript entry and render its bubble; returns the body element. */
  #appendMessage(entry: TranscriptEntry): HTMLElement {
    NoodlrChatPanel.#transcript.push(entry);
    return this.#renderBubble(entry);
  }

  /** Build a message bubble from an entry (no persistence); returns its body element. */
  #renderBubble(entry: TranscriptEntry): HTMLElement {
    const log = this.#root()?.querySelector<HTMLElement>('[data-role="log"]');
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
    return body;
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
    const log = this.#root()?.querySelector<HTMLElement>('[data-role="log"]');
    if (log) log.scrollTop = log.scrollHeight;
  }

  /** Convenience toggle used by the keybinding and scene-control button. */
  static toggle(): void {
    const existing = foundry.applications.instances?.get("noodlr-chat-panel") as
      NoodlrChatPanel | undefined;
    if (existing?.rendered) void existing.close();
    else new NoodlrChatPanel().render({ force: true });
  }
}
