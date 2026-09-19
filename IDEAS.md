# IDEAS / backlog

Parked tangents — one line each. Promote to the roadmap in AGENTS.md when picked up.

Pruned 2026-09-19: every rules-automation idea (hiding prerequisites, cover, ranged range, jumping,
action-economy gaps, spellcasting prerequisites, turn scripts, reinforcements) left with
`noodlr-hooks-55e`. Rules enforcement is the community modules' job; see the "READ FIRST" section of
`AGENTS.md` before adding anything of that shape here.

- **Map upscaling (4x, seam-free).** Generate the base map, then upscale to a large,
  high-detail battle map. Blocked: needs a dedicated super-resolution model (e.g.
  Real-ESRGAN). OpenRouter offers none today (verified 2026-07-25), and a local GPU
  upscaler / Python sidecar is off the table (no capable GPU; keep install one-step).
  Cleanest path once available: one whole-image 4x super-res call to a super-res endpoint
  (no client slicing needed); client-side overlap+blend tiling only as a fallback. A
  disabled "Upscale to 4x (coming soon)" checkbox is shown in the Map generator config as a
  placeholder. Revisit when OpenRouter (or an easy hosted endpoint) exposes upscaling.
- **An environment snapshot for bug reports.** None of the diagnostics reports the world. One
  `api.surveyEnvironment()` returning Foundry / system / module versions, the active RAG backend and
  its reachability, the provider slugs in use (never keys), and a dump of our own settings would
  replace most of the back-and-forth on a report. Output as one flat printed block, not a nested
  object — a collapsed `Object {…}` in a pasted console is what gets reported.
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
- **Player-initiated media through the GM relay.** Image / music / video from a player client
  generates fine and then cannot persist or share (players lack `FILES_UPLOAD`; every media path ends
  in `FilePicker.upload`). Latent only because `allowPlayers` defaults off. The fix is a relay of the
  same shape as the players' bot ask, carrying `userId` / `userName` so speaker context survives.
- **A tactical NPC layer as a new small module — only once Midi QoL runs on dnd5e 6.x.** What to
  revive and the trigger are written in `AGENTS.md`, READ FIRST item 5. Not before then, and never
  inside this repo.
