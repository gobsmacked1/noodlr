# AGENTS.md — noodlr (repo folder `noodlr-main`)

Durable memory for **noodlr**, the AI game master module for Foundry VTT. Auto-loaded as context.
Keep it current with durable facts and decisions; never secrets. **Read the first section before
doing anything else** — it records a direction change and it overrides anything older you may
find in commit history, the changelog, or a backup of another module.

## READ FIRST — where the project stands (decided 2026-09-19, direction widened 2026-09-20)

1. **Platform: Foundry v14 + dnd5e 6.0.3, tracking each one's latest.** `module.json`
   compatibility is min 13 / verified 14 / max 14. We are **not** downgrading to Foundry 13 or
   dnd5e 5.3 to regain compatibility with community modules that have not caught up.

2. **What noodlr is becoming: an AI game master that runs the table, not a chatbot beside it.**
   The end state is an unattended, persistent world — a headless GM client on the host, players
   coming and going, a human GM optional. Two bots: the **GM bot** holds every hand a Foundry GM
   has; the **players' bot** holds a small, code-checked subset. Until 2026-09-20 both bots could
   only *talk*; a whispered "award the party 300 XP" or "move the ogre to chamber J" produced prose
   and nothing happened. That is the gap this direction closes. The model's *judgement* was never
   the problem — the bots had no **hands**. They get hands as **verbs** (item 4), never as
   knowledge dumps (item 6).

3. **Three separations hold the whole design up. Do not blur any of them.**
   - **Judgement / hands / dice.** The model decides *what happens* (narrative, social, world
     state). The module *executes* it through verbs that call Foundry's own API. **Rules
     resolution — did the attack hit, how much damage, did the save succeed, which condition
     applies, whose reaction fires, how far can it move — is the community automation modules'
     job and never ours.** Calling a system's *own* API to do arithmetic it already implements
     (`Award.awardXP`, `actor.longRest({dialog:false})`, `actor.applyDamage(n)` on a GM's explicit
     order) is pressing the system's button, not ruling. Deriving that number from a chat card or
     a rule is ruling. The line is: **a verb executes an instruction somebody gave; it never reads
     a die.**
   - **The trust boundary is code, not prompt.** Speech from a GM or assistant GM (`user.isGM`)
     reaches the full verb set. Speech from a player reaches the curated player subset, each verb
     with a precondition checked in code (door unlocked, item within reach, actor owned). Player
     text is *quoted fiction* to the GM bot: it is never a source of instruction for a GM-set
     verb, however it is phrased. This is the same boundary the players' bot already draws
     (`game.user.isGM` at the access layer, `PLAYER_QUERY_SILOS` at retrieval); verbs extend it,
     they do not add a second one.
   - **Undo replaces confirmation.** A human GM does not confirm every token drag, and neither
     does the bot. The exceptions mirror Foundry's own prompts: deleting an Actor, Scene,
     JournalEntry, Item or Playlist asks first; everything else executes and is written to a
     **ledger** with the prior state, reversible in one click from a GM window. Unattended play
     is only tolerable with a complete ledger, so the ledger is not optional polish — it ships
     with the first verb.

