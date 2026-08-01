// Native Foundry chat-log sniffer -> `unfiltered_chat` RAG silo.
//
// Foundry's chat log is the richest structured record of a session (IC/OOC talk, rolls, skill
// checks, spell casts, loot, etc.), but chat cards are HTML with images and system markup. This
// module listens for new chat messages, distills each into one timestamped plain-text line
// (speaker + text + flavor + evaluated roll results), buffers them, and flushes a combined
// document into the `unfiltered_chat` silo on an interval.
//
// Discipline that matches the rest of Noodlr:
//   - Only the PRIMARY GM records (dedupe across multiple GMs; GM is the sole RAG writer).
//   - Our own module cards (DM narration mirror, player-bot results, media artifacts — anything
//     carrying a `flags.noodlr` key) are skipped so we never double-ingest what other pipelines
//     already handle.
//   - Whispers are private (even a GM can't see whispers they aren't party to) and are excluded
//     unless the GM opts in.
//   - A failed flush re-queues its lines so a transient offline memory service doesn't lose data.

import { MODULE_ID, log } from "../constants";
import { getChatLogConfig, getEmbedOverride, getRagClient, isRagEnabled } from "../rag/config";
import { isPrimaryGM } from "../util/gm";
import type { SiloId } from "../rag/silos";
import { bumpStats } from "../util/stats";

const SILO: SiloId = "unfiltered_chat";
/** Cap a single distilled line so one huge card can't dominate a flush. */
const MAX_LINE_CHARS = 2000;
/** Flush early once the buffer reaches this many lines (busy combat rounds). */
const FLUSH_LINE_CAP = 200;
/** Hard cap on buffered lines while the service is unreachable (drop oldest beyond this). */
const MAX_BUFFER = 2000;

interface BufferedLine {
  ts: number;
  text: string;
}

const buffer: BufferedLine[] = [];
let flushTimer: number | null = null;
let hooked = false;

/** Register the chat-log capture hook. Idempotent; safe to call once on ready (GM clients). */
export function initChatSniffer(): void {
  if (hooked) return;
  hooked = true;
  Hooks.on("createChatMessage", (message: unknown) => {
    try {
      onChatMessage(message as ChatMessageLike);
    } catch (err) {
      log("chat-log sniffer error:", err);
    }
  });
}

/** Minimal structural view of the fields we read off a ChatMessage document. */
interface ChatMessageLike {
  alias?: string;
  content?: string;
  flavor?: string;
  timestamp?: number;
  whisper?: string[];
  rolls?: Array<{ formula?: string; total?: number | null }>;
  speakerActor?: { name?: string } | null;
  author?: { name?: string } | null;
  flags?: Record<string, unknown>;
}

function onChatMessage(message: ChatMessageLike): void {
  const cfg = getChatLogConfig();
  if (!cfg.enabled || !isRagEnabled()) return;
  // Only the primary GM records, so a message isn't ingested once per connected GM.
  if (!isPrimaryGM()) return;
  // Skip Noodlr's own cards — their content is handled by their own pipelines.
  if (message?.flags && Object.prototype.hasOwnProperty.call(message.flags, MODULE_ID)) return;

  const whisper = Array.isArray(message?.whisper) ? message.whisper : [];
  if (whisper.length > 0 && !cfg.includeWhispers) return;

  const line = distill(message, whisper);
  if (!line) return;

  buffer.push({ ts: Date.now(), text: line });
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);

  if (buffer.length >= FLUSH_LINE_CAP) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
  } else {
    ensureFlushTimer(cfg.intervalSec);
  }
}

/** Turn one chat message into a single timestamped plain-text line, or null if nothing useful. */
function distill(message: ChatMessageLike, whisper: string[]): string | null {
  const when = formatTimestamp(message?.timestamp ?? Date.now());
  const speaker = String(
    message?.alias || message?.speakerActor?.name || message?.author?.name || "Unknown",
  ).trim();

  const body = stripHtml(String(message?.content ?? ""));
  const flavor = String(message?.flavor ?? "").trim();
  const rolls = extractRolls(message);

  const parts: string[] = [];
  if (flavor && !body.toLowerCase().startsWith(flavor.toLowerCase())) parts.push(flavor);
  if (body) parts.push(body);
  if (rolls) parts.push(`[roll: ${rolls}]`);

  let text = parts.join(" — ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > MAX_LINE_CHARS) text = `${text.slice(0, MAX_LINE_CHARS)}…`;

  const wPrefix = whisper.length > 0 ? `(whisper→ ${whisperNames(whisper)}) ` : "";
  return `[${when}] ${wPrefix}${speaker}: ${text}`;
}

/** Strip HTML to text, collapsing images to their alt/title so a visual card still leaves a trace. */
function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("img").forEach((img) => {
    const alt = img.getAttribute("alt") || img.getAttribute("title") || "";
    img.replaceWith(document.createTextNode(alt ? `[image: ${alt}]` : "[image]"));
  });
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Fold evaluated dice into "formula = total" strings (rolls are already evaluated at create). */
function extractRolls(message: ChatMessageLike): string {
  const rolls = Array.isArray(message?.rolls) ? message.rolls : [];
  const parts: string[] = [];
  for (const r of rolls) {
    const formula = String(r?.formula ?? "").trim();
    const total = r?.total;
    if (formula && total != null) parts.push(`${formula} = ${total}`);
    else if (total != null) parts.push(String(total));
  }
  return parts.join(", ");
}

function whisperNames(ids: string[]): string {
  const names = ids
    .map((id) => (game.users as any)?.get?.(id)?.name)
    .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
  return names.length > 0 ? names.join(", ") : "private";
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function ensureFlushTimer(intervalSec: number): void {
  if (flushTimer !== null) return;
  const ms = Math.max(30, intervalSec) * 1000;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, ms);
}

/** Ingest the buffered lines as one combined document into `unfiltered_chat`. */
async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const lines = buffer.splice(0, buffer.length);
  const text = lines.map((l) => l.text).join("\n");
  try {
    const res = await getRagClient().ingest(
      SILO,
      [{ text, metadata: { source: "foundry-chat-log", ts: Date.now() } }],
      getEmbedOverride(),
    );
    bumpStats({ ingestDocs: res?.inserted ?? 1, ingestChunks: res?.chunks ?? 0 });
  } catch (err) {
    // Re-queue (bounded) so a transient offline service doesn't lose the session log, and re-arm.
    buffer.unshift(...lines);
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
    log("chat-log ingest failed (will retry):", err);
    ensureFlushTimer(getChatLogConfig().intervalSec);
  }
}
