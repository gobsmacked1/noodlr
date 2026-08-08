// Listening to whichever rules module the table has installed.
//
// The contract is four hooks named `noodlrHooks.*` — deliberately not named after any one module, so
// a future `noodlr-hooks-pf2e` fires the same four and this file needs no change. Noodlr never
// depends on a hooks module being present: with none installed nothing ever fires and every function
// here simply never runs.
//
// Three of the four are handled:
//
//   * `noodlrHooks.turn`     — an automated creature has decided what to do. We may taunt first.
//   * `noodlrHooks.behavior` — a creature wants to flee, yield, or talk. We give it words.
//   * `noodlrHooks.ruling`   — a rule landed. We remember it, so the GM's chatbot knows what
//                              happened at the table without being told.
//
// `noodlrHooks.preRuling` is deliberately NOT handled. It is synchronous — it has to be, since the
// rules module calls it from inside Foundry `pre*` hooks — and a model cannot answer synchronously.
// Vetoing on a coin flip would be worse than not vetoing; the GM overrules through the chatbot and
// the `undo` carried on the ruling instead.

import { debug, log } from "../constants";
import { isBehaviorEnabled, isNpcBanterEnabled } from "./config";
import { asBanterProfile, maybeTaunt } from "./banter";
import { narrateBehavior } from "./narrate";
import { noteRuling } from "./awareness";

/**
 * The payload crosses a module boundary, so it is read as an untyped bag on purpose.
 *
 * Its shape is defined by whichever hooks module fired it — possibly one written by somebody else,
 * possibly a newer protocol than this build knows about. Fields are checked where they are used
 * rather than asserted here, so an unexpected payload costs a missing taunt rather than an exception
 * in the middle of somebody's turn.
 */
type HookEvent = Record<string, any> & { waitFor?: (p: Promise<unknown>) => void };

let registered = false;

export function registerBehaviorHooks(): void {
  if (registered) return;
  registered = true;

  Hooks.on("noodlrHooks.turn", (event: HookEvent) => {
    if (!isNpcBanterEnabled()) return;
    const profile = asBanterProfile(event?.banter);
    if (!profile) return;
    const speaker = event.combatant ?? { actor: event.actor, token: event.token };
    // The rules module awaits this, so the taunt lands before the punchline rather than after it.
    event.waitFor?.(maybeTaunt(speaker, profile).catch((err) => log("banter failed:", err)));
  });

  Hooks.on("noodlrHooks.behavior", (event: HookEvent) => {
    if (!isBehaviorEnabled()) return;
    if (event.handled) return;
    debug("behavior requested", { verb: event.verb, module: event.module });
    // Claimed up front, before the async work: the flag says "somebody is playing this out", and a
    // second listener deciding the same thing while we are still generating would double-narrate it.
    event.handled = true;
    event.waitFor?.(
      narrateBehavior(event).catch((err) => log("could not voice a behavior request:", err)),
    );
  });

  Hooks.on("noodlrHooks.ruling", (event: HookEvent) => {
    noteRuling(event);
  });

  log("listening for noodlrHooks.* rulings");
}
