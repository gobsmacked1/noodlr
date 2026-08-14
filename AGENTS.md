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

## THE SPLIT (2026-08-08) — read this before looking for the rules code

Noodlr spent months accumulating D&D 5e rules enforcement, which was a mistake the user named
outright: module bloat in a module that had started game-system agnostic, hard to maintain and
impossible to extend to a second system. **All of it moved to `noodlr-hooks-55e` on 2026-08-08.**

Gone from this repo: the tactical planner and cognition tiers, the action economy, conditions, dying,
concentration, stealth and hiding, perception and encounter initiation, reactions, forced movement,
Speed enforcement, the ten dnd5e system adapters, the sheet surveys, the Hide toolbar button and the
Act-as-NPC tool. Sixteen combat settings and 115 i18n keys went with them. **If you are looking for
any of that, it is in `C:\Project\noodlr-hooks-55e`, and its `AGENTS.md` holds every dnd5e-internals
invariant that used to be in this file.**

`src/combat/tracker.ts` stayed, because the ⚔️ state block it builds is prompt material rather than
rules. What replaced the rest:

- `src/integration/hooks-modules.ts` — detects any active `noodlr-hooks-*` module and reads its
  `api.noodlrHooks` descriptor (`{protocol, systemId, rulesetName, capabilities}`).
- `src/behavior/` — listens on `noodlrHooks.turn`, `.behavior` and `.ruling`. Gives words to a creature
  that flees, yields or is spared; keeps a short ring buffer of rulings so the GM's chatbot knows what
  happened at the table; heckles on a turn using the `BanterProfile` the rules module read off the
  sheet. **`preRuling` is deliberately not handled** — it is synchronous, and a model cannot answer
  synchronously; vetoing on a coin flip is worse than not vetoing.
- "Combat automation" became **"Behavioral automation"** (boolean, default true, greyed when no rules
  module is enabled). The dead `combat.systemPrompt` — `getCombatSystemPrompt()` had no callers — was
  repurposed as its prompt.
- The ruleset picker lists detected `noodlr-hooks-*` modules above the curated list. **The curated list
  stays**, because a detached chatbot answering rules questions from RAG still has to be told which
  game it is answering about: that is the v0.4.20 fix and it must not regress.

**Neither module depends on the other**, the same optional-enhancement pattern already used for
midi-qol. With no rules module installed, noodlr is a chatbot and media generator with no NPC
management, and it says so in the settings window rather than failing quietly.

