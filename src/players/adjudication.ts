// Bot-to-bot adjudication (P3). When the players-bot decides a request needs privileged truth it
// asks the player to roll and emits an ADJUDICATE directive; the GM client registers a PENDING
// adjudication keyed to that user. The player then rolls from their sheet -> a real Foundry chat
// message -> we capture the total (from the chat-log we already sniff), reconcile it with the
// gm_* secret memory the players-bot cannot see, run a real d20 for any NPC opposition, and post the
// tier-appropriate result back to the party. The whole thing runs on the GM's client; the secret
// never leaves it except as the earned reveal. Every adjudication is audited to the GM.

import { MODULE_ID, log } from "../constants";
import { getFeatureConfig } from "../providers/config";
import { chatCompletion } from "../providers/chat-client";
import { isConfigured, type ChatMessage } from "../providers/types";
import { retrieveContext } from "../rag/retrieval";
import { GM_SECRET_SILOS, isSiloId, type MemoryAudience } from "../rag/silos";
import { getAdjudicationPrompt } from "./prompts";
import { parseDirectives } from "./directives";
import { applyMemoryDirective } from "../rag/memory-writes";
import { postPlayerResult } from "./relay";
import { isPrimaryGM } from "../util/gm";
import { auditToGM } from "../util/audit";

/** How long a pending check stays open awaiting the player's real roll. */
const PENDING_TTL_MS = 180_000;

export interface PendingAdjudication {
  requestId: string;
  userId: string;
  askUserName: string;
  pc: string;
  target: string;
  skill: string;
  question: string;
  expiresAt: number;
}

// Keyed by the asking user's id — at most one open check per player at a time (a new one supersedes).
const pending = new Map<string, PendingAdjudication>();
let captureHooked = false;

/** Register a pending check for a user (called when the players-bot emits an ADJUDICATE directive). */
export function registerPendingAdjudication(p: Omit<PendingAdjudication, "expiresAt">): void {
  pending.set(p.userId, { ...p, expiresAt: Date.now() + PENDING_TTL_MS });
  log(`adjudication pending for ${p.askUserName}: ${p.skill} vs ${p.target}`);
}

/** Install the GM-side roll-capture hook. Idempotent; call once on ready (GM clients). */
export function initAdjudicationCapture(): void {
  if (captureHooked) return;
  captureHooked = true;
  Hooks.on("createChatMessage", (message: unknown) => {
    try {
      void onChatMessage(message as ChatMessageLike);
    } catch (err) {
      log("adjudication capture error:", err);
    }
  });
}

interface ChatMessageLike {
  author?: { id?: string } | null;
  user?: { id?: string } | null;
  rolls?: Array<{ total?: number | null }>;
  flags?: Record<string, unknown>;
}

async function onChatMessage(message: ChatMessageLike): Promise<void> {
  if (!isPrimaryGM()) return;
  if (message?.flags && Object.prototype.hasOwnProperty.call(message.flags, MODULE_ID)) return;
  const rolls = Array.isArray(message?.rolls) ? message.rolls : [];
  if (rolls.length === 0) return;

  const userId = message?.author?.id ?? message?.user?.id ?? "";
  if (!userId) return;
  const p = pending.get(userId);
  if (!p) return;

  // Consume the pending entry regardless of outcome (this roll is the player's answer to it).
  pending.delete(userId);
  if (Date.now() > p.expiresAt) return; // the moment passed; silently drop

  const total = Number(rolls[0]?.total);
  if (!Number.isFinite(total)) return;

  await adjudicateAndPost(p, total);
}

async function adjudicateAndPost(p: PendingAdjudication, playerTotal: number): Promise<void> {
  const cfg = getFeatureConfig("chat");
  if (!isConfigured(cfg)) {
    await postPlayerResult({
      requestId: p.requestId,
      askUserId: p.userId,
      askUserName: p.askUserName,
      question: p.question,
      answer: game.i18n.localize("NOODLR.Players.GenFailed"),
    });
    return;
  }

  // GM-eyes-only ground truth (gm_* + system_rules). The players-bot can never query these.
  const rag = await retrieveContext(`${p.target}: ${p.question}`, undefined, {
    silos: [...GM_SECRET_SILOS],
  });
  const npcD20 = await rollD20();

  const facts =
    `Character: ${p.pc}\n` +
    `Target: ${p.target}\n` +
    `Skill rolled: ${p.skill}\n` +
    `Question to resolve: ${p.question}\n` +
    `Player's REAL total (their roll + their modifiers): ${playerTotal}\n` +
    `Raw d20 for any NPC opposition (add the NPC's modifier from the ground truth/rules): ${npcD20}\n\n` +
    (rag.block
      ? `GM-EYES-ONLY GROUND TRUTH (secret — decide the outcome from this, never reveal it):\n${rag.block}`
      : `GM-EYES-ONLY GROUND TRUTH: (nothing relevant retrieved — treat as nothing concealed unless the established fiction plainly says otherwise)`);

  const adjudicatorPrompt = getAdjudicationPrompt();
  const messages: ChatMessage[] = [];
  if (adjudicatorPrompt) messages.push({ role: "system", content: adjudicatorPrompt });
  messages.push({ role: "user", content: facts });

  let raw: string;
  try {
    raw = await chatCompletion(cfg, { messages });
  } catch (err) {
    log("adjudication generation failed:", err);
    await postPlayerResult({
      requestId: p.requestId,
      askUserId: p.userId,
      askUserName: p.askUserName,
      question: p.question,
      answer: game.i18n.localize("NOODLR.Players.GenFailed"),
    });
    return;
  }

  const { text, directives } = parseDirectives(raw);

  // Execute any memory writes the adjudicator emitted, each under the audience its silo belongs to
  // (player_* as the players-bot's right; gm_* as the GM bot's right). Enforcement lives in
  // applyMemoryDirective, so an out-of-scope silo is denied + audited.
  for (const d of directives) {
    if (d.verb === "ADJUDICATE") continue;
    const silo = String((d.data as any)?.silo ?? "");
    const audience: MemoryAudience = isSiloId(silo) && silo.startsWith("gm_") ? "gm" : "player";
    await applyMemoryDirective(audience, d);
  }

  const answer = text.trim() || game.i18n.localize("NOODLR.Players.GenFailed");
  await postPlayerResult({
    requestId: p.requestId,
    askUserId: p.userId,
    askUserName: p.askUserName,
    question: p.question,
    answer,
  });

  void auditToGM(
    `Adjudicated ${p.skill} for ${p.pc} vs ${p.target} — player ${playerTotal}, NPC d20 ${npcD20}.`,
  );
}

/** A REAL Foundry d20 (never a model-invented number). Falls back to Math.random if Roll is absent. */
async function rollD20(): Promise<number> {
  try {
    const RollCls = (globalThis as any).Roll;
    if (RollCls) {
      const r = await new RollCls("1d20").evaluate();
      const t = Number(r?.total);
      if (Number.isFinite(t)) return t;
    }
  } catch (err) {
    log("d20 roll failed, using fallback:", err);
  }
  return Math.floor(Math.random() * 20) + 1;
}
