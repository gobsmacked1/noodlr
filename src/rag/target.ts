// Where the browser should send noodlr-memory requests, and why it might not arrive.
//
// A browser cannot open a Unix socket at all, so a service reached over one is only usable through
// a reverse proxy — which, from the page's point of view, is just a path on Foundry's own origin.
// (noodlr-memory <=1.0 also disabled TCP whenever a socket was configured, making the proxy the
// only route; 1.1 binds both.) Hence two modes:
//
//   proxy  — "/memory" on Foundry's origin. Works with the socket deployment, inherits Foundry's
//            TLS, and is same-origin so no CORS and no preflight.
//   direct — a full URL to a TCP listener. Requires NOODLR_MEMORY_HOST to be bound somewhere the
//            GM's browser can reach (127.0.0.1 binds nothing useful for a remote GM).
//
// Only the GM's browser ever talks to the service (retrieval is GM-gated), so "reachable" always
// means reachable from the GM's machine, not from the Foundry host.

import { MODULE_ID, RAG_SETTINGS } from "../constants";

export type RagTargetMode = "proxy" | "direct";

export interface RagTarget {
  mode: RagTargetMode;
  /** Path on Foundry's origin, e.g. "/memory". Proxy mode only. */
  path: string;
  /** Full URL as entered, e.g. "http://192.168.1.10:3010". Direct mode only. */
  url: string;
  /** What RagClient actually prefixes onto "/v1/...". Empty when the target is unusable. */
  effectiveUrl: string;
}

/** Trailing "/v1" is stripped: the client appends it, and pasting the full endpoint is a common slip. */
function trimBase(value: string): string {
  return value.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function normalizeServicePath(value: string): string {
  const trimmed = trimBase(value);
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function normalizeServiceUrl(value: string): string {
  return trimBase(value);
}

function pageOrigin(): string {
  return globalThis.location?.origin ?? "";
}

export function getRagTargetMode(): RagTargetMode {
  return game.settings.get(MODULE_ID, RAG_SETTINGS.targetMode) === "proxy" ? "proxy" : "direct";
}

export function getRagTarget(): RagTarget {
  const mode = getRagTargetMode();
  const path = normalizeServicePath(
    (game.settings.get(MODULE_ID, RAG_SETTINGS.servicePath) as string) ?? "",
  );
  const url = normalizeServiceUrl(
    (game.settings.get(MODULE_ID, RAG_SETTINGS.serviceUrl) as string) ?? "",
  );
  const effectiveUrl = mode === "proxy" ? (path ? `${pageOrigin()}${path}` : "") : url;
  return { mode, path, url, effectiveUrl };
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * A problem visible without sending a request — the kind that produces a bare "NetworkError" and no
 * useful clue. Returned localized, or null when the target looks sane.
 */
export function inspectRagTarget(target: RagTarget = getRagTarget()): string | null {
  const t = (key: string, data?: Record<string, string>) =>
    data
      ? game.i18n.format(`NOODLR.Rag.Target.${key}`, data)
      : game.i18n.localize(`NOODLR.Rag.Target.${key}`);

  if (target.mode === "proxy") {
    return target.path ? null : t("NoPath");
  }

  if (!target.url) return t("NoUrl");

  let parsed: URL;
  try {
    parsed = new URL(target.url);
  } catch {
    return t("BadUrl");
  }

  const page = globalThis.location;
  // The classic: 127.0.0.1 resolves to the machine running the browser, so a remote GM is asking
  // their own desktop for the memory service. It "works" only when Foundry is on that same desktop.
  if (isLoopback(parsed.hostname) && page && !isLoopback(page.hostname)) {
    return t("Loopback", { host: page.hostname });
  }
  if (page?.protocol === "https:" && parsed.protocol === "http:" && !isLoopback(parsed.hostname)) {
    return t("MixedContent");
  }
  return null;
}

/** What to try after a request actually failed. Complements inspectRagTarget, never replaces it. */
export function ragFailureAdvice(target: RagTarget = getRagTarget()): string {
  const known = inspectRagTarget(target);
  if (known) return known;
  return game.i18n.localize(
    target.mode === "proxy" ? "NOODLR.Rag.Target.ProxyFailed" : "NOODLR.Rag.Target.DirectFailed",
  );
}
