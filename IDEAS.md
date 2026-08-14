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
- **Ranged attack range is enforced by nobody, and the data paths are now known.** Long-range
  disadvantage, the nearby-foe penalty for shooting in melee, and the out-of-range refusal are all
  unmodelled by dnd5e. Recorded from AC5e's `ac5e-systemRules.mjs` so this is a coding job rather than a
  research one: read `activity.range` unless `range.override === false`, in which case the item's
  `system.range` wins (the same trap that broke reach in v0.4.23); `value` is short, `long` is long,
  `reach` is melee; classify with `activity.getActionType(attackMode)` into `mwak`/`msak`/`rwak`/`rsak`.
  Their distance helper measures perimeter-to-perimeter across both token footprints rather than
  centre-to-centre and folds elevation in as grid steps — which is strictly better than our current
  `hypot(horizontal, rise)` and worth lifting wholesale if we build this.
- **Cover for attack rolls is a delegation problem, and nobody solved it natively.** AC5e computes no
  cover at all; it adapts to Simple Cover 5e's `api.getCoverForTargets()` and no-ops when that module is
  absent. Their representation is worth stealing even if the source is not: half and three-quarters map to
  an AC bonus read from `CONFIG.DND5E.statusEffects.*.coverBonus`, and total cover becomes AC 999 plus
  `criticalSuccess: 21` so even a natural 20 cannot land. We already cast rays for stealth screens and
  positioning, so the geometry is in hand; what is missing is the decision to own it.
- **An environment snapshot for bug reports.** Our `survey*()` family reports features; none reports the
  world. AC5e's troubleshooter captures the fields that actually make their bug class reproducible, and
  every one of them applies to us: the dnd5e rules version (2014 vs 2024), grid type, distance, units and
  crucially the **diagonals** setting, scene token vision and global light, and the versions of the
  sibling modules we stand down for. One `api.surveyEnvironment()` returning that plus our own settings
  dump would replace most of the back-and-forth on a report.
- **Spellcasting prerequisites (Silenced, armour, Rage).** `dnd5e.preUseActivity` returning false is the
  cancel point, the same hook our action-economy veto already uses. Signals: a verbal component is
  `item.system.properties.has("vocal")` against `actor.statuses.has("silenced")`; armour non-proficiency is
  `actor.armor`/`actor.shield` with `!system.proficient && !system.prof.multiplier`. Rage is only findable
  by effect name, which is fragile, so it would want a stable identifier or a flag escape hatch. Tri-state
  off/warn/enforce, matching the ask-then-log shape we chose for the player action economy.
- **Third-party lore importers (World Anvil / Dungeon Alchemist / etc.).** Deferred as low ROI:
  most of these either export to JSON/CSV — already covered by the generic structured import
  (rc5) — or produce maps/scenes (Dungeon Alchemist → images/UVTT), which is scene/map territory,
  not lore RAG. A bespoke API integration (e.g. World Anvil's API) is only worth it if a user
  actually asks and has a large existing world there. Until then, "export → drop the JSON/CSV in"
  is the supported path. World-scoped Journal ingest + a "dump current NPC state" button are the
  higher-value native additions to consider first.
- **Concurrent ingest jobs (a small worker count in the queue).** The queue serializes jobs strictly,
  and the rationale for that was the belief that concurrent ingests would halve each other's share of
  an account rate limit. That premise died on 2026-08-13, when the 429s turned out to be one upstream
  provider's saturation on a single-provider model. The queue keeps every other reason to exist (one
  writer, resume across a reload, visible progress, one job per pack), so this is a throughput idea
  rather than a fix: sixty packs run one at a time against a provider that could serve several. Would
  need the shared 429 gate to stay shared and each job to keep its own `resumeAt`. Low priority because
  `EMBED_BATCH_SIZE` 64 already cut requests 4x, and a healthy multi-provider model finishes a corpus
  quickly as it is.
