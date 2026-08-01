// Every editable prompt field in one place.
//
// This registry is the single source of truth for four things that used to disagree: what a fresh
// world gets, what the settings form shows, what a per-field Reset restores, and which fields an
// upgrading world needs seeded.
//
// CONVENTION (decided 2026-08-01) — the stored value is authoritative. A field showing text means
// that text is what gets sent; a field the user empties sends nothing. Previously an empty setting
// silently fell back to an embedded default, which meant the form could show a blank box while the
// module quietly used a ~1,000-token prompt the user could neither see nor edit. Every field now
// ships pre-filled with its default and carries a Reset button as the way back.

import { MODULE_ID, SETTINGS, warn } from "../constants";
import { isPrimaryGM } from "../util/gm";
import {
  DM_SYSTEM_PROMPT,
  DEFAULT_COMBAT_PROMPT,
  DEFAULT_COMBAT_REMINDER,
  PLAYERS_SYSTEM_PROMPT,
  GM_ADJUDICATION_PROMPT,
  IMAGE_EXPAND_SYSTEM_PROMPT,
  MAP_DEFAULT_POSITIVE,
  SYSTEM_PROMPT_MAX_LENGTH,
} from "./index";

/**
 * Placeholder default for prompt fields that don't have real text written yet.
 *
 * Deliberately loud and greppable: it ships in the field so the maintainer can find every prompt
 * still owing a default by searching for this string, and so a user never faces an unexplained empty
 * box. Replace these with real prose one field at a time.
 */
export const TBD = "TBD_IGNORE_ME_FOR_NOW";

/**
 * A prompt value as the models should see it: the placeholder resolves to nothing.
 *
 * The marker has to be a real stored value so it shows up in the settings form, but it is a note to
 * the maintainer, not content — injecting "TBD_IGNORE_ME_FOR_NOW" as an author's note, or sending it
 * to an image model as a negative prompt, would actively degrade output. Every accessor that feeds a
 * provider goes through this; the settings UI deliberately does not, so the field stays findable.
 */
export function promptValue(raw: unknown): string {
  const s = String(raw ?? "");
  return s.trim() === TBD ? "" : s;
}

export interface PromptFieldDef {
  /** Settings key (also the `data-field` value the Reset button carries). */
  key: string;
  /** i18n key for the field's label. */
  label: string;
  /** i18n key for the explanatory note under the label. */
  hint: string;
  /** The default this field ships with, and what Reset restores. */
  default: string;
  rows: number;
  maxLength: number;
}

/**
 * The four image generators, mirrored from `media/config.ts` on purpose: importing IMAGE_KINDS from
 * there would make this module depend on the media layer, and the media layer needs its defaults
 * from here. Four literals are the cheaper coupling.
 */
const IMAGE_KIND_IDS = ["image", "portrait", "token", "map"] as const;

/** Map is the one generator that ships a real style prefix; the rest still owe one. */
const imagePositiveDefault = (kind: string): string =>
  kind === "map" ? MAP_DEFAULT_POSITIVE : TBD;

function imageFields(): PromptFieldDef[] {
  return IMAGE_KIND_IDS.flatMap((kind) => [
    {
      key: `${kind}.positive`,
      label: "NOODLR.Media.ImagePositive.Name",
      hint: "NOODLR.Media.ImagePositive.Hint",
      default: imagePositiveDefault(kind),
      rows: 2,
      maxLength: 2000,
    },
    {
      key: `${kind}.negative`,
      label: "NOODLR.Media.ImageNegative.Name",
      hint: "NOODLR.Media.ImageNegative.Hint",
      default: TBD,
      rows: 2,
      maxLength: 2000,
    },
    {
      // Was registered but had no field anywhere, so IMAGE_EXPAND_SYSTEM_PROMPT was both invisible
      // and uneditable — the exact problem this convention exists to prevent.
      key: `${kind}.systemPrompt`,
      label: "NOODLR.Media.ImageSystemPrompt.Name",
      hint: "NOODLR.Media.ImageSystemPrompt.Hint",
      default: IMAGE_EXPAND_SYSTEM_PROMPT,
      rows: 3,
      maxLength: 8000,
    },
  ]);
}

