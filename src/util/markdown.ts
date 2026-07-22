// Tiny, dependency-free markdown renderer for assistant output. It escapes HTML FIRST
// (model output is untrusted-ish external content), then applies a conservative subset:
// headings, bold, italic, inline code, and paragraph/line breaks. Not a full parser —
// deliberately small; richer rendering can swap in later.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text: string): string {
  return (
    text
      // inline code first so its contents aren't further transformed
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
  );
}

/** Render a small markdown subset to safe HTML. */
export function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md);
  const blocks = escaped.split(/\n{2,}/);
  const html: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const withBreaks = inline(trimmed).replace(/\n/g, "<br>");
    html.push(`<p>${withBreaks}</p>`);
  }

  return html.join("\n");
}
