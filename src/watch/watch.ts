// Answering `noodlrHooks.watch`: reading a Ready trigger a player wrote in their own words.
//
// The capability compiler's sibling, and the same trade seen from the other side. There, a CREATURE's
// prose is compiled once and deterministic code runs it every turn. Here, a PLAYER's sentence is
// compiled once and deterministic code checks it against every event in the round. Same non-negotiable:
// the model reads what the words MEAN, and never what happens next.
//
// WHY IT IS NOT IN `capability/`. Two compile contracts are not one contract. A capability descriptor is
// a rule about a creature, cached by prose hash, shareable between worlds and valid forever; a watch
// descriptor is one person's intention for the next six seconds, never cached, worthless the moment it
// fires. They share a provider and a model — both jobs are "read a sentence, answer to a schema", which
// is a different choice from the model that narrates — and nothing else.
//
// TWO VERBS, ONE DOCTRINE. `compile` runs once at declaration, with a player sitting in front of a
// dialog waiting for it. `judge` runs mid-round on one candidate event, and is asked only when the
// descriptor could not be reduced to predicates — the rules module disposes of most events for nothing
// first, which is what makes this affordable at all. The two want opposite patience, so they get it:
// see `PATIENCE` below.
//
// NOTHING HERE KNOWS D&D, and nothing here may learn it. Every event name, side, sense and placement key
// arrives on the request, and the answer is checked against THAT rather than against anything of ours.
// A `noodlr-hooks-pf2e` must be able to send a different vocabulary and get correct answers with no
// change here — the same hard rule as `capability/vocabulary.ts`, and for the same reason: a compiler
// holding its own copy would go on validating last month's vocabulary and report success while doing it.

import { MODULE_ID, WATCH_SETTINGS, debug, log, warn } from "../constants";
import { isConfigured } from "../providers/types";
import type { ChatMessage } from "../providers/types";
import { promptDefault, promptValue } from "../prompts/fields";
import { getCapabilityConfig } from "../capability/config";
import { completeJson } from "../capability/client";

/**
 * A compile has a person waiting on it; a judge is holding up a round.
 *
 * The rules module awaits whatever we register with `waitFor` and has no timeout of its own, so these
 * numbers ARE the bound on how long a table can be made to sit still. A compile that gives up early
 * leaves the player with the picker while the answer is still in flight, so it is patient and gets one
 * retry. A judge that takes twenty seconds has already ruined the moment it was asked about, so it gets
 * one attempt and a short leash — an unanswered judge falls through to asking the human, which is a
 * good outcome, and is why being quick matters more here than being right.
 */
const PATIENCE = {
  compile: { timeoutMs: 60_000, maxRetries: 1 },
  judge: { timeoutMs: 20_000, maxRetries: 0 },
} as const;

/** The vocabulary as the asking module sent it. Everything optional; an absent list means unrestricted. */
export interface WatchVocabulary {
  protocol: number;
  events: string[];
  sides: string[];
  senses: string[];
  where: string[];
  notes: string[];
}

type WatchEvent = Record<string, any> & {
  verb?: string;
  vocabulary?: unknown;
  watcher?: Record<string, unknown>;
  prose?: string;
  descriptor?: Record<string, unknown>;
  event?: Record<string, unknown>;
  answer?: unknown;
  waitFor?: (p: Promise<unknown>) => void;
  handled?: boolean;
};

export function registerWatchSettings(): void {
  game.settings.register(MODULE_ID, WATCH_SETTINGS.enabled, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, WATCH_SETTINGS.systemPrompt, {
    scope: "world",
    config: false,
    type: String,
    default: promptDefault(WATCH_SETTINGS.systemPrompt),
  });
}

export function isWatchEnabled(): boolean {
  try {
    return Boolean(game.settings.get(MODULE_ID, WATCH_SETTINGS.enabled));
  } catch {
    return false;
  }
}

/** The doctrine half of the system message, as stored. Read verbatim (see prompts/fields.ts). */
export function getWatchPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, WATCH_SETTINGS.systemPrompt));
}

