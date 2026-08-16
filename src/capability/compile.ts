// Answering `noodlrHooks.compile`: turning a creature's written abilities into rules that run.
//
// This is the other half of the seam. A rules module has read its own sheets, found prose it cannot
// interpret, and handed over a batch along with the closed vocabulary the answer has to be written
// in. Noodlr holds the API key, so Noodlr makes the calls — and holds the rate limit, so Noodlr
// decides how many at once.
//
// THE BOUNDARY. The model COMPILES; it never ADJUDICATES. What comes back is a descriptor, cached
// against the wording and executed by deterministic code every turn thereafter. This does not
// reopen the decision to cut the per-turn model call: the call moved to scene load, and a scene of
// twenty goblins costs one reading because they all share a wording.
//
// NOTHING HERE KNOWS D&D. Every kind, predicate and parameter comes off the request. See
// `vocabulary.ts` for why that is a hard rule rather than tidiness.
//
// Failure is quiet and partial by construction: a feature that will not compile is dropped and the
// other nineteen are returned. The asking module treats a missing descriptor as ordinary — that is
// its baseline, not an error path.

import { debug, log, warn, MODULE_TITLE } from "../constants";
import { isConfigured, type ChatMessage } from "../providers/types";
import { runPool } from "../util/pool";
import { bumpStats } from "../util/stats";
import {
  getCapabilityConcurrency,
  getCapabilityConfig,
  getCapabilityPrompt,
  isCapabilityCompilerEnabled,
} from "./config";
import { completeJson, refusalAdvice, type CompileError, type RefusalKind } from "./client";
import {
  asVocabulary,
  composeRepairMessage,
  composeSystemMessage,
  composeUserMessage,
  validateAgainst,
  type CompileItem,
  type Vocabulary,
} from "./vocabulary";

type CompileEvent = Record<string, any> & {
  items?: CompileItem[];
  vocabulary?: unknown;
  compiled?: Record<string, unknown>;
  waitFor?: (p: Promise<unknown>) => void;
  handled?: boolean;
};

/**
 * The readable half of a thrown error, for a log line.
 *
 * `Error.message` is where every useful detail lives — `client.ts` puts the HTTP status and the
 * provider's own response body there — and it is exactly what a console hides when the object is
 * handed to it as an argument. Anything that is not an Error is stringified rather than dropped,
 * since a thrown string is still the only account we have of what went wrong.
 */
function reasonOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err ?? "no reason given");
}

let registered = false;

export function registerCapabilityCompiler(): void {
  if (registered) return;
  registered = true;

  Hooks.on("noodlrHooks.compile", (event: CompileEvent) => {
    if (!isCapabilityCompilerEnabled()) return;
    if (event.handled) return;
    // The asking module runs this on the primary GM, but the hook is local to whoever fired it and a
    // future caller might not be. A player's client must not spend the world's credit, and could not
    // write the cache afterwards anyway.
    if (!game.user?.isGM) return;

    const vocabulary = asVocabulary(event.vocabulary);
    if (!vocabulary) {
      warn("a compile request arrived without a usable vocabulary; declining it");
      return;
    }
    const items = (event.items ?? []).filter((i) => String(i?.prose ?? "").trim() !== "");
    if (items.length === 0) return;

    const cfg = getCapabilityConfig();
    if (!isConfigured(cfg)) {
      warn(
        `${items.length} ability/abilities need compiling, but the Chat provider is not configured. ` +
          "Set a provider, key and model in Text Generation, or turn the setting off in the rules module.",
      );
      return;
    }

    // Claimed before the work starts: the flag means "somebody is paying for this batch", and a
    // second listener taking it on while we are mid-flight would buy every descriptor twice.
    event.handled = true;
    event.waitFor?.(
      compileBatch(event, items, vocabulary).catch((err) =>
        warn(`compile batch failed: ${reasonOf(err)}`),
      ),
    );
  });

  log("listening for noodlrHooks.compile");
}

