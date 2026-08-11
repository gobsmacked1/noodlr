// `game.modules.get("noodlr").api.surveyPlayed()` — who Foundry thinks each connected user is playing.
//
// Written for a report that was hard to place from the symptom alone (2026-08-07): a player owning four
// characters saw Noodlr's cards signed with the wrong one, and the wrong one was not even on the scene.
// The cause turned out to be core filling in an omitted speaker from `user.character`, but the first
// question — "which character do we think you are driving?" — had no way to be asked. Now it does.
//
// `assigned` is the field to look at. It is what an unsigned chat card would be stamped with, whatever is
// selected on the canvas, and a mismatch between it and `playing` is exactly the confusion being reported.

import { playedTokens } from "./speaker";

export function surveyPlayed(): Record<string, unknown> {
  const scene: any = (canvas as any)?.scene;
  const rows = ((game.users as any)?.contents ?? []).map((user: any) => ({
    user: String(user?.name ?? "?"),
    active: Boolean(user?.active),
    isGM: Boolean(user?.isGM),
    isSelf: Boolean(user?.isSelf),
    // The assigned character from User Configuration. Core uses this as the LAST resort when a chat
    // message names no speaker, which is how a character with no token on the scene ends up signing cards.
    assigned: user?.character?.name ?? null,
    assignedOnScene: Boolean(
      user?.character?.id &&
      ((canvas as any)?.tokens?.placeables ?? []).some(
        (t: any) => String(t?.actor?.id ?? "") === String(user.character.id),
      ),
    ),
    // Strongest signal first: selection, then the assigned character's token, then anything else owned here.
    playing: playedTokens(user).map((t: any) => String(t?.name ?? "?")),
  }));

  return {
    scene: String(scene?.name ?? "(no scene)"),
    note:
      "`playing` is what Noodlr signs cards and builds briefings from; `assigned` is what Foundry falls " +
      "back to for anything that names no speaker. Selection is only readable for isSelf, so another " +
      "user's row lists their assigned and owned tokens rather than what they have clicked.",
    users: rows,
  };
}
