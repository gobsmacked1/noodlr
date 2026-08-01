// Player-bot relay (GM-relayed transport).
//
// A non-GM client's "Ask the Table" request is sent to the GM over the module socket; the
// (primary) GM processes it and posts the result as a public ChatMessage, which Foundry mirrors to
// every client automatically. This keeps provider API keys and the memory secret on the GM's
// machine only - players never call OpenRouter or noodlr-memory directly, and privilege is enforced
// at the access layer (not by trusting a prompt to detect the user's role).
//
// P2: the GM side now generates a real answer via the players-only bot (player-scoped RAG + LLM;
// see answer.ts) and posts it as a public ChatMessage that Foundry mirrors to every client.
// Privileged adjudication (the bot-to-bot relay) is P3.

import { MODULE_ID, SOCKET, debug, warn } from "../constants";
import { getAssistantName } from "../chat/assistant";
import { generatePlayerAnswer } from "./answer";
import { firstDirective } from "./directives";
import { registerPendingAdjudication } from "./adjudication";
import { applyMemoryDirectives } from "../rag/memory-writes";
import { getTtsAutoRead } from "../media/config";
import { speakShared } from "../media/tts";
import { isPrimaryGM } from "../util/gm";

/** Socket message type for a player -> GM "Ask the Table" request. */
export const PLAYER_ASK = "player-ask" as const;

/**
 * Socket message type for the GM's immediate "I have this" receipt, sent before generation starts.
 * Two jobs: it tells the asking client the request survived the socket hop (so a failure can name
 * WHICH hop broke instead of just timing out), and it tells other GMs to stand down.
 */
export const PLAYER_ACK = "player-ask-ack" as const;

/** Local hook fired when an ack arrives, so the panel can cancel its "nobody picked this up" timer. */
export const PLAYER_ACK_HOOK = "noodlr.playerAskAck" as const;

export interface PlayerAckPayload {
  type: typeof PLAYER_ACK;
  requestId: string;
  gmName: string;
}

/** Envelope emitted by a player client (or handled locally by a GM testing their own panel). */
export interface PlayerAskPayload {
  type: typeof PLAYER_ASK;
  requestId: string;
  userId: string;
  userName: string;
  text: string;
}

/** Flag payload attached to the public result message; adopted into open player panels. */
export interface PlayerBotFlag {
  requestId: string;
  askUserId: string;
  askUserName: string;
  question: string;
  answer: string;
}

