// Registration + typed accessors for the prompt-architecture settings and stores.

import { MODULE_ID, SETTINGS } from "../constants";
import { DEFAULT_COMBAT_REMINDER } from "../prompts";
import type { LorebookEntry } from "./types";

export function registerPromptSettings(): void {
  const L = (s: string) => `NOODLR.Prompt.${s}`;

  // Text blocks edited in the settings window (config:false).
  game.settings.register(MODULE_ID, SETTINGS.authorNote, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, SETTINGS.postHistory, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, SETTINGS.combatReminder, {
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_COMBAT_REMINDER,
  });

  // Simple scalars editable natively.
  game.settings.register(MODULE_ID, SETTINGS.authorNoteDepth, {
    name: L("AuthorNoteDepth.Name"),
    hint: L("AuthorNoteDepth.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 3,
  });
  game.settings.register(MODULE_ID, SETTINGS.contextTokenBudget, {
    name: L("ContextBudget.Name"),
    hint: L("ContextBudget.Hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 64000,
  });
  game.settings.register(MODULE_ID, SETTINGS.chatMemoryWrites, {
    name: L("ChatMemoryWrites.Name"),
    hint: L("ChatMemoryWrites.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Verbose diagnostics for both chatbots. Client-scoped: it's a troubleshooting aid for whoever is
  // actually looking at a console, and each person can turn it on without affecting the table.
  game.settings.register(MODULE_ID, SETTINGS.debugLogging, {
    name: L("DebugLogging.Name"),
    hint: L("DebugLogging.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  // Tipster (live scene briefing) — enabled independently per chatbot, since the GM and the
  // players-only bot have different needs and the GM may want to trial it on one side first.
  game.settings.register(MODULE_ID, SETTINGS.tipsterGm, {
    name: L("TipsterGm.Name"),
    hint: L("TipsterGm.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, SETTINGS.tipsterPlayers, {
    name: L("TipsterPlayers.Name"),
    hint: L("TipsterPlayers.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // JSON stores (config:false).
  game.settings.register(MODULE_ID, SETTINGS.lorebook, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });
}

export function getAuthorNote(): string {
  return (game.settings.get(MODULE_ID, SETTINGS.authorNote) as string) ?? "";
}
export function getAuthorNoteDepth(): number {
  return Number(game.settings.get(MODULE_ID, SETTINGS.authorNoteDepth)) || 3;
}
export function getPostHistory(): string {
  return (game.settings.get(MODULE_ID, SETTINGS.postHistory) as string) ?? "";
}
export function getCombatReminder(): string {
  return (game.settings.get(MODULE_ID, SETTINGS.combatReminder) as string) ?? "";
}
export function getContextBudget(): number {
  return Number(game.settings.get(MODULE_ID, SETTINGS.contextTokenBudget)) || 64000;
}
export function isChatMemoryWritesEnabled(): boolean {
  return (game.settings.get(MODULE_ID, SETTINGS.chatMemoryWrites) as boolean) ?? true;
}
export function isTipsterEnabled(which: "gm" | "players"): boolean {
  const key = which === "gm" ? SETTINGS.tipsterGm : SETTINGS.tipsterPlayers;
  return (game.settings.get(MODULE_ID, key) as boolean) ?? true;
}

export function loadLorebook(): LorebookEntry[] {
  const raw = game.settings.get(MODULE_ID, SETTINGS.lorebook);
  return Array.isArray(raw) ? (raw as LorebookEntry[]) : [];
}
export async function saveLorebook(entries: LorebookEntry[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.lorebook, entries);
}
