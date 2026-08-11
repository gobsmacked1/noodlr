// Settings for the capability compiler.
//
// On by default, and inert with no rules module installed — nothing ever fires a compile request, so
// the switch costs a table nothing until something asks. The rules module's own switch ships OFF, so
// a GM has to opt in at the end that spends the money before anything is paid for.

import { MODULE_ID, CAPABILITY_SETTINGS } from "../constants";
import { getFeatureConfig } from "../providers/config";
import type { FeatureProviderConfig } from "../providers/types";
import { promptDefault, promptValue } from "../prompts/fields";

export function registerCapabilitySettings(): void {
  game.settings.register(MODULE_ID, CAPABILITY_SETTINGS.enabled, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, CAPABILITY_SETTINGS.systemPrompt, {
    scope: "world",
    config: false,
    type: String,
    default: promptDefault(CAPABILITY_SETTINGS.systemPrompt),
  });
  game.settings.register(MODULE_ID, CAPABILITY_SETTINGS.model, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, CAPABILITY_SETTINGS.concurrency, {
    scope: "world",
    config: false,
    type: Number,
    default: 4,
  });
}

export function isCapabilityCompilerEnabled(): boolean {
  try {
    return Boolean(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.enabled));
  } catch {
    return false;
  }
}

/** The doctrine half of the system message, as stored. Read verbatim (see prompts/fields.ts). */
export function getCapabilityPrompt(): string {
  return promptValue(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.systemPrompt));
}

/**
 * The provider to compile with: Chat's, with the model swapped when an override is set.
 *
 * Sharing Chat's provider and key rather than adding a sixth feature block is deliberate — this is
 * the same endpoint doing a different job, and a GM should not have to configure a second one. But
 * the MODEL wants to differ: the narrating model is chosen for prose and the compiling model for
 * following a schema, and those are rarely the same choice.
 */
export function getCapabilityConfig(): FeatureProviderConfig {
  const cfg = getFeatureConfig("chat");
  const model = String(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.model) ?? "").trim();
  return model ? { ...cfg, model } : cfg;
}

/** How many features to compile at once. Clamped: the API key and its rate limit are shared. */
export function getCapabilityConcurrency(): number {
  const raw = Number(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.concurrency));
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.round(raw)));
}
