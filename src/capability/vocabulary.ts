// The rules of the language a compiled capability has to be written in — as handed to us.
//
// **Nothing here knows D&D, and nothing here may learn it.** The vocabulary arrives on the
// `noodlrHooks.compile` payload, authored by whichever rules module asked, and everything in this
// file is driven by that data: the prompt is generated from it and the validator checks against it.
// A future `noodlr-hooks-pf2e` will send a different one and this file will not change.
//
// That is not architectural fastidiousness. A compiler holding its own copy of the vocabulary would
// keep validating the previous version of it after the rules module shipped a new effect kind, and it
// would report success while doing so — descriptors that pass here and are rejected on arrival, with
// the disagreement invisible from both ends.

/** One entry in the effect or predicate table: which parameters it takes, and whether it runs. */
export interface ParamSpec {
  required: string[];
  optional: string[];
  /** Keys whose value must be a quantity object rather than a bare number or string. */
  quantities: string[];
  /** False when the rules module can express this but nothing executes it yet. */
  executable: boolean;
}

export interface Vocabulary {
  schema: number;
  triggerEvents: string[];
  effects: Record<string, ParamSpec>;
  predicates: Record<string, ParamSpec>;
  usePeriods: string[];
  units: string[];
  namedQuantities: string[];
  adjudication: string[];
  /**
   * Whom a predicate may ask about. Empty when the asking module does not declare them, in which case
   * `who` is left unchecked — an older rules module must not have its descriptors rejected for a field
   * this side has learned about since.
   */
  subjects: string[];
  /**
   * The status ids this world can actually apply. Empty when the asking module does not declare them,
   * and then unchecked, for the same reason as `subjects`.
   *
   * Worth sending rather than correcting afterwards: an invented status ("sheathed in booming energy")
   * is absent from every creature, so a guard asking whether somebody LACKS it passes always. Being
   * handed the list turns a repair round into a first-time answer.
   */
  statuses: string[];
}

/**
 * Read the payload's vocabulary defensively. Returns null when it is unusable, which is the honest
 * answer to a protocol we do not understand: refusing the batch costs a scene its descriptors, while
 * compiling against a half-read vocabulary costs the table rules that are wrong.
 */
export function asVocabulary(raw: unknown): Vocabulary | null {
  const v = raw as Vocabulary;
  if (!v || typeof v !== "object") return null;
  if (!Array.isArray(v.triggerEvents) || v.triggerEvents.length === 0) return null;
  if (!v.effects || typeof v.effects !== "object") return null;
  if (!v.predicates || typeof v.predicates !== "object") return null;
  return {
    schema: Number(v.schema) || 1,
    triggerEvents: v.triggerEvents.map(String),
    effects: normalizeTable(v.effects),
    predicates: normalizeTable(v.predicates),
    usePeriods: (v.usePeriods ?? []).map(String),
    units: (v.units ?? []).map(String),
    namedQuantities: (v.namedQuantities ?? []).map(String),
    adjudication: (v.adjudication ?? ["engine", "narration", "gm"]).map(String),
    subjects: (v.subjects ?? []).map(String),
    statuses: (v.statuses ?? []).map(String),
  };
}

function normalizeTable(table: Record<string, unknown>): Record<string, ParamSpec> {
  const out: Record<string, ParamSpec> = {};
  for (const [kind, spec] of Object.entries(table)) {
    const s = spec as Partial<ParamSpec>;
    out[String(kind)] = {
      required: (s?.required ?? []).map(String),
      optional: (s?.optional ?? []).map(String),
      quantities: (s?.quantities ?? []).map(String),
      executable: s?.executable !== false,
    };
  }
  return out;
}

function isQuantity(value: unknown, vocab: Vocabulary): boolean {
  if (typeof value !== "object" || value === null) return false;
  const q = value as { value?: unknown; dice?: unknown; named?: unknown; units?: unknown };
  const hasValue = typeof q.value === "number" && Number.isFinite(q.value);
  const hasDice = typeof q.dice === "string" && q.dice.trim() !== "";
  const hasNamed = typeof q.named === "string" && vocab.namedQuantities.includes(q.named);
  if (!hasValue && !hasDice && !hasNamed) return false;
  if (q.units !== undefined && !vocab.units.includes(String(q.units))) return false;
  return true;
}

