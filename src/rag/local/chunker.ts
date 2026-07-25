// Clean-room prose/table-aware chunker for RAG Lite. RPG sources aren't novels: roll tables
// and stat blocks must stay atomic or they become useless mid-split. Heuristic: keep short
// docs and table/stat-block-looking docs whole; otherwise pack paragraphs into ~1600-char
// chunks with a one-paragraph overlap so context isn't sheared at boundaries.

const MAX_CHARS = 1600;
const MIN_CHARS = 200;

/** A doc that reads like a table or stat block (many short lines / pipes / key:value rows). */
function looksAtomic(text: string): boolean {
  if (text.length <= MAX_CHARS) return true;
  const lines = text.split(/\r?\n/);
  if (lines.length >= 6) {
    const shortOrTabular = lines.filter(
      (l) => l.includes("|") || l.includes("\t") || /^.{0,40}:\s/.test(l) || l.trim().length < 40,
    ).length;
    if (shortOrTabular / lines.length > 0.6) return true;
  }
  return false;
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (looksAtomic(clean)) return [clean];

  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const para of paras) {
    if (para.length > MAX_CHARS) {
      // A single oversized paragraph: split on sentence boundaries.
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (buf.length + s.length + 1 > MAX_CHARS) flush();
        buf += (buf ? " " : "") + s;
      }
      flush();
      continue;
    }
    if (buf.length + para.length + 2 > MAX_CHARS) {
      const prev = buf;
      flush();
      // One-paragraph overlap to preserve continuity across the seam.
      if (prev && prev.length < MIN_CHARS * 3) buf = prev.split(/\n{2,}/).slice(-1)[0] + "\n\n";
    }
    buf += (buf ? "\n\n" : "") + para;
  }
  flush();
  return chunks.length > 0 ? chunks : [clean];
}
