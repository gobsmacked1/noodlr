// Action directives — the provider-agnostic "tool call" mechanism for both Noodlr chatbots.
//
// True OpenAI function-calling isn't reliable across our two provider shapes (OpenRouter AND any
// hand-entered OpenAI-compatible endpoint — many local servers don't implement tools/tool streaming).
// So instead the model emits a single-line directive that we intercept and execute on the GM's
// client, then strip from the text the humans see. Same idea as a tool call, but it works everywhere.
//
// Syntax (one per line, JSON payload):
//   @@NOODLR ADJUDICATE {"pc":"...","target":"...","skill":"...","question":"..."}
//   @@NOODLR REMEMBER   {"silo":"player_history","text":"..."}
//   @@NOODLR UPDATE     {"silo":"player_quests","match":"...","text":"..."}
//   @@NOODLR FORGET     {"silo":"player_quests","match":"..."}

export type DirectiveVerb = "ADJUDICATE" | "REMEMBER" | "UPDATE" | "FORGET";

const VERBS: ReadonlySet<string> = new Set<DirectiveVerb>([
  "ADJUDICATE",
  "REMEMBER",
  "UPDATE",
  "FORGET",
]);

export interface Directive {
  verb: DirectiveVerb;
  data: Record<string, unknown>;
}

export interface ParsedOutput {
  /** The model text with all directive lines removed (what humans see). */
  text: string;
  directives: Directive[];
}

// Anchored to line start; JSON object payload runs to end of line. The `m` flag makes ^/$ per-line.
const DIRECTIVE_RE = /^[ \t]*@@NOODLR[ \t]+([A-Z]+)[ \t]+(\{.*\})[ \t]*$/gm;

/**
 * Extract action directives from an LLM answer and return the cleaned display text alongside them.
 * Malformed directives (bad verb, unparseable JSON) are dropped from the directive list but their
 * lines are still stripped from the display text so raw machine syntax never reaches a human.
 */
export function parseDirectives(raw: string): ParsedOutput {
  const directives: Directive[] = [];
  const text = raw.replace(DIRECTIVE_RE, (_full, verb: string, json: string) => {
    if (VERBS.has(verb)) {
      try {
        const data = JSON.parse(json);
        if (data && typeof data === "object") {
          directives.push({ verb: verb as DirectiveVerb, data: data as Record<string, unknown> });
        }
      } catch {
        /* malformed payload — line still stripped below */
      }
    }
    return ""; // strip the directive line from human-visible text
  });

  // Collapse the blank lines a stripped directive can leave behind.
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, directives };
}

/** Convenience: pull the first directive of a given verb (adjudicate is expected at most once). */
export function firstDirective(directives: Directive[], verb: DirectiveVerb): Directive | null {
  return directives.find((d) => d.verb === verb) ?? null;
}
