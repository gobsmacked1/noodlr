# AGENTS.md — noodlr-main (from-scratch rebuild)

This file is the durable memory and master roadmap for **noodlr-main**. It survives
session/workspace resets and is auto-loaded as context. Keep it updated with durable
facts, decisions, and open items (never secrets).

## What this project is

**Noodlr** is an AI Dungeon Master module for Foundry VTT (game-system-agnostic by
design, with D&D 5e as the first-class test case). This folder, `noodlr-main`, is a
**complete from-scratch rewrite**: every line is hand-written by us. No code is copied
from any prior codebase. An earlier third-party module (locally available at
`C:\Project\noodlr` as a *behavioral reference only*) taught us what works and what
doesn't; we retain the insights, not the code.

**Core thesis:** modern flagship LLMs are already competent, creative game masters.
What they lack is (1) reliable memory, (2) authoritative game state, and (3) restraint.
Noodlr supplies all three: a real vector/RAG memory service (`noodlr-memory`, already
built), ground-truth state injected from Foundry itself, and a deliberate refusal to
AI-ify mechanics that traditional automation modules already handle perfectly.

## Workspace layout (multi-root)

- `C:\Project\noodlr-main\` — **this project**: the new Foundry module. Fresh git repo (to be created).
- `C:\Project\noodlr-memory\` — the standalone **vector/RAG memory service** (Node >= 20). COMPLETE and fully ours. Own git repo on GitHub.
- `C:\Project\noodlr-vtt\` — reserved for an **optional external control bridge** (drive Foundry from external AI clients over MCP/WebSocket). Deferred; may never be built.
- `C:\Project\noodlr\` — the **legacy reference module** (prior third-party codebase, deobfuscated). Read-only reference for *behavior*, never for code. Its GitHub repo will be wiped. Retire and delete this folder once noodlr-main reaches parity.

Workspace file: update `noodlr.code-workspace` to include all four folders while the
reference exists; drop the reference folder at retirement.

## Provenance rules (clean-room discipline — do NOT break)

1. **Never copy code** from `C:\Project\noodlr` into `noodlr-main`. Not a line, not a regex.
2. Work from **behavioral specs**: describe what a feature does (inputs, outputs, UX), close the reference, then implement against Foundry's public API and provider docs.
3. Code we authored from scratch during the reference-module phase (all of `noodlr-memory`; the push-to-log design; the RAG client/settings design; the agent-mode fusion) is **ours** — the designs are reusable, but rewrite the module-side code fresh in the new stack anyway for consistency.
4. Record provenance-relevant decisions in this file with dates.
5. The reference module is never redistributed, published, or committed to any remote.

## Design principles

0. **No third-party module is ever a dependency (user, 2026-08-04; overrides any convenience argument).**
   Midi QoL is the specific case that prompted this: superb, widely installed, and repeatedly quiet for
   months at a stretch, so anything built on it strands the table when it lapses. The rule is *learn
   from them, depend on none of them*. Read their source to find out how a thing is done, then implement
   it against core Foundry and the game system's own API, which are the only two things guaranteed to be
   there. Where a module IS present it may raise fidelity — our item-use path already routes through
   midi when it exists, so reactions get its full workflow — but every feature must work with nothing
   installed but Foundry and a system. Principle #2 below (mechanics belong to mechanics modules) is
   about not *duplicating* their work when they are present; it is not licence to require them.
   Corollary for detection triggers: prefer signals core cannot take away. Token position hooks and a
   hit-point decrease are available in every system and every version; "the attack roll is about to
   resolve" is not, and needs a per-system entry in `system-profiles.ts` rather than a guess.

0. **Rules versus tactics (amended 2026-08-02).** Principle 1 below forbids hardcoded system rules,
   and it still does — but it was being read as forbidding system-specific *tactics*, which stalled
   the NPC combatant work. The line is now explicit: Noodlr may know **where a system keeps its
   numbers** and **which of a creature's options are worth considering**; it may never compute an
   attack roll, damage, a save, a DC, or a condition. Deciding "close with the wizard and swing the
   rusty scimitar" is tactics and is ours. Working out whether the swing lands is rules, and belongs
   to the system and to Midi QoL, exactly as before. System-specific tactics live behind an adapter
   (`combat/system-profiles.ts` and the `combat/auto/` planner) with a generic fallback, never
   sprinkled through the codebase.
1. **No hardcoded game-system rules.** Thousands of lines of hardcoded 5e logic are unmaintainable and unfixable when a table interprets a rule differently. Rules live in the **RAG** (`rules` silo — ingest any system's books/compendia) and in the model's own competence. The module ships zero rules logic.
2. **Mechanics belong to mechanics modules.** Midi QoL, DAE, Chris's Premades, Gambit's, etc. already resolve tedious mechanics instantly and for free. Noodlr narrates, decides, and adjudicates; it does not re-implement automation. (This was the loudest user complaint about the prior generation of this idea.)
3. **Two provider shapes, period:** OpenRouter (API key) or any hand-entered OpenAI-compatible base URL + optional key. Applied uniformly to Chat, Embeddings, TTS, Image, Transcription. We will not maintain dozens of proprietary provider clients, and we will not ask users to divulge half a dozen consumer API keys for basic gameplay.
4. **Foundry is the source of truth.** HP, initiative, conditions, rolls, scene state come from Foundry's APIs, injected into the prompt as authoritative state. Dice are **never** model-rolled — a `{{roll:XdY}}` macro executes a real Foundry `Roll` and injects the result.
5. **SillyTavern-informed prompt architecture** (studied: docs.sillytavern.app Data Bank + World Info; KritBlade/VectFox): siloed data banks, keyword/vector-activated lorebook entries with injection positions and token budgets, author's-note depth injection, post-history instructions, promoted "chronicle" facts.
6. **Real build step this time:** TypeScript + esbuild. The no-build constraint of the reference phase was an artifact of forking a bundle, not a choice.

## Feature inventory

### Native features found in the reference module (behavioral baseline)

- In-Foundry AI chat panel (GM co-pilot): streaming responses, markdown, tool/function calling against game state.
- AI-run combat turns for NPCs/monsters.
- A large hardcoded 5e-2024 mechanics engine (damage application, conditions, concentration, reactions, summons, spell automation).
- Campaign memory: browser-side fact store + in-browser BM25 keyword knowledge base.
- Context assembly: world/scene/actor state gathered into the prompt.
- Scene tools (AI-assisted scene description/manipulation) and journal/transcript logging.
- Image generation (scene art, portraits) via proprietary provider clients.
- Voice TTS playback via proprietary provider clients.
- Real-time streaming voice transcription over WebSocket (Gladia/Deepgram/AssemblyAI-style providers).
- Per-vendor proprietary AI provider clients (many).
- An external control bridge letting outside AI clients drive Foundry over WebSocket.
- Remote license validation.
- Tabbed settings application; socket messaging between clients; Foundry chat-card output.

### Discarded (deliberate, with reasons)

- **The hardcoded 5e mechanics engine** — replaced by principle #1 (RAG rules) + #2 (defer to Midi QoL/DAE/CPR/Gambit's).
- **Proprietary per-vendor provider clients** — replaced by OpenRouter + OpenAI-compatible custom endpoints only.
- **The external control bridge and its npm dependency** — cut; `noodlr-vtt` folder reserved if we ever rebuild our own.
- **Streaming per-utterance transcription** — replaced by push-to-log (below); always-on streaming wastes tokens and RAG space on table chatter.
- **Browser-side campaign memory / BM25 KB** — replaced entirely by `noodlr-memory`.
- **License validation** — no license server; both projects are MIT.

### Added (built by us during the reference phase; designs carry forward)

- **`noodlr-memory`** — the complete RAG service (see next section). Feature request #1: COMPLETE.
- **RAG Data Bank UI** — service URL/secret, per-silo status + individual reset, a compendium ingest matrix (locked or unlocked compendia → silo of choice), TXT/PDF upload.
- **Agent Mode retrieval** (VectFox-inspired) — an LLM decomposes the query into multi-angle sub-queries + entity filters; service fuses result lists via multi-list RRF with entity soft-boosting.
- **Push-to-log** — click-to-start/click-to-stop voice capture for *all* participants (GM, assistant GM, players): MediaRecorder segments → Whisper-style `/audio/transcriptions` file API → Foundry chat (optional) + GM-side session journal + periodic RAG ingest (configurable 60–3600 s, default 300 s). Player button floats bottom-center; segments relay to the GM over a module socket.
- **Editable system prompts** per feature (Chat, Combat, TTS, Image, Transcription) — spellcheck-enabled textarea, up to 65,000 characters, reset-to-default.
- **Endpoint override architecture** — per-feature provider/base-URL/model settings; local OpenAI-compatible TTS preset with dynamic voice-list retrieval; Stable-Diffusion-era image parameters.

### Revised

- Transcription: streaming → **push-to-log** (intentional, token-frugal capture).
- Memory: browser store → **siloed server-side RAG** with deliberate (not incidental) ingestion.
- Mechanics: AI-executed → **narration + delegation** to automation modules.
- Combat state tracking: model memory → **module-injected ground-truth state block** built from Foundry's combat tracker each turn (see DM core below).

## noodlr-memory — what exists and how noodlr-main will use it

Status: **complete, tested (14 passing node:test), MIT, v1.1.0, own GitHub repo.**
Standalone Node >= 20 HTTP service; the module talks to it over HTTP only.

What it provides:

- **Per-purpose collections (silos), each independently resettable:** `chat`, `lore`, `rules`, `sheets`, `npc_state`, `factions`, `scenes`, `quests`, `docs`. Rationale: a table recovering from story breakage resets one aspect (e.g. `npc_state`) instead of wiping and re-ingesting the whole world.
- **Pluggable vector backends:** `lancedb` (embedded Node SDK, **default** as of 2026-07-23), `vectra` (file-based), `qdrant`, `chroma` (env `VECTOR_BACKEND`).
- **Embedding providers:** `openrouter` (default model `perplexity/pplx-embed-v1-4b`), `custom` (any OpenAI-compatible `/v1/embeddings` — Ollama/vLLM/llama.cpp/LM Studio), `transformers` (fully in-process, no server/key), `mock` (offline tests). Local and remote embeddings are both first-class.
- **Prose/table-aware chunker:** roll tables and stat blocks stay atomic (RPG sources are not novels; naive chunking is immersion-breaking). `kind:"event"` docs are atomic.
- **Hybrid retrieval:** dense + BM25 sparse fused by Reciprocal Rank Fusion; re-ranked by `importance` + `recency`; multi-query (Agent Mode) fusion with entity soft-boosting.
- **HTTP API** under `/v1`: `health`, `collections`, `ingest`, `ingest-file`, `insert`, `query` (hybrid + weights + multi-query), `list`, `delete`, `purge`, `purge-all`.
- **Security:** shared-secret header `x-noodlr-secret`, localhost bind by default (HOST 127.0.0.1, PORT 3010, env prefix `NOODLR_MEMORY_*`), filename sanitization, body-size caps. CORS reflects the request Origin and pre-answers OPTIONS (the secret header always triggers a preflight cross-origin). `DEPLOYMENT.md` has the Linux/systemd guide.
- **Listeners (v1.1.0, 2026-08-01):** TCP **and** the optional Unix socket run at the same time. Before 1.1 a socket path switched TCP off entirely, which presumed Foundry and the service shared one Linux host; Windows hosts have no socket and some admins run the service on a separate box. `NOODLR_MEMORY_PORT=0` opts out of TCP; a socket path on Windows warns and is ignored; each listener reports its own bind failure and the process exits only if neither starts.

How noodlr-main interacts with it (the integration contract):

1. A **RagClient** (thin HTTP wrapper, ~one file) configured from a "Memory (RAG)" settings tab: service URL (default `http://127.0.0.1:3010`), secret, embedding provider/model, hybrid toggle + weights, Agent-Mode toggle.
2. **Deliberate ingestion, not random chance:** the settings tab lists every Foundry compendium (locked or unlocked) with a target-silo picker for forced ingestion; TXT/PDF upload for materials outside the world; push-to-log and chat/journal feeds ingest into `chat` on a timer during sessions.
3. **Retrieval at prompt-assembly time:** before each generation, query relevant silos (scene-aware: `rules` when adjudicating, `npc_state`/`factions` when NPCs are present, etc.) and inject results into the context under a labeled block, budgeted like lorebook entries.
4. **Graceful degradation:** if the service is down, the module still works — it just plays without long-term memory and says so once.
5. Structured events (`kind:"event"` with `importance`/`entities`/`keywords`/`event_type`/`ts`) feed the re-ranker; the Chronicle pipeline (below) is the main producer.
6. **RAG is pre-injected context, NOT a model-chosen tool.** `retrieveContext()` runs unconditionally (when enabled) *before* the LLM call and the result is baked into the prompt (`assembler.ts`). Consequence: OpenRouter's account-level Web Search "default plugin" cannot "preempt" RAG — the two are independent. OpenRouter's dashboard can't fully turn that default off (min results is 1, not 0), so **`chat-client.ts` sends `plugins:[{id:"web",enabled:false}]` on every OpenRouter chat request** to neutralize it (per-request overrides account defaults unless the user set "Prevent overrides"). The only time web search runs is the opt-in **confidence-gated web fallback** (`rag/web-fallback.ts`, v0.4.1, off by default, OpenRouter chat only), which swaps in a firing `web` plugin spec for a *single* request when memory returns nothing (or a score `<= webFallbackMinScore`). Settings live in the Memory & Knowledge window; `stats.webFallbacks` counts fires.

## The Dungeon Master core

The default Chat system prompt is **"The Noodlr Dungeon Master System Prompt"** —
preserved verbatim in [`prompts/dm-system-prompt.md`](prompts/dm-system-prompt.md)
(~1,050 tokens; role/priorities, play philosophy, continuity, rules & adjudication with
a bounded once-per-session Rule of Cool, stateful combat procedure, intrigue, reward-
preference elicitation, voice/format). Read that file before touching prompt assembly.
Key engineering doctrines from it that shape the *module's* architecture:

- **Echoed combat tracker:** every combat message ends with a full ⚔️ state block with shown arithmetic ("24−11=13"), zones instead of grids, tiered enemy HP. Foundry advantage: the module can **rebuild this block from the real combat tracker** each turn and inject it as ground truth, instead of trusting the model to copy its own last block. Recovery from corruption = the module re-injects; no manual message editing needed.
- **External dice only:** `{{roll:...}}` macros run real Foundry rolls. The model never generates dice results (it biases toward narrative convenience).
- **📜 Chronicle lines:** the prompt has the model append one line of new canon after significant scenes. The module parses these into a review queue → GM promotes them to lorebook entries and/or `kind:"event"` RAG ingestion. This is the anti-amnesia pipeline.
- **Post-history instructions:** a short always-last injection slot; a 2-line combat reminder is swapped in automatically when Foundry combat starts and cleared when it ends.
- **Author's note:** a session-anchor injection at configurable depth (location, time, party status, active threats, tone).
- **Lorebook / World Info:** keyword-activated (plus optional vector-activated via noodlr-memory) entries with insertion order, position, and token budget — for NPCs, locations, faction clocks, house rules, promoted Chronicle facts.
- Foundry-specific adaptation: Noodlr is inherently **multi-user**; spotlight balancing and turn-taking exist at the table layer, and per-player reward-preference profiles key off actual Foundry users.

## Feature specs (the four pillars, restated)

1. **RAG Data Bank (COMPLETE via noodlr-memory)** — SillyTavern-Data-Bank-class capability: siloed vector DBs by function, local or remote embeddings (OpenRouter default `perplexity/pplx-embed-v1-4b`, or custom URL + optional key), forced compendium ingestion matrix, TXT/PDF import, prose/table-competent chunking. Module side (tab + client) is rebuilt in noodlr-main.
2. **Uniform provider endpoints for TTS / Image / Transcription** — each feature gets: OpenRouter (+ key + model slug) or custom OpenAI-compatible URL (+ optional key). Defaults: image `google/gemini-3.1-flash-lite-image`; speech `microsoft/mai-voice-2`; transcription `openai/whisper-large-v3-turbo`. TTS includes a **local OpenAI-compatible preset with dynamic voice-list retrieval**. Image generation exposes SD-era params: sampling steps (20), CFG scale (7.0), sampling method (Euler A), seed (random), positive prompt, negative prompt.
3. **No AI-ification of mundane mechanics** — Noodlr coexists with Midi QoL, DAE, Chris's Premades, Gambit's, etc., and delegates to them. No AI latency or token cost for things a mundane module resolves instantly.
4. **System prompt overrides** — per-feature (Chat, Combat, TTS, Image, Transcription) spellcheck-enabled editable textarea, up to 65,000 ASCII characters, with reset-to-default. The DM prompt is Chat's default.

## Roadmap

### Phase 0 — Foundations & spec