That last clause turned out to be the important one, and `noodlr-hooks-55e` learned it the hard way on
2026-08-11: it had accumulated four *silent* stand-asides (AC5e owning conditions, midi owning
concentration and dying, Gambit's owning opportunity attacks), each individually correct, and together
they meant a GM could read a checkbox that said ON while nothing happened. It now has an ownership
resolver and three settings windows that show who is enforcing each rule; the full reasoning is in
[that module's AGENTS.md](../noodlr-hooks-55e/AGENTS.md) under "A silent stand-aside is a bug report
waiting to happen". **The transferable rule for this repo: greying "Behavioral automation" when no rules
module is enabled was the right instinct, and any future stand-aside here needs the same treatment.**
A capability that switches itself off has to say so in the interface, not only in a comment.

Shipped as **noodlr v0.5.0** (minor bump, not a patch: features were removed, and a GM who upgrades
without installing the companion loses sixteen settings) and **noodlr-hooks-55e v0.1.0**, both with
`module.json` + `module.zip` attached and both `releases/latest/download/module.json` URLs verified to
resolve to the right version with a reachable download.

## The capability compiler (2026-08-09) — noodlr's half of the second pivot

`noodlr-hooks-55e` stopped trying to hand-code the rules and became a runtime compiler instead; the
reasoning, the schema and the deterministic half all live in [that module's AGENTS.md](../noodlr-hooks-55e/AGENTS.md).
What lives HERE is the half that needs a key: `src/capability/`, listening on `noodlrHooks.compile`.

The division is the same one that has governed the split since day one. The rules module knows the
game and holds no credentials; noodlr holds the key, so noodlr makes the calls, and holds the rate
limit, so noodlr decides how many at once. `runPool` and the 429 gate are the corpus miner's proven
patterns, reused rather than re-derived.

- **Nothing in `src/capability/` knows D&D.** Every trigger event, effect kind, predicate and
  parameter arrives ON the request, in the `vocabulary` the asking module supplies, and
  `validateAgainst()` checks the reply against that rather than against anything of ours. This is a
  hard rule, not tidiness: a `noodlr-hooks-pf2e` must be able to send a different vocabulary and get
  correct answers with no change here. It is also the same principle as #1 at the top of this file,
  arriving from the other direction — the game system's knowledge stays in the game system's module.
- **The model compiles; it never adjudicates.** Prose becomes a descriptor once, at scene load, and
  deterministic code runs it every turn. The v0.4.22 decision to cut the per-turn model call stands.
- **Failure is quiet and partial by construction.** A feature that will not validate is dropped and
  the other nineteen come back; one repair prompt is offered and then it is left alone. The asking
  module treats a missing descriptor as ordinary, because that is its baseline rather than an error
  path — with noodlr uninstalled it gets nothing at all and behaves exactly as it always has.
- **`composeSystemMessage` / `composeUserMessage` / `composeRepairMessage` live in `vocabulary.ts`,
  not in `compile.ts`, and depend on no Foundry global.** That is deliberate: `noodlr-rules-corpus`
  imports them directly to run the regression harness over 75,487 mined atoms, and a harness that
  reimplemented the prompt would be measuring a different compiler than the one that ships.
  **Do not inline them back into `compile.ts`** — a divergence there is invisible and makes every
  regression number a lie. `test/seam.test.mjs` in the corpus repo is the guard.

## Workspace layout (multi-root)

- `C:\Project\noodlr-main\` — **this project**: the AI game master. Own git repo on GitHub.
- `C:\Project\noodlr-hooks-55e\` — the **D&D 5e (2024) rules automation** split out of this one. Own git repo, own `AGENTS.md`. Every dnd5e and midi-qol internals note lives there now.
- `C:\Project\noodlr-memory\` — the standalone **vector/RAG memory service** (Node >= 20). COMPLETE and fully ours. Own git repo on GitHub.
- `C:\Project\noodlr-vtt\` — reserved for an **optional external control bridge** (drive Foundry from external AI clients over MCP/WebSocket). Deferred; may never be built. Currently holds the sheet-survey JSON captures.
- `C:\Project\_research\` — the reference corpus (dnd5e source, Foundry client source, v14 types, the community modules we compare against, and `_audit\`). Outside every workspace root, so tools must be pointed at it explicitly. Primarily serves `noodlr-hooks-55e`; see that module's AGENTS.md for the research method.

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
   resolve" is not. This principle now applies mainly to `noodlr-hooks-55e`, which is where every
   third-party stand-aside lives; here it survives as the reason noodlr never *requires* a rules
   module either.

0. **Rules versus tactics (amended 2026-08-02, relocated 2026-08-08).** The distinction that unblocked
   the NPC combatant work — a module may know where a system keeps its numbers and which options are
   worth considering, but may never compute an attack roll, damage, a save, a DC or a condition — now
   governs `noodlr-hooks-55e`, not this module. **Noodlr itself is back to holding no system knowledge
   at all**, which is the state principle 1 always described and that the split finally restored.
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
- **Rate limits (v1.1.1, 2026-08-11):** `embedTexts` had no 429 handling of any kind, and its
  recovery path was an amplifier. A failed batch was retried **one item at a time, immediately** —
  which is right for a poison document and exactly wrong for a rate limit, since it fires
  `batchSize` more requests at an endpoint that just said stop and then throws from the first of
  them anyway. Hedging made it worse from the other side: a duplicate request fires when the first
  stalls past `EMBED_HEDGE_MS`, and a rate-limited provider is *slow*, so the hedge doubled the
  request rate precisely when the account could least afford it. Now: retry with `Retry-After` or
  exponential backoff and jitter, a **process-wide** pause on 429 (a limit belongs to the key, so
  everything in flight must honour one — the corpus miner's gate, ported), hedging stands down for a
  minute after any 429, and a rate-limited batch is reported rather than fanned out. 401/402/400 are
  never retried. New knobs: `EMBED_MAX_RETRIES` (5), `EMBED_MIN_INTERVAL_MS` (0, a pacing floor).
  **Nothing in noodlr's ingest path ever changed** — `ingestCompendium` has always awaited one batch
  of 25 documents at a time. What changed was the provider's tolerance and the fact that resetting
  every silo means re-embedding the whole corpus in one unbroken run, which is the first workload
  that ever reached the limit. `test/embeddings.test.js` covers all of it; the old behaviour was
  untested, same as the `k must be positive` bug below.
  **The first lever against a requests-per-minute limit is `EMBED_BATCH_SIZE`**, not backoff: the
  limit counts requests and not texts, so 16 → 64 is a straight 4× cut in calls for identical work.
- **Patience is measured in time, not attempts (v1.2.0, 2026-08-13).** 1.1.1 handled a 429 correctly
  and still could not finish a compendium, because `maxRetries` (5) with exponential backoff spends
  every attempt *inside the same per-minute window* and then throws while the provider is still
  refusing. A per-minute limit needs a wait sized to the window: `EMBED_RATE_LIMIT_WAIT_MS` starts at
  20 s and scales, and the whole batch gets `EMBED_RATE_LIMIT_BUDGET_MS` (10 min) of patience rather
  than a count. 401/402/400 still fail on the first try — patience is for the one error that passes
  with time.
  - **A 429 teaches the process to pace itself.** `adaptivePaceMs` doubles by `EMBED_PACE_STEP_MS`
    up to `EMBED_PACE_MAX_MS` on every rate limit and decays after a quiet minute, so the run
    settles at a sustainable rate instead of sprinting into the next window. It is a floor on top of
    `EMBED_MIN_INTERVAL_MS`, not a replacement.
  - **429 is now reported as 429.** It used to be flattened into the 400 that `embedTexts` throws for
    any provider error, so a caller could only find it by grepping the message. Both are still read
    on the module side (`isRateLimit` in `ingest.ts`) because a GM does not upgrade the service in
    step with the module.
  - **Raising `batchSize` needs a character cap to stay safe**, hence `EMBED_MAX_CHARS_PER_REQUEST`
    (48k) and `planBatches`: the documented advice is to raise the batch size, and 64 statblocks is
    a payload some providers reject outright. Splitting by length means the advice cannot backfire.
 - The default `batchSize` moved 16 → 32, and the module can override both it and the pacing floor
 per request (see the ingest-queue section below).
- **Patience belongs to whoever has the progress bar (v1.2.1, 2026-08-13).** 1.2.0's ten-minute
 `rateLimitBudgetMs` was spent *inside one HTTP request*, and that is the wrong side of the wire.
 Two failures followed, and only the second was obvious. A reverse proxy cuts the connection first
 (nginx `proxy_read_timeout` defaults to 60 s). Worse, **the module's own countdown could never
 fire**: `withPatience` waits for a 429 *response*, so while the service absorbed the wait the queue
 reported `phase: "sending"` with an empty note and a working ingest was indistinguishable from a
 hung one — which is exactly how it was reported. The hold is now 45 s and then the 429 is handed
 back; the module's 20-minute budget does the waiting where a GM can see and cancel it.
 - **The pacing must survive the hand-back.** A short hold puts the whole weight of not re-bursting
 on the process-wide gate outliving the throw, so `pauseAll` is called before it. Reset the pace on
 the way out and the caller's retry arrives at full speed into the same wall — the stall-burst cycle
 the adaptation exists to stop, looking exactly like the adaptation not working. Locked by a test.
 - **`PACE_DECAY_MS` must comfortably exceed the longest single wait.** It is 300 s, and the older
 note here saying "a quiet minute" was wrong in a dangerous direction: at 60 s a one-minute
 rate-limit wait would count as quiet and zero the pace immediately before the retry that provoked
 it.
 - **`paceMaxMs` 6000 got the ceiling's purpose backwards.** It is a runaway guard, not a cap on
 compliance, and 6 s is 10 requests a minute — so an upstream provider wanting fewer than that
 could never be satisfied, and every retry was refused the instant it left. Now 30 s (2/min).
- **Read WHICH limiter refused, because the two remedies are opposite (v1.2.1).** OpenRouter returns
 its own cap as `{error:{code:429, metadata:{error_type:"rate_limit_exceeded"}}}` with
 `X-RateLimit-Limit`/`-Remaining`/`-Reset` headers; that one is fixable with credits or by leaving a
 `:free` variant. An **upstream** provider's refusal is relayed verbatim behind an `HTTP 429:` prefix
 with a nested body and **no `X-RateLimit-*` at all** — it is that model's capacity rather than the
 key's balance, so credits change nothing and the levers are a slower rate, fewer requests, or a
 different model. `limiterOf()` classifies it (headers first, body shape second, `unknown` carries no
 advice) and the log names it. The 2026-08-13 report was upstream Perplexity, and without this the
 operator's first move is to buy credits that cannot help. **`rate_limit` on `GET /api/v1/key` is
 deprecated and always returns −1**, so there is no asking the account what its limit is.
 `X-RateLimit-Reset` is now used as the wait when no `Retry-After` arrives, its unit inferred by
 magnitude and discarded unless it yields a plausible wait.
- **The arithmetic that makes deliberate pacing the right answer:** a whole corpus is one to two
 thousand requests at `batchSize` 64, so even 10/min finishes overnight — and a refusal costs the
 wait *and* the request, so going slowly on purpose is faster in wall-clock terms than being refused.
  `EMBED_HEDGE_MS=0` for a bulk run; hedging is an interactive-latency trick and every duplicate is
  another request against the same limit.
- **The cheapest request is the one not sent (v1.3.0, 2026-08-13).** Everything above makes a refusal
  survivable; this is the half that stops provoking one. The user rejected further self-throttling
  outright and named the reason the corpus miner never hit this wall at 4 concurrency across nine
  books: it deduplicated. Three sources of pure waste, in the order they were found:
  - **Hedging fired on bulk batches.** A duplicate request is sent when the first stalls past
    `EMBED_HEDGE_MS`, which doubles the request rate exactly when an account can least afford it —
    and there is nobody waiting on a batch of 64 statblocks, so the latency it buys is worth nothing.
    It now fires only for a **single** text. That is the whole of what hedging was for; the previous
    advice to zero it for bulk runs is now mostly redundant rather than load-bearing.
  - **Identical chunks were embedded once each.** `groupIdentical` folds a batch by exact text before
    the call and fans the one vector back out. Keyed on the text and **not** on `contentHash`, which
    is a 32-bit FNV-1a and therefore collides — a hash collision here would silently give two
    different chunks the same vector, which is unfindable at the table.
  - **A re-ingest re-embedded the entire pack.** `freshItems()` in `routes/vectors.js` drops chunks
    the collection already holds, read through `listHashes` behind a small per-collection LRU
    (`knownHashes`) so it is not a full scan per request. `forgetHashes` is called from `/delete`,
    `/purge` and `/purge-all`, because a stale cache after a silo reset would skip everything and
    leave the GM with an empty silo reporting success — the one failure mode that is worse than the
    bug being fixed. Locked by `test/ingest-route.test.js`, which is also the first coverage that
    route has ever had (see the `k must be positive` note: the query route had none either).
  - **`/insert` deliberately does NOT skip stored hashes.** It is the path a memory is retracted or
    edited through (`rag/retraction.ts` is delete + re-insert), so identical text arriving with new
    metadata has to land. Skipping there would make retraction a silent no-op.
  - **A skip has to be reported or it reads as a failure.** `/ingest` returns
    `{inserted, chunks, skipped, alreadyStored, repeats}` and the module surfaces it — a pack that
    reports zero inserted is finished, not broken, and that is the first thing a GM will misread.
  - Default `batchSize` moved 32 → 64 in the same release.
  - **RAG Lite needs the deduplication and none of the rate limiting, and it already has it**
    (checked 2026-08-13, because the reasonable assumption is that the whole arc has a Lite
    counterpart). Nothing in the 1.1.1 → 1.3.2 rate-limit family reaches Lite at all: the only
    embedding path in the module is `rag/local/embedder.ts`, which sets `allowRemoteModels = false`
    against weights shipped in the package, so there is no provider, no key, no request and no 429 to
    handle. **The dedup half matters MORE there than on the service** — it is the GM's own machine on
    one WASM thread rather than someone else's CPU — and `local-memory.ts` skips both stored hashes
    and within-request repeats before embedding. It skips a repeat outright rather than embedding once
    and fanning the vector out, because a Lite row is identified by its hash and there is nothing to
    fan out to. It is also structurally immune to the stale-cache bug `forgetHashes` exists to
    prevent: in Lite the in-memory index IS the store, one client owns both it and the file, and
    every mutation path updates it before saving. `skipped` is the one field both backends set, so
    the queue's "reused" line is already backend-agnostic. Lite's fixed batch of 16 is a WASM
    working-set size, not a request-count lever, and must not be "harmonised" with `EMBED_BATCH_SIZE`.
  - **What DID need doing was the reporting, and it was the inverse of the expected bug (v0.6.6).**
    Lite cannot be rate-limited, so the question is not "does Lite need this remedy" but **"can Lite be
    given this remedy by mistake"** — and it could. `providerRefusalAdvice` was ungated, and
    `isRateLimit` matches the message as well as the status, so any 429 arriving from somewhere else
    entirely (a reverse proxy in front of Foundry refusing the `FilePicker.upload` that Lite saves a
    silo with) would have told a Lite operator to raise `EMBED_BATCH_SIZE` on a service they do not
    run. It returns "" on Lite now, and `ingestFailureAdvice()` is the single dispatcher every report
    path calls, so **adding a backend cannot leave one path handing out another backend's remedies.**
    That is the same doctrine as `ragFailureAdvice`, which was already correctly gated, and the same
    one as naming the model only when `getEmbedOverride()` carries it.
  - **`liteFailureAdvice()` names the two failures Lite actually has, and both have shipped as real
    bugs.** An incomplete install is a 404 *by construction* — `allowRemoteModels = false` means there
    is no fallback — and it is invisible in dev because `npm run fetch-model` already put the weights
    on disk: the v0.4.25 asset genuinely shipped without `models/` and the rc6–rc8 series was three
    releases of the ORT paths resolving to the wrong directory. So the advice says "reinstall from the
    manifest, a complete package is ~29 MB with `models/` and `dist/ort/`", which is the actionable
    form of that. The other is `FilePicker.upload` without `FILES_UPLOAD`, where an index builds fine
    in memory and then cannot be written. **The "Test in-browser embedder" probe is the one that
    catches the install case**, so it leads with the diagnosis and keeps the raw ORT text after it —
    an unrecognised error still shows verbatim, which is the honest fallback.
  - Deliberately absent from Lite's advice: anything about batch size, rate or model. On that backend
    the work is one WASM thread in the GM's own browser and there is no request to slow down.
- **Every wait in the above was sized for a model of the limit, and the model was wrong (v1.3.1,
 2026-08-13).** Reported from a live server: the **Diagnostics self-test** — one sentence, one
 request, no batching, nothing to deduplicate — failed on a 429, and the service then reported
 "embed pacing now 1s / 2s between requests". Two separate faults, and neither is fixable by any of
 the efficiency work above, because there was no waste left to remove.
 - **Read the operator's generation log, not our own inference.** It showed `status: 200` for a
 single-text embed at 21:12:00.502 and a refusal about a second later. A per-minute window cannot
 produce that, so the 20 s first wait (`rateLimitWaitMs`, and `ingest.ts`'s matching constant) was
 spending the entire 45 s hold arriving at a failure the provider had already stopped issuing.
 **1 s, doubling** — and `Retry-After` still beats any schedule we can invent.
 - **Adaptive pacing is OFF by default now (`paceMaxMs` 30000 → 0), and the default is the whole
 decision.** The mechanism assumes a 429 proves "the account cannot take requests at this rate",
 which is true of `[account limit]` and false of `[upstream limit]`: that one is a model's capacity,
 consumed by everybody's traffic, so pacing throttles a run that was never the cause and leaves the
 service slow for minutes after the event passed. Do not restore it as a default; `minIntervalMs` is
 the honest lever because it is a number an operator chose rather than one a failure taught us.
 - **A single-provider model cannot be routed around, and that is most of the mystery.** `routingNote`
 reads `/api/v1/models/<slug>/endpoints` once and logs the provider count on the first 429;
 `perplexity/pplx-embed-v1-4b` is served by Perplexity alone, so OpenRouter has no failover and
 saturation reaches us however slowly we ask. The user kept that slug deliberately (2026-08-13), so
 the remedy is to SAY this rather than to throttle around it. **Superseded the same day — see the
 default change below; the slug WAS the bug and saying so was not enough.**
 - **`scripts/probe-rate.mjs` exists so this is never re-argued from inference.** It talks to the
 provider directly and deliberately bypasses `embeddings.js` — the gate, the retries, the hedge and
 the pacing are exactly what would corrupt the measurement, since they exist to hide the behaviour
 being measured. `recover` is the one that sizes `EMBED_RATE_LIMIT_WAIT_MS`; `routing` needs no key
 (demanding one would send the operator hunting a credential to answer a free question).
- **It was run, and it settled the question — but not with a number (v1.3.2, amended v1.3.3
 2026-08-13).** `recover` on the reference host, twice, and **the two runs disagreed**: the first
 refused the very first request of a cold process and cleared 250ms later; the second succeeded once,
 was refused on request two, was still refused at 250ms and cleared at 500ms. **What they agree on is
 the load-bearing half.** A refusal arrives within the first one or two requests of a cold process,
 and no limit our own request rate could trip behaves that way — so every remedy shaped like "ask
 more slowly" was answering a question the provider never asked, which retires the whole
 self-throttling family for good rather than merely as a default.
 - **The disagreement is itself the finding, and it is why the tuning stops here.** A transient
 refusal lasts as long as that provider's saturation lasts, so there is no constant to match and
 `EMBED_RATE_LIMIT_WAIT_MS` only has to be in the right order of magnitude — the ladder doubles
 (0.5s, 1s, 2s, 4s, 8s, 16s) inside the 45s hold and absorbs the variance. It went 20s → 1s → 250ms
 → **500ms** across four releases, each of the first three cut on better evidence than the last and
 the fourth *raised* back to the top of the measured range. **Do not cut it again on a single probe
 run**; that is fitting to noise, and `config.js` says so at the setting.
 - **Sized to the top of the range rather than the middle, for an asymmetric reason.** Undershooting
 spends a request on a provider that is still refusing, which is waste against the one resource
 that is scarce; overshooting costs idle milliseconds on a rare event. The 250ms default was
 measurably the wrong side of that on the second run.
 - The regression test asserts the ORDER OF MAGNITUDE (`took < 3000`), not the value, so re-sizing
 within the measured range is not a test change while restoring a window-shaped default still fails.
 - `probe-rate.mjs recover` no longer prints "set the wait to N". Printing the newest sample as an
 instruction is what produced this re-tune, and the operator cannot tell from one run that the
 number moves; it now reports whether the measurement is within the scale the shipped ladder
 already covers.
 - **Two other constants had been sized for the same imagined per-minute window and were quietly
 wrong by two orders of magnitude.** The hedge stand-down was a flat minute (`REFUSAL_SETTLE_MS`,
 now 5s): one blip during a bulk ingest disabled hedging for the interactive query arriving ten
 seconds later, which is the only thing hedging still serves now that it fires for a single text
 only. And the `?? 20_000` / `?? 6000` fallbacks in `resolveEmbedConfig` still stated the old
 defaults — a second copy of a default is a value nobody chose, reached on exactly the path (a
 hand-built cfg) where it is least likely to be noticed.
 - **A refusal the service recovers from is `info`, not `warn` (`REFUSAL_NOISE_MS`, 5s of cumulative
 wait within one batch).** A single-provider model refuses the occasional request as a matter of
 course and we retry it away in a quarter of a second; logging that at `warn` with a paragraph of
 remedies is how a working ingest came to be reported as a broken service — the operator's words
 were that it "isn't even able to perform the self-test without being throttled and erroring", and
 the self-test had in fact succeeded. **Severity has to track what the operator should DO**, which
 is the same doctrine as `rag/failure.ts` on the module side, arriving from the other direction.
 The advice and the routing note now fire once per batch at escalation rather than on the first
 rung, so they appear when they are actionable.
 - **`dur()` because the logs rounded the interesting number away.** Every line printed
 `Math.round(ms / 1000)}s`, which was fine while the waits were tens of seconds and became a lie
 the moment they were measured properly: a 250ms retry read as "waiting 0s" and a learned 120ms gap
 as "pacing now 0s between requests". A log that rounds off the quantity it exists to report looks
 like a broken mechanism rather than a broken message.
 - **The module's first wait stays at 1s, and the asymmetry is deliberate.** By the time a 429 reaches
 `ingest.ts`, the service has already retried the blip away for up to its whole 45s hold, so a
 refusal the module can see is one that persisted. Harmonising the two numbers would either make
 the service patient enough to look hung or make the module retry a wall it was just handed.
 - Locked by `test/embeddings.test.js` — "at the shipped defaults, a recovered 429 leaves nothing
 behind" asserts no learned pacing and a sub-second first wait, so restoring a non-zero
 `paceMaxMs` default fails a test instead of quietly slowing the next self-test.
- **The answer was the model slug, and the default changed (v1.3.4 / noodlr v0.6.7, 2026-08-13).**
 Everything above is correct and none of it fixed anything, because none of it addressed the cause.
 The user switched `perplexity/pplx-embed-v1-4b` → `qwen/qwen3-embedding-8b` and reported ingestion
 "without any errors at all", nothing else changed. `probe-rate.mjs routing` says why in one line:
 **three provider endpoints (Nebius, DeepInfra, SiliconFlow) against one (Perplexity).** With one,
 OpenRouter has nothing to fail over to and that provider's saturation is our 429; with three, the
 same event is absorbed before we ever see it. Both defaults moved (`config.js` `EMBED_MODEL`,
 `providers/config.ts` `embeddings`).
 - **The transferable rule: provider redundancy is a selection criterion for an embedding model, not
 a footnote.** It outranks price and benchmark position for this use, because a bulk ingest is
 thousands of requests and one endpoint means every one of them is exposed to strangers' traffic.
 `probe-rate.mjs routing <slug>` answers it in seconds and **needs no API key** — so it is now
 asked before a slug is adopted, and both READMEs plus the in-app refusal advice lead with it. That
 command took a `slug` argument only as of this release; without one it reported the *configured*
 model, which is useless for the question an operator actually has (about a model they have not
 switched to yet) and cost a wrong answer in this very investigation.
 - **Changing the model changes the VECTOR WIDTH**, and a LanceDB table's width is fixed when it is
 first written, so a switch means purge-all and a full re-ingest. Stated at both defaults and in
 the refusal advice, because a GM who changes the slug to escape 429s and then finds every query
 returning nothing has traded a loud failure for a silent one.
 - **Safe to change as a default precisely because it is only a default.** The provider form has
 always saved every field, so worlds that have ingested anything hold an explicit value and are
 untouched; the new slug reaches new worlds and worlds that never opened the setting, i.e. exactly
 those with nothing to re-ingest.
- **The self-throttling audit, asked for and answered (2026-08-13).** With blame settled, the user
 asked what had been added to ingest "less aggressively" that should now be backed out. The honest
 inventory divides in three, and only one item was ever a self-throttle:
 - **Back out: adaptive pacing, and it already is** (`paceMaxMs` default 0 since v1.3.1). Its premise
 — that a 429 proves our rate is too high — is now not merely unproven but measurably false for the
 case that produced it. The code stays because it cannot fire without an operator setting both
 `EMBED_PACE_STEP_MS` and `EMBED_PACE_MAX_MS`, and there is one honest use left (a limit measured
 and known to be the key's). **Do not restore it as a default**, and prefer `EMBED_MIN_INTERVAL_MS`
 even for that case, because it is a number somebody chose.
 - **Keep, because it is PATIENCE rather than throttling**, and patience is right against any
 provider whoever's fault the refusal is: retries with backoff, `Retry-After`/`X-RateLimit-Reset`,
 the 45s service hold, the module's 20-minute budget and visible countdown, the process-wide pause
 (brief now that the first wait is 500ms), the hedge stand-down. None of these slow a healthy run
 by a millisecond — they only ever spend time that a refusal had already taken.
 - **Keep, because it is EFFICIENCY and would be right against a perfect provider**: `batchSize` 64,
 `EMBED_MAX_CHARS_PER_REQUEST`, `groupIdentical`, `freshItems`/`knownHashes`, Lite's hash skip,
 hedging only for a single text. These make an ingest cheaper and faster, not gentler. This is the
 half worth having kept: it is why a full re-ingest on the working model is quick.
 - **The one real cost still standing is the ingest queue's strict serialization**, and its stated
 rationale was the bad premise — "two concurrent ingests halve each other's share of a limit that
 counts requests". The queue itself earns its place on grounds that have nothing to do with rate
 limits (one writer, resume across a reload, visible progress, no duplicate job per pack, nothing
 moving under a running job), so it stays; but sixty packs now run strictly one at a time against a
 provider that could serve several. Parked in `IDEAS.md` rather than built: a small worker count
 would have to keep one shared 429 gate and a per-job `resumeAt`, and `EMBED_BATCH_SIZE` already
 bought a 4× cut in requests for free.
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

- Ground-truth ⚔️ block builder from Foundry's combat tracker (initiative, HP tiers for enemies, conditions, positions as zones) injected each combat turn. **Kept** — `src/combat/tracker.ts`.
- Rules questions during combat hit the `rules` silo automatically. **Kept.**
- AI-run NPC/monster turns: **moved to `noodlr-hooks-55e` in the 2026-08-08 split.** Turns are now decided by a deterministic planner there, with no model call; this module hears about the decision through `noodlrHooks.turn` and may add a taunt or rewrite the announcement.
- Deliverable, restated: run a full combat where the rules module resolves and Noodlr narrates.

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
- **AI NPC turns** — gone from this repo. Shipped here as `combat/npc-turn.ts`, replaced by a deterministic planner in v0.4.22, and moved to `noodlr-hooks-55e` in the 2026-08-08 split along with the scene-control tool and `api.runNpcTurn()`.
- **Rules during combat**: `retrieval.ts` force-adds the `rules` silo to queries whenever combat is active. **Still here** — it is a retrieval decision, not a rules one.

Known gaps: HP/condition extraction is best-effort per system (verify on your target system); positions aren't zone-mapped.

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
  - **Calendar modules feed this rather than bypass it, confirmed from source 2026-08-11.** Calendaria
    sets `CONFIG.time.worldCalendarClass` to a subclass (`calendaria.mjs:179`), so `worldTime` stays the
    canonical clock and `.components`/`.calendar` return its richer answer — a world running one gets
    real month and season names here for free. The only rule that follows: read the calendar by duck
    typing, never by `instanceof` against a core class. Tipster already does.
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

**v0.4.21 — the combat dossier and the AI turn loop.** Superseded twice: by the deterministic planner
in v0.4.22, and then by the 2026-08-08 split. The reasoning, the reservations and the revert map are in
`noodlr-hooks-55e/AGENTS.md`; nothing about it applies to this repo any more.

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
- **Injected in every generation path** — `prompt/assembler.ts` (GM co-pilot), `players/answer.ts`,
  `players/adjudication.ts`, and since the split `behavior/narrate.ts` (the fourth was the NPC turn,
  which left with the rules). The players' bot and the adjudicator matter as much as the co-pilot: both
  talk in checks and DCs, and the players' bot doesn't use the assembler at all. **Any new generation
  path needs this too** — that is the whole lesson of v0.4.20.
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
  {value,subtype}. Since the split it reaches combat through `behavior/banter.ts` (a taunt is spoken in
  the creature's own voice) rather than through the NPC turn, which moved out.
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

## Ingest is a queue with a progress bar (v0.6.2, 2026-08-13)

Reported as a rate limit and only half of it was: repopulating every silo could not get through a
single compendium. The service side is the note above; this is the module side, and the interesting
part is that two of the three faults were interface rather than networking.

- **`#busy` on the window was never a lock.** It guarded re-entry into one handler on one client, so
  it did nothing about a second window, a reload mid-run, or an upload fired while a pack was going.
  Two concurrent ingests do not go twice as fast — they halve each other's share of a limit that
  counts requests — so serializing them is a correctness measure. `src/rag/ingest-queue.ts` is a
  **module-level** singleton for the same reason it is not a window field: a run has to survive the
  GM closing the window, and every caller must see the same queue. Memory access is GM-gated, so
  there is exactly one client doing this.
- **The duplicate guard is on `key`, not on a busy flag.** Queueing is the *right* answer to a GM
  clicking six packs; what must not happen is the same pack twice. A resume keeps the same key
  (`pack:<id>:<silo>`, no `from`), so resuming cannot enqueue a second copy of a job.
- **`resumeAt` is only advanced once a batch is STORED.** That is what makes resume safe in both
  directions: it never re-sends embeddings already paid for and never skips documents that never
  landed. A cancelled job keeps it — the rows written are real. An uploaded file omits `resume`
  entirely rather than faking one, and the button is absent as a consequence rather than as a
  separate check: it is one indivisible request with no index to restart at.
- **The queue is painted imperatively; `render()` is never called on progress.** A re-render rebuilds
  60-odd pack rows, resets every silo picker to its default and loses the scroll position — several
  times a second while a countdown ticks. Same rule as the chat panel's streaming. The subscription
  is taken in `_onRender` and dropped in `_onClose`, and closing the window does **not** cancel the
  run.
- **A wait has to be visible or it reads as a hang.** The old path sat silent through a backoff and
 then reported failure, which is the worst available combination. `withPatience` counts the wait down
 through `report` every second, names the retry number, and gives one batch 20 minutes before it
 gives up. It wraps a thunk rather than a batch so the upload path shares it instead of growing a
 second copy of the loop — which is also why `ingestUploadedFile` moved out of `memory-app.ts` into
 `ingest.ts`.
 - **v0.6.2 got that half right and left the other half silent (fixed v0.6.3).** The countdown only
 runs once a 429 has been *received*, and the service was absorbing rate-limit waits internally for
 up to ten minutes, so the visible state through all of it was one `phase: "sending"` with an empty
 note. A pack that was working perfectly was reported as hung. `reportWhilePending` now ticks the
 elapsed seconds of the in-flight request every second, so slow and stuck look different whatever
 the reason — a property worth having independently of the service-side fix, since any request can
 be slow. The generalisable form: **a progress indicator that only updates on completion is not a
 progress indicator**, and the queue's coalesced `report` already made a per-second tick cheap.
- **Throttle settings are sent independently of `sendEmbedConfig`.** Conflating them is what left the
  documented first lever unreachable: the provider block (model, URL, key) is opt-in because it means
  the GM's key leaves their browser, while batch size and pacing are not credentials. A lever that
  only works when an unrelated checkbox is on is a lever nobody finds. `resolveEmbedConfig` falls
  back to the server's value for every omitted field, so a throttle-only override leaves the provider
  config exactly as the service has it. 0 means "let the service decide" and must survive a save.
- The ingest buttons are deliberately NOT disabled while the queue is busy — they queue. What is
  disabled is everything that would either spend the same budget (upload, developer export) or move
  the ground under a running job (silo reset).

### The queue survives a reload (v0.6.4, 2026-08-13)

The user's prediction of operator behaviour is the whole specification: tick sixty packs, pick sixty
silos, mash ingest, hit Save, close the window and start playing. 0.6.2 got everything except the last
clause — the queue outlived the *window* and died with the *page*, and a GM who reloaded lost the run
with no way to tell how much of it had landed.

- **`IngestSpec` is a serializable descriptor, not the task.** An `IngestTask` closes over a
  `MemoryBackend` and a pack's documents; none of that can be written to a setting. So a job persists
  as `{type:"pack", pack:<id>}` plus its `resumeAt`, and `rebuildIngestTask()` in `memory-app.ts`
  reconstructs the closure at load. A pack that has since been uninstalled rebuilds to nothing and
  the job is dropped rather than retried forever.
- **`resumeAt` was already the right number and is what makes this safe in both directions** (it only
  advances once a batch is STORED, see above), so resuming re-sends nothing already paid for and skips
  nothing that never landed. The reload path needed no new bookkeeping — only somewhere to put it.
- **Only the primary GM writes, and only the primary GM resumes.** Two GMs both restoring the same
  stored queue is two concurrent runs halving each other's share of one rate limit, which is precisely
  what the queue exists to prevent. Same `isPrimaryGM()` rule as transcripts and artifact commits.
- **A non-primary GM's jobs are carried, not dropped.** Each stored job records its `owner`, and
  `writeNow()` re-serializes the jobs belonging to *other* active GMs alongside its own. Without that,
  the primary GM's first write erases an assistant GM's queued work — a data-loss bug that only
  appears on multi-GM tables and looks like the queue randomly forgetting things.
- **Writes are debounced but structural changes flush immediately.** Progress ticks every second and a
  world setting is a socket broadcast to every client, so a per-tick write would be a flood; a cancel
  or a completion that is not written *now* can be resurrected by a reload, which is worse than a
  slightly stale count. `restoring` suppresses writes while the queue is being rebuilt, or the restore
  would race its own persistence.
- Resuming is announced once with a notification and otherwise silent, which is what "I hit ingest and
 went off to play" asks for.

### A provider's refusal is not a broken memory service (v0.6.5, 2026-08-13)

`src/rag/failure.ts` is the one place that tells the two apart, and it exists because they arrive at
the same place and mean opposite things. A rate limit says the store is healthy, the write path is
correct, and an upstream model was busy for a moment; a connection or store failure says nothing
works. Reported as one raw error string — which is how the Diagnostics self-test reported it — the
reasonable conclusion is that memory is broken, and the operator goes off to audit a service that was
never at fault.

- **`isRateLimit` reads the status AND the message**, because noodlr-memory only started reporting 429
 as 429 in 1.2.0 and a GM does not upgrade the service in step with the module. Wrong in the
 permissive direction costs one pointless wait; wrong in the strict direction abandons an ingest that
 would have finished.
- **`providerRefusalAdvice` names the model only when `getEmbedOverride()` carries one.** Without the
 opt-in provider block the service uses its own `EMBED_MODEL`, and naming a setting that had no part
 in the request is the same class of mistake as advising an account top-up for an upstream limit.
- **The advice names the SERVICE's environment variables**, because the audience is whoever runs
 noodlr-memory and every lever is on that side. Same reasoning as the socket/reverse-proxy hints in
 `ragFailureAdvice`.
- Both consumers matter: the self-test (a one-request probe, so nothing here is about bulk load) and
 the queue, where the job note becomes "press Resume in a minute" instead of a quoted 429 body.

## Hard-won invariants

- **A document ingests as its own name and reports success (v0.6.1, 2026-08-12).** Found while
 cross-checking the rules corpus against a straight PDF conversion of the same books: the offline
 exporter had silently dropped 513 roll tables, and the same two blind spots were live in
 `rag/ingest.ts`, which is the path a GM actually uses. `documentToText()` read `system.description`,
 `system.details.biography` and journal pages, then fell back to `JSON.stringify(doc.system)`
 truncated at 4,000 characters. Consequences, both silent:
 - **A RollTable has no `system` at all.** Its prose is top-level `description` and its content is
 the embedded `results` collection, so a d100 table was embedded as its title and nothing else,
 and the service dutifully reported it inserted. The compendium ingest matrix lists every pack
 including the `*.tables` ones, so this was worse than omitting them — the GM ticks a box, sees a
 success count, and gets a store that can match "Wild Magic Surge" and not one of its hundred
 effects. Rows now render with their range prefix, because "25-28" is what selects the effect.
 - **A creature's traits and actions are embedded Items, not fields of `system`.** This is the
 lesson the offline miner learned first (436 SRD actors expand to 4,861 mining units, 11.1x), and
 the importer never got it: most statblocks carry no biography, so an actor fell through to the
 truncated-JSON fallback and was indexed as a name and a few hundred numbers with every trait,
 attack and legendary action absent. Items are appended now, and **the fallback gate changed from
 `parts.length <= 1` to a `hasProse` flag** so a statblock with traits still gets its AC and hit
 points — gating on the count would have dropped the numbers the moment item text started arriving.
 - **The generalisable fix is the reporting, not either extractor.** `ingestCompendium` tallies
 documents whose text is only their own name, by document type, and warns with the census; the
 exporter does the same for a pack that yields zero records, routed through `failures` so the GM
 gets a red toast instead of a missing file. This is the same doctrine as greying "Behavioral
 automation" and as `noodlr-hooks-55e`'s ownership resolver: **a capability that switches itself
 off has to say so.** An extractor that cannot read a document type is not a bug worth preventing
 in advance — it is a bug worth being told about the first time it happens.
 - Untouched deliberately: the PDF path. `/ingest-file` parses server-side through the optional
 `pdf-parse` dependency and 501s with an install hint when it is absent, and RAG Lite refuses PDFs
 with a message naming the workaround. Both fail loudly, which is the property that matters. Its
 real limitation is layout rather than loss — a PDF text layer interleaves table columns — and that
 is not fixable without OCR-grade tooling nobody should add to a browser module.

- **A creature's own sheet outranks the rulebook, and the silo arrays were never what enforced it
 (user's edict, 2026-08-10).** A GM who gave a goblin 40 hit points has stated a fact about that
 goblin; a retrieved rulebook paragraph about the published goblin is a weaker claim about the same
 creature, not a correction. Three things had to change, and the first is the trap:
 - **`GM_QUERY_SILOS` / `PLAYER_QUERY_SILOS` order is documentation, not mechanism.** Their header
 comment claimed "Order = query/injection precedence (rules first...)" since the 35-silo migration
 and it was never true: every silo goes into ONE fused `client.query()` and comes back ranked by
 score, so the array order never reaches the model. Reordering those arrays to "fix" precedence
 changes nothing. `precedenceRank()` in `silos.ts` is the mechanism.
 - **The block could not express the edict because it never said what a hit was.** Hits carried no
 origin, so a sheet excerpt and a rulebook excerpt were indistinguishable bullets. The service had
 stamped `collection` on every hit all along (`routes/vectors.js` `list.push({collection, ...h})`)
 and `RagHit` simply never declared it; RAG Lite genuinely dropped it and now stamps it from a
 per-silo id map. Every line is now tagged `[character sheet]` / `[rulebook]` / `[campaign memory]`.
 - **Sheets are hoisted before the budget loop, not after.** `formatContextBlock` stable-sorts by
 `precedenceRank` so relevance order survives within each group while a tight `tokenBudget` trims
 published rules instead of the table's own customizations — precedence that held only when
 everything fit would be no precedence at all.
 - The clause also lives in `buildRulesetBlock()` rather than only in the retrieved-memory header,
 because most sheet facts reach the model as LIVE Foundry state (the combat block, the Tipster
 briefing) on turns where retrieval returned nothing. Being in that block means all four generation
 paths get it from one edit, which is the v0.4.20 lesson paying off. **Not a prompt field**, for the
 usual reason: a guard deletable by rewriting an unrelated paragraph is not a guard.
 - Deliberately NOT done: re-weighting `importance` per source book on ingest. The user declined it,
 and it would only take effect on re-ingest anyway, so it cannot fix a corpus already in the store.

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
- **Secrecy travels with the turn, never with the UI.** "Hide from players" is one-shot: the checkbox clears
  once a prompt is accepted (a sticky box silently muted the mirrored text *and* the broadcast audio for the
  rest of the session). Consequently, anything that re-runs a turn must pass the original turn's `hidden`
  flag rather than re-reading the checkbox — Retry did the latter and would have regenerated a GM-only reply
  in full view of the table (v0.4.16). Hidden turns are badged **GM ONLY** and use local `speak()`, never
  `speakShared()`, because broadcast audio lands at a predictable unauthenticated URL.

- **A chat card that names no speaker is signed with the author's assigned character (v0.4.46, 2026-08-07).**
  Reported as an attribution bug of ours and it was core filling in a blank: a player owning four characters
  saw Noodlr's cards signed with a different one, which was not even on the scene. Two getters in
  `client/documents/chat-message.mjs` do it —
  `get speakerActor() { return getSpeakerActor(this.speaker) ?? this.author?.character ?? null }` and
  `get alias() { return speakerAlias ?? this.speakerActor?.name ?? authorName }`. So the fallback is
  `user.character` from User Configuration, regardless of what is selected or even present on the scene.
  `ChatMessage.getSpeaker()` with no arguments has the same hole one step earlier, in its CASE 5.
  - **An empty alias string is no better than no speaker**, because `this.speaker.alias || null` discards it
    and falls through identically. Several of our cards were building `{ alias: String(x?.name ?? "") }`.
  - The same fallback feeds `getRollData()` and the portrait, so an unsigned card containing an inline roll
    would be evaluated against the wrong sheet.
  - Rule: **every card goes through `util/speaker.ts`.** `speakerFor(subject)` for a card about one
    creature, `narrator()` for the module's own voice (announcements about the fight, GM diagnostics).
    Never `ChatMessage.create({content})` with no speaker, and never a bare alias that could be empty.
  - `playedTokens(user)` is the single answer to "which characters is this person playing", **plural on
    purpose** — a player may legitimately drive two at once, and the old single-answer resolution is what
    made a four-character player look like whichever one sorted first. Order: selection (only readable for
    `isSelf`; another client's control state is not replicated), then the assigned character's token, then
    anything else owned here. Ownership is tested with `testUserPermission`, not `ownership[id] === 3`, for
    the same reason `rollerForActor` does: Foundry resolves through the default row and its ownership dialog
    *deletes* the per-user entry for anyone left on Default, so "All Players: Owner" matches nothing raw.
    Diagnostics: `api.surveyPlayed()`.

## Open decisions / risks

- **Rules-side risks moved with the code.** The open melee-movement bug, the unverified `wm5e` conflict and
  the missing Thirsting Blade identifier now live in `noodlr-hooks-55e/AGENTS.md`. Nothing in this repo can
  fix them.
- **The behavior contract has one live producer and no second implementation.** Everything in `src/behavior/`
  is written against `noodlrHooks.*` as `noodlr-hooks-55e` fires it, which is the only module that fires it
  today. The names are deliberately generic so a `noodlr-hooks-pf2e` needs no change here, but that claim is
  untested until a second module exists — the first one written against this contract will find whatever we
  accidentally assumed.
- **Two of the ten behavior verbs still have no trigger.** `FLEE`, `SURRENDER` and `MERCY` fire from the
  rules module's encounter layer, and as of 2026-08-09 `PERSUADE`, `DECEIVE`, `INTIMIDATE`, `BRIBE` and
  `PARLEY` fire from its new Influence action — so a listener that voices a guard captain's refusal
  finally has something to hear. `AMBUSH` and `DISTRACT` are declared and wired with nothing requesting
  them, so their prompt gloss in `behavior/narrate.ts` is still unexercised against a model.
- **`influence` is a seventh ruling kind**, alongside `condition`, `dying`, `concentration`, `forced`,
  `surprise` and `encounter`. `behavior/rulings.ts` keeps it in the ring buffer like any other.
- **A behavior request carrying `incoming: true` is the verb being done TO `actor`, and the gloss must be
  reversed** (protocol 2, 2026-08-09). Every verb before Influence was self-directed — a creature that
  FLEEs is the one fleeing — so `narrate.ts` could read `actor` as the doer. A creature that is PERSUADEd
  is the one *responding*, and it is still the one whose voice is wanted, because noodlr voices NPCs and
  the party's negotiator must never be handed the microphone. Swapping `actor` and `target` would do
  exactly that, which is why the contract reverses the sentence instead: `VERBS_INCOMING` holds the
  receiving-end gloss for the seven verbs that can arrive that way, and the prompt asks for the creature's
  answer rather than its action. A listener that ignores the flag narrates the right creature saying the
  wrong thing — plausible nonsense, not an error, so nothing will surface it but a reader at the table.
- Lorebook storage shape (world-scoped JournalEntry vs module setting vs flat file in world data) — decide in Phase 3.
- Multi-GM/assistant-GM permissions model for Chronicle review and silo resets.
- `noodlr.app` domain not yet acquired/configured; git + releases now hosted on `github.com/gobsmacked1` (see Phase 6 status). Revisit if a self-hosted forge / custom domain is preferred.
- Safety tooling (lines-and-veils / X-card equivalent) is *not* in the DM prompt; decide whether it becomes a module feature or stays a Session-Zero practice.
- **Provider API keys are player-readable — accepted risk (decided 2026-07-31):** provider settings are `scope: "world"`, and Foundry ships every world setting to every connected client, so any player can read the OpenRouter key with one console line (`game.settings.get("noodlr","chat.apiKey")`). TLS is irrelevant here — the player is a legitimate recipient, not an eavesdropper. **Deliberately accepted, not a bug:** the key is a *spend* credential only. The credential that actually gates concealed knowledge (the noodlr-memory shared secret) is `scope: "client"` and never leaves the GM's machine, so the players-bot privilege boundary holds regardless. Mitigation is operational: run the world on a dedicated OpenRouter key with a credit limit and rotate it as players come and go. Do not "fix" this by moving keys to client scope without revisiting the decision.
- **Why the players-bot keeps the GM relay (decided 2026-07-31):** moving the player-side LLM call into the player's browser would *not* remove the round trip, because retrieval cannot move with it — the memory secret is client-scoped, so a player's browser cannot reach noodlr-memory at all. Direct calls would cost two hops (fetch context from GM, then call the provider) instead of one. **Correction (2026-07-31, same day):** the apparent carve-out for player-initiated **media** generation is wrong. Players do not get `FILES_UPLOAD` by default, and every media path ends in `saveMedia` → `FilePicker.upload`; a player's client would generate successfully and then be unable to persist or share the result (see the existing note in `av-gen.ts`: the remote URL needs auth, so a local copy is mandatory). Media is therefore the case where the GM proxy is *most* required, not least. Latent rather than live only because `allowPlayers` defaults to `false` on image/music/video. **The relay should carry everything**; player-initiated media needs a relay of the same shape as `PlayerAskPayload` (which already carries `userId`/`userName`, so speaker context survives).
- **LanceDB single-writer:** noodlr-memory must be the sole writer of `LANCEDB_URI`. The user's Python FastAPI PoC (`/opt/lancedb_app`) against `/opt/lancedb_data` must be stopped/retired before pointing the service there.
- **Memory access is GM-gated (decided 2026-07-23):** the GM is the *only* client that contacts noodlr-memory (all chat is shared, so per-player writeback would just duplicate). `retrieveContext` returns null for non-GM; ingest (push-to-log/chronicle/manage) was already GM-only. The RAG **shared secret is now client-scope** (stored on the GM's machine, never synced to player browsers); `serviceUrl`/`enabled`/tuning stay world-scope. Consequence: player-initiated chat generations run without a memory block — acceptable, and a nudge toward routing AI-DM generation through the GM's client (open question). The memory `serviceUrl` default is still `http://127.0.0.1:3010`, but the intended deployment is `https://<host>/memory` behind nginx (Unix socket; `NOODLR_MEMORY_SOCKET`).
