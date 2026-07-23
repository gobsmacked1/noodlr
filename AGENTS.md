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
- **Pluggable vector backends:** `lancedb` (embedded Node SDK, **default** as of 2026-07-23), `vectra` (file-based), `qdrant`, `chroma` (env `VECTOR_BACKEND`).
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

- README, manifest + release URLs (release scheme: `https://github.com/gobsmacked1/noodlr/releases/download/v<version>/module.zip`; manifest at `.../releases/latest/download/module.json`), version to 1.0.0 at parity.
- New GitHub repo for noodlr-main; wipe the legacy repo; delete `C:\Project\noodlr` locally when no longer consulted.
- Deferred/optional: `noodlr-vtt` external bridge with our own protocol and package — only if a real need emerges.

## Tech stack & conventions

- TypeScript, esbuild bundle to `dist/`; `module.json` id **`noodlr`** (do not install alongside the legacy reference module in the same world).
- Format: prettier (printWidth 100). Validate: `npm run check` (tsc) + build before commit. Small commits at working checkpoints.
- Windows host gotcha: the file-Write tool intermittently emits new files as UTF-16LE — after creating any file, verify the first bytes are UTF-8 and convert if needed. Watch CRLF/LF (.gitattributes) since Foundry servers are often Linux.
- Never store secrets in this file or in module settings defaults.

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
- **Author's note / post-history / combat reminder**: edited in the settings window (textareas); depth + context budget + chronicle toggle are native settings. Combat reminder auto-swaps into the post-history slot when `game.combat?.started` (computed at assembly time — no hooks needed).
- **Chronicle pipeline** (`prompt/chronicle.ts` + `apps/chronicle-app.ts`): parses `📜 Chronicle:` lines from DM output into a world-scoped review queue; GM promotes to a lorebook entry and/or ingests as a `kind:"event"` memory (importance/entities/ts) into a chosen silo, or dismisses. Capture runs after each assistant turn (toggle `chronicleAutoParse`).
- New settings menus: "Edit Lorebook", "Review Chronicle". API: `openLorebook()`, `openChronicle()`.

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

## Cross-phase note: nothing has been run inside Foundry yet

All six phases are validated only via `tsc --noEmit`, `eslint`, `esbuild`, prettier, a
verbatim-prompt diff, and UTF-8/LF checks — there is no Foundry world in this build env.
First in-app session should smoke-test, in order: module loads + settings tabs render;
chat streams against a real provider; `{{roll:}}` executes; RAG connects + ingests +
retrieves; lorebook/author's-note/post-history inject; Chronicle capture+promote; TTS/
image/push-to-log; combat block + NPC turn. Scene-control button shapes, FormDataExtended,
DialogV2, MediaRecorder cycling, and the socket relay are the highest-risk unverified spots.

## Open decisions / risks

- Lorebook storage shape (world-scoped JournalEntry vs module setting vs flat file in world data) — decide in Phase 3.
- Multi-GM/assistant-GM permissions model for Chronicle review and silo resets.
- `noodlr.app` domain not yet acquired/configured; git + releases now hosted on `github.com/gobsmacked1` (see Phase 6 status). Revisit if a self-hosted forge / custom domain is preferred.
- Safety tooling (lines-and-veils / X-card equivalent) is *not* in the DM prompt; decide whether it becomes a module feature or stays a Session-Zero practice.
- **API-key exposure (deferred hardening):** keys are write-only in the DOM (v0.2.0), but a GM client can still read the raw world setting via console. True isolation would proxy all provider calls through `noodlr-memory` so the browser never holds keys — bigger change; decide if/when worth it.
- **LanceDB single-writer:** noodlr-memory must be the sole writer of `LANCEDB_URI`. The user's Python FastAPI PoC (`/opt/lancedb_app`) against `/opt/lancedb_data` must be stopped/retired before pointing the service there.
- **Memory access is GM-gated (decided 2026-07-23):** the GM is the *only* client that contacts noodlr-memory (all chat is shared, so per-player writeback would just duplicate). `retrieveContext` returns null for non-GM; ingest (push-to-log/chronicle/manage) was already GM-only. The RAG **shared secret is now client-scope** (stored on the GM's machine, never synced to player browsers); `serviceUrl`/`enabled`/tuning stay world-scope. Consequence: player-initiated chat generations run without a memory block — acceptable, and a nudge toward routing AI-DM generation through the GM's client (open question). The memory `serviceUrl` default is still `http://127.0.0.1:3010`, but the intended deployment is `https://<host>/memory` behind nginx (Unix socket; `NOODLR_MEMORY_SOCKET`).