- Scaffold: TypeScript + esbuild, `module.json` (id `noodlr`, start v0.1.0), npm scripts (`build`, `watch`, `check`), prettier + eslint, MIT LICENSE, fresh git repo.
- Verify current Foundry stable API level before coding (ApplicationV2, settings, sockets, dice, combat tracker APIs churn — check, don't assume).
- Hello-world: module loads, one settings tab renders, a stub sidebar/chat panel opens.
- Write short behavioral specs (own words) per feature area before implementing it; log decisions here.
- Deliverable: installable skeleton in a Foundry world.

### Phase 1 — Provider layer + Chat MVP

- Provider config model: per-feature { provider: openrouter | custom, baseUrl, apiKey (optional for custom), model }.
- Streaming chat client (SSE) against OpenRouter / OpenAI-compatible `/chat/completions`; clean error surfacing.
- Chat panel: history, streaming markdown render, per-user identity.
- `{{roll:...}}` macro → Foundry `Roll` → result injected back into the model turn.
- System-prompt override setting (65k, spellcheck) wired; DM prompt as default.
- Deliverable: "talk to the DM in Foundry; it answers in character and rolls real dice."

### Phase 2 — Memory (RAG) integration

- RagClient + "Memory (RAG)" tab: URL/secret/test-connection, embedding config, hybrid + Agent-Mode toggles, per-silo status/reset.
- Compendium ingest matrix (locked/unlocked → chosen silo); TXT/PDF upload passthrough to `ingest-file`.
- Retrieval wired into prompt assembly with token budgeting and a labeled context block; graceful offline degradation.
- Deliverable: ingest a rules compendium into `rules`, ask a rules question, watch the DM cite retrieved text.

### Phase 3 — Prompt architecture (the SillyTavern-informed layer)

- **Lorebook/World Info:** entries with keys (plaintext/regex), optional vector activation via noodlr-memory, insertion order/position, scan depth, token budget, per-world storage.
- **Author's note** (configurable depth) and **post-history instructions**; automatic combat-reminder swap keyed to Foundry combat start/end hooks.
- **Chronicle pipeline:** parse 📜 lines from DM output → GM review queue → promote to lorebook entry and/or `kind:"event"` ingestion into the right silo.
- Context assembler: system prompt + lorebook + author's note + RAG block + Foundry state + history + post-history, all under one token budget with defined precedence.
- Deliverable: canon survives a 30+ message session without contradiction.

### Phase 4 — Media features

- **TTS:** OpenRouter (`microsoft/mai-voice-2`) or custom OpenAI-compatible incl. local preset; dynamic voice list; per-NPC voice assignment later.
- **Image:** OpenRouter (`google/gemini-3.1-flash-lite-image`) or custom; SD params (steps/CFG/sampler/seed/negative); Image system-prompt override feeds scene-art prompt building.
- **Push-to-log transcription:** rebuild the proven design — click-to-toggle capture, ~20 s MediaRecorder segments, POST to Whisper-style endpoint (`openai/whisper-large-v3-turbo` default), optional chat post, socket relay to GM, GM session journal, periodic RAG ingest (60–3600 s, default 300 s), player button bottom-center.
- Deliverable: a spoken session leaves a searchable transcript in the `chat` silo.

### Phase 5 — Combat co-pilot (no rules engine)

- Ground-truth ⚔️ block builder from Foundry's combat tracker (initiative, HP tiers for enemies, conditions, positions as zones) injected each combat turn.
- AI-run NPC/monster turns: the model *decides and narrates*; execution happens via chat cards, real rolls, and the table's automation modules. Combat prompt override applies.
- Rules questions during combat hit the `rules` silo automatically.
- Deliverable: run a full combat where Noodlr narrates and Midi QoL resolves.

### Phase 7 — Autonomous NPC combatants

> **PIVOT, 2026-08-02 (supersedes the AI-driven design below).** After vetting the v0.4.21 turn loop
> with others, the user cut the per-turn model call: one request per beat per creature makes every
> encounter slow and a horde fight unaffordable. Combat decisions are now made **locally, by a
> deterministic planner, with zero AI calls**. The LLM turn loop is removed outright (user's choice of
> three offered options), not kept as a mode. What survives from N1/N2: `system-profiles.ts`, the
> dossier's live sheet reading, and the per-encounter lifecycle. Everything below about beats, `END
> TURN`, and `MAX_TURN_STEPS` is history — kept for the reasoning, not as a description of the code.
>
> **The engine (user chose utility scoring over a literal branching tree):** generate every legal
> option, score each by the considerations the creature's tier unlocks, then choose by *weighted
> random* rather than by maximum. That last step is the design, not an implementation detail. Argmax
> produces tournament-grinder monsters; pure randomness produces noise; score-proportional choice with
> tier-set sharpness produces an owlbear that usually mauls what is closest and a lich that almost
> always does the clever thing. "Most appropriate, not best" is literally the temperature dial.
>
> **Competence is two dials, not one.** Gating alone yields a creature with two options that plays
> both flawlessly, which reads as eerily precise rather than stupid. So each tier carries `unlocks`
> (what it can conceive of), `noise` (0.85 at insect → 0.08 at god-like: how reliably it acts on the
> best option), and `breadth` (how many options it weighs — its attention span and the CPU ceiling).
>
> **Tier ladder** (`src/combat/auto/tiers.ts`), thresholds from the user's table on (INT+WIS)/2:
> 1 its entire action economy (move, action, bonus action, features, spell-likes, reactions, recharge
> abilities, legendary actions) + call for help · 2 + target the apparent weakest, flee when hurt ·
> 3 + avoid strong opponents, use inventory, Help an ally, surrender · 4 + stealth, deception, control
> maneuvers, advanced casting, self-healing, keep distance, seek cover, mercy · 5 + heal and protect
> allies · 6 + target the real threats, focus fire · 7 + reposition for advantage, hold resources ·
> 8 + manipulate enemies, resource denial · 9 + the long game.
>
> **Two relocations the user made on 2026-08-02 that are easy to undo by accident:** fleeing lives at
> tier 2, not 3 — running from pain is instinct, and a cornered rat manages it. Access to the full
> action economy lives at tier 1: even an insect uses everything it physically has, because competence
> is about *choosing*, never about access. Tier 1's limits are `breadth` and `noise`, not a shorter kit.
>
> **The inverted withdrawal rule (subtle, easy to "fix" backwards).** Tier 4 steps out of melee only
> "when not at risk of an opportunity attack". The naive reading backs away when something is adjacent
> — the exact moment leaving costs a free hit. So an already-engaged creature stays and fights, and one
> that is merely *about to be* closed on (enemy within reach + speed) gives ground while it is still
> free to. Refusing the melee before it starts is the competent play.
>
> **`TIER_CAVEAT = 7` — where the ladder stops being honest.** Tiers 1-6 are fully mechanical. Tier 7
> is stretching: "bait them into the trap room" needs authored terrain the planner cannot invent.
> Tiers 8-9 (manipulation, generational scheming) are campaign-scale fiction; no per-turn automaton
> runs a decades-long con. Those tiers get the best of what *is* mechanical plus GM hints and voice.
> This is written into the code, not just here, so nobody later mistakes the gap for a bug.
>
> **Seeded, not merely random.** The choice is seeded from fight + round + combatant, so a turn
> replays identically: no reroll-shopping by clicking twice, and tests can assert real decisions.
>
> **Principle 0** (top of this file) was amended in the same breath to permit system-specific
> *tactics* behind an adapter while still forbidding system *rules*. The planner picks a verb, an
> implement, and a target; it never computes an attack roll, damage, a save, a DC, or a condition.

Original AI-driven spec, agreed with the user 2026-08-02 and superseded the same day. The largest feature in the module, built in layers, each one
shippable alone. Goal: hostile combatants that behave plausibly *for what they actually are* —
partially aware of the rules (via the `system_rules` silo) and fully aware of their own sheet
(movement, abilities, feats, spells, inventory, consumables). Worked examples the user set as the
bar: a skeletal archer that runs out of arrows, switches to a melee weapon, and closes to reach; a
caster that heals itself or an ally; a bloodied, intelligent creature that flees or drinks a potion
rather than dying in place.

Why today's "Act as NPC" cannot do any of that: `runCurrentNpcTurn()` makes ONE completion, asks for
"their single action", and injects only the combat-tracker block — which carries initiative, HP
tiers, and conditions, and explicitly says positions are narrative zones. **The creature's own
capabilities are never sent.** The model improvises a statblock from the creature's name, on a
battlefield it cannot see, without ever seeing a die result (macros resolve after generation). Three
missing inputs, one missing loop. Not a prompt-wording problem.

Organizing principle: **we count, the model reasons, the automation modules resolve.** Noodlr never
learns what a "bonus action" is. It reads the actor's items as Foundry stores them, including the
system's own activation labels, and enforces only what is checkable as data — does this ability exist
on this actor, does it have uses/ammo left, has that activation slot already been spent this turn.
Meaning stays with the model plus the rules silo. Principle #1 survives intact.

**The dossier** (user's term and framing): each hostile combatant gets a briefing generated from its
sheet, live for the duration of the skirmish and discarded at death or combat end. Volatile numbers
(uses, ammo, HP) are re-read every turn — a cached count is a wrong count the moment something is
spent — while accumulated *notes* (what it did on previous turns, morale state) persist for the
combat only.

Layers:

- **N1 — Dossier + perception briefing.** `src/combat/system-profiles.ts` (candidate-path data table,
  D&D 5e filled in first, generic probing fallback — user chose the profile approach) and
  `src/combat/dossier.ts`. Read-only; no behavior change beyond the model finally knowing its own
  statblock. Includes the closing constraint "only these abilities exist" — the anti-improvisation clause.
- **N2 — The turn loop.** Replace the single completion with propose → resolve dice → feed authoritative
  results back → next step, until the model writes END TURN or a step cap trips. Same shape as the GM
  chat continuation, generalized; multiattack, bonus actions, and move-then-shoot fall out of it.
- **N3 — Structured intents + legality gate + execution.** The model proposes intents rather than prose;
  the module validates them against the activation budget and the actor's real item list, then executes
  through the item's own use path so Midi QoL/DAE/CPR resolve the mechanics. GM approval on by default.
  Execution sits behind a thin adapter with a narrate-only fallback, because `item.use()` is dnd5e-shaped.
- **N4 — Cognition tiers from the sheet** (user chose auto-from-INT/WIS with a per-actor override). The
  strongest lever is *information scope*, and it is free: a beast is told only what it perceives (nearest
  threat, who hurt it last, whether it is badly hurt), a tactician gets the full tracker, ally intent, and
  what `npc_state` remembers about the party. Doctrine text, planning depth, and self-critique scale with
  it; low tiers can route to a cheaper model, which matters when eight skeletons each take a turn.
  Deliberate blunders come from a real seeded Foundry roll, not from temperature, so they are auditable
  and reproducible in tests.
- **N5 — Positioning.** Movement, cover, line of sight, morale/retreat, and coordination between
  high-intelligence enemies. Hardest layer; deliberately last.

Still refused, per principle #2: damage application, condition management, concentration, attack
resolution. Those are Midi QoL's job and always will be.

#### Deterministic planner — what landed in v0.4.22, and what to distrust

Shipped:

- `src/combat/config.ts` — `combat.automation` (`full` | `partial` | `off`, default full) and
  `combat.banter` (default on), both in Text Generation under the ruleset field.
- `src/combat/auto/registry.ts` — per-encounter opt-in set keyed by **combatant id**, cleared on
  `deleteCombat`. Deliberately in memory: a flag on the actor would silently change every future copy
  of that goblin. PCs are refused in every mode.
- `src/combat/auto/control.ts` — Act-as-NPC toggles the selected token(s); multi-select honored;
  pressing again takes the creature back mid-fight with no dialog. Tool is rendered **only** in
  `partial` mode.
- `src/combat/auto/tiers.ts`, `board.ts` (measurement only, tolerant of grid-API drift and gridless
  scenes), `planner.ts` (options → scoring → seeded weighted choice), `hooks.ts` (`updateCombat`,
  primary GM only, so an assistant GM does not double-plan).
- `src/combat/npc-turn.ts` rewritten: **decides and announces only.** Intent posts publicly; the tier
  and scoring rationale go to the console, never to chat — players must not be shown how the monster
  thinks.

Reservations and known gaps:

- **Nothing is executed yet.** No movement, no `item.use()`, no turn advance. The GM resolves what the
  card announces. Execution is the next layer and lands with GM approval on by default.
- **NPC Banter is registered but inert.** With the LLM loop gone, combat currently makes zero AI
  calls, which is what "remove it entirely" meant. Banter returns as one optional short line.
- **Threat detection is a proxy.** "Carries many spells" stands in for "is artillery"; a martial
  damage dealer reads as harmless to tier 6. Needs no rules knowledge, which is why it was chosen.
- **Tier 4's deception and disarm are unimplemented.** Stealth is real (see positioning below); only
  `save`-type items are identifiable generically as control options, and the rest need identifiers
  the adapter cannot read yet.
- **Cover and hiding are computed for real, against ONE observer each** (user's call, 2026-08-02,
  after the announce-only version was rejected as too valuable to skip). `auto/positioning.ts` scans
  12 bearings × 3 radii nearest-first and returns the first square that is reachable (straight-line
  move ray, not pathfinding) and out of sight of the reference observer. Cover tests the **furthest**
  player, hiding the **nearest**. Known hole, accepted: cover from the far archer is not cover from
  the near one. Upgrading is one parameter — the search takes an observer, so passing two costs one
  extra ray per candidate. The angular start is seeded, so identical creatures don't all break left.
- **The cover budget is half the creature's speed**, because movement already spent acting is not
  tracked. Deliberately under-promises rather than proposing a shuffle it could not afford.
- **Collision API is v13-verified** (`ClockwiseSweepPolygon.testCollision(origin, dest, {type, mode:
  "any"})`) with two older shapes tried in turn. An unreadable API returns null and is treated as "no
  cover found", never as "cover found" — the failure mode must be a creature standing in the open,
  not one claiming cover that isn't there.
- **Keeping distance reads the opponent's sheet too.** An enemy whose items are unreadable is assumed
  to threaten one grid step, deliberately: guessing "harmless" would walk archers into a grapple on
  every unfamiliar system. The reverse error (an archer that over-respects a spellcaster's reach) is
  cheap by comparison.
- **Reach defaults to one grid step** when an item states no range. Deliberate: exact reach is a rules
  detail we refuse to model, so a 10-ft polearm may be planned as if adjacent.
- **Unreadable INT/WIS lands at tier 4, not tier 1** — a missing number turning a dragon into a beetle
  is the worse failure.
- **Encounter resolution** (`auto/encounter.ts`, addendum of 2026-08-02): a fight can end by flight,
  surrender, or mercy rather than a body count. The module records the outcome, flips the token from
  Hostile to Neutral for surrender and mercy (one reversible field), and posts a GM-whispered card
  stating what the addendum says the outcome is worth. It deliberately does **not** award experience,
  divide loot, or strip the party's currency/weapons/armour on a mercy — experience and loot are
  system-specific arithmetic — see the rewards adapter below, which the user approved on 2026-08-02.
- **`combat/systems/dnd5e-rewards.ts` is the one place Noodlr does system arithmetic, deliberately
  fenced.** Gated on `game.system.id === "dnd5e"`, returns a no-op report elsewhere, and nothing in
  `auto/` imports system knowledge — a second system is a sibling file, not edits in the planner.
  Holds: the published CR→XP table (the actor's own `details.xp.value` wins when present, since
  homebrew overrides it), even splitting across PC combatants (floored — no XP conjured from a
  remainder), and the mercy forfeiture.
- **XP counts what is left on the field: the dead and the surrendered, nothing for escapees**
  (revised by the user 2026-08-02, replacing the original half-value-for-fleeing rule). Two reasons,
  both worth keeping: a fled token is often deleted, so its value was never reliably countable, and
  parties frequently rout enemies deliberately — intimidation, pity, protecting a faction's regard —
  which is a fight they chose not to have rather than one they won. Do not "restore" the half rule.
- **Forfeiture is destructive, so it is recorded before it happens.** Every removed item's full data
  and every coin is written to an actor flag (`noodlr.mercyForfeit`) *before* deletion;
  `restoreForfeited()` puts it all back, reachable from a button on the mercy card and from
  `api.restoreForfeitedGear()`. A mercy ruling that lands wrong mid-session must be one click to undo,
  not a reconstruction from memory. Forfeiture and the XP award both run once, at encounter end, not
  at the moment of the ruling — "no experience from the combat encounter" is an encounter-level rule.
- **Aggression is inferred from players rolling dice** during combat, which is what mercy hangs on.
  A proxy, and deliberately a generous one: a false positive costs a withheld mercy, a false negative
  spares a party that is still stabbing. Needs round ≥ 2, so it cannot fire on the opening round.
- **Banter** (`combat/banter/`, user-supplied library 2026-08-03). `banter/banter.txt` ships in the
  package and is **fetched at runtime, not bundled**, so a GM can edit, cut, or translate lines in
  place with no build step. Missing file = silent monsters, never an error.
  - Frequency: `INT + 2·CHA − 2·WIS`, clamped 0-10, 10% per point. **The signs are intentional and
    confirmed — do not "fix" the subtraction.** Cleverness makes a creature pleased with its own
    commentary, charisma makes it a show-off (doubled), and wisdom is knowing when to shut up
    (subtracted, doubled). The minus also runs in reverse for free: a negative WIS modifier flips
    positive, so fools are the loudest things on the field. One term, both behaviours.
  - Hard gate: **no language, no lines**, whatever the modifiers say. Anything that *can* talk is
    then floored at 1 point (10%). Checked against published stat blocks before adding the floor:
    the raw formula puts goblins, hobgoblins, bandits, orcs, and ogres at exactly 0 (a goblin's −1 WIS
    gives +2, its −1 CHA takes −2 back), which muted every mook while dragons ran at 90%. The floor
    sits outside the formula, after the language gate, so the arithmetic itself stays as specified.
  - **Banter draws from its own seeded RNG stream** (`auto/random.ts`, stream `"banter"`). If it
    shared the tactics stream, switching banter off would shift every subsequent number and silently
    change what creatures *do*. Any future per-turn randomness needs its own stream for the same reason.
  - Tagging is by section heading plus per-line detection, with ancestry words LATCHING onto the
    following lines (the race section names a race once and then continues about it). A wrong-ancestry
    or wrong-sex taunt scores 0 — excluded outright, not merely disfavoured, because "Elf!" thrown at
    a dwarf is worse than silence. Gender markers are deliberately few: `hag-seed` is neutral (it is
    the *spawn* of a hag, aimed at Caliban) and `fellows` is a crowd, both verified against the file.
  - Speech follows the table's existing TTS switch; banter never enables voice on its own.
- **Reactions and legendary actions are readable but not yet triggered** — which also means the
  "or during a reaction" half of the banter trigger is unbuilt; turn-start only today. Recharge state is honored
  (a spent breath weapon is not offered). Reactions, counterspell, and legendary actions all fire on
  *other* creatures' turns, which needs an off-turn hook and a cost model the sheet does not state
  machine-readably. Tier 1 grants the access; the trigger layer is still to build.
- **Alignment gates mercy**, read as free text: lawful-anything, or anything not evil. An unreadable
  alignment is treated as *not* merciful — inventing a conscience the GM never wrote is the worse error.
- Revert map: the pivot is self-contained in `src/combat/auto/` plus the rewritten `npc-turn.ts`.
  Restoring the AI loop means restoring that one file from v0.4.21.

### Phase 6 — Packaging & cutover

- README, manifest + release URLs (release scheme: `https://github.com/gobsmacked1/noodlr/releases/download/v<version>/module.zip`; manifest at `.../releases/latest/download/module.json`), version to 1.0.0 at parity.
- New GitHub repo for noodlr-main; wipe the legacy repo; delete `C:\Project\noodlr` locally when no longer consulted.
- Deferred/optional: `noodlr-vtt` external bridge with our own protocol and package — only if a real need emerges.

## Tech stack & conventions

- TypeScript, esbuild bundle to `dist/`; `module.json` id **`noodlr`** (do not install alongside the legacy reference module in the same world).
- Format: prettier (printWidth 100). Validate: `npm run check` (tsc) + build before commit. Small commits at working checkpoints.
- **Release cadence (2026-07-25):** the `-rcN` prerelease series is retired. Every shipped change is a normal incremented release (`v0.4.0`, `v0.4.1`, ...) cut with `gh release create` **without `--prerelease`** — Foundry's auto-update reads `releases/latest/download/module.json`, and GitHub excludes prereleases from "latest", so rc URLs were never picked up. Per release: bump `version` in `package.json` + `module.json`, point `module.json.download` at the new tag, then **`npm run package`** (`scripts/package.ps1` — asserts the two versions agree and that the download URL matches the tag, runs check/lint/clean-build, verifies no dangling chunk references, zips the payload and then re-opens the archive to confirm `module.json`, `dist/noodlr.js`, the ORT asyncify wasm, `lang`, `styles`, `banter`, `templates/partials/` and the ONNX weights are all inside). Then commit, tag, `gh release create <tag> module.zip module.json`. Add the release's notes to `changelog.md` (lowercase; Big Bad Module Manager reads it). Bump to 1.0.0 at feature parity.
- **Verify the release's ASSETS, not just the tag (2026-08-03).** v0.4.26 was cut with `gh release create`
  and no files attached, which Foundry reports as `No module manifest found at <url>` — the manifest URL is
  `releases/latest/download/module.json`, so an assetless release makes the *newest* release the broken one
  and blocks updating. Pushing the commit and tag is not shipping. After every release:
  `gh release view <tag> --json assets` must list **both** `module.json` and `module.zip`, then fetch
  `releases/latest/download/module.json` and confirm `version` matches and its `download` URL returns 200.
- **`models/` must be in the zip.** `rag/local/embedder.ts` sets `allowRemoteModels = false` and points
  `localModelPath` at `modules/noodlr/models/`, so Memory Lite's in-browser embedder has no fallback: an
  asset without the weights 404s for anyone installing by manifest. The **v0.4.25 asset shipped without it**
  (13.24 MB, no `models/` entries) — a real regression that local dev installs cannot notice, because the
  weights are already on disk from `npm run fetch-model`. A correct asset is ~29 MB: `dist/ort` (~35 MB of
  wasm, compresses hard) plus `models/.../model_quantized.onnx` (~22 MB, barely compresses at all). Sanity
  check by size before uploading; anything near 13 MB is missing the model.
- **The build wipes `dist/` first (2026-08-03).** Code splitting emits content-hashed chunk names and
  esbuild never removes the previous build's, so `dist/` had reached ~460 JS/map files (17 MB, nearly all
  unreachable) and every one shipped. A clean build emits 28. Deleting `dist/` wholesale is safe —
  everything in it is generated, `dist/ort/` included, which `copyOrtAssets()` re-copies from
  `node_modules` on each build. The upshot for debugging: a chunk that fails to emit is now an honest 404
  rather than being masked by a stale file of the same name, which is what the packaging script's
  dangling-reference check guards.
- Sourcemaps stay in the shipped package and the bundle stays unminified, deliberately: console stack
  traces from play are the primary diagnostic channel, and they are worth far more than the ~3.5 MB.
- Windows host gotcha: the file-Write tool intermittently emits new files as UTF-16LE — after creating any file, verify the first bytes are UTF-8 and convert if needed. Watch CRLF/LF (.gitattributes) since Foundry servers are often Linux.
- Never store secrets in this file or in module settings defaults.

## Research method: the corpus, subagents, and not losing the work

Every "nobody automates this" finding in this file came from reading source, never from asking a model
what it remembered. That is only affordable because the sources are already on disk.

