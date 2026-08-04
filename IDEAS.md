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
- **Split movement across a turn (a "turn script" instead of one option).** Real play is
  move a few feet → attack → bonus-action Disengage → spend the rest of the movement backing
  off (user, 2026-08-04). The planner currently emits ONE option plus an optional end-of-turn
  cover step, so `close` and `kite` are the only shapes where movement and action interleave,
  and the movement budget is spent in a single call rather than drawn down across steps. The
  change is to have the planner emit an ordered list of steps sharing one movement allowance,
  with the executor spending from it — which also makes the action economy explicit (action /
  bonus action / movement remaining) rather than implied. Worth doing after basic movement is
  confirmed working in a live encounter; it is a planner refactor, not a movement fix.
- **Third-party lore importers (World Anvil / Dungeon Alchemist / etc.).** Deferred as low ROI:
  most of these either export to JSON/CSV — already covered by the generic structured import
  (rc5) — or produce maps/scenes (Dungeon Alchemist → images/UVTT), which is scene/map territory,
  not lore RAG. A bespoke API integration (e.g. World Anvil's API) is only worth it if a user
  actually asks and has a large existing world there. Until then, "export → drop the JSON/CSV in"
  is the supported path. World-scoped Journal ingest + a "dump current NPC state" button are the
  higher-value native additions to consider first.