function checkParams(
  spec: ParamSpec | undefined,
  node: Record<string, unknown>,
  label: string,
  vocab: Vocabulary,
  errors: string[],
): void {
  if (!spec) return;
  for (const key of spec.required) {
    const value = node[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`${label} is missing required parameter "${key}"`);
    }
  }
  // `negate`, `kind`, `event` and `note` are structural rather than per-kind parameters, so they are
  // allowed everywhere. Anything else unrecognised is the model inventing a field, which is the exact
  // failure the closed vocabulary exists to catch.
  const allowed = new Set([...spec.required, ...spec.optional, "kind", "event", "note", "negate"]);
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) errors.push(`${label} has unknown parameter "${key}" — remove it`);
  }
  for (const key of spec.quantities) {
    if (node[key] !== undefined && !isQuantity(node[key], vocab)) {
      errors.push(
        `${label} parameter "${key}" must be an object like {"value": 15} or {"dice": "2d6"} or ` +
          `{"named": "half_speed"}, not ${JSON.stringify(node[key])}`,
      );
    }
  }
}

/**
 * Whom a predicate asks about. Three keys carry a subject, not one — `who` is the commonest and
 * `whom`/`of` are the second party in a two-creature question, and leaving those two unchecked would
 * let exactly the same unresolvable value through by a different door.
 *
 * Only checked when the asking module declared its subjects: an unchecked value is a guard that
 * silently resolves to nobody, while rejecting one on a module that never sent the list would be this
 * side inventing a constraint. See `Vocabulary.subjects`.
 */
function checkSubjects(
  node: Record<string, unknown>,
  label: string,
  vocab: Vocabulary,
  errors: string[],
): void {
  if (!vocab.subjects.length) return;
  for (const key of ["who", "whom", "of"] as const) {
    const value = node?.[key];
    if (value === undefined || vocab.subjects.includes(String(value))) continue;
    errors.push(
      `${label}.${key} "${String(value)}" names nobody the engine can resolve; use one of: ` +
        `${vocab.subjects.join(", ")} (the creature whose ability this is, is "self")`,
    );
  }
}

/** A status the world cannot apply. Unchecked when the asking module declared no list. */
function checkStatus(
  node: Record<string, unknown>,
  label: string,
  vocab: Vocabulary,
  errors: string[],
): void {
  if (!vocab.statuses.length || node?.status === undefined) return;
  const wanted = String(node.status).toLowerCase();
  if (vocab.statuses.some((id) => id.toLowerCase() === wanted)) return;
  errors.push(
    `${label}.status "${String(node.status)}" is not a status this world has; choose one of the ` +
      `listed status ids, or drop the rule if none of them is what the text means`,
  );
}

/**
 * Validate one compiled capability against the vocabulary we were handed.
 *
 * Returns EVERY problem rather than the first, because the errors are fed straight back to the model
 * as a repair prompt and one round trip that fixes four mistakes is cheaper than four that fix one.
 * The messages are written to be read by a model, so they say what to do rather than what is wrong.
 *
 * This is a near-mirror of the rules module's own validator, deliberately duplicated across the
 * boundary: it runs there too, on arrival, and the second check is what makes a compiler bug a
 * rejected descriptor rather than a rule nobody vetted.
 */
