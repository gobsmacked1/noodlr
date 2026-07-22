// Prompt-architecture data shapes (lorebook + chronicle). Stored as JSON in world
// settings (decision, Phase 3: simplest reversible store, synchronously readable at
// assembly time; revisit if lorebooks grow large).

/** Where an activated lorebook entry is injected relative to the conversation. */
export type LorebookPosition = "top" | "bottom";

export interface LorebookEntry {
  id: string;
  /** Human label (not sent to the model). */
  name: string;
  /** Activation keys: plaintext (case-insensitive substring) or /regex/flags. */
  keys: string[];
  /** The text injected when the entry activates. */
  content: string;
  enabled: boolean;
  /** Always inject regardless of keys. */
  constant: boolean;
  position: LorebookPosition;
  /** Insertion order among activated entries (lower = earlier). */
  order: number;
  /** Reserved: activate via vector similarity through noodlr-memory (not yet wired). */
  vector: boolean;
}

export function makeLorebookEntry(partial: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: partial.id ?? foundry.utils.randomID(),
    name: partial.name ?? "New entry",
    keys: partial.keys ?? [],
    content: partial.content ?? "",
    enabled: partial.enabled ?? true,
    constant: partial.constant ?? false,
    position: partial.position ?? "top",
    order: partial.order ?? 0,
    vector: partial.vector ?? false,
  };
}

/** A candidate canon fact parsed from a 📜 Chronicle line, awaiting GM review. */
export interface ChronicleItem {
  id: string;
  /** The fact text. */
  text: string;
  /** When it was captured (ms epoch). */
  ts: number;
  /** Optional detected entities/keywords (future use). */
  entities?: string[];
}