4. **The verb layer — shape, home, rules.**
   - **Vehicle:** the existing provider-agnostic `@@NOODLR VERB {json}` directive line
     (`src/players/directives.ts` parses; `Conversation.send()` executes post-stream). Native tool
     calling stays out — it is unreliable on custom endpoints, which is why directives exist.
   - **Home: `src/verbs/` (new).** A registry (`name`, params schema, `audience: gm | player`,
     `precondition`, `execute → LedgerEntry`), a **resolver** (a name or description → a document:
     token, actor, item, region, note, drawing, journal page, scene, user, playlist), an
     **executor** (runs on the primary GM client only — `isPrimaryGM()`, existing helper), a
     **ledger** with undo, and a **manifest builder** that renders the verbs the model may use
     into the prompt. Manifest is **tiered**: a core set always; domain packs only when their
     state is live (combat verbs when `game.combat`, scene-placement verbs when the canvas is
     ready, playlist verbs when playlists exist). Target: 1–2k tokens for the manifest even at
     50 verbs.
   - **noodlr stays system-agnostic.** Core verbs use core Foundry API only (`TokenDocument#move`,
     `createEmbeddedDocuments`, `toggleStatusEffect` with names read from `CONFIG.statusEffects`,
     `JournalEntry#show`, `ImagePopout.shareImage`, pull-to-scene, `game.togglePause(false)`,
     `game.time.advance`, `Scene#activate`, wall `ds`/`door` writes, light/region toggles).
     **System verbs live in a child "verb pack" module** — first one `noodlr-tools-dnd5e` (new
     repo, not this one) — which registers through a public hook/API (`noodlr.registerVerbs`,
     to be defined in step 1). Detect and enhance; never require (principle 0). With no pack
     installed the core set works alone.
   - **Resolution fails closed.** An exact id / uuid always wins. An ambiguous name (two "Guard"
     tokens, no region called "chamber J") makes the bot **ask**, never guess. The spatial
     vocabulary is **named Regions, Notes and Drawings** — GM prep becomes naming the world, and
     the manifest tells the model which names exist on the current scene.
   - **Ledger store: a GM-only `JournalEntry`** (`ownership.default: NONE`, primary GM writes).
     Not a world setting (Foundry ships every world setting to every client, and the ledger holds
     prior HP, positions and hidden-token facts). Not a file under `Data/` (the Data tree is served
     unauthenticated — see Deployment facts). Restores use `keepId: true` on `Document.create` so
     a deleted document comes back under its own id and every link to it survives. Host-level
     world-directory snapshots are the last resort and are ops (systemd timer + rsync), not module
     code.

5. **Implementation sequence — approved 2026-09-20. Work it in order; each step ships alone.**
   1. **Verb kernel + core GM verbs + ledger/undo**, co-pilot only (a human GM is at the table).
      Roughly a dozen verbs: `move_token`, `teleport_token`, `place_token` (from an Actor),
      `remove_token`, `toggle_door`, `toggle_light`, `give_item`, `take_item`, `apply_status`,
      `remove_status`, `show_journal`, `show_image`, `pull_to_scene`, `whisper`. Undo window on the
      GM chat panel. Smoke-test at the table before step 2.
   2. **dnd5e verb pack (`noodlr-tools-dnd5e`)**: `award_xp`, `award_currency` (both
      `dnd5e.applications.Award` statics, verified in 6.0.3 source), `rest` (`initiateRest` with
      `dialog:false`), `apply_damage` / `heal` on an explicit order, `advance_time`. Proves the
      registration API from outside the repo.
   3. **Player verb subset** through the existing socket relay (`PlayerAskPayload` shape): open an
      unlocked door within reach, pick up a reachable item, move own token, read a shown journal.
      Preconditions in code, executed on the primary GM, ledgered like everything else. This also
      closes the parked "player-initiated media through the GM relay" item — media becomes a verb.
   4. **Naming the world + perception**: resolver over Regions / Notes / Drawings; Tipster T2–T5
      (speaker, party, perceived others with the trust boundary, GM omniscient view). The bot's
      eyes; step 6 depends on it.
   5. **Event-driven GM.** The GM bot wakes on hooks — player joined, chat posted, token entered a
      named Region, door opened, `updateCombat`, an idle timer — digests state, makes one model
      call, executes verbs, narrates. Mode is derived, not configured: **co-pilot** when a human GM
      is `activeGM` (bot narrates and executes on request, takes no initiative); **autopilot** when
      the bot's own client is `activeGM`.
   6. **Headless GM host process.** Grows from `C:\Project\noodlr-vtt\harness\watch-gm.mjs`
      (Playwright Firefox, persistent profile, auto-login): a systemd unit on the Foundry host that
      logs in as a dedicated bot User, unpauses, and stays. **Election fact (core source,
      `Users#getDesignatedUser`): `activeGM` is the active GM-role user with the highest role, ties
      broken by lowest id.** Give the bot User the ASSISTANT role so a human GAMEMASTER is primary
      whenever online and the bot is primary only when alone — co-pilot/autopilot falls out of the
      election with no switch. Verify the ASSISTANT permission set covers every core verb before
      relying on it (world-setting writes are GAMEMASTER-only by default). The harness `/eval` port
      stays `127.0.0.1` diagnostics; the headless GM is a *Foundry client running noodlr*, not an
      external control API.
   7. **Unattended combat — blocked.** Nothing on dnd5e 6.x resolves an attack without a human.
      Until Midi QoL declares dnd5e 6.x the bot runs everything up to initiative (exploration,
      social, travel, shopping, puzzles, rests) and hands combat to a human or narrates around it.
      When the trigger fires, the NPC tactics layer returns as its own small module (item 8), and
      the verb layer is what it will execute through.