- **The corpus lives at `C:\Project\_research\`** (outside all three workspace roots, so tools must be
  pointed at it explicitly and a plain workspace search will not find it):
  - `dnd5e\` — dnd5e **5.3.3** system source. `module\*.mjs`, `module\config.mjs`, `lang\en.json`, and
    crucially `packs\_source\` — the unpacked authored CONTENT, which is where the "it's only prose"
    verdicts are actually decided. `dnd5e533\` is a duplicate of the same version; ignore it.
  - `fvtt13\foundryvtt\` — a full Foundry v13 install with **readable client source** under
    `resources\app\`. This is what makes claims like "`#initializeMovementActions` overwrites the cost
    function" checkable rather than plausible.
  - `ftypes14\` — Foundry **v14** API type definitions, carrying the doc comments. The only way to answer
    "does this API exist in 14 but not 13", which has bitten us (`maxCost` arrived in 14.357).
  - `midi-v14\`, `midi-qol\`, `gambits\`, `cpr\`, `vision5e\`, `perceptive\`, `patrol\`, `talia\` — the
    modules we compare against and deliberately stand down for.
  - `gh_*.py`, `gh_issues_found.json`, `milestones.json` — helpers used to search dnd5e issues and releases
    when the question is "did they ever intend to build this".
  - `_audit\` — completed audit reports (see below).
- **`rg` (ripgrep) over the corpus is the primary instrument.** Absence of evidence is the finding in most
  of these investigations, so searches must be exhaustive and the negative result stated with the pattern
  that produced it.
- **PowerShell output is unreliable in the agent shell (observed 2026-08-06).** `Get-ChildItem` and
  `Select-String` have silently returned empty output where the paths plainly existed. `cmd /c dir` and the
  file-reading tools were unaffected. Do not conclude a file is missing from a bare PowerShell listing.

**Subagent protocol (adopted 2026-08-06, after losing a batch — twice).** Six research subagents were
launched as blocking calls in one message. All five that started **finished their work within about a
minute each and wrote a complete final report**; the batch was then killed 77 minutes later because the
handoff back to the parent hung. The work was never slow, and it was never lost — but the *delivery* was
all-or-nothing and there was no copy on disk, because the briefs said "report back" and "modify nothing".

1. **The file is the deliverable, the reply is expendable.** Every research brief names an output path
   under `_research\_audit\` and instructs the agent to create the file *before* researching and rewrite it
   after each section. An interrupted run then still leaves a usable artifact.
2. **Background them** (`run_in_background: true`). A blocking call looks identical whether it is working
   or hung, which is precisely how 77 minutes went by.
3. **Cap the fan-out at two or three.** A blocking batch is only as fast as its worst member and the blast
   radius of one stall is the whole batch.
4. **Bound the effort** in the brief ("finish within ~60 tool calls; a complete-but-partial file beats an
   exhaustive one that never gets written").

**Recovery drill — a vanished subagent's work is usually still on disk.** Transcripts persist at
`C:\Users\Superuser\.cursor\projects\c-Project-noodlr-memory\agent-transcripts\<chat-id>\subagents\<agent-id>.jsonl`,
one JSON event per line with `role` and `message.content[]`. **The final report is the `text` block of the
last `role: "assistant"` event**; tool calls appear as `tool_use` entries but their results are stripped, so
the report is all that is recoverable — which is exactly the part worth having. Sort the folder by write
time to find the batch. A transcript containing only the opening `user` event is an agent that never
started. Five reports (~68k characters, fully cited) were recovered this way on 2026-08-06 and now sit in
`_research\_audit\`: conditions/exhaustion, cover/visibility/surprise, damage/death/hazards, movement rules
beyond Speed, and spellcasting/resources.

## How to tell whether dnd5e enforces a rule (audited 2026-08-06)

Three times now we have built something after discovering the system does not do it (actions v0.4.38,
Speed v0.4.39, forced movement v0.4.40). This is the generalised detection method, so the fourth time is
a five-minute check instead of a five-hour audit. Full report and the citations behind every number:
`_research\_audit\documentation-signals.md`.

- **There is no warning word. The tell is structural: look at where the rule's number lives.** If the
  quantity the rule turns on — a distance, a count of actions, a number of feet — appears only in
  `description.value`, in `chatFlavor`, or in a journal page, and **no schema field could hold it**, then
  nothing enforces it and nothing will until the schema changes. Quantified: 57 content files state a
  forced-movement distance in prose, 52 of them have `effects: []`, and no YAML key in any of the 4,674
  content files can express displacement (every `distance:` is `range.distance`). The orphaned number is
  the signal; `effects: []` on its own is weak evidence, since plenty of pure-damage items have none.
- **`CONFIG.DND5E.rules` (`config.mjs:4673`) is the index of the prose surface.** Its own JSDoc: *"List of
  rules that can be referenced from enrichers."* ~170 entries, every value a bare UUID — `shoving`,
  `hiding`, `speed`, `bonusaction`, `dash`, `opportunityattacks`, `cover`. **The test only works in one
  direction:** presence proves nothing (`difficultterrain` is listed *and* implemented), but a rules-table
  key that appears nowhere in `module/**.mjs` outside the config files is prose-only.
- **`&Reference[...]` documents; `[[/...]]` does dice.** `enrichReference` returns a content link and a
  tooltip. The one exception is `&Reference[condition=x]`, which adds a hand-operated "apply status"
  button. The `[[/attack|damage|save|check|...]]` family produces real rolls — but only rolls: nothing
  compares the result to anything or applies a consequence. `[[/award]]` is the only enricher that changes
  actor state on its own. `@Embed[...]` is core, and purely presentational.
- **A config entry that is only `{label, reference}` exists to be linked to.** `weaponMasteries` is the
  archetype and the only table in `config.mjs` that is purely that shape throughout. The refined test is
  the absence of any sibling key beyond `label`/`icon`/`abbreviation`/`fullKey`, and it works *within* a
  table too: a `conditionTypes` entry carrying `special` is wired into core's `specialStatusEffects`; one
  carrying only `name`/`icon`/`reference` is not.
- **A non-empty `chatFlavor` is the content team's to-do list.** Only 129 of 4,674 files have one, it has
  exactly one consumer (`documents/activity/mixin.mjs:704`, which makes it a chat-card subtitle), and when
  filled in it reads like a stage direction: *"On Hit: Target pushed 15 feet away."* (fire giant), *"On
  Failure: Target is pushed 20 feet back."* (air elemental).
- **Ask which Activity type could express the rule.** The closed list is Attack, Cast, Check, Damage,
  Enchant, Forward, Heal, Save, Summon, Transform, Utility. None of those verbs moves a target. The wiki's
  gloss on the last one is the system naming the concept itself: *"Utility: make an arbitrary roll or just
  indicate something happened."*
- **The schema JSDoc is more honest than the prose docs.** `documents/activity/_types.mjs:35`:
  *"`consume.action` — Should action economy be tracked? Currently only handles legendary actions."* That
  is the system stating the v0.4.38 gap outright, in a doc comment, where nobody would look.
- **The 5.0.0 release notes' "What's Next" is the only place gaps are published.** It lists "Action
  tracking", "Range, reach, & cover", and "Ruler integration with movement rules" — all three of the
  things we have since built — prefaced with *"neither can we promise any firm timelines"*. A roadmap item
  is a confession. Check the newest release's equivalent section before starting anything.
- **Two traps.** `movementAutomation` is the only setting whose display name contains "Automation" and it
  governs terrain cost and token blocking, never Speed. And the gap is usually *not* "automation exists
  but defaults off" — the enforcement toggles mostly ship ON; the real problem is that the automation is
  narrower than its name. The genuine off-by-default exceptions worth knowing: `encumbrance` (`"none"`)
  and `autoRecharge` (`"no"`).
- **Disproved, so don't bother:** `lang/en.json` contains essentially no "we will not do this" vocabulary
  (the closest is one "at your DM's discretion" about optional class features), and no limitations or
  "what is automated" page was found on the dnd5e wiki. Core states its position only in the positive, in
  developer docs: rules are a system's job, so a rule the system never modelled as data is a rule nobody
  enforces.
- **Core adjudicates six statuses and paints the rest.** `CONFIG.statusEffects` entries are `{id, name,
  img}`; only `CONFIG.specialStatusEffects` (`dead`, `invisible`, `blind`, `burrow`, `hover`, `fly`) is
  consumed by core, for defeat, vision and elevation.

Five further audits from the same 2026-08-06 batch sit beside that report and have **not** yet been acted
on: conditions/exhaustion, cover/visibility/surprise, damage/death/hazards, movement rules beyond Speed,
and spellcasting/resources. Read them before planning the next feature — they are the standing gap list.

## Phase 0 status (completed 2026-07-22)

Installable skeleton exists and builds clean. Decisions locked this phase:

- **Foundry target:** v14 is current stable (14.365, verified 2026-07-22). `module.json` `compatibility` = min 13 / verified 14 / max 14. ApplicationV2 (`foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`) is the standard; original `Application` deprecates in v16 — build only on AppV2.
- **Foundry types:** self-authored minimal ambient globals in `src/types/foundry.d.ts` (loose `any`). Deliberately no community types package — it lags the live API and this is a clean-room project.
- **Build/tooling:** TypeScript (strict) + esbuild bundle `src/module.ts` → `dist/noodlr.js` (ESM, sourcemap, unminified for now). Scripts: `build`, `watch`, `check` (tsc --noEmit), `lint` (eslint 9 flat + typescript-eslint), `format` (prettier printWidth 100, LF). `dist/` gitignored; `.gitattributes` forces LF.
- **Wired so far:** `init`/`ready` hooks, `enabled` + `chatSystemPrompt` world settings, a restricted settings-menu → `NoodlrSettingsApp`, a `getSceneControlButtons` launcher (defensive array/record handling) + `Ctrl+Shift+N` keybinding, both opening the stub `NoodlrChatPanel`. Module API exposed at `game.modules.get("noodlr").api`.
- All files verified UTF-8/LF. Fresh git repo initialized (branch `main`), first commit landed. GitHub remote not yet created.

## Phase 1 status (completed 2026-07-22)

Chat MVP built (not yet smoke-tested in a live Foundry world — no world available in the build env; validated via tsc/eslint/esbuild + a verbatim-prompt diff).

- **Provider model** (`src/providers/`): `FeatureProviderConfig` = { provider: openrouter|custom, baseUrl, apiKey, model } per feature (chat/embeddings/tts/image/transcription). `registerFeatureProviderSettings(feature)` exposes the 4 fields in native settings; `getFeatureConfig(feature)` reads them. Spec default models pre-seeded for embeddings/tts/image/transcription; chat model intentionally blank.
- **Streaming chat client** (`chat-client.ts`): async-generator SSE parser over fetch/ReadableStream; `streamChatCompletion` + `chatCompletion`; `ChatClientError` carries HTTP status; OpenRouter attribution headers.
- **DM prompt** embedded verbatim in `src/prompts/dm-system-prompt.ts` (diff-verified against the .md, 7185 chars). `getEffectiveChatSystemPrompt()` = override or default. Override cap 65,000 chars.
- **Dice** (`dice/roll-macros.ts`): `{{roll:FORMULA}}` → real Foundry `Roll.evaluate()`, replaced inline as `[formula = total]`; model never rolls. One bounded auto-continuation (setting `chatContinueAfterRoll`, default on) feeds authoritative results back so the DM reacts.
- **Chat panel** (`apps/chat-panel.ts`): ApplicationV2, imperative DOM (no re-render mid-stream), user/assistant/error bubbles, live streaming, safe minimal markdown (`util/markdown.ts`, escapes first), Foundry-user identity, Stop-to-abort, clear-conversation header control.
- **Settings app**: working Chat system-prompt editor (textarea, 65k maxlength, spellcheck, save collapses an unmodified default to ""), reset-to-default, and a live Test-connection button.

Known gaps / SHORTCUTs to revisit: no in-Foundry test yet; scene-control button shape is defensive but unverified against v14; assistant markdown renderer is intentionally tiny; rolls are not yet posted to the Foundry chat log (results shown in-panel only).

## Phase 2 status (completed 2026-07-22)

Memory/RAG integration built against the live noodlr-memory HTTP contract (read from that repo's README + src). Not yet smoke-tested against a running service.

- **RagClient** (`src/rag/client.ts`): thin wrapper over `/v1` (`health`, `collections`, `query`, `ingest`, `ingest-file`, `purge`), `x-noodlr-secret` header, `RagClientError`. Hit shape `{id,score,text,hash,metadata}`; 9 silos mirrored in `rag/silos.ts`.
- **Config** (`rag/config.ts`): native settings — enable, service URL (default `http://127.0.0.1:3010`), secret, hybrid, agent-mode, sendEmbedConfig, tokenBudget (1500), topK (5); plus embeddings provider (default `perplexity/pplx-embed-v1-4b`). `getEmbedOverride()` only sent when the user opts in (keys stay server-side by default).
- **Retrieval** (`rag/retrieval.ts`): queries default silos (lore/rules/npc_state/factions/quests/chat) across one multi-collection call, budgets hits by ~4-char/token estimate into a labeled block, injected as a second system message per user turn. Graceful degradation: on unreachable service returns null + one-time warning; the DM keeps playing.
- **Agent Mode** (`rag/agent-mode.ts`): chat model decomposes the query into sub-queries + entities (`searchTexts[]` + `entities[]`), best-effort with raw-query fallback.
- **Ingestion** (`rag/ingest.ts`): system-agnostic `documentToText` (name + description HTML stripped + JSON fallback; JournalEntry pages handled), batched (25) compendium ingest with progress.
- **Memory window** (`apps/memory-app.ts` + `templates/memory.hbs`): status/backend, per-silo item counts + reset (confirm dialog), compendium ingest matrix (any pack → chosen silo), TXT/PDF upload (PDF as base64). Opened via the "Manage Memory" settings menu or `game.modules.get("noodlr").api.openMemory()`.

Known gaps: silo-status counts depend on the service's `stats()` shape (rendered defensively); scene-aware silo selection is still a fixed default set; retrieved block is injected at top rather than lorebook-style positioned (Phase 3); no in-Foundry/live-service test yet.

## Phase 3 status (completed 2026-07-22)

SillyTavern-informed prompt architecture. Lorebook storage decision: **world-scoped module setting holding a JSON array** (`type: Array`), synchronously readable at assembly time; revisit if lorebooks grow large. Not yet smoke-tested in Foundry.

- **Context assembler** (`src/prompt/assembler.ts`): single ordered payload — system prompt · top lorebook · RAG · Foundry state (Phase 5 hook) · [history + author's note at depth] · bottom lorebook · post-history. One token budget (`contextTokenBudget`, default 12000, ~4ch/token via `util/tokens.ts`); history trimmed oldest-first to fit fixed blocks. Replaces the ad-hoc payload in `conversation.ts`.
- **Lorebook** (`prompt/lorebook.ts` + `apps/lorebook-app.ts`): keyword (plaintext or `/regex/flags`) + constant activation, position top/bottom, order, enabled. CRUD via a DialogV2 single-entry editor. Vector activation is a stored flag, not yet wired.
- **Author's note / post-history / combat reminder**: edited in the settings window (textareas); depth + context budget are native settings. Combat reminder auto-swaps into the post-history slot when `game.combat?.started` (computed at assembly time — no hooks needed).
- **Chronicle pipeline: REMOVED 2026-07-27** (see the dated section above). Lorebook stays.
- **Memory browser** (`apps/rag-browser-app.ts`): GM-only search-driven CRUD over any RAG collection.
- Session tools live on the DM scene-control toolbar. API: `openLorebook()`, `openRagBrowser()`.

Known gaps: no vector-activated lorebook entries yet; author's note/post-history are plain text (no per-entry token budgets beyond the global one); FormDataExtended path in the lorebook editor is defensive but unverified in v14; no in-Foundry test.

## Phase 4 status (completed 2026-07-22)

Media features. All three provider shapes reuse the shared per-feature provider settings. **Clients are untested against live endpoints; push-to-log is untested (needs mic + Foundry).**

- **TTS** (`media/tts.ts`): `/audio/speech` (OpenRouter/custom incl. local presets), `speak()`/`stopSpeaking()`, dynamic `listVoices()` (tries `/audio/voices`, falls back to OpenAI names). Optional auto-read of DM replies (client-scoped setting) wired into the chat panel.
- **Image** (`media/image.ts` + `media/display.ts`): `/images/generations`, optional chat-model prompt expansion via the Image system-prompt override, SD-era extras (steps 20 / cfg 7 / sampler "Euler a" / seed -1 / negative), b64 or URL result shown in an ImagePopout + posted to chat. GM scene-control button prompts for a description.
- **Transcription** (`media/transcription.ts`): multipart `/audio/transcriptions` (Whisper default).
- **Push-to-log** (`media/push-to-log.ts`): floating bottom-center mic button for all participants; cycles ~N-second MediaRecorder segments → local transcription → GM path posts to chat + appends to a flagged session JournalEntry + buffers for periodic `chat`-silo ingest (60–3600s, default 300s). Player clients relay transcript **text** (not audio) to the GM over the `module.noodlr` socket. Segment length + all toggles are settings.
- API added: `speak`, `stopSpeaking`, `generateSceneImage`, `togglePushToLog`.

Known gaps: no in-Foundry/live-endpoint test; MediaRecorder segment cycling and the socket relay need verification; generated images aren't saved to disk (data URL only); per-NPC voice assignment deferred.

## Phase 5 status (completed 2026-07-22)

Combat co-pilot — no rules engine; narrate + delegate. Not yet tested in a live combat.

- **Ground-truth ⚔️ block** (`combat/tracker.ts`): `buildCombatStateBlock()` rebuilds the tracker from `game.combat` each turn (round, init order, current→next, per-combatant HP/conditions/defeated). System-agnostic best-effort HP extraction (dnd5e + common shapes); PCs show exact HP, enemies show tiers (fresh/wounded/bloodied/near death); positions left as narrative zones (no Cartesian). Injected via the assembler's `foundryState` slot (conversation passes it every turn) — the module, not the model's last message, is the source of truth.
- **AI NPC turns** (`combat/npc-turn.ts`): `runCurrentNpcTurn()` runs the current combatant if it's non-PC — decides + narrates one action, emits `{{roll:...}}` (never prose dice), leaves mechanical application to real dice + the table's automation, posts to Foundry chat under the combatant's alias. Refuses to act for PCs. Uses the Combat system-prompt override (`combat/config.ts`, editable in settings; default in `constants.ts`).
- **Rules during combat**: `retrieval.ts` force-adds the `rules` silo to queries whenever combat is active.
- GM scene-control button + API `runNpcTurn()`.

Known gaps: HP/condition extraction is best-effort per system (verify on your target system); no auto-run on turn change (deliberate — GM triggers); positions aren't zone-mapped; no live test.

## Phase 6 status (partial — 2026-07-22)

Packaging done and shipped to GitHub. Version stays 0.1.0 (pre-parity, pre-smoke-test).

- **README.md** written (thesis, principles, features, install, configure, console API, license).
- **Host decision (2026-07-22):** canonical git + release host is **github.com/gobsmacked1**, not `math.secretdoor.app`. The secretdoor.app URL was a placeholder; `module.json` `url`/`manifest`/`download`/`readme` now point at GitHub. (User can revert to a self-hosted forge later; if so, re-point these four fields.)
- **Repos live (public):** `github.com/gobsmacked1/noodlr` (this module) and `github.com/gobsmacked1/noodlr-memory` (the RAG service — was never actually a git repo locally before; `git init` + first commit + push done, with fresh `.gitignore`/`.gitattributes`).
- **Release v0.1.0 cut:** `module.zip` (dist/ + templates/ + styles/ + lang/ + module.json + LICENSE + README, 90 KB) and `module.json` attached as assets. Install-by-manifest verified reachable: `https://github.com/gobsmacked1/noodlr/releases/latest/download/module.json` returns the correct manifest (id=noodlr, v0.1.0).
- Legacy `C:\Project\noodlr` is already empty on this host; nothing to delete.
- Deferred: bump to 1.0.0 once smoke-tested at parity in a live world.

## Deployment facts (target Foundry server — provided by user 2026-07-22)

- Host `DEMIURGE` (Linux). Foundry service `foundryvtt` runs as account **`superuser`** from **`/opt/foundryvtt`**; world/module data under `/opt/foundryvtt/data/Data`.
- **Module install path:** `/opt/foundryvtt/data/Data/modules/noodlr` (install-by-manifest in Foundry drops it here automatically).
- **External deps** (e.g. `noodlr-memory`) deploy to **`/opt/<service-name>`** → `/opt/noodlr-memory`.
- **Cursor agent worker:** runs as user `cursorbot` under systemd unit `cursor-worker.service` (name `noodlr-cursorbot`, workerId `afb4e5c1-...`), survives reboot (verified). Its serving directory is **`/opt`**, so a Cloud Agent driving this worker has `/opt` as workspace root. Drive it from cursor.com/agents, not from this chat.
- Give the worker scoped power to bounce Foundry via a sudoers drop-in (`cursorbot ALL=(root) NOPASSWD: /usr/bin/systemctl {start,stop,restart,status} foundryvtt`).

## Model-filter round (2026-07-24) — v0.2.4

Per-feature OpenRouter model dropdowns, filtered by output modality (fixes "343 slugs for every
field"). Verified live against `GET /api/v1/models` — the API supports server-side filtering via
`output_modalities` (+ `sort`), and although the docs only list text/image/audio/embeddings, these
all work: text(343), image(40), audio(4), embeddings(27), speech(15), transcription(12), rerank(4),
video(17); `all`=447. Approach: `fetchOpenRouterModels(modality, sort)` caches per `modality|sort`,
preserves server sort order. `provider-ui.ts` maps `data-feature` → modality (chat=text/context-high,
tts=speech, image=image, transcription=transcription, embeddings=embeddings; music=audio, video=video,
rerank=rerank reserved) and auto-fills a per-feature `<datalist>` when OpenRouter is selected. Catalog
is public (no key). No key ever sent for the OR catalog.

## Tipster — live scene briefing (2026-07-31, feasibility DONE; not yet implemented)

Feature name is the user's ("Tipster"). Goal: on-demand poll the active scene and hidden-inject a
situational briefing from the perspective of the token whose player is asking. Full assessment lives
in the canvas `canvases/tipster-feasibility.canvas.tsx` (workspace `c-Project-noodlr-memory`).

**Decision 1 — NO RAG for live scene state (user agreed 2026-07-31).** The user drafted 8
`{player,gm}_tipster_*` collections (`noodlr-memory/scripts/Tipster_RAG_Collection_Access.csv`);
we are deliberately NOT building them. Reasons: live state is already authoritative in Foundry and
readable synchronously in <1 ms; RAG retrieval is semantic/top-k (returns chunks that *resemble* the
question — useless when you need the exact current distance); every write costs an embedding call;
RAG writes are async while prompt assembly is synchronous. Instead: poll on demand at assembly time
into the **existing `AssembleInput.foundryState` slot**, which is already wired through
`conversation.ts` and is `null` outside combat. Durable scene facts still go to
`player_history`/`gm_history` as normal. The CSV stays as a record of the rejected design.

**Decision 2 — per-token perception IS computable (corrected 2026-07-31).** An earlier draft of the
assessment wrongly claimed it wasn't; the user correctly pushed back ("their browser must have a
function that decides what to display"). Verified against v13/v14 docs:
`DetectionMode#testVisibility(visionSource, mode, config)` takes the vision source as an **explicit
parameter** — it is not hardwired to the current client. `CanvasVisibility#restrictVisibility()` is
the method that hides failing placeables. Only the `token.isVisible` *convenience getter* is
client-relative ("visible to the calling user's perspective"; "all Tokens are visible to a GM user
if no Token is controlled").
- **Chosen approach:** compute on the **asking player's client**, where `isVisible` is already
  authoritative, then send the pre-filtered list to the GM in the existing relay request. Inherits
  every vision module the table runs (darkvision, Levels, Perceptive) for free; touches no canvas
  internals; never mutates the GM's view.
- **Trust boundary:** a player-computed snapshot is client-supplied input. Player client *narrows*
  (perception), GM client *validates* (authority) — GM drops any claimed token that is `hidden` or
  SECRET-disposition before it reaches the prompt, so forgery buys nothing.
- GM-side fallback (`token.vision` + `initializeVisionSource()`) is only for GM previews and offline
  players; `token.vision` is undefined when the token isn't a viable source for the current user,
  and forcing one mutates shared canvas state.

**API facts worth not re-deriving** (verified against live docs 2026-07-31):
- z-axis is `token.elevation`. `token.sort` is draw order — NOT height (easy trap).
- `token.inCombat` / `token.combatant` are direct getters on TokenDocument.
- `token.disposition` includes a **SECRET** value; `token.isSecret` is permission-aware.
- Doors: `wall.door` (0 none / 1 door / **2 secret**) and `wall.ds` (0 closed / 1 open / **2 locked**).
- Scene: `width`/`height` + `grid.size`/`grid.distance`/`grid.units` → real distances;
  `environment.darknessLevel`, `environment.globalLight`; `scene.regions`, `scene.notes`,
  `scene.journal`, `scene.playlist`/`playlistSound`.
- **Three real gaps, in Foundry itself (no module can fix):** terrain has no first-class field;
  traps and chests/interactibles are module conventions, not core concepts. Planned escape hatch is
  a GM-authored terrain field or a named region (phase T5).
- System-specific → guard with optional chaining and omit when absent: HP, class levels, ability
  scores, creature type. Reuse the 4-path HP probe + condition reader already in `combat/tracker.ts`.

**Budget hazard:** the assembler trims ONLY history; fixed blocks are never truncated, so an
unbounded Tipster block silently evicts conversation history. It must self-cap (the combat block's
HP-tiering is the in-repo precedent). Target ~180 tokens.

**Decision 3 — three callers, one builder, per-bot toggles (user 2026-07-31).** The block header line
is **"Token/Object Speaking:"** (NOT "You are:") because the caller may be a player, the GM, or a
future internal automation. Two world-scoped booleans let the admin enable Tipster independently for
the GM bot and the players bot; a future NPC-movement/combat AI inherits the GM toggle but must be
built from **the NPC's own perception** (an ogre must not path toward an invisible rogue) — that is
the same T3 machinery with a different vision source, which is the main reason to build T3 properly.

**Decision 4 — ephemeral by construction (user 2026-07-31).** The briefing is built, injected, and
discarded within a single prompt; never written to `this.messages`, so it cannot leak into history or
a later turn. Rationale: a cached block is a *wrong* block as soon as anything moves. Consequence to
accept: the model only knows the situation as of the asking turn, so stamp the block with round/world
time to make stale references self-evident. Also add a nearest-N cap (default 8, sorted by distance,
with an explicit "+N more not listed" tail) — a 20-token siege map would otherwise blow the budget.

**Second API pass — 18 additional fields the user hadn't requested** (full table in the canvas). The
two I'd not ship without:
- **`user.targets`** (Set<Token>) / `token.isTargeted` — who the speaker has actually targeted.
  Resolves "can I hit him?" without guessing which "him", and signals intent.
- **`game.time.worldTime` / `.components` / `.calendar`** — v13+ has a real in-world calendar
  (year/month/day/hour/season). Drives night vs day, shop hours, travel, rest.
Other core (system-agnostic) wins: `token.movementAction` (walk/fly/swim/burrow — airborne or
submerged), `token.light`/`emitsLight` (who carries the torch → stealth + who sees whom),
`token.sight.range`/`.visionMode`/`detectionModes` (darkvision vs blind), `token.rotation` (facing).
**Two are leak guards, not features:** `token.displayName` (vs `CONST.TOKEN_DISPLAY_MODES`) — if the
GM hid names, the player briefing must say "a robed figure", not the actor name; and
`token.displayBars`/`bar1`/`bar2` — tells you whether exact HP is already public, giving a principled
basis for numbers vs tiers.
System-specific (guard + omit when absent): movement speeds, proficiency bonus, skill totals +
passive Perception (better than raw ability scores for adjudication), spell slots, legendary/lair
actions (GM-only; commonly forgotten mid-combat), death saves, concentration (usually arrives free
via the existing status reader).
Not available in core: **action/reaction economy** (Foundry doesn't track spent actions; only
automation modules do, via their own flags). `token._movementHistory` exists but is underscore-
prefixed/internal — treat as unstable.

**Build order:** T1 scene ambience + `game.time` + toggles (no secrets, proves plumbing) → T2
speaker/party incl. `user.targets`, speed, prof, passive Perception → T3 perceived others (the
sensitive one; trust boundary + name/HP leak guards + nearest-N cap) → T4 GM omniscient view +
"what can X see?" preview → T5 terrain escape hatch.

### T1 SHIPPED (v0.4.8, 2026-07-31)

`src/tipster/scene.ts` — the only new file. Exports:
- `buildTipsterBlock({caller, userName, token})` → `string | null`. Emits
  `# Current situation (live from Foundry — trust this over any earlier description)` followed by
  `Token/Object Speaking:` / `Scene:` / `Time:` / `Light:` / `Ambience:` / `Regions:`. Every line is
  independently optional; returns `null` if only the header would survive (not worth the tokens).
  Wrapped in try/catch — a briefing is a nice-to-have, so an unexpected API shape must never break
  the user's chat turn.
- `resolvePerspectiveToken(user)` → controlled token (strongest intent signal, self only) → assigned
  `user.character`'s token on this scene → any token whose `actor.ownership[userId] === 3`.
- `TipsterCaller = "player" | "gm" | "automation"` — the automation arm is unused until the NPC AI.

Wiring:
- GM bot: `chat/conversation.ts` builds it per turn and **concatenates after** `buildCombatStateBlock()`
  into the existing `foundryState` slot (combat block stays first — it's the authoritative one).
  Renamed the local to `combatState`; `foundryState` is now `[combat, tipster].filter(Boolean).join()`.
- Players bot: `players/answer.ts` pushes it as a system message after the RAG block. Runs on the GM's
  client, so the perspective token is resolved from the **asking** user — `generatePlayerAnswer()`
  gained a 4th param `askUserId`, passed through from `relay.ts` (`payload.userId`).
- Settings: `SETTINGS.tipsterGm` / `tipsterPlayers` (world, config:true, default **true**),
  `isTipsterEnabled("gm"|"players")` in `prompt/settings.ts`. i18n `NOODLR.Prompt.Tipster*`.
- `canvas` added to `src/types/foundry.d.ts` ambient globals (first use in the module).

Implementation notes worth keeping:
- Dimensions are reported in **grid squares + distance/units** ("40x30 squares, 5 ft/square"), not
  pixels — pixels are meaningless to a model. Gridless scenes (`grid.type === 0`) report px honestly
  instead of inventing square counts.
- Darkness → phrase ladder (pitch dark / dark / dim / well lit / bright daylight) with the raw value
  kept alongside. Reads `environment.darknessLevel` (v13) **and** legacy top-level `scene.darkness`.
- `game.time.components` + `.calendar` for real month/day/season names, with a `worldTime`-seconds
  fallback that stays silent unless the GM actually advanced the clock (avoids printing a fake
  "day 1, 00:00" for worlds that never touch time).
- Regions capped at 8 names with a `+N more` tail (nearest-N discipline starts here).

### Debug logging + three fixes (v0.4.9, 2026-07-31)

**Debug channel (new, in `constants.ts`).** `SETTINGS.debugLogging` — **client**-scoped (it's a
troubleshooting aid for whoever has a console open; no reason to force it on the table), config:true,
default false. Helpers:
- `debug(label, ...args)` — gated verbose line. Reads the setting in a try/catch because it's called
  from paths that can run before settings registration.
- `debugPayload(label, messages)` — dumps a whole chat payload as a **collapsed console group**, one
  sub-group per message with role + token estimate + full text. This is the tool for confirming
  whether the Tipster / RAG / lorebook blocks actually made it into a request.
- `warn(...)` — always-on channel for things the user must see even with debug off.
- `isDebugEnabled()` — guard for expensive log-only work.
Instrumented: `players/relay.ts` (send → socket → GM handle → post), `players/answer.ts` (payload +
raw reply + Tipster present/absent/disabled), `chat/conversation.ts` (state-block summary + full
payload per request incl. continuations), `module.ts` (socket receipt).

**Fix 1 — players-bot silent no-response (user report).** Root cause: the whole path was
`log`-free and failure-silent, and critically a player's question is only answerable by an **online
GM** (by design — the GM's client holds the keys). With no GM connected the socket emit went nowhere
and the player got a spinner forever with nothing in console. Now: `sendPlayerAsk()` checks
`game.users.activeGM` and both warns to console and shows the player a notification
(`NOODLR.Players.NoGM`); the empty-answer and generation-failure paths use `warn` instead of
swallowing; non-primary-GM skips are logged. NOTE: this makes the failure *visible* — if the user
still sees no answer with a GM online, the debug payload dump will show whether the provider was
called and what it returned.

**Fix 2 — rerank 404 noise.** `providers/rerank.ts` swallowed every failure (`if (!res.ok) return
null; } catch { return null; }`), so a misconfigured account showed only a bare 404 in the network
tab. Now it reads the provider's own error body and warns **once per session per distinct reason**
(`reported` Set), with a 404-specific hint pointing at OpenRouter Settings → Privacy / data policy
and noting retrieval continues without rerank. AbortError is debug-only (routine cancellation).
The user's actual 404 was OpenRouter's *"No endpoints available matching your guardrail restrictions
and data policy"* — an account-side privacy setting, not our bug.

**Fix 3 — `renderChatMessage` deprecation warning was ours.** `output/artifacts.ts` registered BOTH
`renderChatMessageHTML` and legacy `renderChatMessage` for compat — but merely *registering* the
legacy name makes v13 emit the deprecation warning. Now branches on
`game.release.generation >= 13` and binds only the modern name on v13+. (Deprecated in v13, removal
in v15.)

**T1 deliberately has no perception filtering** — everything it reports is non-secret ambience, which
is why it was safe to ship first. Hidden tokens, secret doors, and the player/GM split land in T3/T4.

## Native chat-log sniffer -> unfiltered_chat (2026-07-27)

`src/log/chat-sniffer.ts` (`initChatSniffer()`, called from `module.ts` ready on GM clients).
Listens on `createChatMessage`; only the **primary GM** records (`isPrimaryGM()`). Each message is
distilled to one line `[YYYY-MM-DD HH:MM:SS] (whisper→…) Speaker: text — [roll: 1d20+5 = 18]`:
`message.alias`/`speakerActor`/`author` for the name, `message.content` HTML stripped via a detached
div (imgs → `[image: alt]`), `message.flavor` + evaluated `message.rolls` folded in. Lines buffer and
flush as ONE combined doc to the `unfiltered_chat` silo every N sec (default 300) or at 200 lines;
failed flush re-queues (bounded 2000) and re-arms. Skips any `flags.noodlr` message (DM narration,
player-bot, artifacts) to avoid double-ingest; whispers excluded unless opted in (privacy). Settings:
`RAG_SETTINGS.chatLog{Enabled,Interval,Whispers}` (`getChatLogConfig()`), UI in the Memory & Knowledge
window (`memory-config.hbs` / `memory-config-app.ts`), default OFF. No universal "target" field exists
on ChatMessage (system/module-specific) — v1 is best-effort text; system target extractors are a TODO.

## RAG collection schema migration (2026-07-27, DONE — build green)

Replaced the original 9 silos with a **knowledge-partitioned set of 35**: `system_rules`, `docs`,
`unfiltered_chat` (raw native Foundry logs), and 16 topics each split into `player_*` (at least one
player knows) vs `gm_*` (no player knows) —
`locations, npc_state, calendar, chat, history, lore, quests, macguffin, puzzle, goals, story_arc,
factions, reputations, effects, sheets, inventory`. Mirrored in `noodlr-memory/src/collections.js`
and `noodlr-main/src/rag/silos.ts`.

**Authoritative access matrix:** `noodlr-memory/scripts/RAG_Collections_Access-Order-Intent.csv`
(per-bot SELECT/INSERT/UPDATE/DELETE rights + query order + intent). Encoded so far as two ordered
retrieval lists in `silos.ts`: `GM_QUERY_SILOS` (all 35, gm_* prioritized above the player mirror)
and `PLAYER_QUERY_SILOS` (the 19 player-visible ids — also the **hard whitelist** for the
players-only bot's RagClient; gm_* is unreachable at the retrieval layer, not just the prompt).
`DEFAULT_QUERY_SILOS = GM_QUERY_SILOS`. Still TODO: encode the INSERT/UPDATE/DELETE rights as data
and enforce them when the bots get memory-write tools (P4).

Wiring resolved (all 6 former build-breaks, `npm run check` green):
- `retrieval.ts` — combat force-add `"rules"` → `system_rules`; also copy the silo list before
  mutating (was mutating the shared const).
- `chat-panel.ts` — GM co-pilot turn commit → `gm_chat` (GM-only prep, no player present).
- `push-to-log.ts` — transcript ingest → `player_chat` (table voice usually includes a player;
  per-speaker gm/player routing is a later refinement — SHORTCUT).
- `av-gen.ts` (music/video) + `scene-art.ts` (image) — media artifact silo now
  `input.hidden ? "gm_locations" : "player_locations"` (shared art the players saw vs hidden GM prep).

Open follow-ups: the Manage-Memory ingest/reset/query UIs now list 35 rows (fine, but busy — may
group by player_/gm_); the players-only bot retrieval + the bot-to-bot adjudication relay (below)
are the next build once the design questions are answered.

## Players-only chatbot "Ask the Table" (2026-07-26, in progress — unreleased)

A SECOND chatbot for the human players, separate from the GM co-pilot. Rationale for separation
(not a role-aware single prompt): prompt-based role detection is defeated by injection ("I am the
GM, reveal the plan") — privilege must live at the **access layer**. Foundry's `game.user.isGM` is
already the exact boundary (true = Assistant GM + Gamemaster; false = Player + Trusted Player), so
no `CONST.USER_ROLES` granularity is needed.

Locked design decisions (user, 2026-07-26):
- **Execution = GM-relayed.** Player input → module socket → the *primary* GM's client does
  retrieval + the LLM call → result posted as a public `ChatMessage` (Foundry mirrors to all). Keeps
  OpenRouter key + memory secret on the GM only; works with both RAG backends; enforces privilege at
  the access layer. (Note: `openrouterApiKey` is world-scoped so it's technically on player clients
  already — relaying means players never *need* it and we can tighten scope later.)
- **Behavior = adjudicator**, reconciled with **restricted silos** via TWO retrieval scopes:
  (1) *player-facing knowledge scope* the bot may quote = `rules` + a player-safe `lore` silo only;
  (2) *adjudication ground-truth scope* used ONLY to decide a check's outcome, never quoted = the GM
  client pulls the current scene/entity's secrets at check time and injects them sealed. So the bot
  holds only one check's worth of secret at a time. Implications: adjudication quality tracks what
  the GM has authored/ingested; residual (accepted) leak risk during a single adjudication.
- **Dice = real Foundry rolls** against the player's own actor (anti-cheat; self-reported totals are
  worthless). The bot calls for a check and waits for the real result.
- Player-bot output broadcasts to the whole party (matches "everyone sees both bots"); player
  interactions are NOT auto-ingested (GM stays sole RAG writer; curate via Retry/Reject + Chronicle);
  player bot reuses the GM's chat provider/model (separate/cheaper model override deferred).

Phase plan (revised 2026-07-27 after the access-matrix CSV + design forks): **P1** transport +
role-gated UI (done) · **P2** relayed mundane generation with player-scoped RAG (DONE, below) ·
**P3** bot-to-bot adjudication relay · **P4** full CRUD memory tools · P5 polish (prompt override,
config labels, docs, release).

**P5 remaining (as of v0.4.18).** Docs done — README rewritten 2026-08-01 against a full audit of the
user-facing surface (it had been stuck at the Phase 6 / v0.1.0 text: no players bot, no memory browser,
no Tipster, no music/video, no RAG-Lite, and it still advertised Chronicle). Prompt fields, the config
reorganization, the assistant-name setting, and the toolbar cleanup landed in v0.4.18 (below). Still
open:

- **The `TBD_IGNORE_ME_FOR_NOW` fields need real default text** (user is writing it): every image
  `positive`/`negative` except Map's positive, plus `authorNote` and `postHistory`. Grep that string;
  the only place to edit is `src/prompts/fields.ts` (or `prompts/index.ts` for shared text).
- Bump to 1.0.0 once smoke-tested at parity.

**v0.4.18 — configuration reorganization + the prompt-field convention.** The settings had grown into
one unnavigable scrolling form, and prompts were invisible by design. Both fixed:

- **Five settings windows** (`MENUS` in `constants.ts`, registered in that order): Memory
  Configuration, Text Generation, Audio Generation, Image Generation, Security. Apps live in
  `src/apps/{text,audio,image}-gen-app.ts` + `security-app.ts`, all extending `NoodlrConfigApp`
  (`config-base.ts`) and spreading `CONFIG_WINDOW_DEFAULTS`. `settings-app.ts`/`settings.hbs` are gone.
- Shared markup is now four real Handlebars partials in `templates/partials/`, registered as
  `noodlrHelp` / `noodlrProviderBlock` / `noodlrPromptField` / `noodlrImageBlock` by
  `registerNoodlrPartials()` during `init`. Foundry's `loadTemplates()` takes a `{name: path}` map;
  the v13+ home is `foundry.applications.handlebars.loadTemplates`, resolved defensively.
- Music went to Audio (it's sound), video went to Image (it's pictures that move) — per the user's
  grouping. Per-feature *custom endpoint* keys stayed with their base URL rather than moving to
  Security: a URL and its key are only meaningful as a pair, and splitting them invites mismatches.
  Security holds the one shared OpenRouter key (used by every feature at once) and is where further
  providers go.
- The four flags that were `config: true` (author's-note depth, context budget, memory writes, both
  Tipster toggles) are now `config: false` and render in Text Generation, beside the prompts they
  modify. Foundry's own settings list holds only `debugLogging` (client-scoped troubleshooting).
- **Assistant name** is a setting (`src/chat/assistant.ts`, default "Polly Histor", 64 ASCII).
  `NOODLR.ChatPanel.Title`, `Players.Title`, `Players.Tool`, and both input placeholders take `{name}`;
  panels override `get title()` because a static option can't read a setting. Hints were reworded to
  say "the assistant" instead of naming it, so a renamed bot doesn't leave stale prose behind.
- Toolbar: the players' chat tool is now `visible: !isGM` (each role gets one input surface; a GM can
  still inspect the players' panel via `api.openPlayerChat()`), and the dragon `home` tool is
  `visible: false` rather than deleted — see the activeTool invariant below.
- `changelog.md` (lowercase, module root) exists for Big Bad Module Manager, which shows changelogs to
  the GM after an update. Its default candidate list is `changelog.md`, `changelog.txt`, `CHANGELOG`,
  `docs/changelog.*`, matched against real filenames from `FilePicker.browse` — so the lowercase name is
  deliberate (a `CHANGELOG.md` may not match on a case-sensitive filesystem). Keep it user-facing:
  GMs read it, not developers.

**v0.4.21 — N1 (combat dossier) and N2 (the turn loop) shipped.**

See "Phase 7" above for the whole design. What landed, and where the seams are — this feature is
being built in layers on purpose, so each release records what to distrust and how far back to go.

Shipped:

- `src/combat/system-profiles.ts` — candidate-path table (dnd5e/pf2e + generic fallbacks) with
  `pick`/`pickNumber`/`pickString`. Where the numbers live, not what they mean.
- `src/combat/dossier.ts` — live per-turn read of the combatant's sheet; per-combat notes cleared on
  death (`updateCombatant` with `defeated`) and combat end (`deleteCombat`), wired in `module.ts`.
- `src/combat/npc-turn.ts` — the loop: one beat per pass, real rolls fed back as authoritative totals,
  `END TURN` sentinel, `MAX_TURN_STEPS = 4`, one chat post and one TTS for the whole turn.
- `DEFAULT_COMBAT_PROMPT` rewritten for per-beat play. **Existing worlds keep the old text**, because
  0.4.18 seeds prompt defaults into settings — a GM must press Reset on the Combat NPC-turn prompt or
  the saved "keep it to 1-2 tight paragraphs and end by yielding the turn" fights the loop.

Reservations and known gaps (in rough order of how likely each is to bite):

- **Cost multiplier.** Up to 4 provider requests per NPC turn, per combatant. Eight skeletons is up to
  32 requests a round. `MAX_TURN_STEPS` is a constant with no UI and no per-combatant opt-out; the
  cheap-model routing that makes this affordable is N4. If a horde fight is unaffordable, this is the
  regression to look at first.
- **No stop button.** The GM chat panel can abort a stream; an NPC turn cannot. A model that keeps
  finding one more thing to do bills the full cap before you can intervene.
- **`END TURN` is regex-detected in prose.** A creature that narrates "she moves to end the turn" ends
  early. Structured intents (N3) remove the ambiguity; until then, early stops are expected occasionally.
- **Nothing streams to the table.** The whole turn appears at once after every beat resolves, so a
  four-beat turn feels slower than the old single message even though it does more.
- **System coverage is untested beyond reading the data shapes.** dnd5e paths are written from its
  known layout, pf2e from knowledge rather than a live world, and everything else leans on generic
  candidates. Unreadable fields are omitted silently — which means a sparse dossier on an exotic system
  looks like "this creature has nothing," and the prompt will faithfully play it as having nothing.
  There is no diagnostics view of the generated dossier yet; that would be the cheapest next safeguard.
- **`labels.*` only exist after `prepareData`.** We fall back to raw fields, so an item may read
  `action` instead of "Action" — cosmetic, but it is the wording the model reasons over.
- **Silent truncation at `MAX_ACTIONS = 40`.** A spell-heavy caster can lose options with no marker in
  the block saying the list was cut.
- **dnd5e 4.x uses-field flip** (handled, but worth watching): `system.uses` became a *spent* count.
  `readSupply` prefers a true remainder and derives `max - spent` otherwise. If a world reports
  backwards charge counts, this is the line to check.
- **Notes are per-client memory.** Two GM clients each keep their own dossier notes, so whoever clicks
  the button sees only the turns their own client ran. Fine today (one GM runs combat), wrong the day
  two do.
- **NPC turns still never query the rules silo.** Phase 5 promised rules retrieval during combat and
  this path has none — the creature knows its sheet and the tracker, not the rules. Deliberate for now
  (latency, and retrieval is async while the loop is already long); revisit with N3.
- **No execution.** Nothing is spent, moved, healed, or applied. Ammunition counts read correctly but
  are only reported; the archer that "fires" still has the same arrow count next turn until Midi QoL or
  the GM changes it. That is N3, and it is the layer where a bug can actually damage a world's state.

Revert map: N1+N2 are additive except for `npc-turn.ts` (rewritten) and `DEFAULT_COMBAT_PROMPT`. To
get the old one-shot NPC turn back, revert the v0.4.21 commit; nothing else in the module imports the
dossier, and `registerDossierCleanup()` is a no-op if the files are gone.

**v0.4.20 — the rules system is stated, and memory has a truth hierarchy.**

Reported from play: with D&D 5e 2024 rules fully ingested, the GM bot adjudicated a search in
Pathfinder 2e terms because the active scene's name came from an adventure originally published for
PF2e (and later reissued for 5e). Root cause was not prompt wording — **the module had never told
any model which system Foundry was running.** There was not one reference to `game.system` in the
source. HP, initiative, conditions, scene geometry, and world time were all injected as ground
truth; the single fact every ruling depends on was left to inference, and inference from proper
nouns is a coin flip that arrives sounding certain.

- **`src/system/ruleset.ts`** — settings `rulesetChoice` (a curated list of Foundry-supported
  systems, plus `auto` and `custom`) and `rulesetCustom` (64 ASCII). `auto` reads `game.system.title`.
  Ships defaulting to "Dungeons & Dragons Fifth Edition (2024)" rather than to `auto` (user, 2026-08-02):
  a GM who never opens the setting gets a real answer instead of an inferred one, and detection could
  not have supplied the revision anyway.
  Detection alone can't finish the job: `game.system.id` is `dnd5e` for both the 2014 and 2024 rules,
  so the list spells editions out and the GM's choice is authoritative over what Foundry reports.
  The stored value IS the display name — no id mapping to maintain, and a world that later drops the
  system keeps a readable label.
- **Not a prompt field, deliberately.** The editable prompts are the GM's voice; a guard that
  disappears when someone rewrites an unrelated paragraph is not a guard. Same reasoning as the
  combat state block. What's configurable is the system *name*, in Text Generation directly under the
  main system prompt, because it qualifies everything that prompt says.
- **Injected in all four generation paths** — `prompt/assembler.ts` (GM co-pilot), `players/answer.ts`,
  `players/adjudication.ts`, `combat/npc-turn.ts`. The players' bot and the adjudicator matter as much
  as the co-pilot: both talk in checks and DCs, and the players' bot doesn't use the assembler at all.
- **Two injections, ~50 tokens total.** `buildRulesetBlock()` (~45) goes immediately after the system
  prompt and before anything retrieved, so lorebook entries, memory hits, and an adventure's own prose
  are all read in its light; `rulesetEcho()` (~6) rides in the post-history slot beside the combat
  reminder, where instruction-following is strongest and where a long history can no longer bury it.
  The wording buys precedence (live data and character sheets outrank setting associations and
  pretraining) and a failure mode (say something out of character rather than switch systems) — rules
  *content* stays in the `system_rules` silo.
- Unset/undetectable resolves to an explicit "not configured — ask the GM out of character", which is
  the honest failure. Silence is what produced the bug.

The same incident's second half: the wrong ruling had been stored, so retrieval would keep feeding it
back with the authority of the `# Retrieved campaign memory` header.

- **`src/rag/importance.ts`** — noodlr-memory's re-ranker has always weighted `importance` (0-10) and
  the module **wrote it nowhere**, which is not neutral: a missing value scores identically to zero, so
  a rulebook chapter someone deliberately ingested competed on equal terms with whatever the chat
  sniffer swept up. Now every write path carries a level — curated 8 (hand-typed in the browser),
  ingested 7 (compendia, uploads), assistantWrite 6, artifact 5, conversation 3, transcript 3,
  incidental 2, diagnostic 1. The ordering is the point; the absolute numbers are not.
  `/ingest-file` builds its own metadata server-side, so noodlr-memory gained an optional `importance`
  body field (clamped 0-10) — otherwise uploaded books would have been the one curated path scoring
  zero.
- **`src/rag/retraction.ts` + Retract in the Memory browser** — deleting a bad memory destroys the
  evidence; leaving it lets it reinforce itself. A retracted row keeps `metadata.retracted` and stays
  visible in the browser (struck through, tagged) while `retrieveContext()` filters it out for every
  bot. Plain metadata, so it works identically on noodlr-memory and RAG Lite. There is no
  update-metadata endpoint and adding one would mean touching four store backends, so retract is
  delete + re-insert: one embedding call for a rare, deliberate GM action.

**v0.4.19 — memory reachability, window text selection, TTS test phrase.**

- **Two RAG target modes** (`src/rag/target.ts`, settings `rag.targetMode` + `rag.servicePath`,
  default `direct` so upgrading worlds keep the URL they already had). A browser cannot open a Unix
  socket, so a socket-reached service is only usable through a reverse proxy. (noodlr-memory ≤1.0
  also *disabled* TCP whenever `NOODLR_MEMORY_SOCKET` was set; 1.1 binds both — see the
  noodlr-memory note below.) `proxy` mode stores a path (default `/memory`) and resolves it against
  `location.origin` at read time; `direct` stores a full URL. Both values persist independently so
  flipping the picker doesn't erase the other address. `getRagConnection()` returns the resolved
  URL, so every caller and every error message names something pasteable.
- **The 127.0.0.1 trap:** the module's default URL is `http://127.0.0.1:3010`, which in a browser is
  the *GM's own desktop*, not the Foundry host. `inspectRagTarget()` detects loopback-URL-with-remote-
  Foundry and HTTP-URL-on-an-HTTPS-page before any request, and renders the warning in the window;
  `ragFailureAdvice()` adds the socket/bind/proxy hints after a failed test. Failures now also land in
  a persistent status line (`[data-role="rag-test-status"]`), because a toast disappears before a CORS
  explanation can be read, let alone copied.
- Both normalizers strip a trailing `/v1` — pasting the full endpoint is the common slip, and
  `RagClient` appends `/v1` itself.
- **Window text selection** (`styles/noodlr.css`): the enumerated tag list was replaced by
  `.noodlr .window-content, .noodlr .window-content *` with `!important`. Core's `user-select: none`
  rule shifts between Foundry patch releases and had started out-specifying ours; scope stays on
  `.window-content` so the drag handle in the title bar still drags.
- TTS "Test voice output" ships with its sample phrase in the box and refills it when emptied
  (`NOODLR.Media.TtsTest.Sample`) — an empty test submits nothing and reads like a provider fault.

Design forks resolved (user, 2026-07-27):
- **Adjudication trigger** = LLM tool-call: the players-bot calls `adjudicate(...)` when a request
  needs privileged/hidden info; the STRUCTURED payload (PC, target, skill, rollTotal, question) — not
  the player's verbatim text — crosses to the GM bot (a second injection boundary).
- **NPC opposition** = hybrid: a REAL Foundry roll on the NPC's actor sheet when resolvable, else a
  rules-based DC from the stat block. Player's own check is always a real Foundry roll (anti-cheat).
- **Oversight** = auto-resolve + log every adjudication to the GM side for audit/override.
- **Writes** = full CRUD per the matrix (P4). Needs the noodlr-memory service to expose update/
  delete-by-id — verify its API before building.
- Both bots run on the GM client, so bot-to-bot is a LOCAL call chain (one extra LLM call), not a
  network hop. The GM bot returns a CONSTRAINED verdict (confirmed | unfounded | no_secret + short
  tier flavor), never raw gm_* text — the return channel is the one leak surface.

**P2 shipped (code, unreleased):**
- `src/rag/silos.ts` → `GM_QUERY_SILOS` (all 35, gm_* prioritized) + `PLAYER_QUERY_SILOS` (19
  player-visible ids; also the hard retrieval whitelist for the players-bot). `DEFAULT_QUERY_SILOS`
  aliases `GM_QUERY_SILOS`. Source of truth = the access-matrix CSV.
- `src/rag/retrieval.ts` → `retrieveContext(query, signal, { silos })`: optional silo override so the
  players-bot queries only `PLAYER_QUERY_SILOS`. gm_* is never queried on a player's behalf.
- `src/players/answer.ts` → `generatePlayerAnswer()`: minimal path (players system prompt +
  player-scoped RAG block + question) via the GM's `chat` provider (`chatCompletion`, web-plugin
  auto-disabled). No lorebook/author's-note/Chronicle/combat (GM canon — would leak). GM-side
  re-sanitize of the question (crafted socket payload can bypass the panel). Not auto-ingested.
- `src/players/relay.ts` → `handlePlayerAsk` now calls `generatePlayerAnswer` (was the P1
  placeholder); friendly `NOODLR.Players.GenFailed` on error/empty.

**P3 shipped — bot-to-bot adjudication (code, unreleased):**
- Roll capture uses the chat-log feed: the players-bot asks the player to roll from their sheet and
  emits an `ADJUDICATE` directive; the GM client registers a pending check keyed by userId; the
  player's REAL Foundry roll (a `createChatMessage` with `rolls`) is matched by author id and the
  total consumed. No bespoke roll button.
- `src/players/directives.ts` → provider-agnostic "tool call": model emits `@@NOODLR VERB {json}`
  lines (ADJUDICATE/REMEMBER/UPDATE/FORGET); `parseDirectives()` extracts + strips them. Chosen over
  native function-calling because our custom/local OpenAI-compatible endpoints don't reliably support
  tools.
- `src/players/adjudication.ts` → pending registry (180 s TTL), `initAdjudicationCapture()` (GM
  `createChatMessage` hook), `adjudicateAndPost()`: retrieves `GM_SECRET_SILOS` (gm_* + system_rules
  — the players-bot can never query these), rolls a REAL d20 for NPC opposition, calls
  `GM_ADJUDICATION_PROMPT` (produces the player-facing tiered narration directly — the secret never
  leaves the GM client except as the earned reveal), posts via `postPlayerResult`, audits to GM.
- `prompts/index.ts` → `GM_ADJUDICATION_PROMPT` (section 7); PLAYERS prompt updated to the directive
  handoff (no more injected sealed block).
- Hybrid NPC opposition: real Foundry `1d20` on the GM client + the NPC's modifier reasoned by the
  adjudicator from the stat block/rules (system-agnostic — we never hardcode 5e skill tables; dice
  are always real, per the DM doctrine).

**P4 shipped — CRUD memory tools (code, unreleased):**
- Service already supports it: `/insert`, `/delete` (ids/hashes), `/query` (returns `id`), `/purge`.
  Added `RagClient.delete()` + `MemoryBackend.delete()` + RAG-Lite `LocalMemory.delete()` (new
  `store.removeRecords()`), so CRUD works on BOTH backends.
- `src/rag/silos.ts` → `SILO_RIGHTS` matrix (SELECT/INSERT/UPDATE/DELETE per audience, transcribed
  from the CSV) + `canWrite()` + `writableSilos()` + `GM_SECRET_SILOS`.
- `src/rag/memory-writes.ts` → `applyMemoryDirective(audience, directive)`: enforces the matrix
  (a bot can never mutate a silo it isn't entitled to; players-bot has ZERO gm_* write access),
  REMEMBER=ingest, UPDATE=fuzzy-match→delete→ingest, FORGET=fuzzy-match→delete (no-op if no match —
  never guesses a destructive target), every write audited to the GM (`util/audit.ts`).
- Players-bot executes its directives (`applyMemoryDirectives("player", …)`); the adjudicator writes
  per-silo audience (player_* as player, gm_* as gm).

**GM co-pilot CRUD — ENABLED (2026-07-27).** The GM co-pilot now emits autonomous `@@NOODLR
REMEMBER/UPDATE/FORGET` directives, executed with `audience:"gm"` (writes to gm_* and player_* per
`canWrite`, every write whispered to GMs as an audit line). Implementation without touching the
verbatim DM prompt:
- `rag/memory-writes.ts` → `buildMemoryToolsPrompt(audience)`: compact capability block listing the
  audience's writable silos + directive syntax + "durable state only, not rules/chatter".
- `prompt/assembler.ts`: injects `buildMemoryToolsPrompt("gm")` as a separate leading system message,
  gated on `isRagEnabled() && isChatMemoryWritesEnabled()`.
- `chat/conversation.ts`: after roll resolution, `parseDirectives()` strips directive lines from the
  displayed/stored text; `applyMemoryDirectives("gm", …)` runs them when the toggle is on.
- New world setting `chatMemoryWrites` (default ON, config:true) — flip off to keep all GM memory
  edits manual (via the Memory browser, below).

## Chronicle removed; Lorebook → toolbar; Memory browser added (2026-07-27)

Decision (user): **Chronicle was gutted entirely.** Rationale: with 35 RAG silos + the GM co-pilot's
CRUD directives + the new Memory browser, a separate LLM-summary review queue was redundant and noisy
(it kept capturing non-canon like a rules dump of the Artificer class — `captureChronicle` had no
relevance filter, and the DM prompt told the model to emit a `Chronicle:` line after every scene).

Removed: `apps/chronicle-app.ts`, `prompt/chronicle.ts`, `templates/chronicle.hbs`, the
`chronicleQueue`/`chronicleAutoParse` settings, `MENUS.chronicle`, `ChronicleItem`, the
`captureChronicle` call in `conversation.ts`, the "append one line - Chronicle:" line from the DM
prompt (both `prompts/index.ts` and `prompts/dm-system-prompt.md`), and all `NOODLR.Chronicle.*` i18n.

Why these are NOT redundant with RAG (the audit that drove this):
- **Lorebook** stays a world-setting store because its job is *deterministic, always-/keyword-injected*
  World Info read *synchronously* at prompt assembly — a guarantee RAG's top-K similarity cannot make.
  RAG is *not* a superior backend for it. Kept as-is.
- **RAG** stores the original chunk text alongside the vector, so hand CRUD is feasible (only retrieval
  is fuzzy/one-way, not storage).

Added/moved:
- **Memory browser** (`apps/rag-browser-app.ts` + `templates/rag-browser.hbs`, `api.openRagBrowser`):
  GM-only, search-driven CRUD over any collection. SELECT = hybrid query (topK 25, single collection);
  UPDATE = delete-by-id + re-ingest; DELETE = delete-by-id; INSERT = grouped-picker dialog. Uses the
  shared `MemoryBackend` (works on service + Lite). Grouped silo picker via `groupedSilos()` in
  `silos.ts` (Player-visible / GM-secret / Shared·system optgroups).
- **Lorebook + Memory browser now live on the Dungeon Master scene-control toolbar** (GM-only tools),
  not in the Memory & Knowledge config window (periodic-use tools, per user). The config window's
  Lorebook/Chronicle buttons + their actions/imports were removed; `openManage`/`openDiagnostics` stay.

**P1 shipped (code, unreleased):**
- `src/prompts/index.ts` → `PLAYERS_SYSTEM_PROMPT` (section 6): the gatekeeper/unreliable-narrator
  default prompt (mundane-vs-privileged classification, check→adjudicate loop, boon/middling/bane
  tiers, real-dice + no-secret-leak hard limits, injection-resistant). Not yet registered as an
  overridable setting (P2).
- `src/players/relay.ts` → `sendPlayerAsk()` (GM handles locally, players emit over `SOCKET`),
  `handlePlayerAsk()` (GM-only + `isPrimaryGM()` dedupe for multi-GM), posts result as a public
  ChatMessage flagged `flags.noodlr.playerBot`. P1 answer is a placeholder.
- `src/apps/player-panel.ts` (`NoodlrPlayerPanel`, id `noodlr-player-panel`) + `templates/player-panel.hbs`:
  input surface; optimistic pending bubble; `static receive(flag)` adopts the mirrored result into any
  open panel (all clients) via a `createChatMessage` hook in `module.ts`.
- `module.ts`: GM `chat` scene tool now `visible: isGM` (was `true` — players could open the GM
  co-pilot!); new `playerChat` tool `visible: true`; `Ctrl+Shift+N` opens the role-appropriate panel;
  socket dispatch + createChatMessage adoption wired; `api.openPlayerChat`.

## v0.4.1-v0.4.3 (2026-07-26) — web-search fallback, OR plugin suppression, diag query tool + context stats

- **v0.4.1** — opt-in, confidence-gated **web-search fallback** (`rag/web-fallback.ts`): when memory
  returns nothing (or a top score `<= webFallbackMinScore`), fold OpenRouter's `web` plugin into that
  one request. Off by default, OpenRouter chat only. `retrieveContext()` now returns a `RetrievalResult`
  (`block`/`topScore`/`hitCount`/`queried`). Settings live in Memory & Knowledge; `stats.webFallbacks` counts.
- **v0.4.2** — since OpenRouter's dashboard can't fully disable an account-level web default (min results
  is 1, not 0) and Presets only bind to their chatroom, `chat-client.ts` now sends
  `plugins:[{id:"web",enabled:false}]` on **every** OpenRouter chat request unless the fallback opts in.
  Per-request overrides account defaults (unless the user set "Prevent overrides"). Noodlr is the sole
  arbiter of when a web search runs.
- **v0.4.3** — Diagnostics **Query inspector**: run raw retrieval (pick a silo or all defaults + topK),
  see hits (score · silo/source · full text) with no LLM in the loop. Added **context-sent stats**:
  `stats.ctxSent{Count,Sum,Peak}` sampled in `conversation.ts` via `noteContextEst(estimateMessagesTokens(payload))`,
  shown as Avg/Peak vs the context budget. Also expanded the `ContextBudget` hint: 12000 is thrifty; with
  200k-1M models, 32000-64000+ is safe (cost/latency scale per token; RAG+Chronicle backstop recall).

## v0.4.0-rc8 (2026-07-25) — RAG Lite embedder: trailing-slash fix on wasmPaths

- Follow-up to rc6. The embedder still failed loading `ort-wasm-simd-threaded.asyncify.mjs` — this
  time from `…/dist/` instead of `…/dist/ort/` (the `ort/` segment was dropped). Cause:
  `foundry.utils.getRoute()` strips the trailing slash, and ORT/transformers resolve child files
  relative to `wasmPaths`/`localModelPath` as directory prefixes — so a missing slash drops the last
  segment. `moduleUrl()` now re-adds the trailing slash when the source path was a directory. Fixes
  both `wasmPaths` (→ `…/dist/ort/`) and `localModelPath` (→ `…/models/`).

## v0.4.0-rc7 (2026-07-25) — Diagnostics tests gated to the active backend

- The Diagnostics window now shows only the test relevant to the configured RAG backend, so a
  nontechnical user never sees a failing probe for a RAG type they aren't using. The **in-browser
  embedder** fieldset renders only when backend = `lite`; `#onEmbedTest` also hard-guards (bails with
  `EmbedTest.NotLite` if somehow invoked on the service backend). The **Memory contents** legend is
  backend-aware — "Memory (RAG Lite) contents" vs "Memory (LanceDB) contents" — and the write→read
  self-test (which already routes through the active backend) stays available for both, correctly
  labeled. Context adds `backend`/`backendLite`/`backendService` (from `getRagBackend()`).

## v0.4.0-rc6 (2026-07-25) — RAG Lite embedder loads (ORT asyncify + absolute wasmPaths)

Fixes the rc4/rc5 in-browser embedder failure ("no available backend found" / bare-specifier on
`ort-wasm-simd-threaded.asyncify.mjs"). Two root causes:

- **Missing ASYNCIFY build.** Foundry isn't cross-origin isolated (no COOP/COEP → no
  SharedArrayBuffer), so ONNX Runtime Web can't use its pthread-threaded WASM and loads the
  **asyncify** single-threaded build instead — which esbuild wasn't copying. `ORT_FILES` now ships
  `ort-wasm-simd-threaded.asyncify.{wasm,mjs}` (23.5 MB wasm) plus the base pair as fallback.
- **Bare specifier.** `env.backends.onnx.wasm.wasmPaths` was `"modules/noodlr/dist/ort/"`; the
  browser rejects a bare specifier for the dynamic `import()` of the ORT `.mjs`. New
  `moduleUrl()` in `rag/local/embedder.ts` resolves via `getRoute()` + `new URL(..., origin)` to an
  ABSOLUTE href (also route-prefix safe); applied to both `wasmPaths` and `localModelPath`.

Zip grows ~+10 MB (compressed asyncify wasm). No API/behavior change otherwise.

## v0.4.0-rc5 (2026-07-25) — structured imports (JSON / YAML / CSV)

- **JSON, YAML, and CSV file import** for both memory backends. Parsing happens client-side at the
  upload boundary (`rag/parse-structured.ts`) — the file is flattened to per-record text documents
  *before* `ingest()`, so noodlr-memory and RAG Lite both get it with **zero backend/interface
  change** (contrast PDF, which parses inside the service and is unsupported in Lite).
  - One document per logical record: JSON/YAML array element or named object; CSV row (first row =
    header). Nested objects flatten to `path: value` lines; a name/title/label/id field becomes the
    record label + an `entities` tag for retrieval provenance.
  - JSON = native parse; CSV = small built-in RFC-4180 parser; YAML via the `yaml` dep, **lazy
    `import()`** so it only ships as a chunk when a YAML file is actually parsed.
  - Wired in `apps/memory-app.ts` `#onIngestFile` (structured → `client.ingest(docs)`; else the old
    text/pdf `ingestFile` path). Upload `accept` + hint updated; new `NOODLR.Rag.StructuredEmpty`.
- New dep: `yaml`. Third-party lore importers (World Anvil/Dungeon Alchemist/etc.) deferred — most
  export to JSON/CSV (now covered) or produce maps (out of scope for lore RAG). See `IDEAS.md`.

## v0.4.0-rc4 (2026-07-25) — RAG Lite (built-in memory) + backend-labeled config

- **RAG Lite: a zero-config in-browser memory backend.** New `MemoryBackend` interface
  (`rag/backend.ts`) implemented by both the remote `RagClient` and a new `LocalMemory`
  (`rag/local/local-memory.ts`). A factory in `rag/config.ts` (`getRagBackend()` /
  `getRagClient(): MemoryBackend`) returns the active one; retrieval, ingest, diagnostics, and the
  Manage-Memory UI all call the shared interface — backend-agnostic. New setting
  `RAG_SETTINGS.backend` (`rag.backend`, world scope) **defaults to `"lite"`**.
  - Embeddings: in-browser via the bundled `all-MiniLM-L6-v2` (384-dim) from `rag/local/embedder.ts`
    (transformers.js/ORT-WASM, single-threaded, offline; lazy 1.2 MB chunk).
  - Store: `rag/local/store.ts` — one JSON file per silo under `<mediaFolder>/memory/<silo>.json`
    via FilePicker upload; vectors as base64-Float32; in-memory index on the GM's client (GM-gated).
  - Search: `rag/local/{chunker,search}.ts` — clean-room prose/table-aware chunker + BM25 + cosine +
    RRF fusion (multi-query for Agent Mode) + importance/recency/entity soft-boosts.
  - `isRagEnabled()` is backend-aware: Lite needs no URL/secret; service still requires a URL.
  - **Known gap (SHORTCUT):** Lite `ingestFile` rejects PDFs (throws a friendly "convert to .txt or
    use noodlr-memory" message) — no in-browser PDF parser yet. TXT works. Also: Lite index is
    per-GM-client, not shared across multiple GMs (that's what the service backend is for).
- **Backend-labeled Memory & Knowledge config.** Every RAG option is tagged `(shared RAG setting)`,
  `(noodlr-memory only)`, or `(RAG Lite only)`, and options that don't apply to the selected backend
  are **grayed live** (`data-backend` + `wireBackendGraying()`). Inputs stay enabled (never
  `disabled`) so the inactive backend's stored values round-trip and aren't wiped on save. Service
  URL/secret/Test-connection and the embeddings provider block are noodlr-memory-only; hybrid/agent/
  budget/topK, rerank, and transcript ingest are shared.
- **Map generator default prompt.** `map.positive` now defaults to the top-down orthographic
  battlemap style/scale prompt (`MAP_DEFAULT_POSITIVE` in `media/config.ts`); `seedMapDefaults()`
  (guarded by `map.positiveSeeded`, run on GM ready) backfills existing worlds without a prompt.
- Carries forward rc1–rc3: in-browser embedder + Diagnostics "Test in-browser embedder" probe;
  image size dropdown (16 curated presets + Null + custom WxH, `.webp` output, per-kind subfolders);
  disabled "Upscale to 4× (coming soon)" on the Map generator (see `IDEAS.md`).

## v0.3.0 (2026-07-25) — four image generators + single OpenRouter key + header-only Save

- **Three new image generators** joined Scene Art, each with its own dragon-menu tool icon, chat
  trigger, provider/model, saved Positive/Negative prompts, output subfolder, format, and per-kind
  continuity ledger. Data-driven via `IMAGE_KINDS` / `IMAGE_KIND_META` in `media/config.ts`; one
  generalized `generateSceneImage(desc, {kind})` + `createAndShareImage(input, kind)` path:
  - **Generate Portrait** — waist-up, locked 1000×1000, `.webp`, `…/portraits`, keyed (continuity).
  - **Generate Token** — top-down/iso token, locked 400×400, `.webp`, `…/tokens`, keyed.
  - **Generate Map** — walkable map, default 4500×6000 (editable, hidden clamp 450–7800/side),
    `.webp`, `…/maps`, non-keyed.
  - **Scene Art (Generate Image)** — kept; default bumped **1024×1024 → 1920×1080** (one-time
    `migrateImageDefaults()` upgrades existing worlds; guarded by `image.sizeMigratedV3`).
  - `.webp` output + locked resolutions enforced client-side via `transcodeImage()` (canvas). Maps
    request their configured size from the API but transcode at the model's returned resolution
    (no in-browser upscale to 7800² — memory hazard). Each kind keeps its own ledger so a "goblin"
    portrait and token don't collide on one seed/appearance.
- **Single OpenRouter API key.** One world-scoped, write-only key on the main config
  (`SETTINGS.openrouterApiKey`); `getFeatureConfig()` hands it to every openrouter feature. Removed
  the per-feature OpenRouter key fields; the per-feature key input is now **custom-only** (optional,
  for local endpoints). `getEmbedOverride()` inherits the shared key automatically.
- **Header-only Save.** Removed the footer "Save" buttons from the settings, memory-config, and
  creature-voices pop-outs — only the title-bar dirty Save (from v0.2.8) remains.

## RAG root-cause FIXED (2026-07-25) — noodlr-memory service

The "self-test 0 hits" saga resolved. Root cause was **not** embeddings/dimensions/LanceDB/legacy
tables (all healthy). It was a plain bug in `noodlr-memory` `src/routes/vectors.js`: the hybrid
candidate-pool size used `clampInt(topK*8, topK, 100)` — the `max` arg was omitted, so
`clampInt(value, fallback, min, max)` did `Math.min(undefined, …) = NaN`, which became
`vectorSearch.limit(NaN)` → LanceDB `"k must be positive"` → caught → `[]`. Since **hybrid is the
default, every real RAG retrieval had silently returned zero hits** the entire time. Fixed to
`clampInt(topK*8, topK, topK, 100)`; hardened `lance-store.query()` to clamp k to a positive int;
added a regression test (store.query survives topK NaN/0/negative). Verified on the server:
self-test round-trips (score 1.000) and semantic search ranks the right chunk #1.

Debugging assets added along the way (kept): `scripts/seed.mjs` (health/collections/seed/query/
selftest/purge/purge-all HTTP diagnostic), embedding-vector validation (`assertValidVectors`),
and front-loaded `vectorSearch` failure logging (query dim vs table dim + full lance error). Module
v0.2.9 added a Diagnostics **Copy report** button. Lesson: the query *route* had zero test coverage
— unit tests exercised `store.query` directly and skipped the NaN path.

## Memory diagnosis round (2026-07-24) — v0.2.9 (module) + noodlr-memory update

Self-test still "0 hits" after v0.2.8. Key finding: the LanceDB round-trip **test passes** locally
(dim-256 mock), so the store logic is sound — the "0 hits" is environmental on the server. The most
likely cause is an **embedding-dimension mismatch on a stale `docs` silo** (table first written with
a different embed model), which makes `vectorSearch` throw — and the store was **swallowing that
error** into `[]`.

- **noodlr-memory (own repo, pull+restart):**
  - `lance-store.js` now **logs** vectorSearch/listHashes failures (query dim + message) instead of
    silently returning `[]`. The real reason (dim mismatch, etc.) now shows in `journalctl`.
  - New **`scripts/seed.mjs`** — standalone HTTP diagnostic/seed CLI (health / collections / seed /
    query / selftest / purge) using the same `/v1` + secret + embed config as the module. Isolates
    service vs. module: if `selftest` passes there but fails in Foundry → module bug; if it fails
    there too → service/store (read the log; `purge` the silo).
  - DEPLOYMENT.md: troubleshooting for "0 hits" + seed-tool usage; documented that **silos are
    auto-created lazily** on first ingest (no manual init).
- **Module v0.2.9:** Diagnostics **Copy report** button (deterministic `navigator.clipboard`, with a
  `window.prompt` fallback for insecure contexts) — copy no longer depends on text selection.

## Bugfix round 2 (2026-07-24) — v0.2.8

- **Self-test STILL false-negative (v0.2.7 didn't fully fix it)** — passing embed on the query
  wasn't enough. Real cause: the test ingested a full sentence but queried with the *bare* marker
  token; those embed very differently, so in a populated `docs` silo the marker never made the
  dense candidate pool (BM25 only runs over dense candidates in `rerankMulti`). Fix: ingest AND
  query the SAME distinctive sentence — self-similarity ≈ 1.0 guarantees the marker tops the pool
  regardless of silo size. NotFound message now reports the hit count (0 hits ⇒ store/vectorSearch
  problem; >0 without the marker ⇒ ranking) for future diagnosis. (Real retrieval was never
  affected — it queries with the user's actual text, normal semantic search.)
- **Video timed out at 5 min while OpenRouter was still rendering** (real jobs take 5–6+ min).
  Bumped the poll deadline to 20 min, cadence to 6s.
- **Video now reuses the image Positive/Negative style** — `av-gen` prepends the image `positive`
  prefix and appends `Avoid: <negative>.` (the video API has no native negative_prompt field;
  best-effort in-prompt) so clips match the look of stills.
- **Header Save button** (`apps/header-save.ts`) — injected into the title bar (right, before the
  window controls) of the long form pop-outs (main settings, Memory config, creature voices) so
  users needn't scroll to the footer. Turns amber with a leading "•" when the form has unsaved
  edits; resets after submit. Footer Save still works.

## Bugfix round (2026-07-24) — v0.2.7

Fixes from the v0.2.6 test:
- **Diagnostics self-test false-negative** — the write→read test ingested with the embed override
  but queried WITHOUT it, so noodlr-memory embedded the marker query with a *different* (server
  default) model → different vector space → "wrote it but didn't find it". Fixed: pass
  `getEmbedOverride()` on the self-test query too. (Real retrieval already passes embed on both
  ingest and query — actual memory was fine; only my test was wrong.)
- **Diagnostics text now selectable** (`user-select:text` on diag tables/status/intro).
- **Voices were the 6 OpenAI fallback names for every model** — OpenRouter model metadata carries
  per-model `supported_voices` (verified live: mai-voice-2 → `en-US-Harper:MAI-Voice-2`, …). Added
  `fetchOpenRouterVoices(modelId)` (caches the speech-model list); `tts.listVoices()` and the config
  voice picker now use it for OpenRouter (custom still uses `/audio/voices`), refreshing when the
  model changes. Fixes the creature-voice pop-out too (it uses `listVoices`).
- **Video 401 / empty player** — OpenRouter's `unsigned_urls[0]` points back to
  `openrouter.ai/api/.../videos/{id}/content`, which REQUIRES the bearer token; our downloader
  fetched it unauthenticated and saved the 401 JSON as the .mp4. Fixed: `generateVideo` now
  downloads the bytes itself with the key attached (only when the URL is on the API host — never
  leak the key to third-party signed storage), rejects sub-1KB payloads, and returns a Blob;
  `av-gen` saves the Blob and displays the LOCAL path (the remote URL needs auth so players can't
  load it). `saveMedia` now checks `res.ok` before persisting so an error body can never be saved
  as media again.

## Fixups + diagnostics round (2026-07-24) — v0.2.6

Post-v0.2.5 feedback fixes:
- **Chat model list "still 343"** — NOT a bug. OpenRouter's entire catalog is 343 and *all* output text,
  so `output_modalities=text` can't narrow it (verified live: unfiltered==text==343). The other features
  shrink because speech/image/embeddings/etc. are rarer. Left chat unfiltered on purpose — hiding flagship
  chat models by capability would be worse. Explained to user.
- **Transcription enable toggle** — added `transcription.enabled` (world, default off). The floating mic
  button is now gated: `push-to-log.ts::refreshPushToLogButton()` adds/removes it; called at ready and on
  settings save (no reload needed).
- **Music/Video tool buttons** — added GM-only scene-control tools (`music`/`video`, shown only when the
  feature is enabled) → `promptMusic`/`promptVideo` DialogV2 textareas → `createAndPlayMusic`/
  `createAndShareVideo`. Mirrors the existing scene-art button.
- **Music duration snapping** — the number inputs had `step="5"` with `min="1"`, so valid values were
  1,6,11,… (browser rejected 15/300). Changed to `step="1"`.
- **DM chat unselectable + wiped on reopen** — chat transcript now lives in a **static** store on
  `NoodlrChatPanel` (survives close/reopen from switching scene tools) and is rebuilt from it in
  `_onRender`; `.noodlr-chat__body` gets `user-select:text`; each bubble has a copy-to-clipboard button.
  (The `Conversation` model-history is also static now so the DM keeps context across reopen.)
- **Creature-voice table location** — was a collapsed `<details>` in the TTS section; users expected a
  pop-out. Moved to its own window `NoodlrCreatureVoiceApp` (`creature-voices.hbs`) opened by a button in
  the TTS section; the voice field is fed by the live `/audio/voices` list.
- **Diagnostics/stats (new)** — `util/stats.ts` client-scoped counters (chat turns, prompt/completion
  tokens via `stream_options.include_usage`, RAG queries + hits, injected chars≈tokens, rerank runs + kept,
  ingest docs/chunks, media counts). New **Diagnostics** window (button in Memory window) shows: live
  LanceDB per-silo document counts (proves writes land), a **write→read self-test** (ingest a tagged marker
  into `docs`, query it back), and the session counters with derived ratios. Answers the "is memory/rerank
  actually doing anything + reducing tokens" question with numbers instead of hand-waving.

## New-pillars round (2026-07-24) — v0.2.5

Built the four items requested 2026-07-24 (user chose "build all", recommended options). Verified all
OpenRouter shapes live before coding (no fabrication):
- **Rerank** — `POST /api/v1/rerank` `{model,query,documents[],top_n}` → `{results:[{index,relevance_score,document}]}`.
  `src/providers/rerank.ts`; integrated module-side in `rag/retrieval.ts::maybeRerank` (after `/query`,
  before injection). Config lives in the **Memory window** (feature `rerank`, default cohere/rerank-4-fast)
  per user's call — kept in the module so the model is visible/swappable to non-tech users, not hidden in
  noodlr-memory. Settings `rag.rerankEnabled`, `rag.rerankTopN`.
- **Music** — no dedicated endpoint; runs through `/chat/completions` with `modalities:["text","audio"]`,
  `stream:true`, base64 in `delta.audio.data` (concat all, decode ONCE — chunk-aligned decode corrupts).
  `src/media/music.ts` → `av-gen.ts::createAndPlayMusic` saves to `<mediaFolder>/music`, adds to a Foundry
  **Playlist** (default "Noodlr Music") and plays. Chat: `Generate Music: <mood>`. Duration is a prompt
  hint only (lyria clip is ~fixed length). Default `google/lyria-3-clip-preview`.
- **Video** — async: `POST /api/v1/videos` → poll `polling_url` until `status=completed`, read
  `unsigned_urls[0]`. `src/media/video.ts` → `av-gen.ts::createAndShareVideo` saves to `<mediaFolder>/video`,
  broadcasts via `ImagePopout` (its src accepts video) + chat `<video>` card. Chat: `Generate Video: <scene>`.
  Default `google/veo-3.1-fast`; 6–30s requested (provider may cap lower). Experimental.
- **TTS creature voices** — pivoted from size-based pitch to a **creature-type → {voice, pitch}** table
  (`src/media/creature-voice.ts`, user's D&D type/subtype list). Pitch is sent ONLY when
  `tts.pitchSupported` is ticked (OpenAI/OpenRouter `/audio/speech` has no pitch field; strict servers
  reject unknowns) — no client-side pitch shifting. Actor→type via dnd5e `system.details.type`
  {value,subtype}. Wired into combat NPC turns (`combat/npc-turn.ts` speaks as the combatant when TTS on).
  DM auto-read stays default-voiced (mixed narration = no single actor).

Model dropdowns for all three new features filter by their modality (music=audio, video=video,
rerank=rerank) via the v0.2.4 per-feature datalist wiring. `saveMedia()` in `storage.ts` generalizes the
image saver (Blob or URL, subfolders, MIME→ext). Module API adds `generateMusic`/`generateVideo`.

Follow-ups / caveats: music/video/rerank are UNTESTED against a live key (needs the GM's OpenRouter key);
music duration not truly controllable via chat-completions; video local-save may hit CORS (falls back to
provider URL for display). Watch for provider-specific body-field rejections.

## ---
## Media round (2026-07-23) — v0.2.3

Image pipeline overhaul + media storage + dropdown UX (all requested after the second smoke test).
- **Image "no output" root cause:** the old `display.ts` opened an ImagePopout **locally only** (no
  `shareImage()`) and posted a chat card embedding a **base64 `data:` URL**, which Foundry strips
  from chat HTML — so nothing showed. Replaced by `media/scene-art.ts`: generate → persist to disk →
  `ImagePopout(...).render(true)` + `shareImage()` (broadcasts to all) → chat card referencing the
  **file path** (never base64). `display.ts` deleted.
- **Persistent media storage** (`media/storage.ts`): images saved via `FilePicker.upload("data", …)`
  to a configurable folder, default **`assets/noodlr-out`** (v13 allows uploads to `assets/…` and new
  top-level dirs, but blocks modules/systems/worlds/root — also keeps users from traversing up).
  Auto-created on ready (GM). Config has a FilePicker **folder picker** (folder mode, `data` source).
  **No audio is ever persisted** (transcription covers memory).
- **Continuity ledger** (world setting `image.ledger`): entityKey → {seed, prompt(anchor), model,
  path, ts}. `generateSceneImage(desc, {entityKey})` reuses a recurring entity's concrete seed +
  appearance anchor so portraits/locations stay recognizable; new keyed entities get a concrete
  random seed (not -1) so reuse is deterministic. Optional ingest of prompt/tags/path into the
  `scenes` RAG silo (GM-gated).
- **Chat triggers** (`chatMessage` hook, returns false to swallow the command): `Generate Image:
  <scene>` (one-off) and `Generate Portrait: <Name>: <desc>` (keyed continuity). Gated by
  `image.chatTrigger` (default on) and `image.allowPlayers` (default off — API cost). Player-triggered
  images display but can't persist (no upload perm / can't write world settings) — continuity is a GM
  concern by design.
- **Dropdowns** (`provider-ui.ts`): injects "Fetch models" (all features) and "Fetch voices" (TTS)
  buttons that read the provider/base-URL/**typed key** live from the form (no save needed) and fill a
  per-feature `<datalist>`. OpenRouter models need no key; custom hits `{base}/models`; voices hit
  `{base}/audio/voices` with a standard-name fallback.
- **TTS local endpoint reminder:** `http://192.168.x` from an HTTPS Foundry page is mixed-content
  blocked regardless of OpenAI-compat — proxy it behind nginx (like memory). The v0.2.2 Test field
  surfaces this as the fetch `TypeError` case.

## Second smoke-test round (2026-07-23) — v0.2.1 & v0.2.2

- **v0.2.1:** GM-gated memory + client-scope RAG secret (see Open decisions). noodlr-memory gained
  an optional Unix-socket listener (`NOODLR_MEMORY_SOCKET`) for nginx reverse-proxy deploys.
- **v0.2.2:** Added a **Test voice output** control under the TTS section (140-char input; inline
  status line reports success/HTTP error, and specifically calls out the fetch `TypeError` case as
  the browser-origin trap — mixed content HTTPS→HTTP, missing CORS, or unreachable). Same
  browser-origin lesson as memory/TTS: the module's `fetch` runs client-side, so a *local* TTS
  endpoint that "works on its own" often fails from an HTTPS Foundry page; put it behind the reverse
  proxy. **Standing suspicion when users report "chat doesn't render / no dragon icon": stale
  install.** Both were fixed in v0.1.1 and the current scene-controls code matches the v13 API
  example verbatim; symptom set (mic present, no dragon, no chat) == running v0.1.0. Always confirm
  the loaded module version first.

## First smoke-test feedback + fixes (2026-07-23) — v0.1.1 & v0.2.0

User installed v0.1.0 in a live Foundry world and filed an issues log. Two releases cut:

**v0.1.1 — critical functional fixes (the core loop now works):**
- **Chat responses were never rendered.** Root cause in `src/providers/chat-client.ts`: the SSE
  reader only split frames on `\n\n` (missed `\r\n\r\n` from proxies) so everything fell to the
  end-of-stream flush, which then hit `data: [DONE]` and `return`ed — discarding all accumulated
  text. Rewrote the parser (CRLF-normalized; `[DONE]` no longer eats content) + added a
  non-`event-stream` JSON fallback for custom servers that ignore `stream:true`. This also fixed
  Test Connection showing nothing.
- **Scene-control dragon icon missing.** v13/v14 `getSceneControlButtons` gives a
  `Record<string, SceneControl>`; a custom group MUST set `activeTool`, tools need `order`, and
  the callback is `onChange` (not the removed `onClick`). Old code used `onClick` + the v12 array
  shape and buried tools under Token controls. Now Noodlr is its own top-level group (dragon) with
  Chat / Scene Art (GM) / Run NPC Turn (GM). `openChat` reuses the existing panel instance.
- **Windows ran off-screen.** Global CSS caps every `.application.noodlr` to the viewport with
  `overflow:auto` on `.window-content`.

**v0.2.0 — configuration UX overhaul:**
- **All provider/media/RAG settings moved out of Foundry's native settings list to `config:false`**
  and rendered in our own windows. This removed the anonymous, repeated "Provider/URL/key/model"
  rows and the native unmasked-key text field.
- **API keys + RAG secret are write-only in the DOM.** `getProviderView`/`hasKey` never send the
  stored key to the browser; fields show a "saved" placeholder and only overwrite when a new value
  is typed (`saveProviderFromForm`, `saveRagSecret`; `apiKeyClear`/`secretClear` to wipe).
  Residual limitation: a GM client can still read the raw world setting via console —
  proper fix (proxy provider calls through noodlr-memory so the browser never holds keys) is a
  deferred decision, noted below.
- **Main config grouped by feature** (Chat / TTS / Image / Transcription), each Provider→Model→
  (custom URL)→Key, with layman "what / needs / if skipped" help on every field (`NOODLR.Feature.*`,
  `NOODLR.Help.*`). Added the missing **image positive/style prompt** (`image.positive`, prepended
  before the subject in `media/image.ts`); grouped the TTS base URL with TTS; removed the redundant
  `enabled` module setting.
- **Live OpenRouter model list** via public `GET /models` (no key needed) → `<datalist>`
  (`src/providers/models.ts`, wired by `src/apps/provider-ui.ts`). Custom endpoints keep free-text.
- **New consolidated "Memory & Knowledge" window** (`memory-config-app.ts` + `memory-config.hbs`,
  menu `MENUS.memory`): service URL + write-only secret, hybrid/Agent-Mode, embeddings block,
  transcript ingestion, and buttons opening Manage Memory / Lorebook / Chronicle. The separate
  lorebook/chronicle sidebar menus were removed (reachable from here + the module API).
- Form save robustness: both handlers wrap `formData.object` in `foundry.utils.expandObject` so
  dotted field names (`chat.provider`) nest regardless of FormDataExtended version behavior.

**noodlr-memory: LanceDB is now the default backend.** User chose LanceDB over Chroma/Qdrant and
stood up a Python FastAPI+LanceDB PoC (`/opt/lancedb_app/main.py` → `/opt/lancedb_data`); they did
not want a Python client as the interface. So we **embedded LanceDB inside noodlr-memory via the
official `@lancedb/lancedb` Node SDK** — the service now owns the Lance directory directly and the
Python PoC is retired. New `src/stores/lance-store.js` (one table per collection, metadata as a
JSON column for a stable Arrow schema, cosine distance, per-table write serialization);
`VECTOR_BACKEND=lancedb` default; `LANCEDB_URI` (default `<DATA_DIR>/lancedb`, set to
`/opt/lancedb_data`). Validated against the real native module (a 12-check smoke run + a new
`test/lance.test.js`; full suite 14/14 green on this Windows host). **Only one process may write a
LanceDB dir** — the Python server must be stopped.

## Verified in a live Foundry world (2026-07-31, v0.4.14)

The build env has no Foundry world, so everything here was validated in the user's own world
(Foundry v14, dnd5e, GM and player in separate Firefox multi-account containers). The earlier
prediction that "the socket relay is the highest-risk unverified spot" proved exactly right — see
the `"socket": true` invariant below.

**Milestone — the players-only chatbot held unprompted continuity across a real adjudication.**
Unscripted, in one session: a player asked Polly Histor whether he could hide from the surrounding
skeletons → the bot told him to break line of sight and roll Stealth → the player rolled badly in
native Foundry → the bot read the real roll, told him he had been spotted, and called for
initiative. That is the whole design thesis working end to end: retrieval-scoped player knowledge,
escalation to a real Foundry roll instead of a model-invented one, the roll captured from the chat
log, and consequence carried forward without the GM prompting any of it.

Also confirmed working in-app: module load + settings tabs; streaming chat against a real provider;
GM co-pilot and players-only bot side by side; Tipster scene briefing including the token roster
(counts correct for duplicate tokens); TTS on both bots, broadcast to every client; "Hide from
players" suppressing both text and audio; the GM-relayed player ask with acknowledgement.

Still unverified in-app: push-to-log/MediaRecorder cycling, image/music/video generation from a
player client (see the upload-permission note below — expected to fail), combat block + NPC turn,
lorebook/author's-note/post-history injection.

## Hard-won invariants

- **A prompt field's stored value is the whole truth.** Decided with the user 2026-08-01 and
  implemented in v0.4.18: every prompt setting ships pre-filled with its default (`src/prompts/fields.ts`
  is the single registry) and is read verbatim. Never reintroduce `stored.trim() || SOME_DEFAULT` in an
  accessor — that pattern is why a GM could stare at an empty box while the module sent a 1,000-token
  prompt they had no way to see or edit. An emptied field means "send nothing", and the way back is the
  per-field Reset. Adding a prompt means: add it to `PROMPT_FIELDS`, register it with
  `promptDefault(key)` as its default, and render it with the `noodlrPromptField` partial — the Reset
  action and the upgrade seeding then work for free.
  - Prompt textareas carry **no `name` attribute**; they are collected by `data-prompt-field` in
    `savePromptFields()`. Their settings keys contain dots (`image.positive`), which a form serializer
    expands into nested objects that collide with the provider fields.
  - Reset rewrites the textarea only, and lets Save persist it. Writing the setting immediately would
    force a re-render that discards every other unsaved edit in the window.
  - They save through `sanitizeUserText(..., { preserveLayout: true })`. The default sanitizer collapses
    runs of spaces and caps blank lines, which silently reflows a hand-formatted 65k prompt.
  - `seedPromptDefaults()` fills empty prompt settings once per world (flag: `promptDefaultsSeeded`).
    It exists because the old form saved every field on every Save, so upgrading worlds hold explicit
    empty strings for prompts nobody ever edited; reading those verbatim would strip the DM prompt.
    "Deliberately empty" was not expressible before v0.4.18, which is what makes this safe exactly once.
- **The Noodlr control group's `activeTool` must name a tool that is not one of the real buttons.**
  Foundry requires `activeTool` to name an existing tool, and the active tool is skipped when clicked —
  so pointing it at the chat button stops that button from reopening a panel you closed. The inert
  `home` tool exists solely to absorb that role; v0.4.18 set `visible: false` to get the dead dragon
  icon out of the flyout, which is the only safe way to "remove" it.
- **`"socket": true` must stay in `module.json`.** A package only gets a socket namespace by requesting
  it in the manifest; without it the server silently discards every `game.socket.emit("module.noodlr", …)`
  with no error on either side, and only the GM's own local code paths appear to work. This cost several
  release cycles chasing the players-only chatbot (fixed 2026-07-31, v0.4.14). The manifest is read at
  **server start**, so changing this flag needs a world restart, not a page reload. Anything relying on
  it — player asks, the GM ack, push-to-log transcript relay, artifact retire — fails invisibly if it goes.
- **`isGM` is a role, and several clients can hold it.** Foundry defines `User#isGM` as "GAMEMASTER
  **or** ASSISTANT role", so every `game.user?.isGM` gate admits assistant GMs, and anything driven by a
  socket message or a document hook (`createChatMessage`, `deleteChatMessage`) runs once per connected
  GM. Work that must happen once for the table — journal writes, RAG ingestion, deleting a message,
  writing a shared file — must additionally pass `isPrimaryGM()` from `src/util/gm.ts`. Foundry elects
  the designated GM itself (`Users#activeGM` = highest-role active GM, preferring a full GM over an
  assistant) and every client agrees on it, so **do not build a second election** (an alphabetical-by-name
  roster would be worse: names are mutable and we would own cross-client consistency). Caught in
  v0.4.17 after transcripts, artifact commits and retires had been silently duplicating per GM.
  Per-client counters have the same hazard: broadcast speech filenames are namespaced by user id
  because two GMs both start their slot ring at zero and overwrite each other's audio.
- **A capability read that comes back empty is a bug until proven otherwise.** Found in the first play
  test of automated combat (2026-08-03, fix in v0.4.23): every creature "called out for help" and did
  nothing else, because the planner asked each item for `system.actionType` and dnd5e v4+ (the 2024
  rules) no longer has one — everything doable moved into `item.system.activities`, a collection of
  typed activities each carrying its own attack type, range and uses. An archmage read as having zero
  attacks, and the planner *correctly* played a creature with no attacks. The failure mode is the
  dangerous one: no error, no exception, plausible-looking output. Consequences now baked in —
  - `src/combat/actions.ts` is the single normalizer from an actor's items to `CreatureAction`s. It
    duck-types the shape (activities present? use it; otherwise the legacy `actionType`) rather than
    branching on `game.system.id`, and it **logs** when an actor with items yields no actions.
  - Never fall through to `system.actionType` on an item that *has* an `activities` field, even an
    empty one: dnd5e keeps a deprecation shim there and reading it logs a warning per item.
  - `api.explainTurn()` (`src/combat/auto/explain.ts`) dumps what was read and how every option scored
    for the selected combatant. Reach for it first when a creature behaves oddly; it turns this class
    of silent-empty bug into a one-line answer.
- **dnd5e 5.x facts the combat reader depends on** (researched from system source 2026-08-03, after two
  releases were lost to inference; `src/combat/actions.ts` is the only place that should know any of it):
  - `activity.range.units` has INITIAL value `"self"`, and `range.override === false` means "this
    activity states no range; use the item's". Reading either literally gives a reach of zero, which is
    why a Dire Wolf could not bite anybody. `"spec"` means see-the-description; `"any"` is unlimited;
    distances are `ft`/`mi`/`m`/`km`. Melee fallback: `item.system.range.reach`, else 5 ft.
  - An empty `attack.type.value` means **melee/weapon**, not unknown: the system fills it during data
    preparation, and its weapon-type map deliberately omits `natural`, so every claw and bite lands
    there. Only an explicit `"ranged"` makes something ranged.
  - Spells: `system.method` (was `preparation.mode`) with values `atwill`/`innate`/`ritual`/`pact`/
    `spell`; `system.prepared` is a NUMBER (0/1/2), and NPCs are never prepared-filtered. Whether a
    method spends a slot is `CONFIG.DND5E.spellcasting[method]?.slots` — ask the table, do not hardcode.
  - Limited monster casting is usually a **feat with a `cast` activity**: uses live on the feat, and the
    spell it points at is where the shape lives. Enumerate the cast activity (for the uses) and skip
    spell items flagged `flags.dnd5e.cachedFor` (clones the system makes on first use), or you offer the
    same ability twice with the wrong resource attached.
  - Action economy is `activity.activation.type`; `CONFIG.DND5E.activityActivationTypes` carries
    `passive`, `scalar` and `consume.property` metadata. Legendary/mythic draw on
    `actor.system.resources.legact`; `resources.lair` is a boolean plus an initiative count, not a pool.
  - Languages: `system.traits.languages.value` is a real `Set` (plus semicolon-delimited `.custom`), and
    the literal `"ALL"` is a sentinel. `.communication` (telepathy) is NOT a language — a telepath with
    no tongue cannot be taunted in words.
- **"Midi Attack" is a label, not a thing.** midi-qol replaces the system's activity document classes and,
  with its Activity Prefix setting on, an activity displays midi's localized *type title* as its name. Do
  not match on it, and do not treat it as a duplicate to skip — it IS the creature's real attack. The
  activities that genuinely must be skipped are `canUse === false`, `isRider`, and
  `midiProperties.automationOnly`. Because midi may also register `midiAttack`-style types instead of
  replacing classes, classify activities by what they CARRY (`attack`, `damage.parts`, `save`) rather than
  by `type` string equality. Execute via `MidiQOL.completeActivityUse` with `midiOptions.targetUuids` +
  `ignoreUserTargets` when midi is present (falling back to `activity.use`), and set the acting user's
  targets as well: midi's default is to read `game.user.targets`, so an automated turn otherwise inherits
  whatever the GM had selected.
- **Automation owns the tracker; the GM owns their own creatures.** "Combat automation" full/partial is
  what decides whether Noodlr plays a creature, and playing one now includes ending its turn and
  advancing initiative (user's call, 2026-08-03). Consequences that must not be regressed: advancement is
  skipped if the tracker moved while the turn resolved (the GM got there first, or a surrender ended the
  fight); a resolved creature is skipped PAST rather than replayed, or the fight stalls on its corpse;
  the console entry point deliberately does not advance; and a runaway brake (`RUNAWAY_LIMIT` in
  `combat/auto/hooks.ts`) stops the chain after 24 consecutive automated turns, because an NPC-vs-NPC
  fight or a wiped party is otherwise an unbounded loop issuing real rolls unattended.
- **What the first real census proved (193 actors, 1689 items, 2067 activities; dnd5e 5.3.3 on Foundry
  14.365 with midi-qol, chris-premades, ddb-importer, Argon — `noodlr-vtt/noodlr-sheet-survey.json`).**
  Three of these overturned code written the same day from documentation alone:
  - **An empty `activation.type` means "not independently usable"** — 109 of 2067 activities, with empty
    activation *labels* to match, are the companion half of something else (the save rider on a bite, the
    extra damage on a sneak attack). Preparation fills an activation in when the item has one, so empty on
    a prepared actor is an assertion. Treating it as an action let a creature spend its turn on the save
    half of an attack it never made. `economyOf("")` returns null; do not "helpfully" default it.
  - **Passive activations must not be turn options.** 106 `special` activations exist (grapple-escape
    checks and the like). They are classified `free` for honesty but excluded from turn planning.
  - **Wrappers are how monsters cast.** 509 `cast` activities against 524 spell items: "1/day each:
    fireball" is a feat holding the uses and pointing at a *compendium* spell. `fromUuidSync` on an
    unloaded pack returns an index stub with no activities, so the spell must be resolved with an await
    (`prewarmCastSpells`, called before `planTurn`) or every caster reads as having no spells. Where a
    spell appears both as an item and behind a wrapper, the **wrapper wins** — it owns the resource, and
    casting the item bypasses the daily limit.
  - Confirmations, not corrections: `attack.type.value` was never empty on a prepared actor (277 melee,
    89 ranged); only 17 of 366 attacks state no numeric range, and all 17 are `self` (11) or `touch` (6),
    which is the population the reach fallback exists for; every spell in that world uses `method:
    "spell"`; 74 of 193 creatures have no language at all, so banter correctly never reaches them.
  - **The empty-activation rule is load-bearing, not redundant.** A follow-up census on 0.4.25 came back
    `riders: 2`, `midiAutomationOnly: 0`, `canUseFalse: 13` out of 2067 activities — so the system's own
    rider flag does NOT mark the 109 empty-activation companions, and midi links its save/damage halves
    through its own fields instead. Do not "simplify" by trusting `isRider` to catch them; keep all four
    checks, and re-measure with the survey if midi's linkage changes.
  - Also worth knowing: activity *names* are useless as identity — "Midi Use" 379, "Midi Attack" 349,
    "Midi Save" 298 are all midi's type titles. And `consumption.spellSlot: true` appears on plain
    weapon attacks, so it means nothing on its own.
- **Token movement in v13+ (researched from core source, 2026-08-03, after v0.4.24 shipped movement that
  announced itself and never happened).** All of this lives in `combat/auto/movement.ts`:
  - `TokenDocument#move(waypoint, options)` returns `Promise<boolean>` and has **four paths that resolve
    `false` without throwing** — path constrained to nothing, a `preMoveToken` veto, no usable waypoints,
    or `stopMovement()`. **A boolean-returning core API needs its false branch handled, not just its
    throw.** And the converse: **`move() === true` is not evidence of movement**, because core sets its
    success flag *before* `preUpdateToken` fires, so a handler that deletes `x`/`y` (Rideable does this for
    grappled/mounted tokens; Monk's Active Tiles for teleport cooldowns) yields `true` and a stationary
    token. Verify against `doc._source.x/y` — never the prepared `x`/`y`, which are animated mid-move.
  - **Wall constraint applies to API moves and the GM's "Unconstrained Movement" toggle does not**: core
    reads that setting only in `Token#_getDragConstrainOptions`. "I can drag it there myself" proves
    nothing. Bypass, when genuinely wanted, is `constrainOptions: {ignoreWalls: true}` or
    `action: "displace"`. We pass `ignoreCost: true` only, because the planner budgets movement itself.
  - Waypoint `x`/`y` are **top-left pixel integers**, not centres and not grid offsets. `snapped` is
    metadata recording a claim, and snaps nothing — call `doc.getSnappedPosition()` to actually snap.
    An unrecognised `action` **throws**; unknown waypoint keys are silently dropped.
  - A move **paused** by a region behaviour (Terrain Mapper stairs/elevators) never settles its promise,
    so every await is raced against a timeout and then `stopMovement()`ed. Without that, one stair tile
    hangs a creature's turn and the whole automated initiative chain behind it.
  - `update({x, y})` is not a teleport any more and not a fallback: since v13 it is routed through the
    same constraint/veto pipeline, and merely hides the outcome behind a truthy return.
  - Third-party vetoes to suspect first: **NotYourTurn** (`preMoveToken`, never checks `movement.method`,
    so an API move is treated as a player drag; only warns at default GM setting) and **Token Warp**
    (clamps out-of-bounds moves, vetoing ours while moving the token itself).
  - **Do not let our own geometry veto a move (2026-08-04).** v0.4.26 still moved nothing, and the reason
    was not in `moveTo` at all: the callers discarded every candidate destination first, silently, so core
    was never asked. Two causes, both ours. `occupied()` compared a Token placeable against a
    TokenDocument with `===`, so a creature counted *itself* as an obstacle. And our flat
    `blocked()` wall test vetoed candidates on an elevated scene — a party on top of a barbican reads as
    walled in by the rooms underneath, because that test knows nothing about elevation. `blocked()` is now
    advisory in `movement.ts` (logged, never a veto): **core is the authority on whether a move is legal,
    and a second silent opinion can only subtract moves it would have allowed.** It is still a real veto
    in `positioning.ts`, where the question is line of sight rather than legality.
  - Every rejection on the movement path must name the square and the reason. A bare `continue` is what
    made this cost three releases: `moveTo` reported refusals in detail while nothing ever reached it.
  - **Turn pace is a floor on duration, gated on completion — never a deadline (2026-08-04).** The clock
    starts when the tracker reaches the creature, and the tracker only advances after `runTurnFor`'s
    promise resolves, so a turn that takes longer than the floor simply takes longer. Nothing anywhere
    cuts a turn short, and nothing keys off "movement finished". Say this plainly when it comes up: the
    natural reading of "minimum turn duration" is a timer that could truncate a turn, and it is not one.
    The one place a clock CAN end something early is the move stall watchdog, which is why it counts only
    time with no visible animation — a twelve-square walk at one square per second is twelve legitimate
    seconds, and the flat 8-second timeout it replaced would have killed it mid-stride as a hang.
  - **Off-turn reactions, natively (2026-08-04).** `combat/auto/reactions.ts`, no module required — see
    design principle #0. Two triggers, chosen because core alone can detect them with certainty:
    `preUpdateToken`/`updateToken` for "someone left my reach" (snapshot who had the mover in reach
    BEFORE the change, compare after; these two hooks have been stable for many versions and catch a
    move made by any means), and a hit-point decrease via `preUpdateActor`/`updateActor` for "I was hurt
    off-turn" — split across both hooks because the old value only exists before and the reaction must
    not resolve until the damage has landed. Reaction-spent bookkeeping is OURS, keyed by combatant and
    cleared on round change, not read from any module's flags.
    Two things to know before extending it. An opportunity attack is not a sheet entry in any system —
    it is an ordinary melee attack spent as a reaction — so the code looks for the best melee attack,
    not a reaction-flagged item. And damage carries no attribution, so the creature whose turn it is
    gets the blame; that is right nearly always and wrong for traps and lingering area effects, which is
    why it is logged as an assumption.
  - **What the midi review established (2026-08-04, read from source; clones under `C:\Project\_research`).**
    Facts worth not rediscovering:
    - **Midi does NOT automate opportunity attacks.** Its `reactionmoved`/`isMoved` trigger type is
      declared but never dispatched from any of the eleven `doReactions` call sites. Its `recordAOO`
      setting is bookkeeping only: it marks a reaction spent when *you* attack off-turn.
    - **Gambit's Premades DOES**, via a Region per combatant, and is therefore a hard conflict — two
      opportunity attacks per departure. Hence the stand-aside check in `reactions.ts`. chris-premades
      implements no OA and registers no midi hooks, so it is safe. Gambit's is v13-only as of 2.1.44.
    - **Midi's reaction prompt cannot be answered programmatically** — `ReactionDialog` has no
      auto-select, and the only supported intervention is the awaited `midi-qol.ReactionFilter`. Do NOT
      cancel that hook and substitute your own Shield: midi only re-reads AC when the dialog returned a
      real result, so the attack resolves against the stale AC. Pre-empt earlier instead.
    - **`MidiQOL.setReactionUsed()` is a silent no-op unless `enforceReactions` is `"all"` or
      `"displayOnly"`** (it defaults to `"none"`, and `"character"` does not cover NPCs). We call it
      anyway, purely so midi's own prompt suppresses itself, and never rely on it — hence our own ledger.
    - dnd5e 5.3.3 has **zero reaction tracking** and **no Disengage flag, item or status effect**; it is
      prose in stat blocks only. The community convention is an ActiveEffect literally named "disengage",
      which is what we match.
    - Reaction uses want `isReaction: true` and `workflowOptions.targetConfirmation: "none"` in
      `midiOptions`, which is what midi's own reaction path passes.
  - **Planned, not built: Shield, Parry, Counterspell.** Without midi, dnd5e never compares an attack roll
    to an AC — a human eyeballs it — so there is no "about to hit" moment and Shield genuinely cannot be
    timed natively. The shape that respects principle #0 is a two-part job: an optional adapter that
    lights up when midi is present, hooking `midi-qol.preCheckHits` (the last point at which an AC change
    is still read by `checkHits`, followed by `actor.reset()`), `midi-qol.hitsChecked` for Parry, and
    `midi-qol.isDamaged` for retaliation at higher fidelity than our hit-point watcher; plus a NATIVE
    Counterspell off dnd5e's own activity-use hooks, since "a spell is being cast" is observable without
    midi. Every midi hook built from `WorkflowState_X` exists as both `midi-qol.preX` and `midi-qol.postX`
    and is awaited, so an async handler legitimately delays the workflow.
  - **Asking "can that monster see that player" (2026-08-04, source-verified).** Everything in
    `combat/auto/perception.ts`. Three separate traps, each of which fails SILENTLY:
    1. `token.isVisible` and `canvas.visibility.testVisibility` answer whether the CURRENT USER can see
       something. Core's method iterates `canvas.effects.visionSources` (what is initialized on this
       client) and short-circuits to `return game.user.isGM` when there are none — a confident "yes" to
       everything on an automation client. Neither can be scoped to an arbitrary token.
    2. An uncontrolled NPC has **no vision source on a GM's client**: `Token#_isVisionSource()` refuses
       for a GM unless the token is controlled. Build one by hand —
       `new CONFIG.Canvas.visionSourceClass({sourceId, object: token})` then
       `initialize(token.document._getVisionSourceData())` — and **never call `add()`**, which would
       register the monster's eyes with the canvas and change what the GM sees. Destroy it after use.
       `DetectionMode#testVisibility(visionSource, mode, config)` takes the source as a PARAMETER, which
       is the only reason per-creature perception is possible at all.
    3. **dnd5e never maps stat-block senses onto detection modes, and NPC tokens ship with sight off.**
       Its character template sets `prototypeToken.sight.enabled: true`; its NPC template has no
       prototypeToken block, and core's default is `enabled: sight.range > 0` with range 0.
       `_prepareDetectionModes()` returns early when sight is disabled, so the token gets NO modes and a
       vision test returns false for the entire bestiary. Senses live at
       `system.attributes.senses.ranges.{darkvision,blindsight,truesight,tremorsense}` since dnd5e 5.3
       (flat path still shimmed); vision-5e is the module that does the mapping properly. Our fallback:
       no usable modes → stated senses + a wall test, and log the creature once. **Never let an empty
       capability read pass as "cannot see".**
    Also: `detectionModes` is a **Record keyed by id in v14, an Array of `{id,...}` in v13** — the wrong
    shape yields an empty list, i.e. a blind monster, with no error. And running the detection-mode loop
    is what gets lighting, magical darkness and invisibility right for free; do not hand-roll those.
    Patrol (theripper93) tests `fov.contains()` only, which is why it ignores all of the above — take its
    architecture, not its test. Behaviour was the reference; the code is ours, nothing is vendored here.
  - **Starting a combat unattended (2026-08-04, source-verified).** Find the encounter **by scene**
    (`game.combats.find(c => c.scene?.id === scene.id)`) — `game.combats.viewed` is the tracker's current
    selection, i.e. UI state, and is meaningless on an automation client. Then
    `TokenDocument.createCombatants(docs, {combat})` (handles the already-a-combatant case),
    `combat.rollNPC()`, `combat.startCombat()`. dnd5e overrides `rollAll`/`rollNPC`/`rollInitiative`, so
    core's methods already apply the system's initiative configuration — never pass a formula.
    `rollNPC` not `rollAll` on purpose: rolling a player's initiative for them takes away the one roll
    they expect to make, and it is not the work the GM asked to be relieved of.
    `CONFIG.specialStatusEffects.DEFEATED` (default `"dead"`) via `document.hasStatusEffect()` is the
    defeated test; disposition must be `=== HOSTILE`, never `< 0`, because SECRET is −2 and is GM
    bookkeeping. Fires vetoable `noodlrPreCombatInitiated` and `noodlrCombatInitiated` hooks.
  - **Stealth: Foundry's vision question is not 5e's question (2026-08-04).** `combat/auto/stealth.ts`.
    Core answers "is there an unobstructed line to a lit token"; 5e asks "did you beat their Perception".
    Nothing connects the two natively — verified in dnd5e 5.3.3 source: the `hiding` status effect
    (introduced 3.1.0, note the "-ing") has no `special` key and is read by *nothing*, and a Stealth
    roll's total is never persisted to actor, token or flag; it exists as a chat message and then it is
    gone. Every piece of stealth state is therefore ours to own.
    - **We patch nothing, and that is the whole design.** Stealthy wraps each detection mode's
      `_canDetect` through libWrapper because it must change what every client renders. We do not: our
      sweep builds its own vision source and calls `testVisibility` itself, so we own the call site and
      simply refuse our own result. No libWrapper, no prototype-ordering war with Stealthy or Vision 5e,
      and no chance of an automation query altering the GM's screen. If we ever *do* need to affect
      rendering, Vision 5e's maintainer gave the recipe in their issue #77: wrap
      `CONFIG.Canvas.detectionModes.<id>.prototype._canDetect` per mode in a `setup` hook — never
      `DetectionMode.prototype._canDetect`, which Vision 5e's subclasses override without calling super.
    - **Only a declared hider is contested.** An ordinary walking player is spotted exactly as before.
      State comes from the first source that answers: Stealthy's `window.stealthy.getBankedStealth(token)`
      (returns `undefined` when not hiding — its author's documented integration surface, and there is no
      `game.modules.get("stealthy").api`), Perceptive's `flags.perceptive.PPDCFlag` (`-1` means
      "impossible"), our own `flags.noodlr.stealth`, then dnd5e's inert `hiding` status honoured with
      passive Stealth. Their modules outrank our flag on purpose: when the two disagree the GM should be
      able to trust the UI in front of them. This is the entire integration — no dependency, no patching.
    - **Passive Perception versus a static DC, never a re-roll.** A six-second poll that rolled each
      sweep would eventually spot anyone by luck, which is a worse rule than either edition's. Ties go to
      the spotter: 2024 makes the Stealth total the DC for a Perception check, and a check meets its DC
      on equal. 2014's letter wants an *active* check by a creature that searches; passive-vs-DC is the
      universal convention and we use it under both rulesets deliberately.
    - **Capture via `createChatMessage`, not `dnd5e.rollSkillV2`.** The hook fires only on the rolling
      client, so every client would race to write the flag and only some would have permission. The chat
      hook fires everywhere, letting the primary GM be the single writer. Message shape (verified):
      `flags.dnd5e.roll = {skillId: "ste", type: "skill"}`, total at `rolls[0].total`. Speaker matching
      must prefer `speaker.token` and only fall back to `speaker.actor` for linked actors — every
      unlinked goblin shares one actor id. Hook-name trivia if we ever switch: in dnd5e 5.x *both*
      `dnd5e.rollSkill` and `dnd5e.rollSkillV2` fire with the same `(rolls, {ability, skill, subject})`
      shape, so listening to both double-handles every roll.
    - **Never silent.** A stale hidden state suppressing every encounter forever is this feature's most
      likely failure, and it looks identical to the feature being broken. Each spotter/target pairing
      logs its suppression once, hiding clears on an attack roll or a verbally-cast spell and on combat
      end, and `api.surveyPerception()` dumps the whole matrix with distances, detection modes, passive
      Perception and each verdict.
    - **Concealment is only checked on the fallback path.** When real detection modes run, core already
      enforces invisibility and burrowing in its own `_canDetect`; doing it again would disagree with the
      screen. The stat-block fallback bypasses all of that, so invisibility and the Ethereal Plane are
      applied by hand there. Sense ranges come from Vision 5e's `actor.detectionModes` when present — a
      plain `Record<modeId, range>` computed for every actor *regardless of `sight.enabled`*, which makes
      it strictly better than reading the sheet — and from `senses.ranges` otherwise.
    - **Beyond mundane hiding, and the one deliberate breach of Principle 1 (2026-08-04, user's list).**
      Invisibility, Fog Cloud, Darkness, Nondetection, Pass Without Trace, the illusion spells, Mask of
      the Wild, Nature's Veil and friends are recognised BY NAME from a table in
      `combat/systems/dnd5e-concealment.ts` — the module's SECOND and last game-system-specific file,
      after `dnd5e-rewards.ts`. Rules-as-data, not branches: `auto/stealth.ts` never learns a spell name.
      The two sides meet through a small abstract capability vocabulary — `truesight`, `seeInvisible`,
      `blindsight`, `tremorsense`, `devilsSight`, `etherealSight`, `detectMagic`, `divination`,
      `hearing` — where a concealment declares what `pierced`s it and a sense declares what it `grants`.
      **To port to another system:** write a sibling file exporting the same three functions
      (`concealmentsOn`, `detectorsOn`, `sheetSenses`) gated on its own `game.system.id`, and switch on
      it in `stealth.ts`. A system without invisibility simply never emits `seeInvisible` and the engine
      is unchanged. Name matching is not laziness: Foundry stores no machine-readable "this conceals"
      marker and dnd5e's conditions cover only `invisible`, so the name is the only signal that exists.
      It fails safe — an unrecognised effect does nothing, exactly as before the table existed.
    - **Concealment placed in the world, not worn (2026-08-04, user's correction).** `auto/screens.ts`.
      A party does not cast Fog Cloud on itself — it drops the fog, the Darkness sphere or the illusory
      hedge BETWEEN itself and the guard, so nothing is ever applied to the hider and an effects-only
      model misses the common case entirely. Screens are found geometrically: walk the line between the
      two token centres at half a grid square (capped at 80 samples) and test containment against
      MeasuredTemplates, Regions, and AmbientLights configured as darkness sources. Each is absolute
      until pierced, so a watcher must get past the interposed thing before it has any chance at what is
      behind it. **Worn and interposed are both real and the screens table is checked BOTH ways**
      (user's correction, 2026-08-05): a fog bank is usually placed, but Darkness cast on oneself is the
      canonical Devil's Sight warlock build — they walk the battlefield inside it, seeing out perfectly
      while the guard still has to pierce it. That renders as light emitted by the TOKEN, which the
      ambient-light layer never sees, so token lights with `light.negative` are scanned too; and when a
      module applies it as an effect instead, the worn check catches it. The sampled line includes both
      endpoints, so a creature standing in its own darkness is found exactly like one standing behind
      someone else's. **Naming is the hard part, not the geometry:** Foundry records nothing on a template
      about which spell placed it beyond an origin link that has moved across dnd5e versions and may now
      point at an Activity rather than an Item, so several paths are tried and an unresolvable name means
      the screen is ignored — the correct failure, since an unrecognised template must not start blocking
      sight. Not modelled: the Study action to disbelieve an illusion, which is a player's declared action
      and not something a six-second poll should perform on an NPC's behalf.
    - **Three rules encoded there that are easy to get wrong.** Nondetection is applied to the WATCHER,
      not the hider: it conceals nobody, it blinds the diviner. It removes ONLY capabilities that came
      from a Divination spell (`divined`, tracked separately by `detectorsOn`) — a demon's innate
      truesight is its own eyes and survives, while True Seeing, See Invisibility, Detect Magic and
      Locate Creature do not. Glitterdust and Faerie Fire also survive, being evocations that coat a
      creature in light rather than scry for it. Magical Darkness is deliberately not beaten by
      darkvision. And `trait` versus
      `effect` is a correctness distinction — an always-on trait (Mask of the Wild, Feral Senses, a
      wolf's Keen Hearing) is matched against items, an activated ability (Nature's Veil, One with
      Shadows) only against active effects, or every ranger would be permanently invisible.
    - **Not modelled, deliberately:** the 2024 prerequisites for Hide (Heavily Obscured or ¾ cover, and
      out of all enemy line of sight), size, and lighting-based Perception modifiers. Also the wild-shaped
      flea: no mechanical hook exists for "this shape is unremarkable", and that stays the GM's call.
  - **Perception is one-way, and shouting has a range (2026-08-04, user's spec).** Only a hostile
    creature spotting a player token ever starts a fight; nothing tests a player as the spotter, because
    a party that chose to sneak has chosen not to fight and opening combat on the players' own eyeballs
    would make stealth impossible. Recruitment is capped by `getEngageRadius()` (default 30, scene units,
    configurable): only hostiles within that distance of the SPOTTER join, so one sentry cannot pull a
    whole dungeon. Measured with elevation, and deliberately through walls — it models a shout. The party
    is deliberately NOT radius-limited: adventurers arrive together, and a scout spotted ahead of the
    marching order should not be left fighting alone.
  - **Sweeping does not stop when the fight starts (2026-08-05, user's report).** The radius cap has a
    necessary consequence: creatures out of earshot legitimately miss the opening, and they must be able
    to arrive later or they never arrive at all — a hostile outside the original radius was shot at over
    several rounds and the tracker ignored it. So sweeps continue during combat, restricted to hostiles
    not already enlisted, and a hit routes to `reinforce()` instead of `engage()`: add the newcomer plus
    whoever IT can shout to, `rollNPC()` (which rolls only the unrolled, leaving existing places intact),
    announce, done — never `startCombat()` again. Two entry points, because perception is not the only
    way into a fight: **being hurt joins you regardless of what you saw**, on `preUpdateActor` (not
    `updateActor` — only a DROP counts and the old value is gone afterwards), matching the victim by
    `actor.token.id` because an unlinked token's synthetic actor reports the shared BASE actor id.
    Sweeps still stand down for a combat that exists but has not started: that is someone mid-setup, and
    usually our own initiative wait.
  - **A turn order is not real until everyone has a number (2026-08-04, from a live test).** Rolling the
    monsters and calling `startCombat()` in the same breath put a monster at turn zero of a provisional
    order and automation played the whole round: the player was unconscious before ever rolling. Two
    independent guards now, and both are wanted. `perception.ts` posts the "roll for initiative" call,
    then holds up to `INITIATIVE_WAIT_MS` (60 s, polled once a second) for `initiativeSettled()` before
    `startCombat()`; on expiry it `rollAll()`s the stragglers and says so in chat, because an absent
    player must not be able to freeze an encounter. `hooks.ts` `takeTurn()` independently refuses to play
    any turn while a non-defeated combatant has no initiative, which also covers a combat the GM began by
    hand, and picks the fight back up from an `updateCombatant` hook the moment the last straggler rolls
    (guarded by a `combat:round:combatant` token so the two entry points cannot both play the same turn).
    Defeated combatants are excluded from the check so a corpse cannot deadlock the fight.
  - **Movement is not just walking (2026-08-04).** `combat/auto/locomotion.ts` reads every mode on the
    sheet and is the only place allowed to decide which one a creature uses. Two rules encoded there,
    both deliberate: flight wins over walking whenever it is faster (a dragon does not jog), while swim,
    burrow and climb are last resorts for creatures with nothing else, because Foundry models no terrain
    types and choosing "swim" for a land creature crossing a dungeon floor would be inventing a rule.
    The chosen mode sets the movement BUDGET as well as the action passed to `move()` — reading walk
    speed alone gave a wyvern 20 ft instead of 80 and gave aquatic monsters 0.
  - **Let core do the cost accounting.** `moveTo` passes `maxCost: budget` rather than `ignoreCost: true`.
    The old flag was a quiet rules violation: difficult terrain costs double, so 30 ft of movement buys
    15 ft of bog, and core already knows the multiplier for every movement action — including that a
    flyer pays nothing for the bog. Do not reintroduce `ignoreCost` to "fix" a short move.
  - **Reach is three-dimensional.** `BoardActor.elevation` exists and the planner measures separation as
    `hypot(horizontal, rise)`. A creature that can neither fly nor climb is not offered a melee option
    against something above it, which is what stopped ground troops from walking hopefully at a hovering
    caster and burning the turn. Horizontal-only measurement remains elsewhere (kiting, cover) on purpose.
  - `api.testMove()` (`combat/auto/diagnose.ts`) is the ground truth when this recurs: it really moves the
    selected token one square, escalating walls-enforced → walls-ignored → `displace` → `noHook`, reports
    core's answer at each stage, and restores the position. Whichever attempt first succeeds names the
    cause without any inference.
- **Observe the world, don't infer it.** `api.surveyActions({ saveToFile: true })` censuses every NPC
  sheet in the world — activity types, activation types, range units, flag namespaces, spell methods,
  language shapes, and one worked example per activity type. When a data shape is in question, run it
  before writing code against a guess. Both v0.4.22 and v0.4.23 shipped bugs that this would have caught
  in seconds (user's suggestion, 2026-08-03: "we can map whatever you need dynamically from within the
  running world itself").
- **Probe Foundry globals lazily, one at a time.** Building an array of fallback candidates evaluates
  every entry, and merely *touching* a deprecated global (`ClockwiseSweepPolygon`) emits a console
  warning even when the modern namespace already answered. `src/combat/auto/positioning.ts` stores
  thunks and resolves them in order for exactly this reason.
- **Secrecy travels with the turn, never with the UI.** "Hide from players" is one-shot: the checkbox clears
  once a prompt is accepted (a sticky box silently muted the mirrored text *and* the broadcast audio for the
  rest of the session). Consequently, anything that re-runs a turn must pass the original turn's `hidden`
  flag rather than re-reading the checkbox — Retry did the latter and would have regenerated a GM-only reply
  in full view of the table (v0.4.16). Hidden turns are badged **GM ONLY** and use local `speak()`, never
  `speakShared()`, because broadcast audio lands at a predictable unauthenticated URL.

- **The declaration is the status; a Stealth roll is only a number (v0.4.43, 2026-08-07).** Reported from
 play: a rogue who never took the Hide action was never spotted by anything, never triggered an encounter,
 and killed hostiles one at a time while they stood oblivious. Root cause was the trigger, not the contest —
 `stealth.ts` banked a hidden state on ANY `ste` roll appearing in chat, with no prerequisite and no expiry,
 and the flag persisted in the world save. **The bug was inherited:** Stealthy's README says outright
 *"Rolling a Stealth skill check will apply the Hidden effect"*, Perceptive does the same on
 `flags.dnd5e.roll.skillId === "ste"`, and neither clears on an attack. They survive it because midi's
 `removeHiddenInvis` (default ON, `Workflow.ts:2239`, `utils.ts:4389`) toggles the `hidden`/`hiding`
 statuses off after every attack roll — and it had never heard of `flags.noodlr.stealth`. Only Chris's
 Premades gates on the Hide action. Full comparison: `_research\_audit\stealth-modules-comparison.md`;
 rules audit: `_research\_audit\stealth-hide-raw.md`.
 - **`hidingState()` must not read our banked flag unless the `hiding` status is present.** That single
 ordering is what makes a stale flag structurally incapable of hiding anyone, and it means every way of
 removing the status — token HUD, midi, an effect expiring, our own reveal — ends the state without
 knowing we exist. Do not "optimise" it by reading the flag first.
 - **Reveal off `dnd5e.rollAttack`, never a chat message.** Midi merges the attack into its own card and
 posts no separate attack message, so the old `createChatMessage` listener waited for something that
 never came. The system hook fires inside midi's flow (midi itself registers
 `Hooks.once("dnd5e.rollAttack")` at `AttackActivity.ts:446` to catch the ammo update). It fires only on
 the rolling client, which is fine and is the point: a creature giving itself away is always acted by
 someone who owns it, so that client can always write. Consequence — **`registerStealthWatch()` must be
 registered on every client, not inside the GM-only block.** Note `enrichers.mjs:281` fires the same hook
 with `subject: null` for a bare `[[/attack]]`, and both `rollAttack` and `rollAttackV2` fire, so listen
 to one and guard the subject.
 - **A missed attack DOES reveal you, in both editions** — the hit-only rule the user remembered is
 **Skulker's Sniper** benefit (2024 PHB p. 208), not a house rule, so it is a feat lookup rather than a
 setting. Skulker ships in NO dnd5e compendium (PHB, not SRD), so there is no authored identifier to
 trust: `dnd5e-stealth.ts` tries `flags.noodlr.sniper`, then `system.identifier`, then the item name.
 Its Fog of War (advantage on Hide in combat) is honoured too; its Blindsight 10 needs nothing, because
 `sheetSenses` already reads the range off the sheet.
 - Sniper is the only reason we ever need hit-or-miss, and `attackConnected()` is deliberately NOT
 `forced.ts`'s `hitTargets`: an empty target list means "nobody" there and "no idea" here. **Unknown
 reveals.** Crit and fumble are answered before the AC loop, or a single unreadable AC would discard the
 one fact the die already settled.
 - **We do NOT apply the `invisible` condition for mundane hiding**, even though 2024 Hide grants the
 Invisible condition. Perceptive does, and it makes hiding indistinguishable from magical invisibility to
 every sense-aware module; dnd5e's own content shares our instinct and stamps only `hiding`.
 - **`auto/hide.ts` exists because dnd5e ships no Hide action** outside Cunning Action, Nimble Escape and
 Shadow Stealth. With the status as the declaration, no button would mean most of the party can never
 hide. Cover is estimated by counting blocked corner rays (3 of 4 = three-quarters); that is an
 approximation of a rule 5e states as a fraction of the target obscured, it is what every cover module
 does, and it is stated in the file so nobody mistakes it for exact. Prerequisites are evaluated
 per-watcher, because every term in the rule is relative to an observer.
 - **Invisibility's break is separate from the hiding clear, deliberately.** Midi couples them under one
 rule and therefore deletes Greater Invisibility on the first attack — the entire difference between a
 second-level spell and a fourth-level one. `auto/invisibility.ts` skips concentration effects
 (`actor.concentration.effects.has(effect)`, not the localised "Concentrating:" prefix) so a wizard who
 made someone else invisible does not lose their own spell by swinging.
 - **Surprise was free capability.** dnd5e already lists `surprised` in
 `CONFIG.DND5E.conditionEffects.initiativeDisadvantage` and reads it during initiative prep; it just never
 decides who is surprised. We do, using the literal test (a joining hostile that cannot perceive one
 party member), applied before `rollNPC()` since it modifies the roll. Players are never marked —
 perception is one-way by design, so we have no honest basis for it.
 - The damage-starts-a-fight path shares the sweep's `sweeping` guard: `engage()` holds for up to 60 s
 waiting on initiative, so without it a second casualty during that wait creates a second Combat.

- **Nobody counts actions, so we do (v0.4.38, 2026-08-05).** Verified in dnd5e 5.3.3 source, not assumed:
  `CONFIG.DND5E.activityActivationTypes` gives each activation type an optional `consume` property naming
  an actor resource pool, and exactly three declare one — `legendary`, `mythic` and `crew`. `action`,
  `bonus` and `reaction` carry a label, a header and a group and nothing else, which means the whole
  consumption block at `mixin.mjs:540` (gated on `activationConfig?.consume`) never runs for them and the
  system's own "not enough actions" warnings are unreachable. No per-turn counter exists anywhere in the
  data model. This is intentional — the system's JSDoc says *"Currently only handles legendary actions"*
  and "Action tracking" is an unshipped 5.0.0 roadmap item — and no module fills the gap either: midi's
  `enforceReactions`/`enforceBonusActions` default to `"none"`, there is no `enforceActions` at all, and
  even when enabled midi asks rather than blocks. Full rules reference and gap audit in
  [`docs/action-economy-2024.md`](docs/action-economy-2024.md). Load-bearing details:
  - **The veto is `dnd5e.preUseActivity`, not a patch.** It fires before the usage dialog and before any
    chat card, and returning false cancels cleanly. midi's activity `use()` calls `super.use()`, so the
    same hook fires under midi as without it. Do not reach for libWrapper here.
  - **Do NOT add `consume: { property }` to `activityActivationTypes.action` to borrow the system's
    legendary-action enforcement.** It is tempting and it is wrong: it mutates shared config for every
    other module in the world and would double-count against anything else doing the same.
  - **The budget lives on the actor as a flag, not in a Map.** The hook fires on whichever client used
    the item, so a player's browser must be able to read and write its own budget; GM-side memory is
    invisible to exactly the person it needs to stop. Writing through `actor.setFlag` also gets unlinked
    tokens right for free, because it lands in that token's ActorDelta.
  - **Nothing is ever reset.** A tally carries the stamp of the turn it belongs to, and a stale stamp
    reads as zero. Derived, not stored, so every client computes the same answer with no write and no
    race. The stamp is the round in which the creature's own turn most recently began — which is what
    "refreshes at the start of your turn" means, and what a naive per-round reset gets wrong for a
    reaction spent earlier in the round than the creature's own turn.
  - **Actions and attacks are separate currencies.** One Action buys several attacks, so counting attack
    rolls as actions stops a fighter's second swing — the single most common thing in the game. Actions
    used is `nonAttackActions + ceil(attacks / attacksPerAction)`. `attacksPerAction` is *read*, not
    guessed: dnd5e class features carry stable `system.identifier` values (`extra-attack`,
    `two-extra-attacks`, `three-extra-attacks`). Monsters have no such field, so Multiattack prose is
    parsed for a number word and defaults to **2** when unparseable — biased generous on purpose, since
    blocking a legal attack is a bug report while allowing one too many is merely a bad turn.
  - **Automated creatures are hard-blocked; players are configurable; the GM is never blocked, only
    asked.** The player default is "ask, then log the answer publicly" rather than a hard block, because
    the rules break their own general case constantly — Haste grants a whole extra action — and a system
    with no way to say yes makes those features unplayable (user, 2026-08-05). Asking privately and
    answering publicly is what keeps the override usable without making it abusable.
  - **Effects grant slots via flags, not via code changes here:** `flags.noodlr.extraAction`,
    `extraBonus`, `extraReaction` (AE mode Add) and `flags.noodlr.attacksPerAction` (Override).
  - `execute.ts` asks the ledger *before* attempting, because a hook veto cancels without throwing and
    the attempt loop would otherwise report a swing that never happened.
  - Diagnostics: `api.surveyEconomy()`.

- **Nobody enforces Speed either (v0.4.39, 2026-08-05).** Same shape of finding as the action economy, and
  verified the same way. Core Foundry v13+ *does* have a real movement model — `TokenDocument#movementHistory`
  records every waypoint crossed during a turn, `Combat#_clearMovementHistoryOnStartTurn` resets it, and each
  waypoint carries a terrain-adjusted `cost` — but core has no concept of a creature's Speed and never
  compares the two. dnd5e supplies the number and spends it entirely on ruler colour (`TokenRuler5e` in
  `module/canvas/ruler.mjs`: green under Speed, amber under double, red beyond). `movementAutomation` sounds
  like the setting for this and is not — it governs movement *cost* (difficult terrain, climb/swim without
  the matching speed, crawl, token blocking), never a budget. midi-qol has exactly one `moveToken` listener
  and it expires DAE `isMoved` effects. So the ruler turns red and the token keeps going. Load-bearing:
  - **Truncate on the drag, veto everywhere else.** `Token#_getDragConstrainOptions` can carry `maxCost`
    (added in core **14.357** — it does not exist in v13, where unknown keys are silently destructured
    away), and core then discards waypoints past the budget inside `constrainMovementPath`, so the token
    stops at the line exactly as it stops at a wall. `preMoveToken` is the backstop for arrow keys: it can
    reject a move outright but **cannot shorten one** — waypoints are deep-frozen and only `autoRotate`
    and `showRuler` are writable.
  - **Budget the whole turn, not the remainder.** Core's docs do not say whether `maxCost` is measured
    against the proposed path alone or the path plus the history already recorded this turn, and the answer
    decides whether a second drag in one turn starts from zero. Passing the whole-turn allowance is correct
    under the "history counts" reading and merely lets the backstop do the work under the other; passing
    the remainder would silently halve the budget under the first. Do not "simplify" this without testing.
  - **Dash is charged, not asked.** A creature with something left to spend may drag past its Speed; the
    moment it does, `moveToken` charges the Dash and posts it to chat. The dash count lives in the action
    ledger's `Tally`, not beside the movement code, so it resets on the same lazy turn stamp as the slot
    that paid for it.
  - **Dash is NOT always an Action.** Corrected before release (user, 2026-08-06). A Rogue with Cunning
    Action and a Monk with Step of the Wind Dash as a **bonus action, for free**, and Expeditious Retreat
    grants the same to Sorcerers, Wizards and Warlocks while it runs. Charging the Action in those cases
    silently deletes the class feature, on the most routine thing a rogue does all night. `systems/dnd5e-dash.ts`
    reads it from `system.identifier` (`cunning-action`, `monks-focus`, `step-of-the-wind`, `fleet-step`,
    `ki`) — the same stable-identifier mechanism as Extra Attack — falling back to item and effect names,
    with `flags.noodlr.bonusDash` as the escape hatch for anything unlisted. Expeditious Retreat is
    `effectOnly`, since owning the spell grants nothing: dnd5e names its concentration effect
    `"Concentrating: <spell>"`, so the SPELL name is what gets matched, never the localised prefix.
    **The bonus action is preferred whenever it is available**, because that is what those features are
    for; the Action is the fallback once the bonus action is gone. If both are free the player is not
    asked, which is a deliberate call — it is a legal choice between two resources rather than a rule
    violation, the bonus action is right in nearly every case, and a dialog every time a rogue runs would
    be worse than an occasional undo.
  - **Two Dashes in one turn is legal and supported.** A rogue may spend its full movement, its bonus
    action on Cunning Action, and its action on a second Dash, for three times its Speed (user,
    2026-08-06). `chargeDash` therefore LOOPS, re-reading the budget after each charge so the allowance
    grows as the debt settles — charging once per move event would leave the second Dash unpaid when both
    are crossed in a single drag. The drag itself is only ever offered ONE Dash of headroom at a time,
    though: triple Speed stays reachable across successive drags, but a mis-drag cannot spend both slots
    before the player notices. `takeDash` takes the slot from its caller so the ledger stays agnostic
    about which resource a given system thinks Dash costs.
  - **Subclass `CONFIG.Token.objectClass` at `setup`, not `init`** — dnd5e installs `Token5e` at `init`, and
    extending whatever is there keeps its `ignoreTokens` handling. Registered from `init` on **every**
    client, not from the GM-only `ready` block: the person being constrained is the player.
  - Exempt: the GM (staging is not cheating), Noodlr's own automation (it budgets before it steps), and
    anyone moving outside their own turn. Diagnostics: `api.surveyMovement()`.

- **Ammunition is not a consumption type (fixed v0.4.39).** `activityAvailable` looked for a consumption
  target of `type: "ammunition"`, which does not exist: dnd5e 5.3.3 has exactly six consumption types
  (`activityUses`, `itemUses`, `material`, `hitDice`, `spellSlots`, `attribute` — `config.mjs`
  `DND5E.activityConsumptionTypes`). Ammunition is a property of the **weapon**, resolved against the
  actor's stock at roll time through `item.system.ammunitionOptions`, a getter that already filters the
  actor's consumables to the right subtype and marks empty stacks `disabled`. The dead check meant an
  archer with an empty quiver looked fully armed, so the planner picked the bow, the use failed, and the
  creature spent its turn doing nothing rather than drawing the sword on its own sheet. Ask the getter;
  do not reimplement the filter.

- **Standing in fire is not weather (v0.4.39).** The planner had no notion that one square could be worse
  than another, so a hostile burned to death inside an Incendiary Cloud without ever trying to leave.
  `auto/hazards.ts` tests the creature's centre against every placed template and region using the same
  containment primitives as the sight-screen test, and rings outward for the nearest clear, walkable,
  unoccupied point. **Which areas hurt is not a geometric question** — a template knows its radius and
  nothing about what is inside it — so that judgement is a name table in `systems/dnd5e-hazards.ts`,
  quarantined exactly like the concealment table. Persistent areas only: an instantaneous Fireball leaves
  its template on the canvas long after the fire is gone, and a creature fleeing yesterday's explosion
  looks broken. Gated on the new tier-2 `understandsHazards`, so mindless things still burn where they
  stand.

- **Nobody implements forced movement at all (v0.4.40, 2026-08-06).** The third finding of this shape, and
  the starkest. Verified against dnd5e 5.3.3, core v13.351, midi-qol v14, Gambit's Premades and Chris's
  Premades before a line was written.
  - **dnd5e automates none of it.** No occurrence of `shove|knockback|displace|forced movement` anywhere in
    the 421 files under `module/`, and every one of the ~60 hits for `push` is `Array.prototype.push`. **No
    activity type has a schema field that could express "move the target N feet"** — the concept is absent,
    so no amount of content authoring could represent one. The only code in the system that moves a token
    is a Region Behavior that rotates a scene area for carousel rooms, and the system registers no movement
    hook listeners.
  - **Weapon Mastery is presentational.** `CONFIG.DND5E.weaponMasteries` is eight `{label, reference}`
    pairs; each key as a whole word appears nowhere outside the config files. The diagnostic case is
    Topple, which could trivially have been an AE applying `prone` — that machinery demonstrably works
    elsewhere in the same content — and the quarterstaff YAML contains zero occurrences of "prone".
    Correction to a common list: **Push weapons are Pike, Warhammer, Heavy Crossbow and Greatclub**; the
    Greatsword is Graze.
  - **In the content, every distance is prose,** and the pattern is consistent: when a rule pushes *and*
    imposes a condition, the condition gets a real Active Effect and the push is left in the English.
    Open Hand Technique is the specimen — three sibling activities, Addle and Topple with real effects,
    Push with `effects: []` and no distance anywhere, and an authoring note that lists the two and omits
    the third. Unarmed Strike models the Shove *save* correctly (`ability: [str, dex]`,
    `dc.calculation: str` → 8 + Str + proficiency) and the knock-prone branch; the 5 feet does not exist.
    The closest thing to a modelled distance in the whole set is Bigby's `[[5 + 5 * @flags.dnd5e.summon.mod]]`,
    inside `description.chatFlavor` — a display string.
  - **Nor does anything else.** midi ships `MidiQOL.moveToken` / `moveTokenAwayFromPoint` and calls them
    from nothing — macro API only, no game mechanic. Gambit's covers ~10 items (Shield Master 2024 the only
    mainstream one) with a real helper that iterates `canvas.grid.measurePath` for diagonal correctness and
    marches a ray in tenth-of-a-square steps on wall contact. Chris's covers two, both delegating to the
    separate `cat` module. Custom D&D 5e ships a Move *activity* — good, but an authoring tool: hand-built
    per item, human picks the destination, no rules knowledge. **Nobody handles a hazardous landing**
    (Gambit's prints a chat line asking the GM to fix it), scene edges, or elevation.
  - **Core standardised the concept even though nothing uses it.** v12's `forced` flag was replaced 1:1 by
    `action: "displace"` — core's own deprecation shim returns `action === "displace"` for the old
    property. So displacement is the platform's official "involuntary".
  - **The architecture that follows: ask with `walk`, move with a zero-cost action.** `displace` cannot be
    softened — `#initializeMovementActions` (`client/game.mjs:840-852`) *validates* that it teleports,
    is unmeasured, has `walls: null`, then **overwrites** its animation and cost functions — so a shove
    executed as `displace` would go through walls and snap instantly. Instead `constrainMovementPath` is
    asked where a *walked* path would stop (pure, writes nothing) and the move is committed to that
    already-legal point as `noodlrForce`. Same split CAT arrived at.
  - **Registering a movement action: `init` only, and only `label` + `icon` are required.**
    `#initializeMovementActions` defaults every other field (including `deriveTerrainDifficulty = null`
    and `getCostFunction`) and then **deep-freezes the registry inside `setupGame()`, before the `setup`
    hook** — so registering at `setup` is a silent no-op, not an error. It throws on a missing label or
    icon. `registerForceAction()` therefore runs from `init` on every client and everything downstream
    feature-detects the key, falling back to `displace`. The custom key travels on the wire and core's
    animation path looks it up without a fallback, which is safe only because Foundry activates modules
    world-wide rather than per client.
  - **Coordinate systems are the live bug risk.** `constrainMovementPath` takes and returns **top-left**
    waypoints; every measurement in `auto/` is from the **centre**. `shove.ts` converts at that boundary
    (`toCorner`/`toCentre`) — conflating them puts a medium creature half a square out and a Huge one two
    squares out, and it is invisible in a code review. An empty returned path means "cannot leave the
    square", which must not be confused with the unreadable-API case that retries with our own ray.
  - **Two checks are deliberately repeated after core answers:** core's boundary test uses the PADDED
    canvas rather than the visible map, and creature blocking belongs to the *system* — dnd5e implements it
    properly in its `constrainMovementPath` override (correct multi-space footprints and elevation) but
    **disables itself unless `game.settings.get("dnd5e", "movementAutomation") === "full"`**, so on many
    tables it never runs.
  - **Detection has to come off chat messages, not roll hooks.** `dnd5e.rollAttack` / `rollSavingThrow` are
    ordinary local hooks that fire only on the rolling client, so a player's attack is invisible to the GM
    through them. The GM-side readings, verified in source: attack = `flags.dnd5e.roll.type === "attack"`
    with `flags.dnd5e.targets` (`{name, img, uuid, ac}`) and `rolls[0]` a `D20Roll` whose `options.target`,
    `isCritical` and `isFumble` all survive deserialisation; hit/miss is **stored nowhere** and must be
    recomputed as dnd5e's renderer does. Save = `roll.type === "save"` with `roll.ability`, DC at
    `rolls[0].options.target`, and — crucially — `flags.dnd5e.originatingMessage`, the usage card's id,
    which is the ONLY link back to the activity that demanded the save. Under midi read
    `flags["midi-qol"].hitTargetUuids` / `.failedSaveUuids` off `updateChatMessage` instead: those are
    **token** uuids (better than dnd5e's actor uuids), written unconditionally by `displayAttackRoll` /
    `displaySaves` and not subject to midi's `SaveToChatCard` setting. Select the path by **presence of the
    flags, not presence of the module** — midi can have its automation switched off.
  - **Known-heuristic list, logged rather than asserted:** a null recorded AC conflates total cover with an
    unreadable sheet and is skipped (dnd5e's own formula scores it as a *hit*, via `total < null` coercing
    to `total < 0` — we deliberately diverge); anything rolled from a sheet has no `originatingMessage` and
    is unattributable; `flags.dnd5e.targets` keys by actor uuid, so two linked tokens of one actor
    **collapse into a single entry** before we see it; `BasicRoll#isFailure` returns `false` when there is
    no DC, so absence must be tested first; concentration saves are byte-identical to ordinary saves.
  - **Shove is automatable only because the conditions disambiguate it after the fact.** 2024 folds grapple
    and shove into one save activity, so a failed save cannot say which the attacker chose — but `grappled`
    means grapple, `prone` means the knockdown branch, and neither means the 5-foot push. Hence
    `unlessStatus` and a 700 ms settle before reading.
  - **Applied automatically with an undo, not by prompting** (user, 2026-08-06). Most of these rules are
    permissive ("you *can* push"), so a confirmation on every hit would cost more table time than the
    occasional reversal; every card carries "Put it back" and `api.undoForcedMovement()` reverses the fight.
    **One rule per event only** — mastery, then on-hit, then damage-type — because stacking two is a rules
    interpretation rather than an automation. Push beats pull when a warlock owns both invocations.
  - The application ledger is keyed on the **activation** (message id), not the turn: a card midi revises
    several times cannot push twice for one hit, while a spell cast twice in a turn still pushes twice, and
    a GM testing out of combat is not permanently blocked. Once-per-turn riders are simply not enforced
    outside combat, since there are no turns.
  - Exempt from opportunity attacks and from the Speed budget by construction: `isForcedMovement()` in
    `shove.ts` is the single predicate both `reactions.ts` and the movement cap consult, and it recognises
    `displace` as well as our own action so a shove from *any* module using core's idiom is covered.
  - Stands down on `activity.flags.cat.macros` (Chris's) or `item.flags["gambits-premades"].gpsUuid`
    (Gambit's) when those modules are active. Diagnostics: `api.surveyForced()`; manual use:
    `api.push(feet)` / `api.pull(feet)`.
  - **Not implemented, deliberately:** rules that only knock prone (Destructive Wave, Tidal Wave, the Topple
    mastery) are conditions rather than movement; Vortex Warp needs a human-chosen destination; Antilife
    Shell pushes continuously as its caster walks; the grappler's own halved Speed belongs to the movement
    budget. Core has no concept of falling, so what happens when Reverse Gravity ends is the table's call.

## Configuration, not code: what to tell a GM

Three reported problems were world configuration rather than module bugs. Recorded because they will be
reported again.

- **Reactions, concentration and saves all prompting the GM** is midi's `playerForActor()`, and the cause is
  narrower than "wrong ownership level". Core resolves ownership through the default row —
  `getUserLevel` is `ownership[user.id] ?? ownership.default ?? NONE` (`common/abstract/document.mjs:383-392`)
  — so **"All Players: Owner" genuinely does grant every player Owner rights, and is not a broken setting.**
  midi simply cannot read it: `playerForActor` does raw `ownership[userId] === 3` lookups and never consults
  `default`, and Foundry's ownership dialog *deletes* the per-user entry for anyone left on "Default"
  (`client/applications/apps/document-ownership.mjs:150-155`) rather than writing `-1`, so there is nothing
  to match and it falls through to `preferredActiveGM()`. **Two things satisfy it, either alone:** an
  explicit Owner row for that player, or the character being assigned to the user in User Configuration
  (`user.character`), which midi checks first. A world with "All Players: Owner" and no character assignments
  hits neither, which is exactly what the GM had. Assistant GMs never match at all, because every lookup
  searches `game.users.players`, which excludes GMs by definition. Note also that midi's second check finds
  the *first* active player holding an explicit Owner row, so each character should have exactly one.
  Separately, midi's `doConcentrationCheck` defaults to `"chat"`, which **auto-rolls** the save rather than
  offering it; `"chatOnly"` hands it back to the player.
- **Eldritch Blast beams stuck on a corpse.** dnd5e 5.3.3 does not model beams at all — the SRD item is one
  attack activity with one 1d10 part and `target.affects.count: 1`; multiple beams exist only in the prose,
  and the expectation is one press per beam. The lock-on is midi's `untargetDeadTokens`, which reads
  `hp.value <= 0` 500 ms after the workflow ends, so with manual damage application the corpse still has
  positive HP and is never released. Both `AutoRemoveTargets` and `TargetConfirmation` are **client**-scoped,
  so the GM's settings never reach the player's browser. Per-beam retargeting has been an open dnd5e feature
  request since 2021 ([#1067](https://github.com/foundryvtt/dnd5e/issues/1067), closed unimplemented).

## Open decisions / risks

- **OPEN BUG — melee-only hostiles still move oddly (reported 2026-08-05, v0.4.36 test).** The user saw
  "unusual movement behaviour" from melee-only creatures during an otherwise clean encounter and had no
  time to characterise it. Nothing narrower is known yet: not whether they stall, overshoot, path badly
  or refuse to close. Start by having them run a fight with `api.explainTurn()` on a misbehaving creature
  and `api.testMove()` on its token, since between them those report the planner's scoring and every
  stage of what core did with the move. Prime suspects given recent work: `reachableElevation` and the
  3D `separation` check in `planner.attackOptions` (added with locomotion in v0.4.30), and the
  `maxCost: budget` constraint, which silently refuses a path that costs more than the creature's speed
  rather than moving it as far as it can. **New evidence (2026-08-05):** `maxCost` did not exist before
  core 14.357, so on a v13 host that constraint was being silently ignored and the creature had no budget
  at all — worth confirming the host version before chasing anything subtler.
- Lorebook storage shape (world-scoped JournalEntry vs module setting vs flat file in world data) — decide in Phase 3.
- Multi-GM/assistant-GM permissions model for Chronicle review and silo resets.
- `noodlr.app` domain not yet acquired/configured; git + releases now hosted on `github.com/gobsmacked1` (see Phase 6 status). Revisit if a self-hosted forge / custom domain is preferred.
- Safety tooling (lines-and-veils / X-card equivalent) is *not* in the DM prompt; decide whether it becomes a module feature or stays a Session-Zero practice.
- **Provider API keys are player-readable — accepted risk (decided 2026-07-31):** provider settings are `scope: "world"`, and Foundry ships every world setting to every connected client, so any player can read the OpenRouter key with one console line (`game.settings.get("noodlr","chat.apiKey")`). TLS is irrelevant here — the player is a legitimate recipient, not an eavesdropper. **Deliberately accepted, not a bug:** the key is a *spend* credential only. The credential that actually gates concealed knowledge (the noodlr-memory shared secret) is `scope: "client"` and never leaves the GM's machine, so the players-bot privilege boundary holds regardless. Mitigation is operational: run the world on a dedicated OpenRouter key with a credit limit and rotate it as players come and go. Do not "fix" this by moving keys to client scope without revisiting the decision.
- **Why the players-bot keeps the GM relay (decided 2026-07-31):** moving the player-side LLM call into the player's browser would *not* remove the round trip, because retrieval cannot move with it — the memory secret is client-scoped, so a player's browser cannot reach noodlr-memory at all. Direct calls would cost two hops (fetch context from GM, then call the provider) instead of one. **Correction (2026-07-31, same day):** the apparent carve-out for player-initiated **media** generation is wrong. Players do not get `FILES_UPLOAD` by default, and every media path ends in `saveMedia` → `FilePicker.upload`; a player's client would generate successfully and then be unable to persist or share the result (see the existing note in `av-gen.ts`: the remote URL needs auth, so a local copy is mandatory). Media is therefore the case where the GM proxy is *most* required, not least. Latent rather than live only because `allowPlayers` defaults to `false` on image/music/video. **The relay should carry everything**; player-initiated media needs a relay of the same shape as `PlayerAskPayload` (which already carries `userId`/`userName`, so speaker context survives).
- **LanceDB single-writer:** noodlr-memory must be the sole writer of `LANCEDB_URI`. The user's Python FastAPI PoC (`/opt/lancedb_app`) against `/opt/lancedb_data` must be stopped/retired before pointing the service there.
- **Memory access is GM-gated (decided 2026-07-23):** the GM is the *only* client that contacts noodlr-memory (all chat is shared, so per-player writeback would just duplicate). `retrieveContext` returns null for non-GM; ingest (push-to-log/chronicle/manage) was already GM-only. The RAG **shared secret is now client-scope** (stored on the GM's machine, never synced to player browsers); `serviceUrl`/`enabled`/tuning stay world-scope. Consequence: player-initiated chat generations run without a memory block — acceptable, and a nudge toward routing AI-DM generation through the GM's client (open question). The memory `serviceUrl` default is still `http://127.0.0.1:3010`, but the intended deployment is `https://<host>/memory` behind nginx (Unix socket; `NOODLR_MEMORY_SOCKET`).