let registered = false;

export function registerWatchListener(): void {
  if (registered) return;
  registered = true;

  Hooks.on("noodlrHooks.watch", (event: WatchEvent) => {
    if (!isWatchEnabled()) return;
    if (event.handled) return;
    // The rules module routes the question to the GM before firing this, precisely so a player's
    // browser never spends the world's credit. Refusing it here as well costs nothing and means a
    // future caller that forgets to route cannot quietly bill the table's key from a player's client.
    if (!game.user?.isGM) return;

    const verb = String(event.verb ?? "");
    if (verb !== "compile" && verb !== "judge") return;

    const vocabulary = asVocabulary(event.vocabulary);
    if (!vocabulary) {
      warn("a watch request arrived without a usable vocabulary; declining it");
      return;
    }
    const prose = String(event.prose ?? "").trim();
    if (!prose) return;

    const cfg = getCapabilityConfig();
    if (!isConfigured(cfg)) {
      // Named rather than silent: with nothing listening the rules module offers a picker instead,
      // and a GM who does not know why the text field vanished will report the picker as the bug.
      warn(
        "a Ready trigger needs reading, but the Chat provider is not configured. Set a provider, " +
          "key and model in Text Generation, or turn off the trigger reader beside it.",
      );
      return;
    }

    event.handled = true;
    if (verb === "compile") {
      event.waitFor?.(
        compile(cfg, vocabulary, prose, event)
          .then((answer) => {
            event.answer = answer;
          })
          .catch((err) => warn("could not read that Ready trigger:", err)),
      );
      return;
    }
    event.waitFor?.(
      judge(cfg, vocabulary, prose, event)
        .then((answer) => {
          event.answer = answer;
        })
        // Deliberately swallowed to undefined rather than answered `{fires:false}`: the rules module
        // reads an unanswered judge as "no opinion" and asks the human, and a fabricated no is a
        // readied action that never fires and never says why.
        .catch((err) => warn("could not judge a Ready trigger:", err)),
    );
  });

  log("listening for noodlrHooks.watch");
}

/**
 * Read the payload's vocabulary. Null when it is unusable, which is the honest answer to a protocol we
 * do not understand — the caller then falls back to its own picker, which works.
 */
export function asVocabulary(raw: unknown): WatchVocabulary | null {
  const v = raw as Partial<WatchVocabulary> | null;
  if (!v || typeof v !== "object") return null;
  if (!Array.isArray(v.events) || v.events.length === 0) return null;
  return {
    protocol: Number(v.protocol) || 1,
    events: v.events.map(String),
    sides: (v.sides ?? []).map(String),
    senses: (v.senses ?? []).map(String),
    where: (v.where ?? []).map(String),
    notes: (v.notes ?? []).map(String),
  };
}

/** Doctrine, then the vocabulary that arrived, then which of the two questions is being asked. */
export function composeSystemMessage(
  doctrine: string,
  vocabulary: WatchVocabulary,
  verb: "compile" | "judge",
): string {
  return verb === "judge"
    ? composeJudgeSystem(doctrine, vocabulary)
    : composeCompileSystem(doctrine, vocabulary);
}

/**
 * Event-verb aliases. Prompt text only — a row prints if and only if its write token arrived on
 * this request. A pf2e vocabulary that never sent `creature_moves` must not be taught to write it.
 */
