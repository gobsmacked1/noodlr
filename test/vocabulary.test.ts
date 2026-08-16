import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  asVocabulary,
  describeVocabulary,
  validateAgainst,
  type Vocabulary,
} from "../src/capability/vocabulary";
import { parseJsonReply } from "../src/capability/client";

/**
 * A miniature vocabulary, invented for the test rather than copied from the rules module.
 *
 * That is the point being asserted: nothing in the compiler may know D&D, so a vocabulary with a
 * made-up effect kind has to work exactly as well as the real one. A test built from the real
 * vocabulary would pass even if the validator had hardcoded it.
 */
const VOCAB: Vocabulary = asVocabulary({
  schema: 1,
  triggerEvents: ["on_turn_start", "on_hit"],
  effects: {
    heal: { required: ["amount"], optional: ["target"], quantities: ["amount"], executable: true },
    // Invented. The real 5e vocabulary has nothing called this.
    sprout_wings: { required: ["span"], optional: [], quantities: [], executable: false },
    voice_entity: { required: ["speaker"], optional: [], quantities: [], executable: false },
  },
  predicates: {
    damage_taken: {
      required: ["window"],
      optional: ["damageTypes"],
      quantities: [],
      executable: true,
    },
  },
  usePeriods: ["turn", "day"],
  units: ["hp", "ft"],
  namedQuantities: ["speed", "half_speed"],
  adjudication: ["engine", "narration", "gm"],
})!;

const regeneration = () => ({
  label: "Regeneration",
  rules: [
    {
      trigger: { event: "on_turn_start" },
      condition: [
        { kind: "damage_taken", window: "since_last_turn", damageTypes: ["fire"], negate: true },
      ],
      effect: { kind: "heal", amount: { value: 15, units: "hp" } },
      adjudication: "engine",
    },
  ],
});

test("a well-formed capability validates", () => {
  assert.deepEqual(validateAgainst(VOCAB, regeneration()), { ok: true, errors: [] });
});

test("an empty rules array is a legitimate answer, not an error", () => {
  const result = validateAgainst(VOCAB, { label: "Amphibious", rules: [] });
  assert.equal(result.ok, true);
});

test("an invented effect kind is rejected", () => {
  const cap = regeneration();
  (cap.rules[0].effect as any).kind = "heal_a_lot";
  const result = validateAgainst(VOCAB, cap);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /heal_a_lot/);
});

test("an invented parameter is rejected — the whole reason the level is closed", () => {
  const cap = regeneration();
  (cap.rules[0].effect as any).healingType = "regeneration";
  const result = validateAgainst(VOCAB, cap);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /healingType/);
});

test("a bare number where a quantity belongs is rejected, and the message says what to write", () => {
  const cap = regeneration();
  (cap.rules[0].effect as any).amount = 15;
  const result = validateAgainst(VOCAB, cap);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /"value": 15/);
});

