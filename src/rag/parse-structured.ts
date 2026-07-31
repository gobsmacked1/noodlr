// Client-side parsing of structured uploads (JSON / YAML / CSV) into IngestDocument[]. We parse
// at the upload boundary — BEFORE the backend — so both memory backends (noodlr-memory service and
// RAG Lite) get the feature for free with no interface or server changes: the structured file is
// flattened to plain text records here, then handed to the normal `ingest()` path.
//
// Design: one document per logical record (array element / CSV row / named object) so retrieval
// returns the individual monster / NPC / row rather than one giant blob. Nested objects flatten to
// readable "path: value" lines; a name-ish field becomes the record's label for provenance.

import type { IngestDocument } from "./client";

export type StructuredFormat = "json" | "yaml" | "csv";

/** Detect a structured format from filename/MIME, or null for plain text / unknown. */
export function structuredFormatFor(name: string, type = ""): StructuredFormat | null {
  const n = name.toLowerCase();
  if (n.endsWith(".json") || type === "application/json") return "json";
  if (n.endsWith(".yaml") || n.endsWith(".yml") || /ya?ml/.test(type)) return "yaml";
  if (n.endsWith(".csv") || type === "text/csv") return "csv";
  return null;
}

/** Parse a JSON/YAML/CSV File into ingestable documents. Throws on malformed input. */
export async function parseStructuredFile(file: File): Promise<IngestDocument[]> {
  const fmt = structuredFormatFor(file.name, file.type);
  if (!fmt) throw new Error(`Not a structured file: ${file.name}`);
  const raw = await file.text();
  const source = file.name;

  if (fmt === "csv") return docsFromCsv(raw, source);

  let data: unknown;
  if (fmt === "json") {
    data = JSON.parse(raw);
  } else {
    // YAML is loaded lazily so its parser only ships in a chunk when actually used.
    const YAML = await import("yaml");
    data = YAML.parse(raw);
  }
  return docsFromData(data, source, fmt);
}

// ---- JSON / YAML -> documents ---------------------------------------------------------------

function docsFromData(data: unknown, source: string, format: StructuredFormat): IngestDocument[] {
  const docs: IngestDocument[] = [];
  const add = (obj: unknown, extra: Record<string, unknown>, fallbackName?: string): void => {
    const { text, name } = recordToText(obj);
    if (!text.trim()) return;
    const label = name ?? fallbackName;
    docs.push({
      text,
      metadata: {
        sourceName: label ? `${source} — ${label}` : source,
        source: format,
        ...(label ? { entities: [label] } : {}),
        ...extra,
      },
    });
  };

  if (Array.isArray(data)) {
    data.forEach((el, i) => add(el, { index: i }));
  } else if (data && typeof data === "object") {
    const scalarLines: string[] = [];
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        val.forEach((el, i) => add(el, { section: key, index: i }));
      } else if (val && typeof val === "object") {
        add(val, { section: key }, key);
      } else if (val != null) {
        scalarLines.push(`${key}: ${String(val)}`);
      }
    }
    if (scalarLines.length) {
      docs.push({ text: scalarLines.join("\n"), metadata: { sourceName: source, source: format } });
    }
  } else if (data != null) {
    docs.push({ text: String(data), metadata: { sourceName: source, source: format } });
  }
  return docs;
}

const NAME_FIELDS = ["name", "title", "label", "id", "key"];

function recordToText(obj: unknown): { text: string; name?: string } {
  if (obj == null) return { text: "" };
  if (typeof obj !== "object") return { text: String(obj) };
  const rec = obj as Record<string, unknown>;
  let name: string | undefined;
  for (const f of NAME_FIELDS) {
    if (typeof rec[f] === "string" && (rec[f] as string).trim()) {
      name = (rec[f] as string).trim();
      break;
    }
  }
  return { text: flatten(rec).join("\n"), name };
}

/** Flatten an object to readable "path: value" lines (arrays of scalars joined; depth-capped). */
function flatten(
  obj: Record<string, unknown>,
  prefix = "",
  out: string[] = [],
  depth = 0,
): string[] {
  if (depth > 6) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.every((x) => x == null || typeof x !== "object")) {
        out.push(`${key}: ${v.filter((x) => x != null).join(", ")}`);
      } else {
        v.forEach((x, i) =>
          x && typeof x === "object"
            ? flatten(x as Record<string, unknown>, `${key}[${i}]`, out, depth + 1)
            : out.push(`${key}[${i}]: ${String(x)}`),
        );
      }
    } else if (typeof v === "object") {
      flatten(v as Record<string, unknown>, key, out, depth + 1);
    } else {
      out.push(`${key}: ${String(v)}`);
    }
  }
  return out;
}

// ---- CSV -> documents -----------------------------------------------------------------------

/**
 * Minimal RFC-4180 CSV parser (handles quoted fields, escaped "" quotes, CRLF/LF). The first
 * non-empty row is treated as the header. // SHORTCUT: headerless CSVs will use row 1 as labels.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function docsFromCsv(raw: string, source: string): IngestDocument[] {
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const docs: IngestDocument[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const lines: string[] = [];
    let name: string | undefined;
    for (let c = 0; c < header.length; c++) {
      const val = (cells[c] ?? "").trim();
      if (!val) continue;
      lines.push(`${header[c]}: ${val}`);
      if (!name && /^(name|title|label)$/i.test(header[c])) name = val;
    }
    if (!lines.length) continue;
    docs.push({
      text: lines.join("\n"),
      metadata: {
        sourceName: name ? `${source} — ${name}` : `${source} — row ${r}`,
        source: "csv",
        row: r,
        ...(name ? { entities: [name] } : {}),
      },
    });
  }
  return docs;
}