const EVENT_ALIASES: { write: string; lines: string[] }[] = [
  {
    write: "creature_moves",
    lines: [
      "moves / walks / runs / flees / approaches / closes in / backs off  -> creature_moves",
      "      (and judge true when the verb carries meaning, not just gait: fleeing is meaning,",
      "       moving is gait)",
    ],
  },
  {
    write: "creature_attacks",
    lines: [
      "attacks / swings / shoots / strikes / takes a swing at              -> creature_attacks",
    ],
  },
  {
    write: "creature_casts",
    lines: ["casts / starts a spell / begins an incantation                     -> creature_casts"],
  },
  {
    write: "creature_appears",
    lines: [
      "appears / comes into view / steps out / shows itself               -> creature_appears",
    ],
  },
  {
    write: "creature_damaged",
    lines: [
      "is hurt / takes damage / is wounded / gets hit for damage          -> creature_damaged",
    ],
  },
  {
    write: "creature_drops",
    lines: [
      "falls / drops / dies / goes down / goes unconscious (at 0 HP)      -> creature_drops",
    ],
  },
  {
    write: "creature_condition",
    lines: [
      "becomes prone / grappled / frightened, or any system condition     -> creature_condition",
      '      ("falls prone" is a condition being applied, not creature_drops)',
    ],
  },
  {
    write: "creature_turn_ends",
    lines: [
      "finishes its turn / after it acts / when its turn ends             -> creature_turn_ends",
    ],
  },
  {
    write: "door_changes",
    lines: ["a door opens / closes / unlocks / is opened                       -> door_changes"],
  },
  {
    write: "narration",
    lines: [
      'shouting / a cry / someone says something / "if I hear ..." with',
      "      no token to watch                                             -> narration",
    ],
  },
];

const SIDE_ALIASES: { write: string; lines: string[] }[] = [
  {
    write: "enemy",
    lines: ['hostile / foe / opponent / monster, meaning the other side -> side "enemy"'],
  },
  {
    write: "ally",
    lines: ['friend / companion / party / us / my allies                -> side "ally"'],
  },
  {
    write: "self",
    lines: [
      'I / me / myself / my character, as the SUBJECT of the trigger -> side "self"',
      "      (not merely because the player is who it happens TO: \"if the ogre comes at me\"",
      "       is about the ogre)",
    ],
  },
  {
    write: "any",
    lines: ['anyone / somebody / whoever / anything                     -> side "any"'],
  },
];

function composeCompileSystem(doctrine: string, vocabulary: WatchVocabulary): string {
  const lines: string[] = [
    doctrine.trim(),
    "",
    "# VOCABULARY",
    "",
    "If anything in this block disagrees with the instructions above it, this block wins.",
    "",
    "Event kinds you may name — a closed list. A name that is not on it is DROPPED, and if",
    "none survive the trigger cannot be watched at all:",
  ];
  for (const name of vocabulary.events) lines.push(`- ${name}`);

  if (vocabulary.sides.length) {
    lines.push("", `Sides — the only legal values for subject.side: ${vocabulary.sides.join(", ")}`);
  }
  if (vocabulary.senses.length) {
    lines.push(
      `Senses — the only legal values for subject.sense: ${vocabulary.senses.join(", ")}`,
    );
  }
  lines.push(...describePlacement(vocabulary.where));

  if (vocabulary.notes.length) {
    lines.push("", "From the module that asked:");
    for (const note of vocabulary.notes) lines.push(`- ${note}`);
  }

  const aliases = aliasLines(vocabulary);
  if (aliases.length) {
    lines.push("", "WRITE THE LEGAL TOKEN, NOT THE SYNONYM.");
    lines.push(...aliases);
  }

  lines.push(
    "",
    "SETTING judge — set it yourself, one way or the other, on every watchable trigger.",
    "  judge false: side + event kind(s) + where and/or statuses say the WHOLE sentence.",
    "    That is measurement: watched deterministically, free, forever, and the point of",
    "    compiling. A sentence fully said by side + an event + a placement or status —",
    "    write false. So is a condition being applied, or a door changing.",
    "  judge true: the sentence turns on MEANING the predicates cannot say — fleeing,",
    '    threatening, going for the door, "tries anything", "looks suspicious" — or on',
    "    hearing, or whenever you name narration. narration is judged no matter what you",
    "    write, so write true when you name it, or the player is shown a promise that is",
    "    not what happens.",
    "  If a predicate cannot be written without guessing, OMIT the predicate and set judge",
    "    true. Never drop the meaning in order to keep false.",
    "",
    "OMIT WHAT YOU ARE GUESSING. A missing predicate PASSES — it does not restrict, and the",
    "judgement behind it catches what it lets through. Never invent a distance from a word",
    'like "approaches", "near" or "backs off"',
    ...(vocabulary.where.includes("inReach")
      ? [
          ", and never turn the watcher's own reach into a number: when the player means their",
          "own melee reach, write inReach true.",
        ]
      : ["."]),
    "",
    "Compile only what they are WAITING FOR. What they intend to do about it is not part of",
    "the answer and has no field.",
    "",
    "# THE ANSWER",
    "",
    "Output exactly one JSON object and nothing else — no explanation, no commentary, no code",
    "fence. These are the only keys read:",
    "  events, subject.names, subject.side, subject.sense,",
    `  where.${
      vocabulary.where.length ? vocabulary.where.join(" / ") : "<placement keys listed above>"
    }, statuses, judge, summary, problem`,
    "Omit any field you have nothing honest to say about. subject.names are lowercase kinds or",
    "names taken from the sentence, at most 8. statuses are the game system's own condition",
    "ids, lowercase. summary and problem are at most 200 characters each.",
    "",
    "EXAMPLE ONLY — this shows the SHAPE, not defaults. The event kinds here are an",
    "illustration of an array that can hold several names; choose your own, and choose as many",
    "as the sentence could arrive as:",
    exampleCompile(vocabulary),
    "",
    "UNWATCHABLE EXAMPLE — when nothing on the event list could carry the sentence (weather,",
    'an hour passing, a feeling, "when it feels right"), answer with problem ALONE. It',
    "replaces the whole answer; it never accompanies events, judge or summary:",
    '{"problem": "<one sentence telling the player why this cannot be watched>"}',
    "",
    "Do not invent an event so the answer looks complete. An honest problem sends the player",
    "to the ordinary trigger list; an invented event sends them to a held action that never",
    "fires.",
  );
  return lines.join("\n");
}

