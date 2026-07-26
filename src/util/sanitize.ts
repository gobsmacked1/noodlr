// Input sanitization for user-typed text before it's sent to a provider or stored (chat, image
// Positive/Negative prompts, test boxes — and from there into RAG).
//
// Policy (chosen deliberately): this is a SANITIZER, not an allowlist filter. Normal letters and
// punctuation — including accents, apostrophes, commas, and Stable-Diffusion weighting syntax like
// "(masterpiece:1.2)" — are preserved so prompts and chat stay fully expressive. What we strip is
// the stuff that actually causes unexpected breakage downstream:
//   - Control characters (C0 except tab/newline, C1, DEL) and null bytes
//   - Zero-width, word-joiner, BOM, and bidirectional-override marks (invisible; corrupt search,
//     display, and can be used to smuggle text past a human reviewer)
// It also normalizes Unicode (NFC), normalizes line endings, collapses pathological whitespace,
// trims, and enforces a hard length cap.
//
// NOTE: this is an input-hygiene layer, not an output-safety layer. HTML/script neutralization for
// anything rendered into the UI is handled separately at the display boundary (escaping).

export interface SanitizeOptions {
  /** Hard character cap; anything beyond is dropped. Default 8000. */
  maxLength?: number;
  /** Keep newlines (multi-line prompts). When false they collapse to spaces. Default true. */
  allowNewlines?: boolean;
}

// C0 controls except TAB (\u0009) and LF (\u000A); plus DEL and the C1 range. CR is handled by the
// line-ending normalization below, so it isn't listed here. Matching control chars is the whole
// point of this stripper, so the no-control-regex lint is intentionally disabled here.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Zero-width space/joiners, word joiner, BOM, and all bidi controls/isolates/overrides.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/**
 * Clean a piece of user-typed text. Safe to call on empty/undefined-ish values (returns "").
 */
export function sanitizeUserText(input: unknown, opts: SanitizeOptions = {}): string {
  const { maxLength = 8000, allowNewlines = true } = opts;
  if (typeof input !== "string" || input.length === 0) return "";

  let s = input.normalize("NFC");
  s = s.replace(/\r\n?/g, "\n"); // CRLF / CR -> LF
  s = s.replace(CONTROL, "");
  s = s.replace(INVISIBLE, "");
  s = s.replace(/\t/g, " "); // tabs -> single space

  if (!allowNewlines) {
    s = s.replace(/\n/g, " ");
  } else {
    s = s.replace(/[ \t]+\n/g, "\n"); // strip trailing spaces on each line
    s = s.replace(/\n{3,}/g, "\n\n"); // cap consecutive blank lines
  }

  s = s.replace(/ {2,}/g, " "); // collapse runs of spaces
  s = s.trim();

  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}