export function validateAgainst(
  vocab: Vocabulary,
  input: unknown,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const cap = input as {
    label?: unknown;
    rules?: unknown;
  };
  if (!cap || typeof cap !== "object")
    return { ok: false, errors: ["the answer is not an object"] };
  if (!Array.isArray(cap.rules)) {
    return {
      ok: false,
      errors: ['"rules" must be an array (use [] for a purely flavourful trait)'],
    };
  }

  cap.rules.forEach((rule: any, index: number) => {
    const at = `rules[${index}]`;
    if (!rule || typeof rule !== "object") {
      errors.push(`${at} is not an object`);
      return;
    }
    const event = rule.trigger?.event;
    if (!vocab.triggerEvents.includes(String(event))) {
      errors.push(
        `${at}.trigger.event "${event}" is not allowed; choose one of: ${vocab.triggerEvents.join(", ")}`,
      );
    }
    const kind = String(rule.effect?.kind ?? "");
    if (!vocab.effects[kind]) {
      errors.push(
        `${at}.effect.kind "${kind}" is not allowed; choose one of the listed effect kinds`,
      );
    } else {
      checkParams(vocab.effects[kind], rule.effect, `${at}.effect`, vocab, errors);
      checkStatus(rule.effect, `${at}.effect`, vocab, errors);
    }

    if (rule.condition !== undefined && !Array.isArray(rule.condition)) {
      errors.push(`${at}.condition must be an array`);
    } else {
      (rule.condition ?? []).forEach((predicate: any, pIndex: number) => {
        const pAt = `${at}.condition[${pIndex}]`;
        const pKind = String(predicate?.kind ?? "");
        if (!vocab.predicates[pKind]) {
          errors.push(`${pAt}.kind "${pKind}" is not allowed; choose one of the listed predicates`);
          return;
        }
        checkParams(vocab.predicates[pKind], predicate, pAt, vocab, errors);
        checkSubjects(predicate, pAt, vocab, errors);
        checkStatus(predicate, pAt, vocab, errors);
      });
    }

    if (rule.uses !== undefined) {
      if (!Number.isFinite(rule.uses?.max) || rule.uses.max <= 0) {
        errors.push(`${at}.uses.max must be a positive number`);
      }
      if (!vocab.usePeriods.includes(String(rule.uses?.per))) {
        errors.push(`${at}.uses.per must be one of: ${vocab.usePeriods.join(", ")}`);
      }
    }

    if (!vocab.adjudication.includes(String(rule.adjudication))) {
      errors.push(`${at}.adjudication must be one of: ${vocab.adjudication.join(", ")}`);
    }
    if (rule.adjudication === "gm" && !String(rule.note ?? "").trim()) {
      errors.push(`${at} uses adjudication "gm", so it needs a note saying what the human decides`);
    }
    if (kind === "voice_entity" && rule.adjudication !== "narration") {
      errors.push(`${at} effect "voice_entity" is always adjudication "narration"`);
    }
  });

  return { ok: errors.length === 0, errors };
}

