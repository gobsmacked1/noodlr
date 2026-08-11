// Giving a creature words when it decides to stop fighting.
//
// A rules module has already settled what happens — the token's disposition, the experience, the
// forfeited gear — and asks only for the voice. That division is the whole point of the split: the
// mechanical outcome must be identical whether or not anybody is listening, so nothing here may
// change state, and a failure to generate is silence rather than a stalled encounter.
//
// Posted publicly under the creature's own name. GM-only reasoning is not included and not asked
// for: a surrender the party can see through because the card explains the monster's morale check is
// worse than no card.

import { debug, log } from "../constants";
import { getFeatureConfig } from "../providers/config";
import { ChatClientError, chatCompletion } from "../providers/chat-client";
import { isConfigured, type ChatMessage } from "../providers/types";
import { buildRulesetBlock } from "../system/ruleset";
import { getTtsEnabled } from "../media/config";
import { speakShared } from "../media/tts";
import { speakerFor } from "../util/speaker";
import { bumpStats } from "../util/stats";
import { getBehaviorPrompt } from "./config";

/** How each verb is described to the model. Unlisted verbs still work; they just get no gloss. */
const VERBS: Record<string, string> = {
  FLEE: "is running away from the fight",
  MERCY: "is being spared by the party and knows it",
  SURRENDER: "is giving itself up",
  BRIBE: "is offering something valuable to be let go",
  PARLEY: "wants to stop fighting and talk terms",
  INTIMIDATE: "is trying to frighten its opponents into backing off",
  PERSUADE: "is trying to talk its opponents round",
  DECEIVE: "is lying to buy itself an advantage",
  AMBUSH: "is springing a trap it had been holding back",
  DISTRACT: "is trying to pull attention away from something else",
};

/**
 * The same verbs read from the receiving end, for a request flagged `incoming`.
 *
 * The rules module fires these when somebody leans on a creature and wants to hear its answer — the
 * Influence action is the producer. The speaker is still the creature named in `actor`, because
 * noodlr voices NPCs and the party's negotiator must not be handed the microphone; what changes is
 * who is doing what. Sending the outbound gloss for an inbound request describes the guard captain
 * as the one doing the persuading, which reads as plausible nonsense rather than as an error.
 */
const VERBS_INCOMING: Record<string, string> = {
  BRIBE: "is being offered something to look the other way",
  PARLEY: "is being asked to talk terms",
  INTIMIDATE: "is being threatened into cooperating",
  PERSUADE: "is being talked round",
  DECEIVE: "is being lied to, and does not know it",
  AMBUSH: "has just been ambushed",
  DISTRACT: "is having its attention pulled elsewhere",
};

/** Loose by design: the payload is authored by another module, possibly a newer one. */
interface BehaviorEvent {
  verb?: string;
  actor?: any;
  token?: any;
  target?: any;
  /** The verb is being done TO `actor`; what is wanted is its answer, still in its own voice. */
  incoming?: boolean;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

function nameOf(subject: any): string {
  return String(subject?.name ?? subject?.document?.name ?? subject?.actor?.name ?? "").trim();
}

export async function narrateBehavior(event: BehaviorEvent): Promise<void> {
  const verb = String(event?.verb ?? "").toUpperCase();
  if (!verb) return;

  const cfg = getFeatureConfig("chat");
  if (!isConfigured(cfg)) {
    debug("behavior: chat provider not configured, staying quiet");
    return;
  }

  const subject = event.token ?? event.actor;
  const speakerName = nameOf(subject) || nameOf(event.actor);
  const targetName = nameOf(event.target);
  const incoming = Boolean(event.incoming);
  const gloss = incoming
    ? (VERBS_INCOMING[verb] ?? `is on the receiving end of the ${verb.toLowerCase()} action`)
    : (VERBS[verb] ?? `is taking the ${verb.toLowerCase()} action`);

  const facts = [
    `Creature: ${speakerName || "an unnamed creature"}`,
    incoming ? `What is happening to it: it ${gloss}.` : `What it is doing: it ${gloss}.`,
    targetName
      ? `${incoming ? "Who is doing it" : "Who it is dealing with"}: ${targetName}`
      : "",
    incoming ? "Write its answer, in its own voice." : "",
    describeContext(event.context),
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [];
  const sys = getBehaviorPrompt();
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "system", content: buildRulesetBlock() });
  messages.push({ role: "user", content: facts });

  let text = "";
  try {
    text = (await chatCompletion(cfg, { messages, maxTokens: 220 })).trim();
  } catch (err) {
    // Silence, not an error card: the mechanical outcome already landed and the fight carries on.
    log("behavior: could not generate a line:", err instanceof ChatClientError ? err.message : err);
    return;
  }
  if (!text) return;
  bumpStats({ chatTurns: 1 });

  const ChatMessageDoc = (globalThis as any).ChatMessage;
  await ChatMessageDoc.create({
    content: `<div class="noodlr-behavior" data-verb="${verb}">${foundry.utils.escapeHTML(text)}</div>`,
    speaker: speakerFor(subject, speakerName),
  });

  if (getTtsEnabled()) {
    try {
      await speakShared(text);
    } catch (err) {
      log("behavior: could not speak the line:", err);
    }
  }
}

/** Flatten whatever particulars the rules module supplied into a few plain lines. */
function describeContext(context: Record<string, unknown> | undefined): string {
  if (!context) return "";
  const lines: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.length ? `Particulars:\n${lines.join("\n")}` : "";
}
