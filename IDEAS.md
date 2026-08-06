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
- **Hide should check its own prerequisites (2024 rules).** Built in v0.4.33: a Stealth roll now buys a
  contest against passive Perception. Not built: the 2024 requirement that you be Heavily Obscured or
  behind three-quarters cover *and* out of every enemy's line of sight before Hide is even legal, and the
  DC 15 floor on the attempt. dnd5e models cover as the `coverHalf`/`coverThreeQuarters`/`coverTotal`
  statuses, so the cover half is readable; "heavily obscured" needs a lighting read we do not have yet.
- **Imprecise detection is a different trigger from being seen.** Vision 5e flags tremorsense, hearing
  and the detect-spells as `imprecise`: a creature that hears you knows *something* is there, not who or
  where. Starting a normal combat off that is wrong — it should raise an alert, or start a fight with the
  hider still unlocated, rather than a clean ambush. Needs our sweep to carry the detection level through
  instead of collapsing to a boolean.
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
- **The rest of the 2024 action economy.** Action, bonus action and reaction are now counted (v0.4.38),
  but the movement and interaction rules around them are not: standing up costs half your speed, crawling
  and unaided climbing/swimming cost double, dropping prone is free, mounting costs half, and the second
  free object interaction in a turn should demand the Utilize action. Ready is not modelled either, so
  there is no held action to release as a reaction. The full rules text and a gap-by-gap audit are in
  `docs/action-economy-2024.md` — work from that rather than re-deriving it.
- **Haste's extra action is narrower than ours.** `flags.noodlr.extraAction` grants a general action, but
  the spell allows only Attack (one attack), Dash, Disengage, Hide or Utilize. Enforcing the subset needs
  per-effect action whitelists; until then a hasted caster could take two spell actions and the public
  override log is what catches it.
- **Third-party lore importers (World Anvil / Dungeon Alchemist / etc.).** Deferred as low ROI:
  most of these either export to JSON/CSV — already covered by the generic structured import
  (rc5) — or produce maps/scenes (Dungeon Alchemist → images/UVTT), which is scene/map territory,
  not lore RAG. A bespoke API integration (e.g. World Anvil's API) is only worth it if a user
  actually asks and has a large existing world there. Until then, "export → drop the JSON/CSV in"
  is the supported path. World-scoped Journal ingest + a "dump current NPC state" button are the
  higher-value native additions to consider first.
