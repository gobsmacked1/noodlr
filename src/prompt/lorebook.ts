// Lorebook / World Info activation. Keyword-activated (plaintext or /regex/) entries,
// plus always-on "constant" entries. Vector activation is reserved for later.

import type { LorebookEntry } from "./types";
import { log } from "../constants";

/** Does a single key match the scan text? `/pattern/flags` = regex, else substring. */
function keyMatches(key: string, text: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  const re = /^\/(.+)\/([a-z]*)$/i.exec(trimmed);
  if (re) {
    try {
      return new RegExp(re[1], re[2]).test(text);
    } catch (err) {
      log("invalid lorebook regex key:", key, err);
      return false;
    }
  }
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

/** Return the entries activated by the given scan text, sorted by insertion order. */
export function activateEntries(entries: LorebookEntry[], scanText: string): LorebookEntry[] {
  const text = scanText;
  return entries
    .filter((e) => e.enabled && (e.constant || e.keys.some((k) => keyMatches(k, text))))
    .sort((a, b) => a.order - b.order);
}
