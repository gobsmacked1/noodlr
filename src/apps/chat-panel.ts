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

  #conversation = new Conversation();
  #abort: AbortController | null = null;
  #streaming = false;

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
    this.#conversation.reset();
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

    this.#appendMessage("user", game.user?.name ?? "You", text);

    this.#setStreaming(true);
    this.#abort = new AbortController();

    let bodyEl: HTMLElement | null = null;
    let raw = "";
    try {
      await this.#conversation.send(text, {
        speakerName: game.user?.name,
        signal: this.#abort.signal,
        onAssistantStart: () => {
          raw = "";
          bodyEl = this.#appendMessage("assistant", "Dungeon Master", "");
        },
        onDelta: (delta: string) => {
          raw += delta;
          if (bodyEl) bodyEl.textContent = raw;
          this.#scrollToBottom();
        },
        onAssistantDone: (finalText: string, _rolls: ResolvedRoll[]) => {
          if (bodyEl) bodyEl.innerHTML = renderMarkdown(finalText);
          this.#scrollToBottom();
          if (getTtsAutoRead()) void speak(finalText);
        },
      });
    } catch (err) {
      const msg = err instanceof ChatClientError ? err.message : String(err);
      this.#appendMessage("error", "Error", msg);
    } finally {
      this.#setStreaming(false);
      this.#abort = null;
    }
  }

  /** Append a message bubble; returns its body element for streaming updates. */
  #appendMessage(role: "user" | "assistant" | "error", author: string, text: string): HTMLElement {
    const log = this.#root()?.querySelector<HTMLElement>('[data-role="log"]');
    const msg = document.createElement("div");
    msg.className = `noodlr-chat__msg noodlr-chat__msg--${role}`;

    const authorEl = document.createElement("div");
    authorEl.className = "noodlr-chat__author";
    authorEl.textContent = author;

    const body = document.createElement("div");
    body.className = "noodlr-chat__body";
    body.textContent = text;

    msg.append(authorEl, body);
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
