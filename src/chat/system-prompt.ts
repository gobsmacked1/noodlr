// The Chat system prompt as stored.
//
// No fallback to DM_SYSTEM_PROMPT here any more: the setting ships pre-filled with it (see
// prompts/fields.ts), so the stored string is the whole truth. A GM who clears the box means it.

import { MODULE_ID, SETTINGS } from "../constants";
import { promptValue } from "../prompts/fields";

export function getEffectiveChatSystemPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, SETTINGS.chatSystemPrompt));
}
