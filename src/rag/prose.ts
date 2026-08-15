// Keeping instructions about Foundry out of the memory store.
//
// THE PROBLEM. A game system's own compendia ship asides written by its content team and addressed
// to the human running the table, describing what the software cannot do and what the reader must
// therefore do by hand. dnd5e has 793 of them and every one opens with the words "Foundry Note":
//
//   "The Exhaustion levels from missing limbs must be applied manually."      (Loathsome Limbs)
//   "The resistances outlined will need to be manually enabled/disabled."     (Draconic Origin)
//   "You can select the damage type in the damage roll's dialog box."         (Sneak Attack)
//
// These are not rules, and a retrieved chunk does not carry a label saying so. Injected under the
// `# Retrieved campaign memory` header they read with exactly the authority of the rulebook text
// beside them, so the failure mode is a bot telling a player that their GM applies something by hand
// — advice about our software, delivered as if it were advice about the game.
//
// WHY THIS IS A SEPARATE, SMALLER JOB THAN THE RULES MODULE'S. `noodlr-hooks-55e` scrubs the same
// notes out of a creature's prose before a model compiles it into a machine-readable descriptor, and
// there the stakes are much higher: the Troll's note is a plain-English instruction NOT to emit the
// effect the rule states, a well-behaved model obliges, and the rule silently vanishes with nothing
// anywhere reporting it. Here the worst case is a badly-worded answer. So this file takes the half of
// that predicate which pays for itself — hidden sections that talk about the software — and
// deliberately does not attempt the rest; see `keepOpenProse` below.
//
// It is a DELIBERATE SECOND COPY of that module's vocabulary, not an import. Neither module depends
// on the other and that is the architecture, the same call already made for the title-bar Save
// button. Twenty lines is cheaper than the coupling, and the two are allowed to diverge because they
// are answering slightly different questions.

/** A section `enrichHTML` hides from players. */
const SECRET =
  /<section\b[^>]*\bclass\s*=\s*(["'])[^"']*\bsecret\b[^"']*\1[^>]*>[\s\S]*?<\/section>/gi;

/**
 * Vocabulary that talks about the SOFTWARE rather than about the game.
 *
 * Narrow on purpose: a rule is a statement about a world with creatures and dice in it, and it has
 * no reason to mention a tab, an Active Effect or a module. Every term was taken from a note that
 * exists in the shipped dnd5e corpus and then measured against all 31,845 of its ability
 * descriptions (`npm run census:notes` in `noodlr-hooks-55e`).
 *
 * `compendium` is deliberately absent and is the omission worth knowing about: it reads as pure
 * tooling and is not, because `@UUID[Compendium.dnd5e.…]` is how a link to a spell is written, so
 * the word sits in the middle of thousands of ordinary rules. Measured, adding it takes the strip
 * from 5 descriptions to 2,469.
 */
const TOOLING = new RegExp(
  [
    String.raw`\bfoundry\b`,
    String.raw`\bactive effects?\b`,
    String.raw`\beffects? tab\b`,
    String.raw`\b(?:character|actor|creature|item|monster)(?:'s|s')? sheet\b`,
    String.raw`\bsheet(?:'s|s')? (?:effects?|details|inventory) tab\b`,
    String.raw`\bmacros?\b`,
    String.raw`\bmidi[\s-]?qol\b`,
    String.raw`\bdae\b`,
    String.raw`\blibwrapper\b`,
    String.raw`\bmanually\b`,
    String.raw`\benabled\s*\/\s*disabled\b`,
  ].join("|"),
  "i",
);

/**
 * Drop hidden sections that are about the software, and keep every other one.
 *
 * **THE CONDITION IS NOT OPTIONAL POLISH HERE — IT IS THE WHOLE SAFETY ARGUMENT, and the reasoning
 * is stronger on this side of the wire than on the rules module's.** `class="secret"` is what a GM
 * marks their own campaign secrets with: the villain's real name, what is actually behind the door,
 * the faction's plan. Those are precisely what the `gm_*` silos exist to hold, so a scrubber that
 * dropped hidden sections wholesale would quietly delete the most valuable thing a GM ingests, and
 * it would look like memory simply never learning the secrets they wrote down.
 *
 * So being hidden is not the test. Talking about Foundry is the test. A hidden section holding
 * campaign material is kept and indexed like any other prose; a hidden section holding an authoring
 * note is dropped, whole, because the note's own heading and its follow-on sentences are one
 * authored unit and leaving the tail behind reads exactly like the note it came from.
 *
 * The same measurement says 55 of dnd5e's 848 hidden sections are ordinary rules text that happens
 * to be a surprise — a curse, a disease's progression, Sneak Attack's "Once per turn" — which is the
 * same finding from the published-content direction.
 */
export function dropMetaAsides(html: string): { html: string; removed: number } {
  let removed = 0;
  // One pass, and deliberately no `SECRET.test()` guard in front of it: the regex is global, so a
  // `test` advances its `lastIndex` and the next caller starts matching from the middle of their
  // string. That is a stateful bug that shows up as an occasional missed note, which is exactly the
  // failure this file exists to prevent. `replace` resets the index itself.
  const out = html.replace(SECRET, (section) => {
    if (!TOOLING.test(section)) return section;
    removed += 1;
    return "";
  });
  // The original string when nothing changed, so a caller can compare by identity.
  return removed === 0 ? { html, removed: 0 } : { html: out, removed };
}

/**
 * Why sentence-level scrubbing of open prose is NOT done here, though the rules module does it.
 *
 * There, an instruction reaching the compiler can suppress a rule outright, so the cost of missing
 * one is a creature that silently stops doing what its stat block says. Here the cost is one noisy
 * retrieved chunk. And the risk runs the other way: this path ingests whatever a GM uploads — their
 * own journals, their own lore, their own homebrew — where a sentence deleter working on an
 * eleven-term vocabulary will eventually eat a line of somebody's campaign and never mention it.
 *
 * The volume settles it. Across dnd5e's whole corpus the open-prose case is **5 descriptions, two
 * distinct sentences**, both of them "drag this onto your character sheet". Against 793 hidden notes
 * that is a rounding error, and it is not worth owning a silent deleter to catch it.
 *
 * Exported as documentation rather than code on purpose: this is a decision that will be revisited,
 * and the next person should find the reasoning at the place they would add the feature.
 */
export const keepOpenProse = true;
