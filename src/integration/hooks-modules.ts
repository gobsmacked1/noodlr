// Finding whichever rules module the table has installed.
//
// The convention is the module id: anything matching `noodlr-hooks-*` and active is a candidate, and
// each one declares what it is through `api.noodlrHooks`. Detection is by id rather than by a
// registry we maintain, so a third party can write `noodlr-hooks-pf2e` without asking us for
// anything — the same reason the hook names carry no module id.
//
// Nothing here is required for Noodlr to work. With no hooks module installed the table has an AI
// game master and a media generator, which is a coherent product on its own; the game-system
// integration controls simply grey out and say why.

/** What a hooks module publishes about itself. Every field is optional to a reader. */
export interface HooksDescriptor {
  /** Contract version. A mismatch is reported, never enforced — refusing to talk helps nobody. */
  protocol?: number;
  /** The Foundry system id it automates, e.g. `dnd5e`. */
  systemId?: string;
  /** Human-readable ruleset, e.g. "Dungeons & Dragons Fifth Edition (2024)". Feeds the prompt. */
  rulesetName?: string;
  /** Which rules it enforces, for display and for feature detection. */
  capabilities?: string[];
}

export interface DetectedHooksModule extends HooksDescriptor {
  id: string;
  title: string;
  version: string;
  /** True when the running system is the one this module automates. */
  matchesSystem: boolean;
}

/** The contract version Noodlr is written against. */
export const SUPPORTED_PROTOCOL = 1;

const ID_PATTERN = /^noodlr-hooks-/;

/**
 * Every active `noodlr-hooks-*` module, in id order so the picker is stable between renders.
 *
 * A module that is installed but declares no descriptor is still listed: it is plainly meant to be
 * one of ours, and hiding it would leave a GM staring at an empty dropdown with the module enabled.
 */
export function detectHooksModules(): DetectedHooksModule[] {
  const found: DetectedHooksModule[] = [];
  const systemId = String((game as any)?.system?.id ?? "");
  for (const mod of (game as any)?.modules?.values?.() ?? []) {
    const id = String(mod?.id ?? "");
    if (!ID_PATTERN.test(id) || !mod?.active) continue;
    const descriptor: HooksDescriptor = (mod as any)?.api?.noodlrHooks ?? {};
    found.push({
      ...descriptor,
      id,
      title: String(mod?.title ?? id),
      version: String(mod?.version ?? ""),
      matchesSystem: !descriptor.systemId || descriptor.systemId === systemId,
    });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

export function hasHooksModule(): boolean {
  return detectHooksModules().length > 0;
}

/** The detected module with this id, or undefined. Used to resolve a stored ruleset choice. */
export function hooksModuleById(id: string): DetectedHooksModule | undefined {
  return detectHooksModules().find((m) => m.id === id);
}