function randomId(): string {
  return (foundry as any)?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * Hard ceiling on one player question. Nothing in the provider path times out on its own — a stalled
 * request or a stream that never closes would otherwise leave the asking player watching a spinner
 * forever with no error anywhere. Generous enough for a slow model, short enough to stay a chat.
 */
const GENERATION_TIMEOUT_MS = 90_000;

/** How long a non-primary GM waits for the primary's ack before answering the request itself. */
const TAKEOVER_DELAY_MS = 4_000;

/** requestIds some GM has acknowledged, so a standby GM knows not to take over. */
const acked = new Set<string>();

/** Announce that this GM has taken responsibility for a relayed question. */
function emitAck(requestId: string): void {
  acked.add(requestId);
  const ack: PlayerAckPayload = {
    type: PLAYER_ACK,
    requestId,
    gmName: game.user?.name ?? "GM",
  };
  game.socket?.emit(SOCKET, ack);
}

/** Record an ack (from any GM) and let the asking panel know its question was picked up. */
export function handlePlayerAckSocket(data: PlayerAckPayload): void {
  if (!data?.requestId) return;
  acked.add(data.requestId);
  debug("players/relay: ask acknowledged", { requestId: data.requestId, by: data.gmName });
  Hooks.callAll(PLAYER_ACK_HOOK, data.requestId);
}

/**
 * Send an "Ask the Table" request. Non-GM players emit it to the GM over the socket; a GM testing
 * their own player panel handles it locally (Foundry sockets do not loop back to the sender).
 * Returns the payload so the panel can match the eventual answer by requestId.
 */
export function sendPlayerAsk(text: string): PlayerAskPayload {
  const payload: PlayerAskPayload = {
    type: PLAYER_ASK,
    requestId: randomId(),
    userId: game.user?.id ?? "",
    userName: game.user?.name ?? "Player",
    text,
  };
  if (game.user?.isGM) {
    debug("players/relay: handling locally (GM)", { requestId: payload.requestId });
    void handlePlayerAsk(payload, { local: true });
  } else if (game.socket) {
    debug("players/relay: emitting to GM over socket", {
      requestId: payload.requestId,
      socket: SOCKET,
      activeGM: (game.users as any)?.activeGM?.name ?? null,
    });
    // A relayed question can only be answered by an online GM, so say so up front rather than let the
    // ack timeout explain it later.
    if (!(game.users as any)?.activeGM) {
      warn("player-bot: no active GM online — question cannot be answered");
      ui.notifications?.warn(game.i18n.localize("NOODLR.Players.NoGM"));
    }
    game.socket.emit(SOCKET, payload);
  } else {
    warn("player-bot: no socket available; question not sent");
  }
  return payload;
}

/**
 * GM-side handler. `local` means this GM invoked it directly (testing their own panel), so the
 * primary-GM dedupe guard is skipped. Generates the players-only bot answer and posts it publicly.
 */
export async function handlePlayerAsk(
  payload: PlayerAskPayload,
  opts: { local?: boolean } = {},
): Promise<void> {
  if (!game.user?.isGM) return;
  if (!opts.local && !isPrimaryGM()) {
    // Stand by rather than drop it. If the GM Foundry named as primary is a stale session that will
    // never answer, silently ignoring the request black-holes the entire feature with no output
    // anywhere. Wait briefly for that GM's ack; if none comes, answer it ourselves.
    const primary = (game.users as any)?.activeGM;
    warn(
      `player-bot: standing by — Foundry names ${primary?.name ?? "another GM"} as the primary GM. ` +
        `Taking over in ${TAKEOVER_DELAY_MS / 1000}s if they don't acknowledge.`,
    );
    window.setTimeout(() => {
      if (acked.has(payload.requestId)) return;
      warn("player-bot: the primary GM never acknowledged; answering it here instead");
      emitAck(payload.requestId);
      void handlePlayerAsk(payload, { local: true });
    }, TAKEOVER_DELAY_MS);
    return;
  }

  // Tell the asker (and any standby GM) that this request is being worked on, before the slow part.
  if (!opts.local) emitAck(payload.requestId);

  const text = (payload.text ?? "").trim();
  if (!text) {
    warn("player-bot: empty question received; nothing to answer");
    return;
  }
  debug("players/relay: GM handling request", {
    requestId: payload.requestId,
    from: payload.userName,
    text,
  });

  let answer: string;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), GENERATION_TIMEOUT_MS);
  let timedOut = false;
  abort.signal.addEventListener("abort", () => {
    timedOut = true;
  });
  try {
    const result = await generatePlayerAnswer(text, payload.userName, abort.signal, payload.userId);
    answer = result.text;

    // If the bot escalated a privileged check, register it so the player's real roll (captured from
    // the chat log) resolves it against gm_* truth. The posted text is the "roll X" ask.
    const adj = firstDirective(result.directives, "ADJUDICATE");
    if (adj) {
      const d = adj.data as Record<string, unknown>;
      registerPendingAdjudication({
        requestId: payload.requestId,
        userId: payload.userId,
        askUserName: payload.userName,
        pc: String(d.pc ?? payload.userName),
        target: String(d.target ?? ""),
        skill: String(d.skill ?? "a check"),
        question: String(d.question ?? text),
      });
      if (!answer.trim()) {
        answer = game.i18n.format("NOODLR.Players.RollPrompt", { skill: String(d.skill ?? "a") });
      }
    }

    // Execute any memory writes the players-bot emitted (enforced to player_* silos + audited).
    await applyMemoryDirectives("player", result.directives);
  } catch (err) {
    // Always warn (not debug-gated): a swallowed failure here is exactly what made this silent.
    if (timedOut) {
      warn(`player-bot generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s`);
      answer = game.i18n.localize("NOODLR.Players.Timeout");
    } else {
      warn("player-bot generation failed:", err);
      answer = game.i18n.localize("NOODLR.Players.GenFailed");
    }
  } finally {
    clearTimeout(timer);
  }
  if (!answer.trim()) {
    warn("player-bot produced an empty answer; posting the fallback notice");
    answer = game.i18n.localize("NOODLR.Players.GenFailed");
  }

  await postPlayerResult({
    requestId: payload.requestId,
    askUserId: payload.userId,
    askUserName: payload.userName,
    question: text,
    answer,
  });

  // Read the answer aloud, honouring the same auto-read toggle as the GM co-pilot. Synthesized here
  // (the GM's client holds the credentials) but played on every client, so the player who asked
  // actually hears the reply.
  if (getTtsAutoRead()) {
    try {
      await speakShared(answer);
    } catch (err) {
      warn("player-bot: reading the answer aloud failed:", err);
    }
  }
}

/** Post the player-bot result as a public ChatMessage (Foundry mirrors it to all clients). */
export async function postPlayerResult(flag: PlayerBotFlag): Promise<void> {
  const esc = (s: string): string =>
    (globalThis as any).Handlebars?.escapeExpression?.(s) ?? String(s);
  const content =
    `<div class="noodlr-player-card">` +
    `<p class="noodlr-player-card__q"><i class="fa-solid fa-user"></i> ` +
    `<strong>${esc(flag.askUserName)}</strong>: ${esc(flag.question)}</p>` +
    `<div class="noodlr-player-card__a">${esc(flag.answer)}</div>` +
    `</div>`;
  try {
    await (globalThis as any).ChatMessage.create({
      content,
      speaker: { alias: getAssistantName() },
      flags: { [MODULE_ID]: { playerBot: flag } },
    });
    debug("players/relay: result posted", { requestId: flag.requestId });
  } catch (err) {
    warn("player-bot result post failed:", err);
  }
}
