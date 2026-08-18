import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_CAPABILITY_MODEL, resolveCapabilityModel } from "../src/capability/config";

// A blank compile slug used to mean "whatever Chat uses", which is how a world-recompile
// model ended up Gamemastering the campaign. Empty is the default, never Chat.

test("the compile slug defaults to gemini flash, not to Chat", () => {
  assert.equal(DEFAULT_CAPABILITY_MODEL, "google/gemini-3.7-flash");
  assert.equal(resolveCapabilityModel(""), DEFAULT_CAPABILITY_MODEL);
  assert.equal(resolveCapabilityModel("   "), DEFAULT_CAPABILITY_MODEL);
  assert.equal(resolveCapabilityModel(null), DEFAULT_CAPABILITY_MODEL);
  assert.equal(resolveCapabilityModel(undefined), DEFAULT_CAPABILITY_MODEL);
});

test("a typed slug is kept, including Chat's if someone really wants it", () => {
  assert.equal(resolveCapabilityModel("openai/gpt-5.4"), "openai/gpt-5.4");
  assert.equal(resolveCapabilityModel("  google/gemini-3.7-flash  "), "google/gemini-3.7-flash");
});