function composeJudgeSystem(doctrine: string, vocabulary: WatchVocabulary): string {
  const lines: string[] = [
    doctrine.trim(),
    "",
    "# VOCABULARY",
    "",
    "If anything in this block disagrees with the instructions above it, this block wins.",
    "",
    "The kind of the event you are shown is one of these names, spelled exactly:",
  ];
  for (const name of vocabulary.events) lines.push(`- ${name}`);

  if (vocabulary.notes.length) {
    lines.push("", "From the module that asked:");
    for (const note of vocabulary.notes) lines.push(`- ${note}`);
  }

  lines.push(
    "",
    "You are judging ONE event against the player's own sentence. The descriptor you wrote",
    "earlier is only the filter that routed this event to you — it is not the thing to judge,",
    "and satisfying it is not the same as satisfying the sentence. \"Moves\" is not \"flees\": a",
    "creature that walked five feet toward someone has not fled.",
    "",
    "Lean towards firing. A wrongly offered trigger is shown to the player and can be",
    "declined; a wrongly withheld one silently costs their turn. When the payload is not",
    "enough to tell, prefer fires true and let the why name exactly what happened. Never",
    "answer false to look decisive — false is the one answer nothing downstream can undo.",
    "Answer false when the payload is enough to tell that this is NOT the moment, not when it",
    "is merely thin.",
    "",
    "For a narration event, read the said text against the sentence; narration reaches you",
    "whatever the descriptor said, and there may be no subject at all.",
    "",
    "# THE ANSWER",
    "",
    "Output exactly one JSON object and nothing else — no explanation, no commentary, no code",
    "fence. The only keys read are fires and why. fires is a real boolean. why is one short",
    "clause addressed to the player, naming what just happened, at most 200 characters.",
    "",
    "EXAMPLE ONLY — the shape, not the answer:",
    '{"fires": true, "why": "<one short clause naming what happened>"}',
  );
  return lines.join("\n");
}

