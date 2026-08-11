// Who a chat card is from.
//
// This exists because of a bug that looked like an attribution mistake of ours and was really Foundry
// filling in a blank (user's report, 2026-08-07: a player driving one of their four characters saw our
// cards signed with a different character's name — one that was not even on the scene).
//
// Core's renderer resolves an omitted speaker from the *author*, and the last thing it reaches for is the
// author's assigned character (`client/documents/chat-message.mjs`):
//
//     get speakerActor() {
//       return this.constructor.getSpeakerActor(this.speaker) ?? this.author?.character ?? null;
//     }
//     get alias() { ... return speakerAlias ?? this.speakerActor?.name ?? authorName; }
//
// So `ChatMessage.create({content})` from a player's client is stamped with whatever is set in that user's
// User Configuration, regardless of which token they are actually playing. The same fallback also feeds
// `getRollData()` and the portrait beside the card, so an inline roll in an unsigned card would be
// evaluated against the wrong sheet. `ChatMessage.getSpeaker()` with no arguments has the same problem one
// step earlier, in its CASE 5.
//
// The rule that follows: every card Noodlr posts names its speaker explicitly. A card about a creature
// names that creature's token; a card in the module's own voice says so. Neither ever borrows the author.

import { MODULE_TITLE } from "../constants";

/**
 * The module's own voice, for cards that are about the fight rather than about one creature — "roll for
 * initiative", "three of them are surprised", a GM-only diagnostic.
 */
export function narrator(): { alias: string } {
  const key = "NOODLR.Narrator";
  // Foundry's `localize` returns the key itself when there is no translation, and this runs from paths
  // that can fire before i18n is ready, so an unresolved key must not become the speaker's name.
  const localized = String(game.i18n?.localize?.(key) ?? "");
  return { alias: localized && localized !== key ? localized : MODULE_TITLE };
}

/**
 * The speaker for a card about one creature, from a Token, a TokenDocument, an Actor, or a Combatant.
 *
 * Delegates to core's `getSpeaker` so the scene and token ids come out right and the portrait resolves,
 * but only ever with a subject in hand — and always with an explicit alias, so that a subject core
 * declines to recognise still cannot fall through to the author's assigned character.
 */
export function speakerFor(subject: any, fallbackName?: string): Record<string, unknown> {
  const ChatMessage = (globalThis as any).ChatMessage;
  const doc = subject?.document ?? subject;
  const actor = doc?.actor ?? (doc?.documentName === "Actor" ? doc : subject?.actor) ?? null;
  const alias = String(fallbackName ?? subject?.name ?? doc?.name ?? actor?.name ?? "").trim();

  try {
    const token = doc?.documentName === "Token" ? doc : null;
    const resolved = ChatMessage?.getSpeaker?.(
      token ? { token, alias } : actor ? { actor, alias } : { alias },
    );
    if (resolved && (resolved.token || resolved.actor)) {
      return { ...resolved, alias: alias || resolved.alias };
    }
  } catch {
    // Fall through to a bare alias, which is enough to keep the card honestly labelled.
  }
  return alias ? { alias } : narrator();
}

/**
 * Every token the given user is actually playing on the current scene, in order of how strong the signal
 * is. Plural on purpose: a player may legitimately drive two characters at once, and the previous
 * single-answer resolution is what made a four-character player look like whichever one sorted first.
 *
 *   1. Tokens they have selected. What someone just clicked is the strongest statement of intent there is.
 *   2. Their assigned character's token, if it is on this scene.
 *   3. Every other token on the scene they own.
 *
 * Ownership is tested with `testUserPermission` rather than a raw `ownership[userId] === 3` lookup, because
 * Foundry resolves ownership through the default row and its ownership dialog *deletes* the per-user entry
 * for anyone left on "Default" — so a world set to "All Players: Owner" has nothing for a raw lookup to
 * match. Same hole that made midi prompt the GM for everything; see `rollerForActor`.
 */
export function playedTokens(user: any): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  const add = (placeable: any): void => {
    const doc = placeable?.document ?? placeable;
    const id = String(doc?.id ?? "");
    if (!doc || (id && seen.has(id))) return;
    if (id) seen.add(id);
    out.push(doc);
  };

  try {
    const layer = (canvas as any)?.tokens;
    if (!layer) return out;
    const placeables: any[] = layer.placeables ?? [];

    // Selection is only readable for the local client; another user's control state is not replicated.
    if (user?.isSelf) for (const token of layer.controlled ?? []) add(token);

    const assignedId = String(user?.character?.id ?? "");
    if (assignedId) {
      for (const token of placeables) if (String(token?.actor?.id ?? "") === assignedId) add(token);
    }

    for (const token of placeables) {
      if (token?.actor?.testUserPermission?.(user, "OWNER")) add(token);
    }
  } catch {
    // A briefing without a perspective is still a briefing; never let this throw into a caller.
  }
  return out;
}
