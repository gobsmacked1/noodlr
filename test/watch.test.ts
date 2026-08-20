import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  asVocabulary,
  composeCompileMessage,
  composeJudgeMessage,
  composeSystemMessage,
  shapeDescriptor,
  shapeVerdict,
} from "../src/watch/watch";

/**
 * A miniature vocabulary, invented for the test rather than copied from the rules module.
 *
 * Nothing in the Watch reader may know D&D. A test built from the 5e event list would pass even
 * if compose had hardcoded `creature_moves`. This list has none of those names.
 */
const DECLARED = asVocabulary({
  protocol: 1,
  events: ["token_steps", "token_speaks", "gate_shifts"],
  sides: ["rival", "friend"],
  senses: ["eyes"],
  where: ["inReach", "ofSelf"],
  notes: ["Set judge:false only when the predicates fully express the sentence."],
})!;

const FIVE = asVocabulary({
  protocol: 1,
  events: [
    "creature_moves",
    "creature_damaged",
    "creature_casts",
    "creature_attacks",
    "narration",
  ],
  sides: ["enemy", "ally", "self", "any"],
  senses: ["sight", "hearing", "any"],
  where: ["ofSelf", "ofAlly", "inReach", "beyondSelf"],
  notes: [],
})!;

const doctrine = "You read a sentence. If anything here disagrees with # VOCABULARY, that block wins.";

test("asVocabulary refuses an empty event list", () => {
  assert.equal(asVocabulary({ events: [] }), null);
  assert.equal(asVocabulary(null), null);
});

test("compile generated half states the load-bearing rules Fusion found unstated", () => {
  const text = composeSystemMessage(doctrine, DECLARED, "compile");
  assert.match(text, /this block wins/);
  assert.match(text, /inReach takes only true/);
  assert.match(text, /A missing predicate PASSES/);
  assert.match(text, /judge false:/);
  assert.match(text, /judge true:/);
  assert.match(text, /never turn the watcher's own reach/);
  assert.match(text, /WAITING FOR/);
  assert.match(text, /problem ALONE/);
  assert.match(text, /\{"problem":/);
  assert.doesNotMatch(text, /creature_moves/);
  assert.doesNotMatch(text, /hostile \/ foe/);
  assert.doesNotMatch(text, /flees \/ approaches/);
});

test("the compile example skips the first event so it cannot teach that name onto everything", () => {
  const text = composeSystemMessage(doctrine, DECLARED, "compile");
  const example = text.match(/EXAMPLE ONLY[\s\S]+?\n(\{.+?\})\n/)?.[1];
  assert.ok(example, "expected a JSON example after EXAMPLE ONLY");
  const parsed = JSON.parse(example) as { events: string[]; where?: { inReach?: boolean } };
  assert.deepEqual(parsed.events, ["token_speaks", "gate_shifts"]);
  assert.equal(parsed.events.includes("token_steps"), false);
  assert.equal(parsed.where?.inReach, true);
});

test("alias rows print only when their write token arrived", () => {
  const five = composeSystemMessage(doctrine, FIVE, "compile");
  assert.match(five, /flees \/ approaches/);
  assert.match(five, /-> creature_moves/);
  assert.match(five, /hostile \/ foe \/ opponent/);
  assert.match(five, /side "enemy"/);
});

test("judge generated half does not emit compile-only lists or aliases", () => {
  const text = composeSystemMessage(doctrine, FIVE, "judge");
  assert.match(text, /this block wins/);
  assert.match(text, /creature_moves/);
  assert.match(text, /\{"fires": true/);
  assert.match(text, /Lean towards firing/);
  assert.match(text, /Never\nanswer false|Never answer false/);
  assert.doesNotMatch(text, /Sides —/);
  assert.doesNotMatch(text, /Placement keys/);
  assert.doesNotMatch(text, /WRITE THE LEGAL TOKEN/);
  assert.doesNotMatch(text, /hostile \/ foe/);
  assert.doesNotMatch(text, /-> creature_moves/);
});

test("the judge wrapper names the descriptor as a filter, not as the thing to judge", () => {
  const text = composeJudgeMessage("if they flee", { events: ["creature_moves"] }, { kind: "creature_moves" }, {
    name: "Rogue",
  });
  assert.match(text, /the filter that routed this event to you, not the thing to judge/);
  assert.doesNotMatch(text, /which is why this event reached you/);
});

test("the compile wrapper is unchanged", () => {
  const text = composeCompileMessage("if the ogre comes at me", { name: "Rogue", reach: 5 });
  assert.match(text, /What are they waiting for\?/);
  assert.match(text, /Their trigger, in their own words:/);
});

test("shapeDescriptor drops unknown events and keeps the rest", () => {
  const shaped = shapeDescriptor(
    {
      events: ["token_steps", "invented_verb", "gate_shifts"],
      judge: false,
      summary: "the gate or a step",
    },
    DECLARED,
  );
  assert.deepEqual(shaped?.events, ["token_steps", "gate_shifts"]);
  assert.equal(shaped?.judge, false);
});

test("an omitted judge defaults to true — the safe expensive reading", () => {
  const shaped = shapeDescriptor({ events: ["token_steps"], summary: "a step" }, DECLARED);
  assert.equal(shaped?.judge, true);
});

test("an explicit judge false stays false", () => {
  const shaped = shapeDescriptor(
    { events: ["token_steps"], judge: false, summary: "a step" },
    DECLARED,
  );
  assert.equal(shaped?.judge, false);
});

test("problem alone, with no events, is the honest unwatchable answer", () => {
  const shaped = shapeDescriptor({ problem: "the weather cannot be watched" }, DECLARED);
  assert.deepEqual(shaped?.events, []);
  assert.equal(shaped?.problem, "the weather cannot be watched");
  assert.equal(shaped?.judge, false);
});

test("an invented where key is dropped; a declared ofSelf distance is kept", () => {
  const shaped = shapeDescriptor(
    {
      events: ["token_steps"],
      where: { ofSelf: 5, invented: 10, inReach: true },
      judge: false,
      summary: "close",
    },
    DECLARED,
  );
  assert.deepEqual(shaped?.where, { inReach: true, ofSelf: 5 });
});

test("shapeVerdict returns null when fires is missing — never a fabricated no", () => {
  assert.equal(shapeVerdict({ why: "not sure" }), null);
  assert.equal(shapeVerdict({ fires: "false", why: "no" }), null);
  assert.deepEqual(shapeVerdict({ fires: false, why: "they walked, they did not flee" }), {
    fires: false,
    why: "they walked, they did not flee",
  });
});
