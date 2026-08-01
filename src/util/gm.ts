// Which GM client acts, when several are connected.
//
// Anything triggered by a relayed socket message runs on EVERY connected GM, because
// `game.user.isGM` is true for each of them (Foundry counts Assistant GMs as GMs). Work that must
// happen exactly once for the table — writing the session journal, ingesting into RAG, deleting a
// message — has to be narrowed to one client, or it happens once per GM logged in.

/**
 * True when this client is the GM Foundry has designated to act for the table.
 *
 * Foundry elects the designated GM itself (`Users#activeGM` = the highest-role user among the
 * active GMs, so a full Gamemaster is preferred over an Assistant), and every client evaluates the
 * same replicated user list, so all clients agree on the answer. We do not run our own election.
 *
 * Compares by id, not object identity: `activeGM` and `game.user` are normally the same User
 * instance, but that is an implementation detail to lean on for something that silently disables a
 * whole feature when it does not hold.
 *
 * Falls back to "any GM" when Foundry reports no active GM, so a feature degrades to running
 * everywhere rather than nowhere.
 */
export function isPrimaryGM(): boolean {
  if (!game.user?.isGM) return false;
  const active = (game.users as any)?.activeGM ?? null;
  return !active || active.id === game.user.id;
}
