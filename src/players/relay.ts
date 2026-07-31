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
import { generatePlayerAnswer } from "./answer";
import { firstDirective } from "./directives";
import { registerPendingAdjudication } from "./adjudication";
import { applyMemoryDirectives } from "../rag/memory-writes";

/** Socket message type for a player -> GM "Ask the Table" request. */
export const PLAYER_ASK = "player-ask" as const;

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

/**
 * True when this client is the GM responsible for handling relayed player requests. With several
 * GMs/assistant-GMs online, only the designated primary handles socket relays so a request is not
 * answered twice. Falls back to "any GM" if Foundry reports no active GM.
 */
export function isPrimaryGM(): boolean {
  if (!game.user?.isGM) return false;
  const active = (game.users as any)?.activeGM ?? null;
  return !active || active === game.user;
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
    // A relayed question can only be answered by an online GM. Warn the player instead of leaving
    // them staring at a spinner forever (the previous behaviour — the root cause of "no response,
    // no console output": no GM was connected, so nothing ever picked the request up).
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
    debug("players/relay: ignoring (not the primary GM)", { requestId: payload.requestId });
    return;
  }
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
    const result = await generatePlayerAnswer(
      text,
      payload.userName,
      abort.signal,
      payload.userId,
    );
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
      speaker: { alias: game.i18n.localize("NOODLR.Players.Speaker") },
      flags: { [MODULE_ID]: { playerBot: flag } },
    });
    debug("players/relay: result posted", { requestId: flag.requestId });
  } catch (err) {
    warn("player-bot result post failed:", err);
  }
}