function describePlacement(where: string[]): string[] {
  if (!where.length) return [];
  const lines = [
    "",
    `Placement keys — the only legal keys inside "where": ${where.join(", ")}.`,
    "  Copy those key spellings exactly as printed, including their capitals.",
  ];
  const hasReach = where.includes("inReach");
  const numeric = where.filter((key) => key !== "inReach");
  if (hasReach) lines.push("  inReach takes only true.");
  if (numeric.length) {
    const sample = numeric[0];
    lines.push(
      `  ${hasReach ? "The others take" : "Each takes"} a bare number greater than zero, in the scene's own units:`,
      `  {"${sample}": 20}, never "20", never "20 feet", never 0 or less.`,
    );
  }
  return lines;
}

function aliasLines(vocabulary: WatchVocabulary): string[] {
  const events = new Set(vocabulary.events);
  const sides = new Set(vocabulary.sides);
  const senses = new Set(vocabulary.senses);
  const out: string[] = [];
  for (const row of EVENT_ALIASES) {
    if (events.has(row.write)) out.push(...row.lines);
  }
  for (const row of SIDE_ALIASES) {
    if (sides.has(row.write)) out.push(...row.lines);
  }
  if (senses.has("sight")) {
    out.push('"I can see" / in sight / visible / where I can watch it     -> sense "sight"');
  }
  if (senses.has("hearing") || events.has("narration")) {
    out.push(
      '"I hear" / a sound / a voice                                -> sense "hearing" when',
      '      there is a token to watch; otherwise events ["narration"] with no invented subject',
    );
  }
  if (senses.has("sight")) {
    out.push("Only sight is checkable here, so any hearing-based trigger also needs judge true.");
  }
  return out;
}

/**
 * A filled-in first list entry teaches that name onto every sentence. Skip events[0]; prefer
 * the next two so the example can hold more than one name without becoming the first token.
 */
function exampleCompile(vocabulary: WatchVocabulary): string {
  const kinds = vocabulary.events.slice(1, 3);
  const events = kinds.length > 0 ? kinds : vocabulary.events.slice(0, 1);
  const subject: Record<string, unknown> = {
    names: ["<lowercase name from the sentence>"],
  };
  if (vocabulary.sides[0]) subject.side = vocabulary.sides[0];
  if (vocabulary.senses[0]) subject.sense = vocabulary.senses[0];
  const shaped: Record<string, unknown> = { events, subject };
  if (vocabulary.where.includes("inReach")) shaped.where = { inReach: true };
  shaped.judge = true;
  shaped.summary = "<one sentence the player would recognise as their own>";
  return JSON.stringify(shaped);
}

/** The player's sentence and who wrote it. */
export function composeCompileMessage(prose: string, watcher: Record<string, unknown>): string {
  return [
    "The player readying an action:",
    JSON.stringify(watcher ?? {}),
    "",
    "Their trigger, in their own words:",
    prose,
    "",
    "What are they waiting for?",
  ].join("\n");
}

/** The sentence, the reading of it that let this event through, and the event. */
export function composeJudgeMessage(
  prose: string,
  descriptor: Record<string, unknown>,
  happening: Record<string, unknown>,
  watcher: Record<string, unknown>,
): string {
  return [
    "The player readying an action:",
    JSON.stringify(watcher ?? {}),
    "",
    "Their trigger, in their own words:",
    prose,
    "",
    "Your earlier reading of it — the filter that routed this event to you, not the thing to judge:",
    JSON.stringify(descriptor ?? {}),
    "",
    "What just happened:",
    JSON.stringify(happening ?? {}),
    "",
    "Is this the moment they were waiting for?",
  ].join("\n");
}

async function compile(
  cfg: ReturnType<typeof getCapabilityConfig>,
  vocabulary: WatchVocabulary,
  prose: string,
  event: WatchEvent,
): Promise<Record<string, unknown> | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: composeSystemMessage(getWatchPrompt(), vocabulary, "compile") },
    { role: "user", content: composeCompileMessage(prose, event.watcher ?? {}) },
  ];
  const answer = await completeJson(cfg, { messages, ...PATIENCE.compile });
  const descriptor = shapeDescriptor(answer, vocabulary);
  debug("watch compile", { prose, descriptor });
  if (descriptor) log(`read a Ready trigger: ${String(descriptor.summary ?? "")}`);
  return descriptor;
}