6. **Rejected, measured, and not to be proposed again.**
   - **A runtime rules compiler** (a frontier model reads each creature's sheet prose at scene
     load and emits machine-readable descriptors that deterministic code executes). Built and
     shipped in hooks during Aug 2026, run over 1,022 distinct wordings on a real world. The
     model was conservative (86% of rules came back "ask the GM"), and every misreading it did
     make was **silent arithmetic** at the table — doubled damage, a dropped guard, a rule firing
     on the wrong turn — costing hours per bug to diagnose. No prompt change fixed the class.
   - **Generating Foundry macros from prose with a model.** Same misreading, plus generated code
     running inside the client with no review gate. A verb is the opposite: a fixed, reviewed
     function the model may only *select* and *parameterise*.
   - **Hand-coding 5e rules inside noodlr.** That bloat is what forced the 2026-08-08 split.
   - **Depending on Midi QoL for execution.** Only viable once midi declares dnd5e 6.x, and then
     in a new small module, never inside noodlr.
   - **"Knowledge packs" — injecting Foundry API docs or the dnd5e source/rules into the prompt,
     or vectorising them into new `foundry_api` / `game_system` silos (proposed and rejected
     2026-09-20).** Measured: dnd5e 6.0.3 rule prose alone is millions of tokens against a 4k RAG
     budget and 64k context; the API docs are larger. And it answers the wrong question — the bots
     did not need to *know* the API, they needed a fixed set of actions to call. Rules text the
     table wants the bot to cite already has a home: `ingestCompendium` into the existing
     `system_rules` silo. Do not create a `foundry_api` silo; do not add the dnd5e repo to RAG.
   - **A knowledge-injecting child module registered in the "Game Rules System" picker.** Same
     rejection. A child module's job is *verbs* (item 4), not prose.

