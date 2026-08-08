// Registration + typed accessors for the prompt-architecture settings and stores.

import { MODULE_ID, SETTINGS } from "../constants";
import { promptDefault, promptValue } from "../prompts/fields";
import type { LorebookEntry } from "./types";

export function registerPromptSettings(): void {
  const L = (s: string) => `NOODLR.Prompt.${s}`;

  // Prompt text blocks. Each ships pre-filled from the registry and is read verbatim afterwards.
  for (const key of [SETTINGS.authorNote, SETTINGS.postHistory, SETTINGS.combatReminder]) {
    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: String,
      default: promptDefault(key),
    });
  }

  // These four used to be config:true, which stranded them in Foundry's own settings list — far away
  // from the prompts they modify. They now render in the Text Generation window (config:false).
  game.settings.register(MODULE_ID, SETTINGS.authorNoteDepth, {
    scope: "world",
    config: false,
    type: Number,
    default: 3,
  });
  game.settings.register(MODULE_ID, SETTINGS.contextTokenBudget, {
    scope: "world",
    config: false,
    type: Number,
    default: 64000,
  });
  game.settings.register(MODULE_ID, SETTINGS.chatMemoryWrites, {
    scope: "world",
    config: false,
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

  // Developer tools. Client-scoped for the same reason as debugLogging: it changes what one person
  // sees in a window, costs the table nothing, and the thing it unlocks (compendium export) is
  // already gated behind GM upload permission.
  game.settings.register(MODULE_ID, SETTINGS.developerMode, {
    name: L("DeveloperMode.Name"),
    hint: L("DeveloperMode.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  // Tipster (live scene briefing) — enabled independently per chatbot, since the GM and the
  // players-only bot have different needs and the GM may want to trial it on one side first.
  // Also rendered in the Text Generation window, alongside the prompts it augments.
  game.settings.register(MODULE_ID, SETTINGS.tipsterGm, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, SETTINGS.tipsterPlayers, {
    scope: "world",
    config: false,
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

// All three read the stored value verbatim, minus the TBD placeholder (see promptValue).
export function getAuthorNote(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.authorNote));
}
export function getAuthorNoteDepth(): number {
  return Number(game.settings.get(MODULE_ID, SETTINGS.authorNoteDepth)) || 3;
}
export function getPostHistory(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.postHistory));
}
export function getCombatReminder(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.combatReminder));
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
