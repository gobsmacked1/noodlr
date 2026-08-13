// Telling a provider's refusal apart from a broken memory service, in the operator's words.
//
// These two failures arrive at the same place and mean opposite things. A rate limit says the store
// is healthy, the write path is correct, and an upstream model was busy for a moment; a connection
// or store failure says nothing is working. Reported as one raw error string they are
// indistinguishable, and the reasonable conclusion from "self-test failed" is that memory is broken —
// which sends the operator to audit a service that was never at fault. Naming the refusal is the
// whole point: it is the difference between "wait a minute and press it again" and "go and debug".

import { RagClientError } from "./client";
import { getEmbedOverride, getRagBackend } from "./config";

/**
 * Whether a failure is the provider's rate limit rather than a fault in the request.
 *
 * The service reports one as HTTP 429 as of noodlr-memory 1.2.0. Older builds flattened it to a 400
 * whose message still quoted the provider's status, and a GM does not upgrade the service in step
 * with the module — so the message is read as well. Getting this wrong in the permissive direction
 * costs one pointless wait; getting it wrong in the strict direction abandons an ingest that would
 * have finished, which is the failure the patience path exists to prevent.
 */
export function isRateLimit(err: unknown): boolean {
  if (err instanceof RagClientError) {
    if (err.status === 429) return true;
    return /\b429\b|rate.?limit/i.test(err.message);
  }
  return /\b429\b|rate.?limit/i.test(String((err as Error)?.message ?? err));
}

/**
 * Which embedding model to name, or "" when the module genuinely does not know.
 *
 * `getEmbedOverride()` carries a model only when the GM opted into sending the provider config;
 * without that the service uses its own `EMBED_MODEL` and we would be reporting a setting that had no
 * part in the request. Naming the wrong model is worse than naming none — the same class of mistake
 * as advising an account top-up for an upstream limit.
 */
function refusedModel(): string {
  return getEmbedOverride()?.model ?? "";
}

/**
 * One sentence for the operator when the embedding provider refused, or "" for any other failure.
 *
 * Deliberately mentions the service's own environment variables: the audience for this line is
 * whoever runs noodlr-memory, and the levers are all on that side. Same reasoning as the socket and
 * reverse-proxy hints in `ragFailureAdvice`.
 *
 * Returns "" on the Lite backend, and that guard is the point rather than an optimization. Lite
 * embeds in this browser from weights shipped in the package — no provider, no key, no request — so
 * it can never be rate-limited, and every lever this advice names (`EMBED_BATCH_SIZE`,
 * `EMBED_MIN_INTERVAL_MS`, `EMBED_PROVIDER`) is an environment variable of a service the GM does not
 * run. `isRateLimit` matches on the message as well as the status, so an unrelated 429 reaching us
 * from somewhere else entirely — a reverse proxy in front of Foundry refusing the `FilePicker.upload`
 * that Lite saves its silo with — would otherwise send a Lite operator to tune a service that is not
 * involved. Naming the wrong remedy is the same class of mistake as advising an account top-up for an
 * upstream limit.
 */
export function providerRefusalAdvice(err: unknown): string {
  if (getRagBackend() === "lite") return "";
  if (!isRateLimit(err)) return "";
  const model = refusedModel();
  return game.i18n.format(model ? "NOODLR.Rag.Refused.Model" : "NOODLR.Rag.Refused.Generic", {
    model,
  });
}

/**
 * One sentence for the operator when Memory Lite's own machinery failed, or "" when the error is not
 * one we recognise (in which case the caller shows the raw text, which is the honest fallback).
 *
 * Lite's failure modes are few, known, and have all been shipped as real bugs at least once, which is
 * exactly why they are worth naming rather than re-diagnosing from a stack trace at someone's table:
 *
 *  - **An incomplete install.** `rag/local/embedder.ts` sets `allowRemoteModels = false`, so there is
 *    no fallback if the weights or the ONNX Runtime WASM are missing from the package — it is a 404
 *    and nothing else. The v0.4.25 asset genuinely shipped without `models/` (13 MB instead of ~29),
 *    and the rc6-rc8 series was three releases of the ORT paths resolving to the wrong directory. A
 *    local dev install cannot reproduce either, because the files are already on disk from
 *    `npm run fetch-model`. Whoever hits this needs to reinstall, not to configure anything.
 *  - **No upload permission.** Lite persists one JSON file per silo through `FilePicker.upload`, so a
 *    client without `FILES_UPLOAD` can build an index in memory and then fail to save it.
 *
 * Deliberately says nothing about batch sizes, rates or models: on this backend the work happens on
 * one WASM thread in the GM's own browser, and there is no request to slow down.
 */
export function liteFailureAdvice(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  // Anything that names a file we ship, or the loader failing to find a backend at all.
  if (
    /\.onnx|ort-wasm|no available backend|could not locate file|\/models\/|\/dist\/ort\//i.test(msg)
  ) {
    return game.i18n.localize("NOODLR.Rag.Lite.Incomplete");
  }
  if (/filepicker|upload|permission/i.test(msg)) {
    return game.i18n.localize("NOODLR.Rag.Lite.NoUpload");
  }
  return "";
}

/**
 * The advice for whichever backend is actually in use — the one entry point callers should reach for.
 *
 * A single dispatcher exists so that adding a backend cannot leave a report path quietly handing out
 * another backend's remedies, which is the bug this file was written to prevent in the first place.
 */
export function ingestFailureAdvice(err: unknown): string {
  return getRagBackend() === "lite" ? liteFailureAdvice(err) : providerRefusalAdvice(err);
}
