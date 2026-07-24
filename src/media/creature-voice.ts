// Per-creature-type TTS voice + pitch overrides. The GM assigns a distinct voice (and optional
// pitch, only sent when the endpoint supports it) to each D&D-style creature type/subtype; when
// Noodlr speaks for an actor, we look up its type and use that voice. Pitch is a hint sent to the
// provider — there is no client-side pitch shifting (which would also change speed).

import { MODULE_ID, MEDIA_SETTINGS, log } from "../constants";

/** Canonical creature types/subtypes the GM can assign voices to (user-provided list). */
export const CREATURE_TYPES: readonly string[] = [
  "Aberration",
  "Beast",
  "Celestial",
  "Construct",
  "Dragon",
  "Elemental",
  "Fey",
  "Fiend",
  "Fiend (demon)",
  "Fiend (devil)",
  "Giant",
  "Humanoid",
  "Humanoid (any race)",
  "Humanoid (dwarf)",
  "Humanoid (elf)",
  "Humanoid (gnoll)",
  "Humanoid (gnome)",
  "Humanoid (goblinoid)",
  "Humanoid (grimlock)",
  "Humanoid (human)",
  "Humanoid (kobold)",
  "Humanoid (lizardfolk)",
  "Humanoid (merfolk)",
  "Humanoid (orc)",
  "Humanoid (sahuagin)",
  "Monstrosity",
  "Monstrosity (titan)",
  "Ooze",
  "Plant",
  "Swarm of tiny beasts",
  "Undead",
];

export interface CreatureVoice {
  voice: string;
  /** Percent pitch adjustment, e.g. -20 or +10; 0/absent = none. */
  pitch: number;
}

export function normalizeTypeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function readTable(): Record<string, CreatureVoice> {
  try {
    return JSON.parse(
      (game.settings.get(MODULE_ID, MEDIA_SETTINGS.ttsCreatureVoices) as string) || "{}",
    );
  } catch {
    return {};
  }
}

export function getCreatureVoiceTable(): Record<string, CreatureVoice> {
  return readTable();
}

export async function setCreatureVoiceTable(table: Record<string, CreatureVoice>): Promise<void> {
  await game.settings.set(MODULE_ID, MEDIA_SETTINGS.ttsCreatureVoices, JSON.stringify(table));
}

/**
 * Derive a creature-type key from an actor. Works with dnd5e's
 * `system.details.type = { value, subtype, custom }` (or a plain string). Returns e.g.
 * "humanoid (elf)" or "dragon". Empty string when it can't be determined.
 */
export function creatureTypeKeyFromActor(actor: unknown): string {
  const type = (actor as { system?: { details?: { type?: unknown } } })?.system?.details?.type;
  if (!type) return "";
  if (typeof type === "string") return normalizeTypeKey(type);
  const t = type as { value?: string; subtype?: string; custom?: string };
  const base = (t.value || t.custom || "").trim();
  if (!base) return "";
  const sub = (t.subtype || "").trim();
  return normalizeTypeKey(sub ? `${base} (${sub})` : base);
}

/**
 * Resolve a voice+pitch for an actor from the table. Tries the full "type (subtype)" key first,
 * then falls back to the base type. Returns null when nothing matches.
 */
export function resolveVoiceForActor(actor: unknown): CreatureVoice | null {
  const table = readTable();
  const full = creatureTypeKeyFromActor(actor);
  if (!full) return null;
  const byFull = Object.entries(table).find(([k]) => normalizeTypeKey(k) === full);
  if (byFull) return byFull[1];
  // Fall back to the base type (strip the "(subtype)").
  const base = full.replace(/\s*\(.*\)\s*$/, "").trim();
  const byBase = Object.entries(table).find(([k]) => normalizeTypeKey(k) === base);
  return byBase ? byBase[1] : null;
}

/** Speak text using the actor's assigned creature voice/pitch, if any. */
export async function speakForActor(text: string, actor: unknown): Promise<void> {
  const { speak } = await import("./tts");
  const cv = resolveVoiceForActor(actor);
  try {
    await speak(text, cv ? { voice: cv.voice, pitch: cv.pitch } : undefined);
  } catch (err) {
    log("speakForActor failed:", err);
  }
}
