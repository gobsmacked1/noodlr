// Which provider refusals are worth asking again.
//
// The two directions fail differently and both fail quietly, which is why this is pinned rather than
// reviewed. Read a threshold as permanent and a batch of abilities is lost with nothing explaining
// itself — that is the 2026-08-16 report, 62 wordings gone in 52ms. Read a flagged wording as
// transient and every scene load re-sends it five times, for ever, to be told the same thing.

import assert from "node:assert/strict";
import test from "node:test";

import { moderationRefusal } from "../src/capability/client";

test("a moderation verdict is permanent", () => {
  // OpenRouter's own shape for a flagged prompt.
  assert.ok(
    moderationRefusal(
      '{"error":{"message":"Input was flagged","code":403,' +
        '"metadata":{"reasons":["violence"],"flagged_input":"the troll rends…"}}}',
    ),
  );
  assert.ok(moderationRefusal('{"error":{"message":"content policy violation"}}'));
  assert.ok(moderationRefusal("Blocked by moderation"));
});

test("a refusal that names no verdict is treated as a threshold", () => {
  // The specimen: an edge refusal with an HTML body and nothing about the content in it.
  assert.equal(moderationRefusal("<html><head><title>403 Forbidden</title></head></html>"), false);
  assert.equal(moderationRefusal('{"error":{"message":"Forbidden"}}'), false);
  // AN EMPTY OR UNREADABLE BODY MUST NOT READ AS A VERDICT. This is the asymmetry: one needless
  // retry costs a request, calling a threshold permanent costs the batch.
  assert.equal(moderationRefusal(""), false);
  assert.equal(moderationRefusal(undefined as unknown as string), false);
});

test("ordinary rules prose in an error body does not make it a verdict", () => {
  // A 403's body can echo the request. "flagged" is the load-bearing word and it is not a word that
  // turns up in a statblock; guarding on something vaguer would have made every refusal permanent.
  assert.equal(
    moderationRefusal('{"error":{"message":"Forbidden","input":"the creature is Prone and takes"}}'),
    false,
  );
});
