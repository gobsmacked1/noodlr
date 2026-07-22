// {{roll:FORMULA}} macro resolution. The model NEVER rolls its own dice (it biases
// toward narrative convenience); instead it emits macros like {{roll:1d20+5}} and the
// module executes a real Foundry Roll, injecting the authoritative result back.

const ROLL_MACRO = /\{\{\s*roll\s*:\s*([^}]+?)\s*\}\}/gi;

export interface ResolvedRoll {
  /** The formula as written in the macro. */
  formula: string;
  /** Numeric total, or null when the formula failed to evaluate. */
  total: number | null;
  /** Foundry's rendered result string (individual dice), when available. */
  breakdown: string;
  /** Error message when evaluation failed. */
  error?: string;
}

export interface RollResolution {
  /** Original text with each macro replaced by an inline result token. */
  text: string;
  /** Every roll performed, in order. */
  rolls: ResolvedRoll[];
}

/** True if the text contains at least one roll macro. */
export function hasRollMacro(text: string): boolean {
  ROLL_MACRO.lastIndex = 0;
  return ROLL_MACRO.test(text);
}

async function evaluateFormula(formula: string): Promise<ResolvedRoll> {
  try {
    // Foundry v12+ Roll#evaluate is async. Roll is a global provided by Foundry.
    const RollCtor = (globalThis as any).Roll;
    const roll = new RollCtor(formula);
    await roll.evaluate();
    return {
      formula,
      total: Number(roll.total),
      breakdown: typeof roll.result === "string" ? roll.result : String(roll.total),
    };
  } catch (err) {
    return { formula, total: null, breakdown: "", error: (err as Error).message };
  }
}

/**
 * Resolve every {{roll:...}} macro in `text`. Each macro is replaced inline with a
 * compact, human-readable token, e.g. "1d20+5 = 18". Returns the rewritten text and
 * the structured roll list (useful for posting to Foundry chat or feeding a follow-up).
 */
export async function resolveRollMacros(text: string): Promise<RollResolution> {
  const rolls: ResolvedRoll[] = [];

  // Collect matches first (regex + async replacement don't mix).
  const matches: { full: string; formula: string; index: number }[] = [];
  ROLL_MACRO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLL_MACRO.exec(text)) !== null) {
    matches.push({ full: m[0], formula: m[1].trim(), index: m.index });
  }

  if (matches.length === 0) return { text, rolls };

  let out = "";
  let cursor = 0;
  for (const match of matches) {
    const resolved = await evaluateFormula(match.formula);
    rolls.push(resolved);
    const token =
      resolved.total === null
        ? `[invalid roll: ${match.formula}]`
        : `[${match.formula} = ${resolved.total}]`;
    out += text.slice(cursor, match.index) + token;
    cursor = match.index + match.full.length;
  }
  out += text.slice(cursor);

  return { text: out, rolls };
}

/** Format resolved rolls as a concise note to feed back to the model for continuation. */
export function formatRollResultsForModel(rolls: ResolvedRoll[]): string {
  const lines = rolls.map((r) =>
    r.total === null
      ? `- ${r.formula}: ERROR (${r.error ?? "invalid"})`
      : `- ${r.formula} = ${r.total}${r.breakdown ? ` (${r.breakdown})` : ""}`,
  );
  return `Dice results (authoritative, rolled by Foundry — narrate from these, do not change them):\n${lines.join("\n")}`;
}
