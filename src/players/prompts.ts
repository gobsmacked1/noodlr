// The two players-bot prompts, as stored.
//
// Both ship pre-filled with their defaults and are read verbatim afterwards (see prompts/fields.ts).
// The adjudicator's prompt is the one guarding GM-secret memory from the players, so making it
// editable is deliberate: a table that wants it stricter should be able to say so.

import { MODULE_ID, SETTINGS } from "../constants";
import { promptValue } from "../prompts/fields";

export function getPlayersSystemPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.playersSystemPrompt));
}

export function getAdjudicationPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.adjudicationPrompt));
}
