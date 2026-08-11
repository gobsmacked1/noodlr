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

import { debug, log, warn } from "../constants";
import { isConfigured, type ChatMessage } from "../providers/types";
import { runPool } from "../util/pool";
import { bumpStats } from "../util/stats";
import {
  getCapabilityConcurrency,
  getCapabilityConfig,
  getCapabilityPrompt,
  isCapabilityCompilerEnabled,
} from "./config";
import { completeJson } from "./client";
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
      compileBatch(event, items, vocabulary).catch((err) => warn("compile batch failed:", err)),
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
    warn(`could not compile "${item.label ?? item.id}":`, result.error);
  });

  bumpStats({ chatTurns: ok });
  log(
    `compiled ${ok}/${items.length} ability/abilities in ${Math.round((Date.now() - started) / 1000)}s` +
      (failed ? ` (${failed} could not be compiled and were left out)` : ""),
  );
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
