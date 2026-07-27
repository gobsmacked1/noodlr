// Player-bot relay (GM-relayed transport).
//
// A non-GM client's "Ask the Table" request is sent to the GM over the module socket; the
// (primary) GM processes it and posts the result as a public ChatMessage, which Foundry mirrors to
// every client automatically. This keeps provider API keys and the memory secret on the GM's
// machine only - players never call OpenRouter or noodlr-memory directly, and privilege is enforced
// at the access layer (not by trusting a prompt to detect the user's role).
//
// Phase P1: the GM side echoes a placeholder answer so we can verify relay + role gating +
// player-wide mirroring end to end. Real generation (restricted RAG + LLM) lands in P2+.

import { MODULE_ID, SOCKET, log } from "../constants";

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
  if (game.user?.isGM) void handlePlayerAsk(payload, { local: true });
  else game.socket?.emit(SOCKET, payload);
  return payload;
}

/**
 * GM-side handler. `local` means this GM invoked it directly (testing their own panel), so the
 * primary-GM dedupe guard is skipped. Phase P1: post a placeholder answer as a public ChatMessage
 * to prove relay + role gating + player-wide mirroring.
 */
export async function handlePlayerAsk(
  payload: PlayerAskPayload,
  opts: { local?: boolean } = {},
): Promise<void> {
  if (!game.user?.isGM) return;
  if (!opts.local && !isPrimaryGM()) return;
  const text = (payload.text ?? "").trim();
  if (!text) return;

  const answer = game.i18n.localize("NOODLR.Players.P1Placeholder");
  await postPlayerResult({
    requestId: payload.requestId,
    askUserId: payload.userId,
    askUserName: payload.userName,
    question: text,
    answer,
  });
}

/** Post the player-bot result as a public ChatMessage (Foundry mirrors it to all clients). */
async function postPlayerResult(flag: PlayerBotFlag): Promise<void> {
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
  } catch (err) {
    log("player-bot result post failed:", err);
  }
}
