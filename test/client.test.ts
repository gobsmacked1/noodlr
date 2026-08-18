// What a 403 means, which the status alone never says.
//
// Pinned rather than reviewed because every direction fails quietly. Read a threshold as permanent and
// a batch of abilities is lost with nothing explaining itself — the 2026-08-16 report, 62 wordings gone
// in 52ms. Read a flagged wording as transient and every scene load re-sends it five times, for ever,
// to be told the same thing. Read a spending cap as transient and the shared pause gate stalls every
// other request behind a refusal that cannot pass until a human tops the account up.

import assert from "node:assert/strict";
import test from "node:test";

import { refusalAdvice, refusalKind } from "../src/capability/client";

test("a moderation verdict is permanent", () => {
  // OpenRouter's own shape for a flagged prompt.
  assert.equal(
    refusalKind(
      '{"error":{"message":"Input was flagged","code":403,' +
        '"metadata":{"reasons":["violence"],"flagged_input":"the troll rends…"}}}',
    ),
    "moderation",
  );
  assert.equal(refusalKind('{"error":{"message":"content policy violation"}}'), "moderation");
  assert.equal(refusalKind("Blocked by moderation"), "moderation");
});

test("a spending cap is permanent and is not the pause gate's business", () => {
  // THE SPECIMEN, verbatim from the run that made this a three-way test rather than a two-way one.
  // The earlier version read it as a threshold and retried four times into a monthly cap.
  assert.equal(
    refusalKind(
      '{"error":{"message":"Budget limit exceeded (monthly limit). Contact your org admin.","code":403}}',
    ),
    "budget",
  );
  assert.equal(refusalKind('{"error":{"message":"Insufficient credits"}}'), "budget");
  assert.equal(
    refusalKind('{"error":{"message":"spending limit reached for this key"}}'),
    "budget",
  );
});

test("a refusal that names no reason is treated as a threshold", () => {
  // An edge refusal with an HTML body and nothing in it about the content or the account.
  assert.equal(refusalKind("<html><head><title>403 Forbidden</title></head></html>"), "threshold");
  assert.equal(refusalKind('{"error":{"message":"Forbidden"}}'), "threshold");
  // AN EMPTY OR UNREADABLE BODY MUST NOT READ AS PERMANENT. This is the asymmetry: one needless
  // retry costs a request, while calling a threshold permanent costs the batch.
  assert.equal(refusalKind(""), "threshold");
  assert.equal(refusalKind(undefined as unknown as string), "threshold");
});

test("ordinary rules prose in an error body does not make it permanent", () => {
  // A 403's body can echo the request, so every pattern here has to be a word that cannot turn up in
  // a statblock. "flagged" is the load-bearing one for moderation; guarding on something vaguer would
  // have made every refusal permanent.
  assert.equal(
    refusalKind('{"error":{"message":"Forbidden","input":"the creature is Prone and takes"}}'),
    "threshold",
  );
  // "exceeded" alone must NOT read as a budget: that is also how a rate limit reads, and a rate limit
  // is a 429 whose own handling must not be shadowed by this.
  assert.equal(refusalKind('{"error":{"message":"Rate limit exceeded"}}'), "threshold");
});

test("only the refusals an operator can act on carry advice", () => {
  // The advice IS the report — this path runs unattended during a scene load, so a console line is
  // nobody's notification. A threshold has nothing for a human to do, and saying so would train them
  // to dismiss the channel.
  assert.match(refusalAdvice("budget"), /limit|credit/i);
  assert.match(refusalAdvice("moderation"), /by hand|Capabilities/i);
  assert.equal(refusalAdvice("threshold"), "");
  assert.equal(refusalAdvice(undefined), "");
});