test("every problem is reported at once, so one repair round can fix them all", () => {
  const result = validateAgainst(VOCAB, {
    label: "Nonsense",
    rules: [
      {
        trigger: { event: "on_moonrise" },
        condition: [{ kind: "is_a_wizard" }],
        effect: { kind: "heal" },
        adjudication: "vibes",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 4, `expected several errors, got ${result.errors.length}`);
});

test("negate is allowed on any predicate without being declared per kind", () => {
  assert.equal(validateAgainst(VOCAB, regeneration()).ok, true);
});

test("a gm rule has to say what the human is deciding", () => {
  const cap: any = regeneration();
  cap.rules[0].adjudication = "gm";
  assert.equal(validateAgainst(VOCAB, cap).ok, false);
  cap.rules[0].note = "whether the ritual site counts as consecrated";
  assert.equal(validateAgainst(VOCAB, cap).ok, true);
});

test("voice_entity is always narration", () => {
  const cap: any = {
    label: "Speak with Dead",
    rules: [
      {
        trigger: { event: "on_hit" },
        condition: [],
        effect: { kind: "voice_entity", speaker: "the corpse" },
        adjudication: "engine",
      },
    ],
  };
  assert.equal(validateAgainst(VOCAB, cap).ok, false);
  cap.rules[0].adjudication = "narration";
  assert.equal(validateAgainst(VOCAB, cap).ok, true);
});

test("an unusable vocabulary is refused rather than half-read", () => {
  assert.equal(asVocabulary(null), null);
  assert.equal(asVocabulary({ triggerEvents: [], effects: {}, predicates: {} }), null);
  assert.equal(asVocabulary({ triggerEvents: ["on_hit"], predicates: {} }), null);
});

test("the prompt is generated from the vocabulary, including kinds nobody has heard of", () => {
  const text = describeVocabulary(VOCAB);
  assert.match(text, /sprout_wings/);
  assert.match(text, /required: span/);
  assert.match(text, /\[not executed yet\]/);
  assert.match(text, /half_speed/);
});

/**
 * The same vocabulary, plus the two lists that only exist on a newer rules module. Separate rather
 * than added to VOCAB above, because the interesting property is the OLD one: a module that sends
 * neither must have its descriptors accepted unchanged, or upgrading this side breaks that side.
 */
const DECLARED: Vocabulary = asVocabulary({
  schema: 1,
  triggerEvents: ["on_turn_start"],
  effects: {
    // Invented, as above. `status` is a parameter name rather than a D&D concept.
    daub: { required: ["status"], optional: [], quantities: [], executable: true },
  },
  predicates: {
    lacks_status: { required: ["status"], optional: ["who"], quantities: [], executable: true },
  },
  usePeriods: ["turn"],
  units: [],
  namedQuantities: [],
  adjudication: ["engine", "narration", "gm"],
  subjects: ["self", "target"],
  statuses: ["speckled", "smudged"],
})!;

const daubed = (over: Record<string, unknown> = {}) => ({
  label: "Daubing",
  rules: [
    {
      trigger: { event: "on_turn_start" },
      condition: [{ kind: "lacks_status", status: "speckled", who: "self" }],
      effect: { kind: "daub", status: "speckled" },
      adjudication: "engine",
      ...over,
    },
  ],
});

test("a declared subject validates and an unresolvable one does not", () => {
  assert.equal(validateAgainst(DECLARED, daubed()).ok, true);
  const cap: any = daubed();
  cap.rules[0].condition[0].who = "the owner";
  const result = validateAgainst(DECLARED, cap);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /the owner/);
});

test("whom and of are checked too, or the same bad value walks in another door", () => {
  const cap: any = daubed();
  cap.rules[0].condition[0].whom = "Rogwiz Ardue";
  assert.equal(validateAgainst(DECLARED, cap).ok, false);
});

test("a status the world does not have is refused, on the effect and on the guard", () => {
  const onEffect: any = daubed();
  onEffect.rules[0].effect.status = "sheathed in booming energy";
  assert.equal(validateAgainst(DECLARED, onEffect).ok, false);

  // The one that matters: a guard asking whether somebody LACKS an invented status passes always,
  // so the rule fires unconditionally and nothing anywhere reports why.
  const onGuard: any = daubed();
  onGuard.rules[0].condition[0].status = "sheathed in booming energy";
  assert.equal(validateAgainst(DECLARED, onGuard).ok, false);
});

test("a module that declares neither list has both left unchecked", () => {
  // The same specs with only the two lists removed, so the one variable under test is their absence.
  // A rules module older than this check sends no lists at all, and its descriptors must still be
  // accepted — an upgrade on this side that rejected them would take that table's compiler away.
  const older: Vocabulary = { ...DECLARED, subjects: [], statuses: [] };
  const cap: any = daubed();
  cap.rules[0].condition[0].who = "the owner";
  cap.rules[0].condition[0].status = "sheathed in booming energy";
  cap.rules[0].effect.status = "sheathed in booming energy";
  assert.equal(validateAgainst(older, cap).ok, true);
  // And the same descriptor is refused the moment the lists arrive, which is what makes the pass above
  // permission rather than the checks silently not running.
  assert.equal(validateAgainst(DECLARED, cap).ok, false);
});

test("both lists reach the prompt when they are declared", () => {
  const text = describeVocabulary(DECLARED);
  assert.match(text, /"who"/);
  assert.match(text, /self, target/);
  assert.match(text, /speckled, smudged/);
  // And are absent rather than described as empty when they are not.
  assert.doesNotMatch(describeVocabulary(VOCAB), /status" parameter must be one of/);
});

test("a fenced reply still parses, because models fence even in JSON mode", () => {
  assert.deepEqual(parseJsonReply('```json\n{"rules": []}\n```'), { rules: [] });
  assert.deepEqual(parseJsonReply('Here you go: {"rules": []} — hope that helps'), { rules: [] });
  assert.throws(() => parseJsonReply("I am afraid I cannot do that"));
});
