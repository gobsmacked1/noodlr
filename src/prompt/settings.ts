// Registration + typed accessors for the prompt-architecture settings and stores.

import { MODULE_ID, SETTINGS, DEFAULT_COMBAT_REMINDER } from "../constants";
import type { ChronicleItem, LorebookEntry } from "./types";

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
    default: 12000,
  });
  game.settings.register(MODULE_ID, SETTINGS.chronicleAutoParse, {
    name: L("ChronicleAutoParse.Name"),
    hint: L("ChronicleAutoParse.Hint"),
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
  game.settings.register(MODULE_ID, SETTINGS.chronicleQueue, {
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
  return Number(game.settings.get(MODULE_ID, SETTINGS.contextTokenBudget)) || 12000;
}

export function loadLorebook(): LorebookEntry[] {
  const raw = game.settings.get(MODULE_ID, SETTINGS.lorebook);
  return Array.isArray(raw) ? (raw as LorebookEntry[]) : [];
}
export async function saveLorebook(entries: LorebookEntry[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.lorebook, entries);
}

export function loadChronicleQueue(): ChronicleItem[] {
  const raw = game.settings.get(MODULE_ID, SETTINGS.chronicleQueue);
  return Array.isArray(raw) ? (raw as ChronicleItem[]) : [];
}
export async function saveChronicleQueue(items: ChronicleItem[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.chronicleQueue, items);
}
