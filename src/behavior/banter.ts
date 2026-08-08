// Who mouths off, and at whom.
//
// Half of this used to live here and half in the combat planner; since the split, the halves are in
// different modules. `noodlr-hooks-*` reads the creature's sheet — can it speak at all, how pleased
// with itself is it, what is the target's ancestry and class — and hands the answer over with every
// automated turn. This file owns the part that was always flavour: the line library, choosing a line
// that fits, saying it, and voicing it.
//
// The chatter formula and the reasoning behind its signs now live with the sheet reader, in
// `noodlr-hooks-55e/src/combat/banter/profile.ts`. What matters here is that the two random draws
// arrive in the profile rather than being taken locally: the fight's seed belongs to the other
// module, so a `Math.random()` on this side would make every taunt unreplayable.

import { log } from "../constants";
import { speakerFor } from "../util/speaker";
import { getTtsEnabled } from "../media/config";
import { speakShared } from "../media/tts";
import { banterLines, type BanterLine } from "./banter-library";

/** Everything a taunt needs to know about the creature receiving it. */
export interface TargetProfile {
  name: string;
  race?: string;
  klass?: string;
  style?: string;
  gender?: string;
}

/** The sheet-derived half, supplied by whichever hooks module played the turn. */
export interface BanterProfile {
  chance: number;
  creatureType: string;
  target: TargetProfile;
  roll: number;
  pick: number;
}

/** Narrow an untyped hook payload, since a listener must survive a malformed one. */
export function asBanterProfile(raw: unknown): BanterProfile | null {
  const p = raw as any;
  if (!p || typeof p !== "object") return null;
  const chance = Number(p.chance);
  const roll = Number(p.roll);
  const pick = Number(p.pick);
  if (!Number.isFinite(chance) || !Number.isFinite(roll) || !Number.isFinite(pick)) return null;
  if (!p.target || typeof p.target.name !== "string") return null;
  return {
    chance,
    creatureType: String(p.creatureType ?? ""),
    target: p.target as TargetProfile,
    roll,
    pick,
  };
}

/**
 * How well a line suits this target. Zero means never say it — a taunt that names the wrong ancestry
 * or addresses a woman as "boy" is worse than no taunt at all, so those are excluded rather than
 * merely disfavoured.
 */
function weigh(line: BanterLine, target: TargetProfile, creatureType: string): number {
  if (line.race && line.race !== target.race) return 0;
  if (line.gender && line.gender !== target.gender) return 0;

  let weight = 1;
  if (line.race && line.race === target.race) weight += 6;
  if (line.klass) weight += line.klass === target.klass ? 6 : -0.9;
  if (line.style) weight += line.style === target.style ? 3 : -0.7;
  // A curse in the mouth of something dead already sounds right.
  if (line.flavor === "curse" && /undead|fiend|fey/.test(creatureType)) weight += 2;
  if (line.bark) weight += 0.5;
  return Math.max(0.05, weight);
}

function choose(lines: BanterLine[], weights: number[], at: number): BanterLine {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = at * total;
  for (let i = 0; i < lines.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return lines[i];
  }
  return lines[lines.length - 1];
}

/**
 * Say something, maybe. Returns the line spoken, or null when the creature stayed quiet — which is
 * the common case and not a failure.
 */
export async function maybeTaunt(speaker: any, profile: BanterProfile): Promise<string | null> {
  const lines = banterLines();
  if (lines.length === 0) return null;
  if (profile.chance <= 0 || profile.roll >= profile.chance) return null;

  const weights = lines.map((l) => weigh(l, profile.target, profile.creatureType));
  const usable = lines.filter((_, i) => weights[i] > 0);
  const usableWeights = weights.filter((w) => w > 0);
  if (usable.length === 0) return null;

  const line = choose(usable, usableWeights, profile.pick);
  const name = String(speaker?.name ?? "");
  log(
    `banter: ${name} -> ${profile.target.name} (${Math.round(profile.chance * 100)}% chatter): ${line.text}`,
  );

  const ChatMessage = (globalThis as any).ChatMessage;
  await ChatMessage.create({
    content: `<p class="noodlr-banter">"${foundry.utils.escapeHTML(line.text)}"</p>`,
    speaker: speakerFor(speaker?.token ?? speaker?.actor ?? speaker, name),
  });

  // Spoken only if the table already has voice switched on; banter never turns it on by itself.
  if (getTtsEnabled()) {
    try {
      await speakShared(line.text);
    } catch (err) {
      log("banter: could not speak the line:", err);
    }
  }

  return line.text;
}
