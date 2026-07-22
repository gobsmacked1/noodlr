// Resolve the effective Chat system prompt: the user override if set, else the built-in
// Noodlr Dungeon Master prompt.

import { MODULE_ID, SETTINGS } from "../constants";
import { DM_SYSTEM_PROMPT } from "../prompts/dm-system-prompt";

export function getEffectiveChatSystemPrompt(): string {
  const override = (game.settings.get(MODULE_ID, SETTINGS.chatSystemPrompt) as string) ?? "";
  return override.trim().length > 0 ? override : DM_SYSTEM_PROMPT;
}
