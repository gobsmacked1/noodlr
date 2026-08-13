// Telling a provider's refusal apart from a broken memory service, in the operator's words.
//
// These two failures arrive at the same place and mean opposite things. A rate limit says the store
// is healthy, the write path is correct, and an upstream model was busy for a moment; a connection
// or store failure says nothing is working. Reported as one raw error string they are
// indistinguishable, and the reasonable conclusion from "self-test failed" is that memory is broken —
// which sends the operator to audit a service that was never at fault. Naming the refusal is the
// whole point: it is the difference between "wait a minute and press it again" and "go and debug".

import { RagClientError } from "./client";
import { getEmbedOverride } from "./config";

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
 */
export function providerRefusalAdvice(err: unknown): string {
  if (!isRateLimit(err)) return "";
  const model = refusedModel();
  return game.i18n.format(model ? "NOODLR.Rag.Refused.Model" : "NOODLR.Rag.Refused.Generic", {
    model,
  });
}