/** One feature to read. Loose on purpose: the payload is authored by another module. */
export interface CompileItem {
  id?: string;
  label?: string;
  prose?: string;
  structured?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/**
 * The system message: the GM's doctrine, then the vocabulary, generated.
 *
 * Split because they answer to different owners. The doctrine is editable — a GM may want a house
 * style, a stricter reading, a note about their own conventions — and the vocabulary is not, because
 * it belongs to the module that asked and an edited copy would validate a language nobody speaks.
 * Same reasoning as the ruleset block: a guard that disappears when someone rewrites an unrelated
 * paragraph is not a guard.
 *
 * Here rather than in `compile.ts`, and taking the doctrine as an argument rather than reading the
 * setting, so that the corpus regression harness can build the byte-identical prompt outside Foundry.
 * A harness that assembled its own copy would drift, and would then certify a prompt nobody sends.
 */
export function composeSystemMessage(doctrine: string, vocabulary: Vocabulary): string {
  return [doctrine, "", "## VOCABULARY", describeVocabulary(vocabulary)].join("\n");
}

/** The feature, as the model sees it. Structured data is presented as outranking the prose. */
export function composeUserMessage(item: CompileItem): string {
  const parts = [`ABILITY: ${item.label ?? "(unnamed)"}`, "", "TEXT:", String(item.prose ?? "")];
  if (item.structured && Object.keys(item.structured).length > 0) {
    parts.push(
      "",
      "STRUCTURED DATA read off the live sheet. AUTHORITATIVE for every number it carries:",
      JSON.stringify(item.structured, null, 2),
    );
  }
  if (item.context && Object.keys(item.context).length > 0) {
    parts.push(
      "",
      "WHOSE ABILITY THIS IS, for resolving what the text calls 'the creature':",
      JSON.stringify(item.context, null, 2),
    );
  }
  return parts.join("\n");
}

/**
 * The repair prompt, sent once when the first answer does not validate.
 *
 * Shared with the harness for the same reason as the two above: the repair round is a large part of
 * what determines whether a model is usable here, and a harness that measured a different repair
 * prompt would be measuring the wrong thing.
 */
export function composeRepairMessage(errors: string[]): string {
  return [
    "That did not validate. Fix EVERY problem below and return the corrected JSON object only.",
    "",
    ...errors.map((e) => `- ${e}`),
    "",
    "Remember: an empty rules array is a valid answer. Dropping a rule you cannot express in the",
    "vocabulary is better than inventing a kind or a parameter that is not listed.",
  ].join("\n");
}

/** The vocabulary, rendered for a prompt. Generated rather than written, so it cannot drift. */
export function describeVocabulary(vocab: Vocabulary): string {
  const line = (kind: string, spec: ParamSpec): string => {
    const req = spec.required.length
      ? ` required: ${spec.required.join(", ")}`
      : " no required parameters";
    const opt = spec.optional.length ? `; optional: ${spec.optional.join(", ")}` : "";
    const q = spec.quantities.length ? `; quantities: ${spec.quantities.join(", ")}` : "";
    // Marked rather than hidden: an inert kind is still the honest reading of a rule, and the sheet
    // shows it as understood-but-not-run. Mangling it into an executable kind would be worse.
    const inert = spec.executable ? "" : " [not executed yet]";
    return `- ${kind}:${req}${opt}${q}${inert}`;
  };
  return [
    `TRIGGER EVENTS (trigger.event):\n${vocab.triggerEvents.join(", ")}`,
    "",
    `EFFECT KINDS (effect.kind), with the ONLY parameters each may carry:`,
    ...Object.entries(vocab.effects).map(([k, s]) => line(k, s)),
    "",
    `PREDICATES (condition[].kind), with the ONLY parameters each may carry:`,
    ...Object.entries(vocab.predicates).map(([k, s]) => line(k, s)),
    "",
    `Any predicate may also carry "negate": true to mean "unless".`,
    `A quantity is {"value": <number>} or {"dice": "<formula>"} or {"named": "<one of: ${vocab.namedQuantities.join(", ")}>"}, optionally with "units" from: ${vocab.units.join(", ")}.`,
    `uses.per must be one of: ${vocab.usePeriods.join(", ")}.`,
    ...(vocab.subjects.length
      ? [
          `"who" (and "whom", and "of") name whom a predicate asks about. The ONLY values are: ${vocab.subjects.join(", ")}. Nothing else resolves — a role ("the caster", "the owner"), a creature's name, or an object is read as nobody, and a guard about nobody stops the rule. The creature whose ability this is, is "self".`,
        ]
      : []),
    ...(vocab.statuses.length
      ? [
          `A "status" parameter must be one of these ids exactly. There is no other way to name a condition, and an id this world does not have can never be applied or tested for:\n${vocab.statuses.join(", ")}`,
        ]
      : []),
    "",
    describeShape(vocab),
  ].join("\n");
}

/**
 * One complete rule object, spelled out.
 *
 * Generated from the vocabulary rather than written into the doctrine, for two reasons that pull the
 * same way. It cannot contradict the tables above it, so a rules module that renames a kind gets a
 * correct example for free — and a hand-written example naming D&D kinds would be the one place in this
 * file that knew D&D, which is the rule the header states.
 *
 * WHY THIS EXISTS AT ALL: 576 of 693 guards in a live cache were filed under `conditions`, plural,
 * because the prompt named that field only as an English noun ("the conditions under which it fires")
 * while every key it spelled in dotted form came back correct 100% of the time. **A field named in
 * prose is a field returned at chance.** The skeleton is the cheapest possible fix and the parameter
 * placeholders are deliberately `<...>` rather than plausible values: a filled-in example gets copied.
 */
function describeShape(vocab: Vocabulary): string {
  const event =
    vocab.triggerEvents.find((e) => e !== "always") ?? vocab.triggerEvents[0] ?? "always";
  const [effectKind, effectSpec] = Object.entries(vocab.effects).find(
    ([, s]) => s.executable && s.required.length,
  ) ??
    Object.entries(vocab.effects)[0] ?? ["", undefined];
  const [predKind, predSpec] = Object.entries(vocab.predicates).find(
    ([, s]) => s.required.length,
  ) ??
    Object.entries(vocab.predicates)[0] ?? ["", undefined];

  const params = (spec: ParamSpec | undefined): string =>
    (spec?.required ?? [])
      .map((key) =>
        spec?.quantities.includes(key) ? `, "${key}": {"value": <number>}` : `, "${key}": <${key}>`,
      )
      .join("");

  return [
    "THE SHAPE OF ONE RULE. Every key here is spelled the only way it is read:",
    "{",
    `  "trigger": {"event": "${event}"},`,
    `  "condition": [{"kind": "${predKind}"${params(predSpec)}}],`,
    `  "effect": {"kind": "${effectKind}"${params(effectSpec)}},`,
    '  "adjudication": "engine",',
    '  "uses": {"max": <number>, "per": "<one of the periods above>"},',
    '  "note": "<only when adjudication is not engine, or when a human needs telling something>"',
    "}",
    '"condition" is an array and is spelled in the singular. "uses" and "note" are optional; the other three are not.',
  ].join("\n");
}
