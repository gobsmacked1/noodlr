// Which rules system this table plays, stated as fact rather than left to be inferred.
//
// A model with no authoritative statement of the system will deduce one from whatever proper nouns
// are in front of it — an adventure's title, a scene name, a place name — and adventures get
// converted between systems all the time, so that guess is a coin flip that arrives dressed as
// confidence. Everything else Foundry knows for certain (HP, initiative, conditions, scene) is
// already injected as ground truth; this is the same idea applied to the most load-bearing fact of
// all.
//
// Deliberately NOT a prompt field: the editable prompts are the GM's voice, and a guard that can be
// edited away by rewriting an unrelated paragraph isn't a guard. What IS configurable is the system
// name itself, chosen from the systems Foundry supports or typed freely.
//
// Auto-detection is a starting point, never the last word: game.system.id is "dnd5e" for both the
// 2014 and 2024 rules, and a system's title says nothing about which revision a table plays.

import { MODULE_ID, SETTINGS } from "../constants";
import { sanitizeUserText } from "../util/sanitize";

/** Free-text alternative to the curated list. */
export const RULESET_CUSTOM = "custom";
/** Use whatever Foundry reports for the active system. */
export const RULESET_AUTO = "auto";

export const RULESET_NAME_MAX_LENGTH = 64;

/**
 * Shipped default. A concrete, common system beats "detect from Foundry" as an out-of-box value:
 * detection can only name the system, never the revision, and a GM who plays something else changes
 * one dropdown — whereas a GM who never opens the setting at all is still covered by a real answer
 * instead of an inferred one.
 */
export const RULESET_DEFAULT = "Dungeons & Dragons Fifth Edition (2024)";

/**
 * Systems offered in the picker (user-curated). The stored value IS the display name, so adding one
 * needs no id mapping and a world that later drops the system keeps a readable label.
 */
export const RULESET_CHOICES = [
  "Alien RPG",
  "Black Flag Roleplaying",
  "Blade Runner - The Roleplaying Game",
  "Blades in the Dark",
  "Call of Cthulhu 7th edition",
  "Coriolis: The Great Dark",
  "Coriolis: The Third Horizon",
  "Cosmere Roleplaying Game",
  "Daggerheart",
  "Dragonbane",
  "Draw Steel",
  "Dungeon Crawl Classics (DCC)",
  "Dungeons & Dragons Fifth Edition (2014)",
  "Dungeons & Dragons Fifth Edition (2024)",
  "Dungeons & Dragons Fourth Edition",
  "Forbidden Lands",
  "GURPS 4th Edition",
  "Invincible - Superhero Roleplaying",
  "Mutant Year Zero",
  "Old-School Essentials",
  "Pathfinder Second Edition",
  "Savage Worlds Adventure Edition",
  "Shadowrun 6th Edition",
  "Starfinder First Edition",
  "Starfinder Second Edition",
  "Tales From the Loop",
  "The Dark Eye (5th Edition)",
  "Torg Eternity",
  "Twilight: 2000 (4th Edition)",
  "Vaesen",
  "Warhammer 40,000 Roleplay: Imperium Maledictum",
  "Warhammer 40,000 Roleplay: Wrath & Glory",
  "Warhammer Age of Sigmar : Soulbound",
  "Warhammer Fantasy Roleplay 4th Edition",
  "Warhammer: The Old World Roleplaying Game",
] as const;

export function registerRulesetSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.rulesetChoice, {
    scope: "world",
    config: false,
    type: String,
    default: RULESET_DEFAULT,
  });
  game.settings.register(MODULE_ID, SETTINGS.rulesetCustom, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
}

/** What Foundry itself reports, e.g. "Dungeons & Dragons Fifth Edition". Empty if unavailable. */
export function detectedSystemName(): string {
  const sys = (game as any).system;
  return String(sys?.title ?? sys?.id ?? "").trim();
}

/** Detected system with its version, for display: "Dungeons & Dragons Fifth Edition 5.2.1". */
export function detectedSystemLabel(): string {
  const sys = (game as any).system;
  const name = detectedSystemName();
  const version = String(sys?.version ?? "").trim();
  return version ? `${name} ${version}` : name;
}

/**
 * The system to play by. Empty string means "nobody has said" — callers must treat that as a
 * question to ask, not as licence to pick one.
 */
export function getRulesetName(): string {
  const choice = String(game.settings.get(MODULE_ID, SETTINGS.rulesetChoice) ?? RULESET_DEFAULT);
  if (choice === RULESET_CUSTOM) {
    const custom = sanitizeUserText(game.settings.get(MODULE_ID, SETTINGS.rulesetCustom), {
      maxLength: RULESET_NAME_MAX_LENGTH,
      allowNewlines: false,
    });
    // A blank custom box falls back to detection rather than to nothing: half-finished config
    // shouldn't be worse than no config.
    return custom || detectedSystemName();
  }
  if (choice === RULESET_AUTO) return detectedSystemName();
  return choice;
}

/**
 * The authoritative statement, injected once per request into every bot's prompt.
 *
 * Kept to ~45 tokens: it rides along on every turn, so the wording buys precedence (what outranks
 * what) and a failure mode (say something rather than switch systems) and nothing else. Rules
 * content belongs in the `system_rules` silo, not here.
 */
export function buildRulesetBlock(): string {
  const name = getRulesetName();
  if (!name) {
    return (
      "# Game system\nRules system: not configured. Never deduce it from adventure titles, place " +
      "names, or your own associations — ask the GM out of character which system is in play."
    );
  }
  return (
    `# Game system\nRules system: ${name}. This is authoritative. Never deduce the system from ` +
    "adventure titles, place names, or prior associations — published adventures are frequently " +
    "converted between systems. Live Foundry data and the characters' own sheets outrank both. " +
    "If something contradicts this, say so out of character rather than switching systems."
  );
}

/** Six-token restatement for the always-last slot, where compliance is decided. */
export function rulesetEcho(): string {
  const name = getRulesetName();
  return name ? `Rules system: ${name}.` : "";
}
