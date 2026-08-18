// Settings for the capability compiler.
//
// On by default, and inert with no rules module installed — nothing ever fires a compile request, so
// the switch costs a table nothing until something asks. The rules module's own switch ships OFF, so
// a GM has to opt in at the end that spends the money before anything is paid for.

import { MODULE_ID, CAPABILITY_SETTINGS } from "../constants";
import { getFeatureConfig } from "../providers/config";
import type { FeatureProviderConfig } from "../providers/types";
import { promptDefault, promptValue } from "../prompts/fields";

/**
 * The cheap, fast slug the compiler and the Ready-trigger reader share.
 *
 * Independent of Chat on purpose: the narrating model is chosen for prose, and this one is chosen
 * for following a schema. A blank stored value used to mean "whatever Chat uses", which is how a
 * world-recompile slug ended up Gamemastering the campaign (2026-08-18). Empty now resolves to
 * the default rather than to Chat.
 */
export const DEFAULT_CAPABILITY_MODEL = "google/gemini-3.7-flash";

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
    default: DEFAULT_CAPABILITY_MODEL,
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

/** The slug that will actually be sent. Empty or whitespace is the default, never Chat's model. */
export function resolveCapabilityModel(stored: string | null | undefined): string {
  const slug = String(stored ?? "").trim();
  return slug || DEFAULT_CAPABILITY_MODEL;
}

export function getCapabilityModel(): string {
  try {
    return resolveCapabilityModel(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.model));
  } catch {
    return DEFAULT_CAPABILITY_MODEL;
  }
}

/**
 * Chat's provider and key, this job's model.
 *
 * Sharing the endpoint rather than adding a sixth feature block is deliberate — same key, different
 * job. The model is never Chat's unless the GM typed that slug into this field on purpose.
 */
export function getCapabilityConfig(): FeatureProviderConfig {
  const cfg = getFeatureConfig("chat");
  return { ...cfg, model: getCapabilityModel() };
}

/** How many features to compile at once. Clamped: the API key and its rate limit are shared. */
export function getCapabilityConcurrency(): number {
  const raw = Number(game.settings.get(MODULE_ID, CAPABILITY_SETTINGS.concurrency));
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.round(raw)));
}
