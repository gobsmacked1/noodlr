// GM-only audit trail. Automated adjudications and bot-driven memory writes resolve without the
// human GM in the loop (their choice), so every such action is whispered to the GM as a compact
// ChatMessage they can review and manually correct. Flagged with the module id so the chat-log
// sniffer skips it (no self-ingest) and it's easy to filter.

import { MODULE_ID, log } from "../constants";

/**
 * Whisper a one-line audit note to all GM users. Best-effort and non-blocking — a failure here must
 * never break the action being audited.
 */
export async function auditToGM(summary: string): Promise<void> {
  try {
    const gmIds = (game.users as any)?.filter?.((u: any) => u.isGM)?.map((u: any) => u.id) ?? [];
    await (globalThis as any).ChatMessage.create({
      content: `<div class="noodlr-audit"><i class="fa-solid fa-clipboard-check"></i> ${foundry.utils.escapeHTML(summary)}</div>`,
      whisper: gmIds,
      speaker: { alias: "Noodlr audit" },
      flags: { [MODULE_ID]: { audit: true } },
    });
  } catch (err) {
    log("audit whisper failed:", err);
  }
}