7. **Community stack status as of 2026-09-19**, verified from each module's own `module.json`
   (`relationships.systems[].compatibility`). The foundryvtt.com package pages reported wrong
   versions during this check and must not be trusted for it.
   - DAE v14 and Automated Conditions 5e v14: declare dnd5e 6.x. Usable.
   - Midi QoL v14.0.12: declares dnd5e **5.2.4–5.3.99 only**. Not usable on 6.x.
   - Chris's Premades and Gambit's Premades: require Midi QoL (Gambit's is Foundry-13-only).
   - Consequence: unattended combat (step 7) waits. Everything else does not.

8. **`noodlr-hooks-55e` is archived read-only on GitHub (2026-09-20), not deleted.** Its
   integration inside noodlr was removed in v0.8.0 (done record below). Two salvage lists, both
   by *behavioural description* re-verified against current source, never by copy-paste:
   - **For the verb layer (step 1, 4):** `src/core/movement.ts` (`TokenDocument#move` returns
     `false` silently on four paths; a move `=== true` is not proof of movement — verify
     `doc._source.x/y`; a Region-paused move never settles, race it against a timeout),
     `src/core/positioning.ts` (`measureBetween`, `reachBetween` — closest occupied squares, the
     scene's diagonal rule), `src/rules/sight.ts` (per-creature vision source built by hand and
     never `add()`ed; `observersWhoSee`; `hasLineOfSight`), `src/util/queries.ts` (`askGm` /
     `askUser` over `CONFIG.queries`), `src/util/prompt.ts` (timed `DialogV2`).
   - **For the tactics module (step 7 trigger):** `src/tactics/`, `src/rules/{perception,stealth,
     hide}.ts`, `src/system/profiles.ts` and the `system/dnd5e-*` readers the planner imports —
     a deterministic NPC turn planner (utility scoring, cognition tiers from INT/WIS, seeded
     weighted choice), per-creature perception sweep, awareness, flee / surrender / mercy, banter.
     Built on `MidiQOL.completeActivityUse` for execution, announce-only fallback without midi.
     **Not before Midi QoL declares dnd5e 6.x, and not inside this repo.**
   - The hooks `AGENTS.md` carries the tombstone and the same two lists. Its body is a history
     of dnd5e internals this module must not learn; read it only for a specific API fact you are
     about to re-verify.

### Standing "do not" list

- Do not add game-system knowledge to this module: no spell or feat names, no condition rules,
  no dnd5e data paths beyond the guarded, omit-when-absent display reads already in
  `src/combat/tracker.ts` and `src/tipster/scene.ts`. **System-specific verbs go in the verb
  pack module, never here.** A core verb that needs a system path is a system verb.
- Do not let a verb read a die, a chat card verdict, an AC, a DC or a rule. A verb takes an
  instruction and executes it. If the instruction is "apply the damage from that card", the
  answer is that the GM presses the tray; if it is "deal 10 fire damage to the goblin", that is a
  verb.
- Do not let player-sourced text reach a GM-audience verb, and do not put the check in the
  prompt. `audience` on the registry entry plus `user.isGM` at dispatch is the gate.
- Do not add a verb that mutates without writing a ledger entry, and do not add a confirmation
  dialog to a verb that is not an unrecoverable delete. Both defeat the doctrine in item 3.
- Do not propose rules automation, a rules compiler, macro generation, native tool calling, a
  knowledge pack, or a hooks revival before its trigger. If asked, point at items 6 and 8.
- Do not depend on any third-party module (principle 0). Detect and enhance; never require.
- `C:\Project\_research` is the Foundry / dnd5e **source corpus for verifying API signatures**
  (`ftypes14/` types, `fvtt13/` client source, `dnd5e/` 6.0.3). Use it to check a call before
  coding a verb. Do not use it to learn rules into this module, and do not read its `_audit/`
  reports for direction — they served hooks.
- Do not re-add: Chronicle (removed 2026-07-27); RAG-backed Tipster collections (rejected
  2026-07-31); `stored || DEFAULT` prompt accessors (see invariants); a second GM election (use
  `isPrimaryGM()` / `game.users.activeGM`).
- Do not re-tune the embedding rate-limit constants in noodlr-memory. Four releases were spent
  on it and the fix was the embedding model slug (memory section).

### Done record — v0.8.0 removed the rules-module integration (2026-09-19)

Deleted whole: `src/behavior/`, `src/capability/`, `src/watch/`, `src/integration/`, `banter/`,
and the four tests that imported only from them. Unwound: `src/module.ts`, `src/settings.ts`,
`src/constants.ts`, `src/apps/text-gen-app.ts`, `templates/text-gen.hbs`, `src/system/ruleset.ts`,
`src/chat/conversation.ts`, `src/prompts/fields.ts`, `src/prompts/index.ts`, `lang/en.json`,
`styles/noodlr.css`, `scripts/package.ps1`, `README.md`, `changelog.md`. `npm run check`, `lint`,
`build` and `test` (7/7) were green afterwards. The `hooks` parameter of `Conversation.send()` is
the chat panel's callback bag and was never related. Nothing in this repo listens for a
`noodlrHooks.*` hook; a reference you find to one is stale documentation — delete it.

Two things survive on purpose — do not "clean them up":
- `LEGACY_HOOKS_PREFIX` (`"hooks:"`) in `src/system/ruleset.ts`. Worlds on 0.5–0.7 could store a
  ruleset picker value of `hooks:<module id>`; `rulesetChoice()` reads that as the shipped default
  so every prompt still names a system. A one-line migration, not dead code.
- `NOODLR.Settings.BehaviorLegend` in `lang/en.json` and the fieldset it labels in
  `templates/text-gen.hbs`. Despite the name it holds the Tipster and memory-write toggles.

Settings the removed features left in existing worlds are ignored by Foundry and harmless.

### What 1.0.0 and 2.0.0 mean now

- **1.0.0 — a GM co-pilot with hands**, smoke-tested at the table on the target platform: chat
  co-pilot executing core and dnd5e verbs from whispered orders with working undo, players' bot
  with a real adjudication and the player verb subset, memory ingest + retrieval on both
  backends, lorebook / author's note / post-history injection, push-to-log, image / TTS, Tipster
  T1–T3. Steps 1–4 of item 5. No rules feature is part of parity.
- **2.0.0 — the unattended GM**: steps 5–6 running a session with no human GM connected, through
  a non-combat evening. Combat autonomy is not part of 2.0.0 (item 5 step 7).

## What this project is

**Noodlr** is an AI Dungeon Master module for Foundry VTT, game-system agnostic by design, with
D&D 5e as the first-class test case. Every line is hand-written by us (clean-room; see Provenance).

**Core thesis:** flagship LLMs are already competent, creative game masters. What they lack is
(1) reliable memory, (2) authoritative game state, (3) restraint, and (4) hands. Noodlr supplies
all four: a real vector/RAG memory service (`noodlr-memory`), ground-truth state injected from
Foundry itself, a refusal to AI-ify mechanics that automation modules handle deterministically,
and a fixed, reviewed, ledgered set of verbs the model may select to act on the world (READ FIRST
item 4).

## Workspace layout

- `C:\Project\noodlr-main\` — **this project.** Git repo `github.com/gobsmacked1/noodlr`.
- `C:\Project\noodlr-memory\` — the standalone **vector/RAG memory service** (Node >= 20). Complete,
  MIT, own repo `github.com/gobsmacked1/noodlr-memory`.
- `C:\Project\noodlr-vtt\` — **test-capture folder**, not a git repo, nothing ships from it: chat
  exports, HARs, `prompt-backups/`, and `harness/` (the Playwright GM harness, below). Its
  `_hooks-era/` subfolder quarantines every artifact of the retired rules module (capability caches,
  sheet censuses, `noodlrHooks.*` probes); read its README, take no direction from its contents.
- `C:\Project\_research\` — Foundry / dnd5e **source corpus**, read-only reference: `ftypes14/`
  (v14 API types), `fvtt13/foundryvtt/` (v13 client source), `dnd5e/` (6.0.3 checkout). Verify a
  call's signature here before writing a verb against it. Its `_audit/` folder served hooks and is
  not direction for this repo.
- `C:\Project\noodlr-hooks-55e\` — **archived read-only** (GitHub archive, 2026-09-20). Salvage
  lists are in READ FIRST item 8. Remove it from the workspace roots once step 1 has taken what it
  needs; nothing here imports from it.
- Planned, not yet created: `noodlr-tools-dnd5e` — the first verb pack module (READ FIRST item 5,
  step 2). Its own repo; depends on nothing; registers verbs when both it and noodlr are active.

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
2. **Mechanics belong to mechanics modules; hands belong to noodlr.** Noodlr narrates, remembers,
   adjudicates socially, and **acts** — it presses every button a GM can press, through verbs
   that call Foundry's own API. It never resolves a die, a hit, a save or a condition rule. "Move
   the ogre", "award 300 XP", "open that door" are verbs; "did the ogre's claw hit" is not, and
   never will be (READ FIRST item 3).
2a. **Judgement is the model's, execution is code, and the two never swap.** The model may only
   *select* and *parameterise* a verb from a fixed registry; it never writes code, a macro or a
   rule. A verb never infers what the model should have said. Everything a verb changes is
   ledgered and reversible.
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

The ordered sequence is READ FIRST item 5; this list is the same work with the smaller items that
ride alongside it.

1. ~~v0.8.0 — remove the rules-module integration~~ — done 2026-09-19 (READ FIRST done record).
2. **Step 1 — verb kernel, core GM verbs, ledger + undo** (`src/verbs/`). First release with hands.
   Facts already verified for it, so nobody re-derives them: `TokenDocument#move` returns
   `Promise<boolean>` and resolves `false` silently on four paths (verify `_source.x/y` after);
   `action: "displace"` is core's teleport and ignores walls and cost by construction; `Document.create`
   / `createEmbeddedDocuments` accept `keepId: true` for restores; status names come from
   `CONFIG.statusEffects` at runtime, never a list; `game.togglePause(paused, push)`;
   `JournalEntry#show()`, `ImagePopout.shareImage`, the pull-to-scene socket event.
3. **Step 2 — `noodlr-tools-dnd5e` verb pack** (new repo). `dnd5e.applications.Award.awardXP` /
   `.awardCurrency` are statics `(amount, destinations, {each, origin})`; `actor.initiateRest({type,
   dialog:false, chat})`; `actor.applyDamage(damages, options)`. All verified in the 6.0.3 corpus.
4. **Step 3 — player verb subset** over the socket relay (`PlayerAskPayload` shape). Absorbs the
   old "player-initiated media through the GM relay" item: media requests become verbs whose
   `execute` runs on the GM client, which has `FILES_UPLOAD`.
5. **Step 4 — naming the world + Tipster T2–T5** (speaker/party incl. `user.targets`, perceived
   others with the trust boundary and name/HP leak guards, GM omniscient view, terrain escape
   hatch). Perception is computed on the asking player's client (`token.isVisible` is authoritative
   there) and validated on the GM. The resolver reads Regions / Notes / Drawings by name.
