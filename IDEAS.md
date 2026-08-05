# IDEAS / backlog

Parked tangents — one line each. Promote to the roadmap in AGENTS.md when picked up.

- **Map upscaling (4x, seam-free).** Generate the base map, then upscale to a large,
  high-detail battle map. Blocked: needs a dedicated super-resolution model (e.g.
  Real-ESRGAN). OpenRouter offers none today (verified 2026-07-25), and a local GPU
  upscaler / Python sidecar is off the table (no capable GPU; keep install one-step).
  Cleanest path once available: one whole-image 4x super-res call to a super-res endpoint
  (no client slicing needed); client-side overlap+blend tiling only as a fallback. A
  disabled "Upscale to 4x (coming soon)" checkbox is shown in the Map generator config as a
  placeholder. Revisit when OpenRouter (or an easy hosted endpoint) exposes upscaling.
- **Stealth should get a say in being spotted.** Perception currently answers "is there a clear line to
  a lit token", which is Foundry's vision question, not 5e's: a rogue with Stealth 27 creeping past a
  guard with Passive Perception 10 is seen the moment the wall ends. Wants a contested read — the party's
  last Stealth roll (or Dexterity (Stealth) passive) against the spotter's passive Perception, only for
  tokens the players have actually declared as sneaking. Needs a way to know that a party is sneaking at
  all, which Foundry does not model; a toolbar toggle or an effect is probably the honest answer.
- **Reinforcements: hostiles outside the shout radius joining later.** The 30 ft recruitment cap means a
  warband two rooms away legitimately misses the fight — but it should be able to arrive once the noise
  of combat reaches it, rather than standing idle forever. Wants a per-round sweep during combat that
  adds hostiles who can now see or hear the fight, which needs a sound-propagation model we do not have.
- **Split movement across a turn (a "turn script" instead of one option).** Real play is
  move a few feet → attack → bonus-action Disengage → spend the rest of the movement backing
  off (user, 2026-08-04). The planner currently emits ONE option plus an optional end-of-turn
  cover step, so `close` and `kite` are the only shapes where movement and action interleave,
  and the movement budget is spent in a single call rather than drawn down across steps. The
  change is to have the planner emit an ordered list of steps sharing one movement allowance,
  with the executor spending from it — which also makes the action economy explicit (action /
  bonus action / movement remaining) rather than implied. Worth doing after basic movement is
  confirmed working in a live encounter; it is a planner refactor, not a movement fix.
- **Jumping as automated movement (2024 rules, verified against rpgbot.net/dnd5/how-to-play/movement).**
  Long jump = Strength SCORE in feet, high jump = 3 + Strength MODIFIER, both halved without a 10 ft
  run-up, and the horizontal distance counts against normal movement. Foundry exposes a `jump` movement
  action, so the mechanics are expressible — what is missing is any notion of a gap or a ledge to jump
  over, since core models no terrain types. Realistically this only becomes useful alongside Terrain
  Mapper or a region convention we define. Parked with the formulas recorded so it is a coding job, not
  a research job, if it comes up.
- **A flyer knocked prone should fall.** 5e: if a creature's fly speed drops to 0 — grappled, restrained,
  paralysed, prone — it falls unless it has Hover or flies magically. `Locomotion.hover` is already read;
  nothing acts on it yet. Small, self-contained, and only matters at tables that put flyers in the air.
- **Third-party lore importers (World Anvil / Dungeon Alchemist / etc.).** Deferred as low ROI:
  most of these either export to JSON/CSV — already covered by the generic structured import
  (rc5) — or produce maps/scenes (Dungeon Alchemist → images/UVTT), which is scene/map territory,
  not lore RAG. A bespoke API integration (e.g. World Anvil's API) is only worth it if a user
  actually asks and has a large existing world there. Until then, "export → drop the JSON/CSV in"
  is the supported path. World-scoped Journal ingest + a "dump current NPC state" button are the
  higher-value native additions to consider first.
