import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  asVocabulary,
  composeRepairMessage,
  composeUserMessage,
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
  assert.deepEqual(validateAgainst(VOCAB, regeneration()), { ok: true, errors: [], codes: [] });
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
  // NAMES THE KIND AND LISTS WHAT IT DOES TAKE. The parameter set is per-kind and the label
  // ("rules[0].effect") does not carry it, so the bare message could not distinguish "the model
  // invented a field" from "our vocabulary has a gap" — which is exactly the call that had to be
  // made 13 times over one live recompile, on a parameter that turned out to be a real omission.
  assert.match(result.errors.join(" "), /"heal" takes only: amount, target/);
});

/**
 * Every code `validateAgainst` can emit, asserted as a set rather than one at a time.
 *
 * These strings are a REPORTING CONTRACT, not decoration: `compile.ts` tallies repair rounds by code
 * so a run says "gm-note x99" in the one line an operator reads, and a rename that nobody notices
 * turns that line into a lie by silently zeroing a family. The messages are free to be reworded; the
 * codes are not.
 */
test("every problem carries a stable code beside its message", () => {
  const result = validateAgainst(VOCAB, {
    label: "Nonsense",
    rules: [
      {
        trigger: { event: "on_moonrise" },
        condition: [{ kind: "is_a_wizard" }],
        effect: { kind: "heal", healingType: "fast" },
        uses: { max: 0, per: "fortnight" },
        adjudication: "vibes",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.codes.length, result.errors.length);
  assert.deepEqual([...new Set(result.codes)].sort(), [
    "adjudication",
    "param-missing",
    "param-unknown",
    "predicate-kind",
    "trigger-event",
    "uses-max",
    "uses-per",
  ]);
  assert.deepEqual(validateAgainst(VOCAB, "not an object").codes, ["not-object"]);
  assert.deepEqual(validateAgainst(VOCAB, { label: "x" }).codes, ["rules-not-array"]);
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

/**
 * The rule above, asserted from the other end. The validator has always rejected a noteless `gm` rule
 * and the skeleton used to call the field optional, which cost 51 repair prompts in one 480-wording
 * recompile. A validator requirement the prompt does not state is a bill, so both halves are pinned.
 */
test("the prompt states the one case where a note is not optional", () => {
  const text = describeVocabulary(VOCAB);
  assert.match(text, /"note" is REQUIRED on every rule whose "adjudication" is "gm"/);
  assert.doesNotMatch(text, /"note" are optional/);
});

/**
 * The other four rules the validator enforces and the prompt never stated, pinned in the same shape as
 * the note above and for the same reason.
 *
 * A CENSUS FOUND THESE, NOT A READING. Each was written down once, in the doctrine — which is frozen
 * per world and therefore reaches nobody who upgrades — while this half of the prompt is composed at
 * request time and reaches everybody. **An unstated requirement is enforced at chance**, so its cost
 * stays invisible until a wording happens to trip it: 2 answers in one 960-wording recompile came back
 * with no `rules` array at all, and the envelope was described nowhere the model could not miss it.
 */
test("the prompt states the envelope, the adjudication values, and the two hard rules", () => {
  const text = describeVocabulary(VOCAB);
  // The object the rules go in. This function was titled "the shape of one rule" and showed one rule.
  assert.match(text, /"rules": \[/);
  assert.match(text, /"rules" is REQUIRED and is ALWAYS an array/);
  // All three values, glossed. An example is not an enumeration, and only "engine" was ever shown —
  // on the most consequential choice the model makes (a live census put 86% of rules on "gm").
  assert.match(text, /"adjudication" must be exactly one of: .*"engine".*"narration".*"gm"/);
  assert.match(text, /a human has to decide/);
  assert.match(text, /"max" must be a positive number/);
  assert.match(text, /"voice_entity" effect is always adjudication "narration"/);
});

/**
 * ...and the last of those is conditional on the vocabulary declaring the kind, which is the rule this
 * whole file exists to assert: nothing here may know a specific effect. A `noodlr-hooks-pf2e` without
 * `voice_entity` must not be told about it.
 */
test("a rule about a kind this vocabulary lacks is not stated", () => {
  const without = asVocabulary({
    schema: 1,
    triggerEvents: ["on_hit"],
    effects: { heal: { required: ["amount"], optional: [], quantities: [], executable: true } },
    predicates: { damage_taken: { required: [], optional: [], quantities: [], executable: true } },
    usePeriods: ["turn"],
    units: [],
    namedQuantities: [],
    adjudication: ["engine"],
  })!;
  assert.doesNotMatch(describeVocabulary(without), /voice_entity/);
  // And an unfamiliar adjudication value is rendered bare rather than mislabelled with a gloss we
  // invented — the failure direction that costs nothing.
  assert.match(describeVocabulary(without), /must be exactly one of: "engine"/);
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

test("damage_taken windows are closed in the prompt when that predicate exists", () => {
  const text = describeVocabulary(VOCAB);
  assert.match(text, /"this_turn"/);
  assert.match(text, /"since_last_turn"/);
  assert.match(text, /"this_round"/);
  assert.match(text, /"ever"/);
  // An older module that never sent the list still gets the four strings, not free text.
  assert.match(text, /"window" on damage_taken is required/);
});

test("caster means self when the asking module declared that subject", () => {
  const text = describeVocabulary(DECLARED);
  assert.match(text, /caster/);
  assert.match(text, /-> "self"/);
  // DECLARED has no trigger subject, so that alias row must not appear as a legal write.
  assert.doesNotMatch(text, /-> "trigger"/);
  assert.doesNotMatch(text, /-> "attacker"/);
});

test("reserved statuses are named only when this world already has one", () => {
  assert.doesNotMatch(describeVocabulary(DECLARED), /Never emit apply_status/);
  const withDead: Vocabulary = { ...DECLARED, statuses: ["speckled", "dead"] };
  const text = describeVocabulary(withDead);
  assert.match(text, /Never emit apply_status/);
  assert.match(text, /dead/);
});

test("the user message tells the model the sheet numbers already fire", () => {
  const text = composeUserMessage({
    label: "Fire Bolt",
    prose: "A mote of fire.",
    structured: { damage: [{ formula: "1d10", types: ["fire"] }] },
    context: { name: "Archmage" },
  });
  assert.match(text, /ALREADY EXECUTED/);
  assert.match(text, /subject self/);
  assert.match(text, /ABILITY: Fire Bolt/);
  assert.match(text, /TEXT:/);
});

test("the repair prompt names the guard array in the singular", () => {
  const text = composeRepairMessage(['rules[0]: unknown parameter "target"']);
  assert.match(text, /condition, singular/);
  assert.match(text, /the whole object/);
  assert.match(text, /dropping a guard/);
});

test("a fenced reply still parses, because models fence even in JSON mode", () => {
  assert.deepEqual(parseJsonReply('```json\n{"rules": []}\n```'), { rules: [] });
  assert.deepEqual(parseJsonReply('Here you go: {"rules": []} — hope that helps'), { rules: [] });
  assert.throws(() => parseJsonReply("I am afraid I cannot do that"));
});
