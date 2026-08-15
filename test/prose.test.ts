// What may and may not be dropped on the way into memory.
//
// The two tests that matter pull in opposite directions, which is the whole reason the predicate is
// conditional: the Troll's authoring note MUST go, and a GM's own hidden campaign secret MUST stay.
// A scrubber that got either one wrong would be silent about it — a note reaching the store reads as
// a rule, and a deleted secret reads as memory never having learned it.

import assert from "node:assert/strict";
import test from "node:test";

import { dropMetaAsides } from "../src/rag/prose";

/**
 * Loathsome Limbs, verbatim from dnd5e 5.3.3
 * (`packs/_source/monsterfeatures24/traits/loathsome-limbs.yml`).
 *
 * The specimen for all of this. Note that the RULE half contains `@UUID[Compendium.dnd5e.…]`, which
 * is why `compendium` is not in the vocabulary: judging on that word would put the rule itself in
 * scope.
 */
const TROLL =
  '<p class="feature">If the troll ends any turn Bloodied and took 15+ Slashing damage during ' +
  "that turn, one of the troll's limbs is severed, falls into the troll's space, and becomes a " +
  "<strong>@UUID[Compendium.dnd5e.actors24.Actor.mmTrollLimb00000]{Troll Limb}</strong>. The limb " +
  "acts immediately after the troll's turn. The troll has 1 &amp;Reference[Exhaustion apply=false] " +
  "level for each missing limb, and it grows replacement limbs the next time it regains Hit " +
  'Points.</p><section class="secret" id="secret-01PBOuaZ8xS1KYt6"><p><strong>Foundry Note</strong>' +
  "</p><p>This feature provides an Active Effect condition in the character sheet's Effects tab to " +
  "enable each level of Exhaustion. Since the condition can be applied multiple times, the GM must " +
  "manually manage the level of Exhaustion. There is an active effect available for each level of " +
  "exhaustion.</p></section>";

test("the Troll's authoring note goes and the rule beside it stays", () => {
  const { html, removed } = dropMetaAsides(TROLL);
  assert.equal(removed, 1);
  assert.ok(!html.includes("Foundry Note"));
  assert.ok(!html.includes("manually"));
  assert.ok(!html.includes("Effects tab"));
  // The clause the compiler and a rules question both need is still there.
  assert.ok(html.includes("1 &amp;Reference[Exhaustion apply=false] level for each missing limb"));
  assert.ok(html.includes("15+ Slashing damage"));
});

test("a GM's hidden campaign secret is kept, because that is what gm_* silos are for", () => {
  const lore =
    "<p>The mayor greets you warmly and offers rooms at the inn.</p>" +
    '<section class="secret"><p>The mayor is the cult\'s high priest. He poisoned the previous ' +
    "mayor and keeps the reliquary behind the fireplace in his study.</p></section>";
  const { html, removed } = dropMetaAsides(lore);
  assert.equal(removed, 0);
  assert.equal(html, lore);
  assert.ok(html.includes("cult's high priest"));
});

test("a hidden section holding rules is kept — 55 of dnd5e's 848 are exactly this", () => {
  const axe =
    "<p>You gain a +1 bonus to attack and damage rolls with this weapon.</p>" +
    '<section class="secret"><p><strong>Curse.</strong> This weapon is cursed, and becoming ' +
    "attuned to it extends the curse to you. As long as you remain cursed, you are unwilling to " +
    "part with the weapon, keeping it within reach at all times.</p></section>";
  assert.deepEqual(dropMetaAsides(axe), { html: axe, removed: 0 });
});

test("tooling prose standing in the open is left alone", () => {
  // The deliberate limit of this predicate, recorded as behaviour rather than only as a comment:
  // sentence-level deletion over a GM's own uploads risks eating their campaign, and across all of
  // dnd5e this case is 5 descriptions. See `keepOpenProse`.
  const open =
    "<p>You can drag your choice from the above onto your character sheet and it will " +
    "automatically update.</p>";
  assert.deepEqual(dropMetaAsides(open), { html: open, removed: 0 });
});

test("only the note goes when a description carries both kinds of hidden section", () => {
  const both =
    '<section class="secret"><p>The door is a mimic.</p></section>' +
    "<p>Opening it requires a DC 15 check.</p>" +
    '<section class="secret"><p><strong>Foundry Note</strong></p><p>Apply the condition manually.' +
    "</p></section>";
  const { html, removed } = dropMetaAsides(both);
  assert.equal(removed, 1);
  assert.ok(html.includes("The door is a mimic."));
  assert.ok(html.includes("DC 15"));
  assert.ok(!html.includes("Foundry Note"));
});

test("prose with no hidden section is returned unchanged, and repeatedly so", () => {
  const plain = "<p>The troll regains 10 hit points at the start of its turn.</p>";
  // Called twice on purpose: the section regex is global, and a stateful `lastIndex` would make the
  // second call behave differently from the first.
  assert.deepEqual(dropMetaAsides(plain), { html: plain, removed: 0 });
  assert.deepEqual(dropMetaAsides(plain), { html: plain, removed: 0 });
});

test("a note is still found after a call that matched, i.e. no leaked regex state", () => {
  assert.equal(dropMetaAsides(TROLL).removed, 1);
  assert.equal(dropMetaAsides(TROLL).removed, 1);
  assert.equal(dropMetaAsides(TROLL).removed, 1);
});
