# AGENTS.md — noodlr (repo folder `noodlr-main`)

Durable memory for **noodlr**, the AI game master module for Foundry VTT. Auto-loaded as context.
Keep it current with durable facts and decisions; never secrets. **Read the first section before
doing anything else** — it records a direction change and it overrides anything older you may
find in commit history, the changelog, or a backup of another module.

## READ FIRST — where the project stands (decided 2026-09-19)

1. **Platform: Foundry v14 + dnd5e 6.0.3, tracking each one's latest.** `module.json`
   compatibility is min 13 / verified 14 / max 14. We are **not** downgrading to Foundry 13 or
   dnd5e 5.3 to regain compatibility with community modules that have not caught up.

2. **Rules enforcement is not this project's job, and never will be again.** The companion
   module `noodlr-hooks-55e` (D&D 5e rules automation, split out of this repo on 2026-08-08) is
   **abandoned and its repository is being scrapped**; the user holds a backup. Nothing in this
   workspace decides whether an attack hit, applies damage, rolls or judges a save, applies a
   condition, offers a reaction, budgets movement, or counts actions. Those belong to the
   community automation modules once they support dnd5e 6.x. Until then the GM presses the
   damage tray by hand and noodlr says nothing about it.

3. **Community stack status as of 2026-09-19**, verified from each module's own `module.json`
   (`relationships.systems[].compatibility`). The foundryvtt.com package pages reported wrong
   versions during this check and must not be trusted for it.
   - DAE v14 and Automated Conditions 5e v14: declare dnd5e 6.x. Usable.
   - Midi QoL v14.0.12: declares dnd5e **5.2.4–5.3.99 only**. Not usable on 6.x.
   - Chris's Premades and Gambit's Premades: require Midi QoL (Gambit's is Foundry-13-only).
   - Consequence: the mechanics stack is not yet usable on our platform. We wait.

4. **Rejected, measured, and not to be proposed again:**
   - **A runtime rules compiler** (a frontier model reads each creature's sheet prose at scene
     load and emits machine-readable descriptors that deterministic code executes). Built and
     shipped in hooks during Aug 2026, run over 1,022 distinct wordings on a real world. The
     model was conservative (86% of rules came back "ask the GM"), and every misreading it did
     make was **silent arithmetic** at the table — doubled damage, a dropped guard, a rule firing
     on the wrong turn — costing hours per bug to diagnose. No prompt change fixed the class.
   - **Generating Foundry macros from prose with a model.** Same misreading, plus generated code
     running inside the client with no review gate.
   - **Hand-coding 5e rules inside noodlr.** That bloat is what forced the 2026-08-08 split.
   - **Depending on Midi QoL for execution.** Only viable once midi declares dnd5e 6.x, and then
     as a new small module (item 5), never inside noodlr.

5. **What in hooks is worth reviving later, and the trigger.** Its *tactics* layer is novel and no
   community module does it: a deterministic NPC turn planner (utility scoring, cognition tiers
   from INT/WIS, seeded weighted choice), a per-creature perception sweep that starts encounters,
   per-watcher hiding, awareness (a planner that only sees what its creature can see),
   flee / surrender / mercy encounter resolution, and banter. It is only useful when a mechanics
   module resolves what the planner decides. **Trigger:** Midi QoL's `module.json` declares dnd5e
   6.x. **Then:** a NEW small module built on `MidiQOL.completeActivityUse` for execution, midi's
   `gmAutoAttack` / `gmAutoDamage` / `autoCheckSaves` / `reactionTimeout` for unattended NPC
   play, and an announce-only fallback when midi is absent. Salvage from the hooks backup:
   `src/tactics/`, `src/core/`, `src/rules/{perception,sight,stealth,hide}.ts`,
   `src/system/profiles.ts` and the `system/dnd5e-*` readers the planner imports. Not before the
   trigger, and not inside this repo.

6. **noodlr + noodlr-memory are the product and continue.** An AI game master: the GM co-pilot
   chat, the players' "Ask the Table" bot, siloed memory (RAG), the SillyTavern-informed prompt
   architecture, media generation, push-to-log transcription, the Tipster live scene briefing and
   the ground-truth combat state block. The goal is polish and a 1.0.0.

7. **The hooks integration inside noodlr was removed in v0.8.0 (2026-09-19).** `src/behavior/`,
   `src/capability/`, `src/watch/`, `src/integration/`, the `banter/` library, their settings,
   prompt fields, i18n keys and the `hooksModules()` / `capabilityModel()` console calls are gone.
   Nothing in this repo listens for a `noodlrHooks.*` hook. A reference you find to any of it is
   stale documentation — delete it. The done record is below.

### Standing "do not" list

- Do not add game-system knowledge to this module: no spell or feat names, no condition rules,
  no dnd5e data paths beyond the guarded, omit-when-absent display reads already in
  `src/combat/tracker.ts` and `src/tipster/scene.ts`.
- Do not propose rules automation, a rules compiler, macro generation, or a hooks revival before
  the trigger in item 5. If asked, point at this section.
- Do not depend on any third-party module (principle 0). Detect and enhance; never require.
- Do not consult `C:\Project\_research` — it is the dnd5e / Foundry source corpus that served
  hooks. Remove it from the workspace roots along with `C:\Project\noodlr-hooks-55e`.
- Do not re-add: Chronicle (removed 2026-07-27); RAG-backed Tipster collections (rejected
  2026-07-31); the `noodlr-vtt` external control bridge (never built, not planned);
  `stored || DEFAULT` prompt accessors (see invariants).
- Do not re-tune the embedding rate-limit constants in noodlr-memory. Four releases were spent
  on it and the fix was the embedding model slug (memory section).
- Do not read the hooks `AGENTS.md` backup for guidance on this repo. It describes a module that
  no longer exists and is full of dnd5e internals this module must not learn.

### Done record — v0.8.0 removed the rules-module integration (2026-09-19)

Deleted whole: `src/behavior/`, `src/capability/`, `src/watch/`, `src/integration/`, `banter/`,
and the four tests that imported only from them. Unwound: `src/module.ts`, `src/settings.ts`,
`src/constants.ts`, `src/apps/text-gen-app.ts`, `templates/text-gen.hbs`, `src/system/ruleset.ts`,
`src/chat/conversation.ts`, `src/prompts/fields.ts`, `src/prompts/index.ts`, `lang/en.json`,
`styles/noodlr.css`, `scripts/package.ps1`, `README.md`, `changelog.md`. `npm run check`, `lint`,
`build` and `test` (7/7) were green afterwards. The `hooks` parameter of `Conversation.send()` is
the chat panel's callback bag and was never related.

Two things survive on purpose — do not "clean them up":
- `LEGACY_HOOKS_PREFIX` (`"hooks:"`) in `src/system/ruleset.ts`. Worlds on 0.5–0.7 could store a
  ruleset picker value of `hooks:<module id>`; `rulesetChoice()` reads that as the shipped default
  so every prompt still names a system. A one-line migration, not dead code.
- `NOODLR.Settings.BehaviorLegend` in `lang/en.json` and the fieldset it labels in
  `templates/text-gen.hbs`. Despite the name it holds the Tipster and memory-write toggles.

Settings the removed features left in existing worlds are ignored by Foundry and harmless.

### What 1.0.0 means now

Smoke-tested at the table on the target platform: chat co-pilot, players' bot with a real
adjudication, memory ingest + retrieval on both backends, lorebook / author's note / post-history
injection, push-to-log, image / TTS, Tipster. No rules feature is part of parity.

## What this project is

**Noodlr** is an AI Dungeon Master module for Foundry VTT, game-system agnostic by design, with
D&D 5e as the first-class test case. Every line is hand-written by us (clean-room; see Provenance).

**Core thesis:** flagship LLMs are already competent, creative game masters. What they lack is
(1) reliable memory, (2) authoritative game state, and (3) restraint. Noodlr supplies all three:
a real vector/RAG memory service (`noodlr-memory`), ground-truth state injected from Foundry
itself, and a refusal to AI-ify mechanics that automation modules handle deterministically.

## Workspace layout

- `C:\Project\noodlr-main\` — **this project.** Git repo `github.com/gobsmacked1/noodlr`.
- `C:\Project\noodlr-memory\` — the standalone **vector/RAG memory service** (Node >= 20). Complete,
  MIT, own repo `github.com/gobsmacked1/noodlr-memory`.
- `C:\Project\noodlr-vtt\` — **test-capture folder**, not a git repo, nothing ships from it: chat
  exports, HARs, `prompt-backups/`, and `harness/` (the Playwright GM harness, below).
- Retired: `C:\Project\noodlr-hooks-55e\` (scrapped, backed up) and `C:\Project\_research\` (its
  source corpus). Remove both from the workspace roots.

## Provenance rules (clean-room — do not break)

1. Never copy code from the legacy third-party module that was once at `C:\Project\noodlr` (the
   folder is empty now). Not a line, not a regex. Work from behavioral descriptions only.
2. Everything in `noodlr-memory` and everything in this repo is ours.
3. Record provenance-relevant decisions here with dates.

## Design principles

0. **No third-party module is ever a dependency.** Every feature works with nothing installed
   but Foundry and a game system. Detect another module to *enhance* (e.g. read a calendar
   module's richer time components by duck typing); never require one. Prefer signals core cannot
   take away.
1. **No hardcoded game-system rules.** Rules live in the `system_rules` RAG silo (ingest any
   system's books / compendia) and in the model's own competence. The module ships zero rules
   logic. (Item 2 of READ FIRST is this principle restated after the experiment that violated it.)
2. **Mechanics belong to mechanics modules.** Noodlr narrates, remembers and adjudicates
   socially; it does not resolve dice mechanics.
3. **Two provider shapes, period:** OpenRouter (one shared API key) or any hand-entered
   OpenAI-compatible base URL + optional key. Applied uniformly to Chat, Embeddings, TTS, Image,
   Transcription, Music, Video, Rerank.
4. **Foundry is the source of truth.** HP, initiative, conditions, scene state come from
   Foundry's APIs and are injected as authoritative state. Dice are **never** model-rolled — a
   `{{roll:XdY}}` macro executes a real Foundry `Roll` and the result is fed back.
5. **SillyTavern-informed prompt architecture:** siloed data banks, keyword-activated lorebook
   entries with position and budget, author's note at depth, post-history instructions.
6. **TypeScript + esbuild**, strict, with a real build step.
7. **A capability that switches itself off must say so in the interface** (a greyed control or an
   advisory), never only in a comment. Every stand-aside or degradation in this repo follows that.

## What ships today (v0.8.0) — by folder

- `src/providers/` — per-feature `{provider, baseUrl, apiKey, model}` config; one shared
  OpenRouter key (`SETTINGS.openrouterApiKey`, world scope, write-only in the DOM); streaming SSE
  chat client (`chat-client.ts`) with CRLF-safe frame parsing and a JSON fallback for servers that
  ignore `stream:true`; OpenRouter model catalog filtered by output modality (`models.ts`);
  per-model voice lists (`supported_voices`); rerank (`rerank.ts`).
- `src/chat/` — the GM co-pilot conversation (`conversation.ts`): retrieval → assembler → stream →
  roll macros → one bounded auto-continuation → memory directives. Assistant name setting
  (`assistant.ts`, default "Polly Histor").
- `src/apps/` — ApplicationV2 windows: chat panel, player panel, five config windows (Memory,
  Text Generation, Audio Generation, Image Generation, Security) on `NoodlrConfigApp`, memory
  manager, memory browser, lorebook, diagnostics, creature voices. Header-only Save button
  (`header-save.ts`).
- `src/prompt/` — context assembler (one token budget, fixed blocks never truncated, history
  trimmed oldest-first), lorebook (world-setting JSON array, keyword/regex/constant activation,
  top/bottom position), author's note at depth, post-history slot with an automatic combat
  reminder when `game.combat?.started`.
- `src/prompts/` — the verbatim DM system prompt (`dm-system-prompt.ts`, mirrored in
  `prompts/dm-system-prompt.md`), the players' bot prompt, the GM adjudication prompt, and
  `fields.ts` — the single registry of every editable prompt field.
- `src/system/ruleset.ts` — the "which game are we playing" setting (`rulesetChoice`: curated
  list + `auto` + `custom`; default "Dungeons & Dragons Fifth Edition (2024)"); injected into every
  generation path as `buildRulesetBlock()` after the system prompt and `rulesetEcho()` in the
  post-history slot.
- `src/rag/` — `MemoryBackend` interface with two implementations: `RagClient` (HTTP to
  noodlr-memory) and `LocalMemory` (RAG Lite, in-browser MiniLM embeddings via transformers.js /
  ORT-WASM, JSON silo files under the world's media folder). Retrieval with silo scoping,
  precedence ranking, retraction filtering, optional rerank and optional web-search fallback.
  Ingest queue with resume and reload survival. Structured import (JSON / YAML / CSV). Prose
  cleaning (`prose.ts`). Memory-write directives with a rights matrix.
- `src/players/` — the players-only bot: socket relay to the primary GM, player-scoped retrieval,
  `@@NOODLR VERB {json}` directives, bot-to-bot adjudication with a real captured Foundry roll.
- `src/combat/tracker.ts` — the ⚔️ ground-truth state block rebuilt from `game.combat` each turn
  (PC exact HP, enemy HP tiers, conditions, defeated). Prompt material, not rules.
- `src/tipster/scene.ts` — live scene briefing (T1: ambience, time, light, regions; header
  `Token/Object Speaking:`).
- `src/media/` — TTS (`/audio/speech`, shared broadcast + local), image (four generators with
  continuity ledger), music (`/chat/completions` with audio modality), video (async
  `/videos` + poll), transcription, push-to-log, persistent media storage, creature-type voices.
- `src/log/chat-sniffer.ts` — native chat log → `unfiltered_chat` silo, primary GM only.
- `src/dice/roll-macros.ts`, `src/util/` (`gm.ts` `isPrimaryGM`, `speaker.ts`, `audit.ts`,
  `stats.ts`, `markdown.ts`, `tokens.ts`).

## noodlr-memory — contract and operating facts

Standalone Node >= 20 HTTP service; the module talks to it over HTTP only. Status: complete,
tested (node:test), MIT.

- **Collections (silos), 35, independently resettable:** `system_rules`, `docs`, `unfiltered_chat`,
  and sixteen topics each split `player_*` / `gm_*` (`locations, npc_state, calendar, chat, history,
  lore, quests, macguffin, puzzle, goals, story_arc, factions, reputations, effects, sheets,
  inventory`). Mirrored in `noodlr-memory/src/collections.js` and `noodlr-main/src/rag/silos.ts`.
  Access matrix (per-bot SELECT/INSERT/UPDATE/DELETE): `noodlr-memory/scripts/RAG_Collections_Access-Order-Intent.csv`,
  encoded as `SILO_RIGHTS` / `canWrite()` in `silos.ts`. `PLAYER_QUERY_SILOS` is the hard
  whitelist for the players' bot; `gm_*` is unreachable at the retrieval layer.
- **Backends:** `lancedb` (default, embedded Node SDK, one table per collection, only one process
  may write the directory), `vectra`, `qdrant`, `chroma` (`VECTOR_BACKEND`).
- **Embeddings:** `openrouter` (default model **`qwen/qwen3-embedding-8b`** — three provider
  endpoints; the old `perplexity/pplx-embed-v1-4b` had one and its saturation was our 429s),
  `custom` (any OpenAI-compatible `/v1/embeddings`), `transformers` (in-process), `mock`.
  **Changing the model changes the vector width; a LanceDB table's width is fixed at first write,
  so a switch means purge-all + full re-ingest.** `scripts/probe-rate.mjs routing <slug>` reports
  a model's provider count with no key — ask it before adopting a slug.
- **Chunker:** prose/table-aware; roll tables and stat blocks stay atomic; `kind:"event"` docs
  atomic.
- **Retrieval:** dense + BM25 fused by RRF, re-ranked by `importance` (0–10) + `recency`;
  multi-query fusion (Agent Mode) with entity soft-boosting. Every hit carries `collection`.
- **HTTP API** under `/v1`: `health`, `collections`, `ingest`, `ingest-file` (TXT/PDF; optional
  `importance`), `insert`, `query`, `list`, `delete`, `purge`, `purge-all`. Shared-secret header
  `x-noodlr-secret`. Binds 127.0.0.1:3010 by default; TCP and an optional Unix socket
  (`NOODLR_MEMORY_SOCKET`) run together; `NOODLR_MEMORY_PORT=0` opts out of TCP. CORS reflects
  Origin and answers OPTIONS. `DEPLOYMENT.md` has the Linux/systemd guide.
- **Ingest efficiency (keep):** `batchSize` 64, `EMBED_MAX_CHARS_PER_REQUEST` 48k, identical
  chunks embedded once per batch (`groupIdentical`, keyed on text not hash), already-stored hashes
  skipped on `/ingest` (`freshItems` + `knownHashes` LRU, invalidated by `/delete`, `/purge`,
  `/purge-all`). `/insert` deliberately does NOT skip stored hashes — it is the retraction/edit
  path. `/ingest` returns `{inserted, chunks, skipped, alreadyStored, repeats}`; zero inserted
  means finished, not broken.
- **Rate limits (settled, do not re-tune):** retries with `Retry-After` / `X-RateLimit-Reset` /
  exponential backoff from 500 ms; process-wide pause on 429; service holds a request at most 45 s
  then hands the 429 back so the module's visible 20-minute countdown does the waiting; hedging
  only for single-text requests. Adaptive pacing exists but is **off by default** (`EMBED_PACE_MAX_MS=0`)
  and must stay off. 401/402/400 never retry. `limiterOf()` distinguishes OpenRouter's own limit
  (headers present; credits help) from an upstream provider's (no headers; credits do not).
- **Diagnostic CLI:** `scripts/seed.mjs` (health / collections / seed / query / selftest / purge).
- **Query route bug to remember:** hybrid retrieval once returned zero hits for months because
  `clampInt` was called with a missing `max` → `NaN` → LanceDB `k must be positive`, swallowed to
  `[]`. Lesson: routes need their own tests, not only store tests.

### Module-side integration contract

1. `RagClient` / `LocalMemory` behind `MemoryBackend`; `getRagBackend()` / `getRagClient()` in
   `rag/config.ts`. Setting `rag.backend` defaults **`lite`**. `isRagEnabled()` is backend-aware.
2. **Memory access is GM-gated.** Only the GM client contacts noodlr-memory; `retrieveContext`
   returns null for non-GM. The shared secret is **client-scoped** (stays on the GM's machine);
   URL and tuning are world-scoped.
3. Two target modes (`rag.targetMode`): `direct` (full URL, default `http://127.0.0.1:3010`) or
   `proxy` (a path such as `/memory` resolved against `location.origin`). Loopback-URL-with-remote-
   Foundry and HTTP-on-HTTPS are detected before any request (`inspectRagTarget()`). Both
   normalizers strip a trailing `/v1`.
4. **RAG is pre-injected context, not a model-chosen tool.** `retrieveContext()` runs before the
   LLM call and the block is baked into the prompt. `chat-client.ts` sends
   `plugins:[{id:"web",enabled:false}]` on every OpenRouter chat request; the only web search is
   the opt-in confidence-gated fallback (`rag/web-fallback.ts`, off by default).
5. Graceful degradation: service down → play without long-term memory, warn once.
6. **Importance is written on every path** (`rag/importance.ts`): curated 8, ingested 7,
   assistantWrite 6, artifact 5, conversation 3, transcript 3, incidental 2, diagnostic 1.
7. **Retraction** (`rag/retraction.ts`): delete + re-insert with `metadata.retracted`; the browser
   shows it struck through; retrieval filters it. Works on both backends.
8. **Precedence:** `precedenceRank()` in `silos.ts` hoists character-sheet hits above rulebook
   hits above campaign memory inside `formatContextBlock`, before the budget loop. Silo array
   order is documentation only — every silo goes into one fused query.
9. **Ingest is a queue** (`rag/ingest-queue.ts`): module-level singleton, keyed `pack:<id>:<silo>`
   so a pack cannot be queued twice, `resumeAt` advanced only once a batch is stored, painted
   imperatively (never `render()` on progress), persisted so it survives a reload (primary GM
   writes and resumes; other GMs' jobs are carried), visible per-second countdown during waits.
10. `rag/failure.ts` tells a provider refusal apart from a broken service and names the remedy for
    the active backend only (`ingestFailureAdvice()` is the single dispatcher). Lite advice names
    Lite's two real failures: an incomplete install (no `models/`) and `FilePicker.upload` without
    `FILES_UPLOAD`.
11. `documentToText()` in `rag/ingest.ts` reads RollTable `results` and an actor's embedded Items,
    not only `system.description`; `ingestCompendium` warns with a census of documents that
    ingested as only their own name. `rag/prose.ts` drops `<section class="secret">` asides that
    talk about the software (Foundry tooling vocabulary) and keeps every other hidden section — a
    GM's own secrets are marked the same way. **Consequence for existing stores: purge, then
    re-ingest**, because scrubbed text is a new hash.

## The Dungeon Master core and prompt architecture

The default Chat system prompt is preserved verbatim in `prompts/dm-system-prompt.md`
(~1,050 tokens). Read it before touching assembly. Doctrines that shape the module:

- **Echoed combat tracker:** the module rebuilds the ⚔️ block from the real tracker every turn
  (`combat/tracker.ts`) and injects it as ground truth in the assembler's `foundryState` slot,
  concatenated with the Tipster block (combat first).
- **External dice only:** `{{roll:...}}` → real `Roll.evaluate()`, replaced inline as
  `[formula = total]`; one bounded auto-continuation (`chatContinueAfterRoll`).
- **Post-history instructions:** always-last slot; combat reminder swapped in automatically;
  `rulesetEcho()` rides there too.
- **Author's note** at configurable depth; **lorebook** entries keyword/regex/constant-activated.
- **Ruleset statement:** `buildRulesetBlock()` immediately after the system prompt in every
  generation path (assembler, `players/answer.ts`, `players/adjudication.ts`). Any new generation
  path must include it — the module once adjudicated in PF2e terms because nothing had told the
  model which system Foundry was running.
- **Memory tools:** the GM co-pilot emits `@@NOODLR REMEMBER/UPDATE/FORGET` directives
  (`rag/memory-writes.ts`, gated by `chatMemoryWrites`, every write audited to GMs). The players'
  bot uses the same syntax with `audience:"player"`.
- Chronicle (a 📜-line review queue) was removed 2026-07-27 as redundant with directives + the
  memory browser. Do not re-add.

## Remaining roadmap (noodlr only)

1. ~~v0.8.0 — remove the rules-module integration~~ — done 2026-09-19 (READ FIRST done record).
2. **Prompt defaults:** the `TBD_IGNORE_ME_FOR_NOW` placeholders in `src/prompts/fields.ts`
   (image positive/negative except Map's positive, `authorNote`, `postHistory`) need real text;
   the user is writing it.
3. **Verify in-app what has never been verified:** push-to-log MediaRecorder cycling and the
   transcript relay; image/music/video from a player client (expected to fail — see the relay
   note under Open decisions); lorebook / author's note / post-history injection at the table.
4. **Player-initiated media through the GM relay** (same shape as `PlayerAskPayload`).
5. Tipster T2–T5 (speaker/party incl. `user.targets`, perceived others with the trust boundary
   and name/HP leak guards, GM omniscient view, terrain escape hatch). Perception is computed on
   the asking player's client (`token.isVisible` is authoritative there) and validated on the GM.
6. 1.0.0 at parity (definition above).

Parked ideas live in `IDEAS.md`. Rules-automation ideas were removed from it on 2026-09-19.

## Tech stack, conventions, release discipline

- TypeScript (strict) + esbuild → `dist/noodlr.js` (ESM, sourcemap, unminified — console stack
  traces from play are the primary diagnostic channel). `module.json` id **`noodlr`**,
  `"socket": true`. Self-authored ambient Foundry types in `src/types/foundry.d.ts` (no community
  types package). Only ApplicationV2 (`HandlebarsApplicationMixin`).
- `npm run check` (tsc) + `npm run lint` + `npm run build` before commit; prettier printWidth 100,
  LF via `.gitattributes`. Small commits at working checkpoints.
- **Release:** every shipped change is a normal incremented release (no `-rc`; GitHub excludes
  prereleases from `releases/latest`). Bump `version` in `package.json` + `module.json`, point
  `module.json.download` at the new tag, run **`npm run package`** (`scripts/package.ps1` asserts
  versions agree, runs check/lint/clean-build, checks for dangling chunk references, zips, and
  re-opens the zip to confirm `module.json`, `dist/noodlr.js`, the ORT asyncify wasm, `lang`,
  `styles`, `templates/partials/` and the ONNX weights are inside). Commit, tag,
  `gh release create <tag> module.zip module.json` (notes via `--notes-file`). Add the entry to
  `changelog.md` (lowercase filename — Big Bad Module Manager reads it; keep it user-facing).
- **Verify the release's ASSETS, not just the tag.** `gh release view <tag> --json assets` must
  list both files, and `https://github.com/gobsmacked1/noodlr/releases/latest/download/module.json`
  must return the new version with a `download` URL that returns 200. An assetless release makes
  the newest release the broken one and blocks every update.
- **`models/` must be in the zip.** RAG Lite's embedder sets `allowRemoteModels = false`; an asset
  without the weights 404s for manifest installs. A correct zip is ~29 MB; ~13 MB means the model
  is missing. The build wipes `dist/` first (code-splitting chunk names are content-hashed and
  stale chunks used to ship).
- Windows host gotcha: the file-write tool occasionally emits UTF-16LE; verify new files are UTF-8.
- Never store secrets in this file or in setting defaults.

## Deployment facts (the user's server)

- Host `DEMIURGE` (Linux). Foundry runs as `superuser` from `/opt/foundryvtt`; data at
  `/opt/foundryvtt/data/Data`; module installs to `.../Data/modules/noodlr`. `noodlr-memory`
  deploys to `/opt/noodlr-memory` (systemd unit; `journalctl -u noodlr-memory` is its log).
  Intended memory URL is `https://<host>/memory` behind nginx.
- **The Data tree is served to the internet with no authentication** (measured). Anything a
  diagnostic writes under `assets/` or `worlds/<id>/assets/` is public by filename (directory
  listing is refused). Generated media is deliberately referenced by path so players' browsers can
  fetch it; never write a console log or anything with tokens there. A narrow nginx deny for
  diagnostic subtrees (`survey/`, `logs/`) is the remedy if one is ever needed.
- **One host, two worlds, one memory index — fixed in v0.7.5.** The media folder setting
  registers **empty** and resolves to `worlds/<id>/assets/noodlr-out` (`defaultMediaFolder()`;
  `getMediaFolder()` is the only reader). RAG Lite silos live under it, so two campaigns no longer
  share one index. A module MAY `FilePicker.upload` into `worlds/<id>/` — the FilePicker *UI*
  refuses, the server does not. Files were not moved; old chat-card paths still resolve. **No
  legacy read-through anywhere**: a world with an unreadable `game.world.id` reads and writes
  nothing rather than falling back.

### The GM harness — `C:\Project\noodlr-vtt\harness\`

`watch-gm.mjs` runs the GM session in a Playwright Firefox, writes every console record to a
file, and exposes a localhost port an agent can run diagnostics through.

```
cd C:\Project\noodlr-vtt\harness
npm install && npm run setup   # once
npm run watch                  # GM; log in by hand the first time, the profile remembers you
npm run watch-player           # second Firefox, port 3112, log in as a player once
```

- `logs/latest.log` is everything; `logs/latest.signal.log` is warnings/errors/failed requests/
  `/noodlr/i`. Slices roll on combat start/end (a 2 s poll of `game.combat.started`), on an idle
  hour or 16 MB; the finished fight is copied to `logs/latest.combat.log`. Archives older than
  seven days are deleted.
- `POST http://127.0.0.1:3111/eval` (body = JavaScript) answers with the value **and** the console
  output the call produced. Also `GET /health`, `GET /tail?n=200&signal=1`, `POST /roll`,
  `POST /screenshot`. Player client: same endpoints on 3112. Never log a player into the GM profile.
- **Binds 127.0.0.1 only and must stay that way** — `/eval` is arbitrary JS in a logged-in session.
- Playwright cannot attach to an already-open stock browser; the persistent profile is the
  mitigation. Set `$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\ms-playwright"` before
  `playwright install` or the browser lands in a sandbox cache. Target is `/vtt/join`, not `/vtt/`.
  Downloads are saved to `C:\Install` (or `harness/downloads`).

### What each diagnostic channel can see

- Module code is browser-only ESM; **nothing it logs reaches the server.** `journalctl` cannot
  show a client-side error.
- The **chat log** is server-side (messages are world documents) and carries any failure card the
  module posts.
- `noodlr-memory`'s log is server-side by nature.
- A file named `fvtt-log-<date>.txt` in `noodlr-vtt` is a chat export, not a server log.

## Durable facts by area

### Providers and OpenRouter (all verified live, 2026-07)

- `GET /api/v1/models?output_modalities=<m>` filters server-side: text=all(343), image, audio,
  embeddings, speech, transcription, rerank, video. Chat is left unfiltered on purpose (every model
  outputs text). Catalog is public; no key is sent for it.
- Rerank: `POST /api/v1/rerank {model, query, documents[], top_n}` → `results[{index,
  relevance_score}]`. A 404 "no endpoints matching your guardrail restrictions and data policy" is
  the account's privacy setting, not our bug; warned once per distinct reason.
- Music: `/chat/completions` with `modalities:["text","audio"]`, streamed; concatenate all base64
  audio then decode ONCE. Video: `POST /api/v1/videos` → poll `polling_url` (deadline 20 min,
  cadence 6 s) → `unsigned_urls[0]`, which points back at the API host and **requires the bearer
  token** — download with the key attached only when the URL is on the API host, reject sub-1 KB
  payloads, save locally, display the local path.
- `/audio/speech` has no pitch field; pitch is sent only when `tts.pitchSupported` is ticked.
- A local HTTP endpoint from an HTTPS Foundry page is mixed-content blocked whatever the API
  shape; proxy it behind nginx. The TTS test surfaces this as the fetch `TypeError` case.
- **API keys are player-readable — accepted risk (2026-07-31).** Provider settings are world-
  scoped, so any player can read the OpenRouter key from the console. It is a spend credential
  only; the credential that gates concealed knowledge (the memory secret) is client-scoped.
  Mitigation is operational: a dedicated key with a credit limit, rotated. Do not "fix" by moving
  keys to client scope without revisiting.

### Chat panel and conversation

- Transcript and model history are **static** on `NoodlrChatPanel` / `Conversation` so they
  survive close/reopen; DOM is imperative (no re-render mid-stream); `.noodlr-chat__body` is
  selectable; copy buttons per bubble.
- **"Hide from players" is one-shot** and travels with the turn: Retry must pass the original
  turn's `hidden` flag, never re-read the checkbox. Hidden turns use local `speak()`, never
  `speakShared()`.
- `stream_options.include_usage` feeds `util/stats.ts` (tokens, RAG hits, injected chars, rerank,
  ingest, media) shown in Diagnostics.

### Players' bot ("Ask the Table")

- Privilege lives at the access layer, not in the prompt: `game.user.isGM` is the boundary.
  Player input → `module.noodlr` socket → **primary GM** client does retrieval (player silos only)
  + the LLM call → public `ChatMessage` flagged `flags.noodlr.playerBot`, adopted by any open panel.
- `sendPlayerAsk()` checks `game.users.activeGM` and tells the player when no GM is online.
- Directives are provider-agnostic `@@NOODLR VERB {json}` lines (native tool calling is unreliable
  on custom endpoints). `ADJUDICATE` registers a pending check keyed by userId; the player's REAL
  Foundry roll (a `createChatMessage` with `rolls`, matched by author) is consumed; the GM-side
  adjudicator retrieves `GM_SECRET_SILOS`, rolls a real d20 for NPC opposition, and posts a tiered
  player-facing result. The secret never leaves the GM client except as the earned reveal.
- Verified at the table 2026-07-31: hide → Stealth roll → spotted → initiative, unprompted.

### Media

- Images are persisted via `FilePicker.upload` and shared by **path** — Foundry strips base64
  `data:` URLs from chat HTML, which is why the first image pipeline showed nothing.
- Four generators (`IMAGE_KINDS`): scene art 1920×1080, portrait 1000×1000 keyed, token 400×400
  keyed, map default 4500×6000 (clamp 450–7800). `.webp` via canvas transcode; maps transcode at
  the returned resolution (no in-browser upscale). Continuity ledger `image.ledger` (entityKey →
  seed/prompt/model/path). Chat triggers `Generate Image:` / `Generate Portrait: Name: desc`,
  gated by `image.chatTrigger` and `image.allowPlayers` (default off).
- Broadcast speech filenames are namespaced by user id (two GMs both start at slot zero).
- Creature-type → {voice, pitch} table in `media/creature-voice.ts` reads dnd5e
  `system.details.type` when present and omits otherwise.
- Push-to-log: floating mic for all participants, ~N-second MediaRecorder segments → local
  transcription → GM posts to chat + session JournalEntry + periodic `player_chat` ingest; players
  relay transcript **text** over the socket. Gated by `transcription.enabled`.

### Tipster (live scene briefing)

- Built on demand at assembly time into the existing `foundryState` slot; **ephemeral by
  construction** (never written to history); self-capped (~180 tokens, nearest-N with a `+N more`
  tail) because the assembler never truncates fixed blocks.
- `resolvePerspectiveToken(user)`: controlled token → assigned character's token → any owned
  token. Two world toggles `tipsterGm` / `tipsterPlayers` (default on).
- API facts not to re-derive: z is `token.elevation` (`sort` is draw order); `token.disposition`
  has SECRET; doors are `wall.door` 0/1/2(secret) and `wall.ds` 0/1/2(locked); real distances are
  `grid.size`/`grid.distance`/`grid.units`; `game.time.components`/`.calendar` exist in v13+ and
  calendar modules subclass `CONFIG.time.worldCalendarClass` (read by duck typing, never
  `instanceof`). `user.targets` and `token.displayName` / `displayBars` are the T2/T3 leak guards.
- Trust boundary for T3: the player client narrows (perception), the GM client validates (drops
  `hidden` and SECRET tokens), so a forged snapshot buys nothing.

### Debug channel

`SETTINGS.debugLogging` (client-scoped, in Foundry's native settings list). `debug()`,
`debugPayload()` (collapsed console group per message with role and token estimate — the tool for
"did the RAG / lorebook / Tipster block reach the request"), `warn()`, `isDebugEnabled()`.

## Hard-won invariants

- **A prompt field's stored value is the whole truth.** Every prompt setting ships pre-filled
  with its default (`src/prompts/fields.ts` is the registry) and is read verbatim. An emptied field
  means "send nothing"; the way back is per-field Reset. Never reintroduce
  `stored.trim() || DEFAULT`. Textareas carry `data-prompt-field` and **no `name`** (dotted keys
  collide with the form serializer); saved through `sanitizeUserText(..., {preserveLayout: true})`.
  `seedPromptDefaults()` runs once per world (`promptDefaultsSeeded`); do not re-seed on version
  change. **Corollary:** improving a shipped default reaches only new worlds; before spending
  anything on a prompt change, compare the stored text against
  `game.settings.settings.get("noodlr.<key>").default`, diff, back up to
  `C:\Project\noodlr-vtt\prompt-backups\`, and reset only if the diff is purely additive.
- **`"socket": true` must stay in `module.json`**, and a change to it needs a world restart.
  Without it every `game.socket.emit("module.noodlr", …)` is silently dropped and only the GM's
  own paths appear to work (cost several release cycles).
- **`isGM` is a role several clients can hold.** Anything that must happen once for the table
  (journal writes, ingestion, deleting a message, shared files) must also pass `isPrimaryGM()`
  (`src/util/gm.ts`, reads Foundry's own `Users#activeGM` — do not build a second election).
- **Every chat card goes through `util/speaker.ts`** (`speakerFor(subject)` / `narrator()`). An
  unsigned card, or one with an empty alias, is signed by core with the author's assigned
  character, which may be a different actor. `playedTokens(user)` is plural on purpose; test
  ownership with `testUserPermission`, never `ownership[id] === 3`.
- **The Noodlr control group's `activeTool` names an inert hidden `home` tool.** Foundry skips the
  active tool on click, so pointing it at a real button stops that button reopening its panel.
- Never name a `data-action` after one of core's own verbs (`tab`, `close`, `submit`,
  `toggleDisabled`).
- **Window text selection:** `.noodlr .window-content, .noodlr .window-content * { user-select:
  text !important }` — core's `user-select: none` shifts between patch releases.
- Register only the modern hook name on v13+ (`renderChatMessageHTML`); registering the legacy
  `renderChatMessage` emits the deprecation warning by itself.
- **Diagnostics print a flat block and return a count.** A nested object pasted from a console is
  a collapsed line that answers nothing.
- **A progress indicator that only updates on completion is not one**; a wait has to be visible
  or it reads as a hang.
- **Interpolate an error's `.message` into a log line; never pass the Error object as an
  argument** (a console renders it as its class name).
- **A retry policy written as a whitelist of transient statuses fails closed on every status it
  has not met.** Classify by reading the body, and default unknown to transient.

## Open decisions / accepted risks

- **Players do not get `FILES_UPLOAD` by default**, and every media path ends in `saveMedia` →
  `FilePicker.upload`, so a player-initiated image would generate and then fail to persist or
  share. Latent (media `allowPlayers` defaults off). The fix is the GM relay carrying media too.
- **Multi-GM permissions** for silo resets and memory review are unmodelled beyond `isPrimaryGM`.
- **Safety tooling** (lines-and-veils / X-card) is not in the DM prompt; undecided whether it
  becomes a feature.
- **LanceDB single-writer:** noodlr-memory must be the only writer of `LANCEDB_URI`.
- **Chat sniffer target fields** are best-effort text; no universal "target" exists on
  ChatMessage.