const TEXT_FIELDS: PromptFieldDef[] = [
  {
    key: SETTINGS.chatSystemPrompt,
    label: "NOODLR.Settings.ChatPromptLegend",
    hint: "NOODLR.Settings.ChatPromptHint",
    default: DM_SYSTEM_PROMPT,
    rows: 14,
    maxLength: SYSTEM_PROMPT_MAX_LENGTH,
  },
  {
    key: SETTINGS.playersSystemPrompt,
    label: "NOODLR.Settings.PlayersPrompt.Name",
    hint: "NOODLR.Settings.PlayersPrompt.Hint",
    default: PLAYERS_SYSTEM_PROMPT,
    rows: 10,
    maxLength: SYSTEM_PROMPT_MAX_LENGTH,
  },
  {
    key: SETTINGS.adjudicationPrompt,
    label: "NOODLR.Settings.AdjudicationPrompt.Name",
    hint: "NOODLR.Settings.AdjudicationPrompt.Hint",
    default: GM_ADJUDICATION_PROMPT,
    rows: 8,
    maxLength: SYSTEM_PROMPT_MAX_LENGTH,
  },
  {
    key: "combat.systemPrompt",
    label: "NOODLR.Combat.PromptName",
    hint: "NOODLR.Combat.PromptHint",
    default: DEFAULT_COMBAT_PROMPT,
    rows: 5,
    maxLength: SYSTEM_PROMPT_MAX_LENGTH,
  },
  {
    key: SETTINGS.authorNote,
    label: "NOODLR.Prompt.AuthorNote.Name",
    hint: "NOODLR.Prompt.AuthorNote.Hint",
    default: TBD,
    rows: 3,
    maxLength: 4000,
  },
  {
    key: SETTINGS.postHistory,
    label: "NOODLR.Prompt.PostHistory.Name",
    hint: "NOODLR.Prompt.PostHistory.Hint",
    default: TBD,
    rows: 3,
    maxLength: 4000,
  },
  {
    key: SETTINGS.combatReminder,
    label: "NOODLR.Prompt.CombatReminder.Name",
    hint: "NOODLR.Prompt.CombatReminder.Hint",
    default: DEFAULT_COMBAT_REMINDER,
    rows: 3,
    maxLength: 4000,
  },
];

/** Every prompt field, keyed by settings key. */
export const PROMPT_FIELDS: Record<string, PromptFieldDef> = Object.fromEntries(
  [...TEXT_FIELDS, ...imageFields()].map((f) => [f.key, f]),
);

/** The shipped default for a prompt field ("" for an unknown key). */
export function promptDefault(key: string): string {
  return PROMPT_FIELDS[key]?.default ?? "";
}

/**
 * View model for rendering one prompt field (label, hint, current value, Reset target).
 * `value` is read verbatim — an empty field renders empty, which is now a meaningful state.
 */
export function promptFieldView(key: string): {
  key: string;
  label: string;
  hint: string;
  value: string;
  rows: number;
  maxLength: number;
} {
  const def = PROMPT_FIELDS[key];
  const value = String(game.settings.get(MODULE_ID, key) ?? "");
  return {
    key,
    label: def ? game.i18n.localize(def.label) : key,
    hint: def ? game.i18n.localize(def.hint) : "",
    value,
    rows: def?.rows ?? 3,
    maxLength: def?.maxLength ?? 4000,
  };
}

/**
 * One-time migration for worlds created under the old convention.
 *
 * Under the old rules an empty setting meant "use the embedded default", and the settings form saved
 * every field on every Save — so most existing worlds have explicit empty strings stored for prompts
 * the user never touched. Reading those verbatim (the new rule) would silently strip the DM prompt.
 * Since "deliberately empty" wasn't expressible before this change, treating every empty field as
 * "never set" is safe exactly once.
 */
export async function seedPromptDefaults(): Promise<void> {
  if (!isPrimaryGM()) return;
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.promptDefaultsSeeded)) return;
  } catch {
    return;
  }
  let seeded = 0;
  for (const def of Object.values(PROMPT_FIELDS)) {
    try {
      const cur = String(game.settings.get(MODULE_ID, def.key) ?? "");
      if (cur.trim() === "") {
        await game.settings.set(MODULE_ID, def.key, def.default);
        seeded++;
      }
    } catch (err) {
      warn(`could not seed the default for prompt field "${def.key}":`, err);
    }
  }
  await game.settings.set(MODULE_ID, SETTINGS.promptDefaultsSeeded, true);
  if (seeded > 0) warn(`seeded ${seeded} prompt field default(s) for this world`);
}
