// The AI assistant's display name.
//
// Shown in both chat panels' titles, the input placeholder, the message author line, and the speaker
// alias on the public chat cards it posts. Configurable because "Polly Histor" is our name for it,
// not necessarily the table's.

import { MODULE_ID, SETTINGS } from "../constants";

export const DEFAULT_ASSISTANT_NAME = "Polly Histor";

/** Max characters for the name. Long enough for a title, short enough for a window header. */
export const ASSISTANT_NAME_MAX_LENGTH = 64;

/**
 * The configured assistant name, or the shipped default when unset.
 *
 * Deliberately NOT following the "empty means empty" rule that governs prompt fields: this is an
 * identifier used inside labels, and a nameless chatbot renders as "Noodlr - " with a dangling dash.
 * Control characters are stripped because this string lands in window titles and chat aliases.
 */
export function getAssistantName(): string {
  const raw = String(game.settings.get(MODULE_ID, SETTINGS.assistantName) ?? "");
  const clean = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, ASSISTANT_NAME_MAX_LENGTH);
  return clean || DEFAULT_ASSISTANT_NAME;
}

/** Localize a string that takes the assistant's name as `{name}`. */
export function localizeWithAssistant(key: string): string {
  return game.i18n.format(key, { name: getAssistantName() });
}