async function judge(
  cfg: ReturnType<typeof getCapabilityConfig>,
  vocabulary: WatchVocabulary,
  prose: string,
  event: WatchEvent,
): Promise<{ fires: boolean; why: string } | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: composeSystemMessage(getWatchPrompt(), vocabulary, "judge") },
    {
      role: "user",
      content: composeJudgeMessage(
        prose,
        event.descriptor ?? {},
        event.event ?? {},
        event.watcher ?? {},
      ),
    },
  ];
  const answer = await completeJson(cfg, { messages, ...PATIENCE.judge });
  const verdict = shapeVerdict(answer);
  debug("watch judge", { prose, event: event.event, verdict });
  return verdict;
}

/**
 * Shape the reply against the vocabulary that arrived.
 *
 * The rules module validates this again on receipt — deliberately, since it is the one that has to live
 * with the answer — and shaping here is not redundant with that. An unknown event name dropped at this
 * end can be REPORTED at this end, which is the only place anybody is watching a console; and a
 * descriptor that arrives already clean cannot be quietly narrowed on the far side into something the
 * player was never shown.
 *
 * A missing field is left missing rather than defaulted: an omitted predicate passes on the far side,
 * so inventing one here would narrow a trigger the player wrote broadly.
 */
export function shapeDescriptor(
  raw: unknown,
  vocabulary: WatchVocabulary,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, any>;

  const allowed = new Set(vocabulary.events);
  const named: string[] = Array.isArray(source.events) ? source.events.map(String) : [];
  const events = Array.from(new Set(named.filter((name) => allowed.has(name))));
  const dropped = named.filter((name) => !allowed.has(name));
  if (dropped.length) {
    warn(
      `the trigger reader named events nobody watches for and they were dropped: ${dropped.join(", ")}`,
    );
  }

  const problem = typeof source.problem === "string" ? source.problem.trim().slice(0, 200) : "";
  // A problem and no events is the honest "that cannot be watched for". A problem WITH events is a
  // model hedging, and the events are the useful half — so the hedge is discarded rather than the work.
  if (!events.length) {
    return {
      events: [],
      judge: false,
      summary: "",
      problem: problem || "nothing in that sentence is something Foundry can notice",
    };
  }

  const out: Record<string, unknown> = {
    events,
    judge: source.judge !== false,
    summary: String(source.summary ?? "")
      .trim()
      .slice(0, 200),
  };

  const subject = source.subject;
  if (subject && typeof subject === "object") {
    const shaped: Record<string, unknown> = {};
    if (Array.isArray(subject.names)) {
      const names = subject.names
        .map((n: unknown) =>
          String(n ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .slice(0, 8);
      if (names.length) shaped.names = names;
    }
    if (vocabulary.sides.includes(String(subject.side))) shaped.side = String(subject.side);
    if (vocabulary.senses.includes(String(subject.sense))) shaped.sense = String(subject.sense);
    if (Object.keys(shaped).length) out.subject = shaped;
  }

  const where = source.where;
  if (where && typeof where === "object" && vocabulary.where.length) {
    const shaped: Record<string, unknown> = {};
    for (const key of vocabulary.where) {
      const value = (where as Record<string, unknown>)[key];
      if (value === true) {
        shaped[key] = true;
        continue;
      }
      const distance = Number(value);
      if (Number.isFinite(distance) && distance > 0) shaped[key] = distance;
    }
    if (Object.keys(shaped).length) out.where = shaped;
  }

  if (Array.isArray(source.statuses)) {
    const statuses = source.statuses
      .map((s: unknown) =>
        String(s ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
      .slice(0, 8);
    if (statuses.length) out.statuses = statuses;
  }

  return out;
}

/** Null when the reply did not answer the question, which the caller reads as "no opinion". */
export function shapeVerdict(raw: unknown): { fires: boolean; why: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, any>;
  if (typeof source.fires !== "boolean") return null;
  return {
    fires: source.fires,
    why: String(source.why ?? "")
      .trim()
      .slice(0, 200),
  };
}
