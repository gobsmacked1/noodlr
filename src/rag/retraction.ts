// Retracted memories: rows a GM has marked as known errors.
//
// Deleting a wrong memory loses the evidence that it was ever there; leaving it in place lets it
// come back at retrieval with the same authority as the material it contradicts, and reinforce
// itself each time it's cited. Retraction splits the difference — the row survives in the Memory
// browser (where a GM can read what went wrong) and is skipped everywhere a bot would read it.
//
// Stored as plain metadata rather than a separate collection, so it works identically against
// noodlr-memory and RAG Lite and needs no service-side support.

import type { RagHit } from "./client";

export function isRetracted(hit: Pick<RagHit, "metadata">): boolean {
  return Boolean((hit.metadata as { retracted?: unknown } | undefined)?.retracted);
}