async function compileBatch(
  event: CompileEvent,
  items: CompileItem[],
  vocabulary: Vocabulary,
): Promise<void> {
  const cfg = getCapabilityConfig();
  const system = composeSystemMessage(getCapabilityPrompt(), vocabulary);
  const started = Date.now();
  log(`compiling ${items.length} ability/abilities with ${cfg.model}…`);

  const results = await runPool(items, getCapabilityConcurrency(), (item) =>
    compileOne(cfg, vocabulary, system, item),
  );

  const compiled = (event.compiled ??= {});
  const refusals = new Set<RefusalKind>();
  let ok = 0;
  let failed = 0;
  results.forEach((result, index) => {
    const item = items[index];
    if (result.value) {
      compiled[String(item.id)] = result.value;
      ok++;
      return;
    }
    failed++;
    // Named, because the alternative is a GM watching a scene silently not work. The asking module
    // logs its own rejections; this is the half it cannot see.
    //
    // THE REASON IS INTERPOLATED, NOT PASSED AS AN ARGUMENT. `client.ts` already reads 300
    // characters of the provider's own response body into the message, and a console renders a
    // trailing `Error` object as the bare word "Error" — so passing it discarded the only thing
    // that names the cause. A batch of 62 was lost to an unexplained 403 on 2026-08-16 and the
    // body that would have identified it had been read and thrown away here.
    warn(`could not compile "${item.label ?? item.id}": ${reasonOf(result.error)}`);
    const kind = (result.error as CompileError | undefined)?.kind;
    if (kind && kind !== "threshold") refusals.add(kind);
  });

  bumpStats({ chatTurns: ok });
  log(
    `compiled ${ok}/${items.length} ability/abilities in ${Math.round((Date.now() - started) / 1000)}s` +
      (failed ? ` (${failed} could not be compiled and were left out)` : ""),
  );

  // ONCE PER BATCH, AND TO THE SCREEN. A spending cap is the only provider refusal a GM can do
  // anything about, and this whole path runs unattended during a scene load: nobody is reading a
  // console, so the honest report of "your credit ran out" is a notification. Sixty-two of them
  // would be a storm, hence the set — and a `threshold` never lands here at all, because it is
  // transient and the retry already dealt with it.
  for (const kind of refusals) {
    const advice = refusalAdvice(kind);
    if (advice) ui.notifications?.error(`${MODULE_TITLE}: ${advice}`, { permanent: true });
  }
}

async function compileOne(
  cfg: ReturnType<typeof getCapabilityConfig>,
  vocabulary: Vocabulary,
  system: string,
  item: CompileItem,
): Promise<Record<string, unknown>> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: composeUserMessage(item) },
  ];

  let answer = await completeJson(cfg, { messages });
  let { errors } = validateAgainst(vocabulary, answer);

  if (errors.length > 0) {
    // One repair round, carrying every error at once. A model that produced a near-miss usually
    // fixes it when told precisely what is wrong, and one extra call is far cheaper than losing a
    // reading. A second round is not attempted: past one, the failure is comprehension rather than
    // formatting, and paying repeatedly to watch it fail the same way is how a scene load gets
    // expensive.
    debug("capability compile needs repair", { label: item.label, errors });
    messages.push({ role: "assistant", content: JSON.stringify(answer) });
    messages.push({ role: "user", content: composeRepairMessage(errors) });
    answer = await completeJson(cfg, { messages });
    errors = validateAgainst(vocabulary, answer).errors;
  }

  if (errors.length > 0) {
    throw new Error(`it did not match the vocabulary after a repair attempt: ${errors.join("; ")}`);
  }

  const shaped = answer as { label?: unknown; rules?: unknown };
  return {
    id: String(item.id),
    // The model's label is a courtesy; the sheet's own name is the one the GM will recognise.
    label: String(item.label ?? shaped.label ?? "").trim() || String(shaped.label ?? "Ability"),
    prose: String(item.prose ?? ""),
    rules: shaped.rules,
    compiledBy: { model: cfg.model, at: Date.now(), schema: vocabulary.schema },
    status: "compiled",
  };
}