6. **Prompt defaults:** the `TBD_IGNORE_ME_FOR_NOW` placeholders in `src/prompts/fields.ts`
   (image positive/negative except Map's positive, `authorNote`, `postHistory`) need real text;
   the user is writing it. The verb manifest is a *new* prompt block, not one of these fields.
7. **Verify in-app what has never been verified:** push-to-log MediaRecorder cycling and the
   transcript relay; lorebook / author's note / post-history injection at the table.
8. **1.0.0** at the definition above (steps 1–4 smoke-tested).
9. **Steps 5–6 — event-driven GM, headless host process; 2.0.0.**
10. **Step 7 — unattended combat**: blocked on Midi QoL declaring dnd5e 6.x; then the tactics
    module (READ FIRST item 8), which executes through the verb layer.

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
  share. Latent (media `allowPlayers` defaults off). The fix is the player verb subset (READ
  FIRST item 5, step 3): the request relays, the GM client executes.
- **Multi-GM permissions** for silo resets and memory review are unmodelled beyond `isPrimaryGM`.
- **Verb layer, decided but unbuilt (2026-09-20):** the ledger is a GM-only `JournalEntry`; the
  player subset's preconditions are code, not prompt; deletes of Actor / Scene / JournalEntry /
  Item / Playlist are the only confirmation gates; the bot User is ASSISTANT role so the human GM
  wins the `activeGM` election. Open: whether an ASSISTANT can execute every core verb (world
  settings are GAMEMASTER-only by default), and whether a headless Firefox renders the canvas
  well enough for Region containment tests — both to be measured at step 6, not assumed.
- **The bot's verbs and the community mechanics modules will one day touch the same documents**
  (a `move_token` during a midi workflow, a status applied while AC5e watches). No conflict exists
  today because no mechanics module runs on 6.x. When one does, the rule is the same as
  principle 0: detect and stand aside per operation, never require.
- **Safety tooling** (lines-and-veils / X-card) is not in the DM prompt; undecided whether it
  becomes a feature.
- **LanceDB single-writer:** noodlr-memory must be the only writer of `LANCEDB_URI`.
- **Chat sniffer target fields** are best-effort text; no universal "target" exists on
  ChatMessage.
