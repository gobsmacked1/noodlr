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

test("a fenced reply still parses, because models fence even in JSON mode", () => {
  assert.deepEqual(parseJsonReply('```json\n{"rules": []}\n```'), { rules: [] });
  assert.deepEqual(parseJsonReply('Here you go: {"rules": []} — hope that helps'), { rules: [] });
  assert.throws(() => parseJsonReply("I am afraid I cannot do that"));
});
