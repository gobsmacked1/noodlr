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

Status: **complete, tested (9 passing node:test), MIT, v1.0.0, own GitHub repo.**
Standalone Node >= 20 HTTP service; the module talks to it over HTTP only.

What it provides:

- **Per-purpose collections (silos), each independently resettable:** `chat`, `lore`, `rules`, `sheets`, `npc_state`, `factions`, `scenes`, `quests`, `docs`. Rationale: a table recovering from story breakage resets one aspect (e.g. `npc_state`) instead of wiping and re-ingesting the whole world.
- **Pluggable vector backends:** `vectra` (file-based, zero-setup), `chroma`, `qdrant` (env `VECTOR_BACKEND`).
- **Embedding providers:** `openrouter` (default model `perplexity/pplx-embed-v1-4b`), `custom` (any OpenAI-compatible `/v1/embeddings` — Ollama/vLLM/llama.cpp/LM Studio), `transformers` (fully in-process, no server/key), `mock` (offline tests). Local and remote embeddings are both first-class.
- **Prose/table-aware chunker:** roll tables and stat blocks stay atomic (RPG sources are not novels; naive chunking is immersion-breaking). `kind:"event"` docs are atomic.
- **Hybrid retrieval:** dense + BM25 sparse fused by Reciprocal Rank Fusion; re-ranked by `importance` + `recency`; multi-query (Agent Mode) fusion with entity soft-boosting.
- **HTTP API** under `/v1`: `health`, `collections`, `ingest`, `ingest-file`, `insert`, `query` (hybrid + weights + multi-query), `list`, `delete`, `purge`, `purge-all`.
- **Security:** shared-secret header `x-noodlr-secret`, localhost bind by default (HOST 127.0.0.1, PORT 3010, env prefix `NOODLR_MEMORY_*`), filename sanitization, body-size caps. `DEPLOYMENT.md` has the Linux/systemd guide.

How noodlr-main interacts with it (the integration contract):

1. A **RagClient** (thin HTTP wrapper, ~one file) configured from a "Memory (RAG)" settings tab: service URL (default `http://127.0.0.1:3010`), secret, embedding provider/model, hybrid toggle + weights, Agent-Mode toggle.
2. **Deliberate ingestion, not random chance:** the settings tab lists every Foundry compendium (locked or unlocked) with a target-silo picker for forced ingestion; TXT/PDF upload for materials outside the world; push-to-log and chat/journal feeds ingest into `chat` on a timer during sessions.
3. **Retrieval at prompt-assembly time:** before each generation, query relevant silos (scene-aware: `rules` when adjudicating, `npc_state`/`factions` when NPCs are present, etc.) and inject results into the context under a labeled block, budgeted like lorebook entries.
4. **Graceful degradation:** if the service is down, the module still works — it just plays without long-term memory and says so once.
5. Structured events (`kind:"event"` with `importance`/`entities`/`keywords`/`event_type`/`ts`) feed the re-ranker; the Chronicle pipeline (below) is the main producer.

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

### Phase 6 — Packaging & cutover

- README, manifest + release URLs (release scheme: `https://math.secretdoor.app/gobsmacked1/noodlr/releases/download/v<version>/module.json`), version to 1.0.0 at parity.
- New GitHub repo for noodlr-main; wipe the legacy repo; delete `C:\Project\noodlr` locally when no longer consulted.
- Deferred/optional: `noodlr-vtt` external bridge with our own protocol and package — only if a real need emerges.

## Tech stack & conventions

- TypeScript, esbuild bundle to `dist/`; `module.json` id **`noodlr`** (do not install alongside the legacy reference module in the same world).
- Format: prettier (printWidth 100). Validate: `npm run check` (tsc) + build before commit. Small commits at working checkpoints.
- Windows host gotcha: the file-Write tool intermittently emits new files as UTF-16LE — after creating any file, verify the first bytes are UTF-8 and convert if needed. Watch CRLF/LF (.gitattributes) since Foundry servers are often Linux.
- Never store secrets in this file or in module settings defaults.

## Open decisions / risks

- Foundry version target and ApplicationV2 migration status — verify at Phase 0.
- Lorebook storage shape (world-scoped JournalEntry vs module setting vs flat file in world data) — decide in Phase 3.
- Multi-GM/assistant-GM permissions model for Chronicle review and silo resets.
- `noodlr.app` domain not yet acquired/configured; release hosting currently via `math.secretdoor.app`.
- Safety tooling (lines-and-veils / X-card equivalent) is *not* in the DM prompt; decide whether it becomes a module feature or stays a Session-Zero practice.
