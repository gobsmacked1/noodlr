// The nine noodlr-memory collections ("silos"). Mirror of the service's COLLECTIONS
// map (src/collections.js). Kept here so the module can label + target silos without a
// round-trip. If the service adds a silo, add it here too.

export const SILOS = {
  chat: "Chat & transcriptions",
  lore: "World lore",
  rules: "Game system rules",
  sheets: "Character sheets & inventory",
  npc_state: "NPC state persistence",
  factions: "Factions & reputation",
  scenes: "Scene state",
  quests: "Quest tracking",
  docs: "Imported documents (TXT/PDF)",
} as const;

export type SiloId = keyof typeof SILOS;

export const SILO_IDS = Object.keys(SILOS) as SiloId[];

export function isSiloId(id: string): id is SiloId {
  return Object.prototype.hasOwnProperty.call(SILOS, id);
}

/** Default silos queried at prompt-assembly time (scene-aware refinement comes later). */
export const DEFAULT_QUERY_SILOS: SiloId[] = [
  "lore",
  "rules",
  "npc_state",
  "factions",
  "quests",
  "chat",
];
