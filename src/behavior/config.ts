// Behavioral automation: the settings for the half of a fight that is not arithmetic.
//
// This replaced "Combat automation", which moved to `noodlr-hooks-55e` along with the planner it
// governed. What Noodlr keeps is the part it was always better suited to: when a rules module
// decides a creature runs, yields, or tries to talk its way out, Noodlr gives that creature words.
//
// On by default, and inert with no hooks module installed — nothing ever fires the request, so the
// setting costs a table nothing until it has something to listen to.

import { MODULE_ID, BEHAVIOR_SETTINGS } from "../constants";
import { promptDefault, promptValue } from "../prompts/fields";

export function registerBehaviorSettings(): void {
  game.settings.register(MODULE_ID, BEHAVIOR_SETTINGS.enabled, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, BEHAVIOR_SETTINGS.systemPrompt, {
    scope: "world",
    config: false,
    type: String,
    default: promptDefault(BEHAVIOR_SETTINGS.systemPrompt),
  });
  game.settings.register(MODULE_ID, BEHAVIOR_SETTINGS.banter, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });
}

export function isBehaviorEnabled(): boolean {
  return Boolean(game.settings.get(MODULE_ID, BEHAVIOR_SETTINGS.enabled));
}

export function isNpcBanterEnabled(): boolean {
  return Boolean(game.settings.get(MODULE_ID, BEHAVIOR_SETTINGS.banter));
}

/** The behavior prompt as stored — ships pre-filled, read verbatim (see prompts/fields.ts). */
export function getBehaviorPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, BEHAVIOR_SETTINGS.systemPrompt));
}
