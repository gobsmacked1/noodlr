# Noodlr for Foundry VTT

Noodlr is an AI Gamemaster module for [Foundry VTT](https://foundryvtt.com/), game-system-agnostic by
design, with D&D 5e as the first-class test case.

**Core thesis:** modern flagship LLMs are already competent, creative game masters. What they lack is
(1) reliable memory, (2) authoritative game state, and (3) restraint. Noodlr supplies all three:

- real vector/RAG memory, queried at prompt-assembly time — either in-browser (zero setup) or via the
  standalone [`noodlr-memory`](https://github.com/gobsmacked1/noodlr-memory) service;
- ground-truth state injected from Foundry itself (HP, initiative, conditions, scene contents, dice); and
- a deliberate refusal to AI-ify mechanics that automation modules (Midi QoL, DAE, Chris's Premades,
  Gambit's, …) already handle perfectly.

> **Status: v0.4.x, pre-1.0.** Running and actively tested in a live Foundry world, but not yet at the
> parity bar we've set for 1.0.0. Expect rough edges, and expect settings to move.

## Design principles

1. **No hardcoded game-system rules.** Rules live in retrieval and in the model's own competence. The
   module ships zero rules logic, so it works for any system whose books you feed it.
2. **Mechanics belong to mechanics modules.** Noodlr narrates, decides, and adjudicates; it never
   re-implements what a mundane automation module resolves instantly and for free.
3. **Two provider shapes only.** OpenRouter (API key) or any hand-entered OpenAI-compatible base URL
   (+ optional key), applied uniformly to chat, embeddings, rerank, TTS, image, music, video, and
   transcription. No per-vendor client zoo, no asking you for six consumer API keys.
4. **Foundry is the source of truth.** Dice are never model-rolled — a `{{roll:XdY}}` macro runs a real
   Foundry `Roll`. The combat tracker is rebuilt from Foundry each turn rather than trusted to the model's
   own last message.

## Requirements

- **Foundry VTT v13 or newer** (verified against v14).
- **An OpenRouter API key**, or any OpenAI-compatible endpoint, for chat. Everything else — memory,
  voice, images, music, video, transcription — is optional and configured independently.
- **Memory is optional to set up.** The default backend runs entirely in your browser with a bundled
  embedding model and needs no server, no key, and no configuration. Point Noodlr at a
  [`noodlr-memory`](https://github.com/gobsmacked1/noodlr-memory) service instead when you want memory
  shared across GM machines, server-side embeddings, or PDF ingestion.

## Install

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/gobsmacked1/noodlr/releases/latest/download/module.json
```

Then enable **Noodlr** in your world.

Noodlr uses a module socket, and Foundry reads that from the manifest at **server start** — so after a
fresh install, restart the Foundry server (not just the browser) or player-to-GM features will fail
silently.

### Quick start

1. Open **Game Settings → Noodlr → Security** and paste your OpenRouter key.
2. Open **Text Generation**, pick a chat model, and hit **Test connection**.
3. Click Noodlr's scene control, or press **Ctrl+Shift+N**, to open the chat panel.
4. Optionally open **Memory Configuration** and turn memory on — the default in-browser backend needs
   nothing else.
5. Optionally ingest your rules compendia from **Manage Memory** so the GM can answer rules questions
   from your actual books.

## Features

### Two chatbots, with different privileges

**Polly Histor (GM)** is the co-pilot — rename her to anything you like in **Text Generation**, and every
label, chat alias, and window title follows. She offers streaming markdown chat, real dice macros, full retrieval across
every memory silo, and the built-in Gamemaster system prompt (overridable, 65k characters). Each turn
carries Retry/Reject for 60 seconds, and a **Hide from players** option that keeps a turn on your screen
only — not mirrored to chat, not spoken aloud anywhere else. Hiding applies to one prompt at a time and
the reply is badged **GM ONLY**.

**Ask the Table (players)** is a separate bot for your players, with its own prompt and a deliberately
narrower view of the world. It answers mundane questions truthfully, but for anything privileged it
plays gatekeeper: it asks for a real skill check rolled from the player's own sheet, then hands a
*structured* request to the GM-side adjudicator, which consults the GM-only silos and returns a tiered
reveal. The secret text never reaches the player's machine — only the earned result does. Every
adjudication is logged to the GM.

Player requests are relayed through the GM's client, so provider keys and the memory secret never leave
the GM's machine and privilege is enforced at the access layer rather than by asking a prompt nicely.

### Memory

Retrieval runs over purpose-built silos (player-visible, GM-secret, and shared/system), so the players'
bot is structurally incapable of querying the GM's secrets. Hybrid dense + keyword search with
Reciprocal Rank Fusion, optional reranking, and an optional Agent Mode that decomposes a question into
multiple sub-queries before fusing the results.

Feed it from the **Manage Memory** window: ingest any compendium (locked or not) into a silo of your
choice, or upload `.txt`, `.md`, `.csv`, `.json`, `.yaml`, and `.pdf` files. The **Memory browser** on
the toolbar gives you search-driven CRUD over any collection, and Polly Histor can maintain memory
herself with autonomous remember/update/forget directives (every write whispered to you as an audit
line, and switchable off).

If memory is unavailable, the module says so once and keeps playing without it.

Pointing at a `noodlr-memory` service asks one question worth understanding: the service listens on
**either** a Unix socket **or** a TCP port, never both, and a browser cannot open a Unix socket. So
Memory Configuration offers two ways to reach it. **Behind the Foundry server** is the recommended one
— give it the path your reverse proxy forwards, typically `/memory`, and requests ride Foundry's own
origin, which means the socket deployment works, TLS comes free, and there's no CORS. **Direct URL**
suits a service on a reachable TCP port, and needs `NOODLR_MEMORY_SOCKET` unset with
`NOODLR_MEMORY_HOST` bound somewhere the GM's browser can actually address — `127.0.0.1` means the GM's
own desktop, which the window will warn you about.

### Prompt architecture

A token-budgeted context assembler composes each request in a defined order: system prompt, lorebook
entries, retrieved memory, live Foundry state, chat history with the author's note injected at depth,
and post-history instructions last.

- **Lorebook / World Info** — keyword-activated entries with insertion order, position, and budget.
- **Author's note** — a session anchor injected at a configurable depth.
- **Post-history instructions** — an always-last slot, with a combat reminder that swaps itself in when
  Foundry combat starts and clears when it ends.
- **Scene awareness** — a live scene briefing built on demand from the canvas: environment, placeables,
  and a token roster, filtered by privilege so the players' bot never sees hidden tokens or exact enemy
  HP. Toggled separately for each chatbot.

### Media

- **Voice** — TTS over OpenRouter or any OpenAI-compatible `/audio/speech`, with a dynamic voice list,
  optional auto-read, per-creature-type voice and pitch assignment, and broadcast so the whole table
  hears it rather than just the GM's browser.
- **Images** — four separate generators (scene art, portrait, token, map), each with its own provider,
  positive/negative prompts, optional prompt expansion, SD-era parameters (steps, CFG, sampler, seed),
  and continuity keying so the same character regenerates recognizably.
- **Music and video** — short generated tracks routed to a Foundry playlist, and short clips shared to
  the table. Both off by default.
- **Push-to-log** — click-to-start voice capture for anyone at the table. Segments are transcribed
  locally, relayed as text, posted to chat (optionally), appended to a session journal, and ingested
  into memory on a timer, so a spoken session leaves a searchable transcript.

Every generated artifact arrives as a chat card with Retry and Reject for 60 seconds before it commits
to memory.

### Combat

A ground-truth state block is rebuilt from Foundry's own combat tracker each turn — initiative, HP
(tiered for enemies), conditions, and zone positions — and injected as authoritative context, so the
model narrates from real state instead of copying its own last message. **Run NPC turn** has the model
decide and narrate the current NPC's action while real dice and your automation modules resolve it.

## Chat commands

Type these into Foundry's normal chat bar. Each can be disabled, and each can be opened to players,
independently in settings.

| Command | Result |
| --- | --- |
| `Generate Image: <description>` | Scene art, shared to the table |
| `Generate Portrait: <description>` | Character portrait, keyed for continuity |
| `Generate Token: <description>` | Top-down actor token, keyed for continuity |
| `Generate Map: <description>` | Battle map |
| `Generate Music: <mood>` | Music added to a playlist |
| `Generate Video: <description>` | Short video clip |

## Where things live

Noodlr's **scene control** holds the chat panels, the four image generators, run-NPC-turn, music and
video, the Lorebook, and the Memory browser. Each role sees exactly one chat button: the GM gets the
co-pilot, players get **Ask the Table**, and the rest of the tools are GM-only. **Ctrl+Shift+N** opens
whichever panel suits your role. The push-to-log mic floats at bottom-center whenever transcription is
enabled.

Settings live in five windows under **Game Settings**, each opening its own page:

| Window | Holds |
| --- | --- |
| **Memory Configuration** | memory backend, retrieval tuning, embeddings, rerank, ingestion, plus Manage Memory and Diagnostics |
| **Text Generation** | chat provider and model, the assistant's name, every text prompt, author's-note depth, context budget, memory writes, scene awareness |
| **Audio Generation** | TTS, voices, music, push-to-log transcription |
| **Image Generation** | the four image generators and video |
| **Security** | provider API keys |

Only the per-client **verbose logging** toggle stays in Foundry's plain settings list, since players need
it to gather their own console diagnostics and the five windows are GM-only.

### Prompts ship filled in, not blank

Every prompt box — system prompts, positive and negative image prompts, the author's note, post-history
instructions — arrives pre-populated with Noodlr's default text, so you can read what the module is
actually telling the model instead of guessing at a blank field. Edit it freely; the stored text is
exactly what gets sent. Clearing a box means "send nothing", not "silently fall back to the default", and
each box has its own **Reset** button to put the shipped text back. Fields whose default text is still
being written show `TBD_IGNORE_ME_FOR_NOW`; that placeholder is stripped before any request, so it is
safe to leave alone.

## Console API

```js
const noodlr = game.modules.get("noodlr").api;
noodlr.openChat();            // GM co-pilot
noodlr.openPlayerChat();      // players' panel
noodlr.openMemory();          // Manage Memory
noodlr.openTextGen();         // settings windows: also openAudioGen, openImageGen, openSecurity
noodlr.openLorebook();
noodlr.openRagBrowser();      // Memory browser
noodlr.speak("The tavern door creaks open.");
await noodlr.generateSceneImage("a rain-lashed harbor at dusk");
await noodlr.generateMusic("a slow dirge for a funeral procession");
noodlr.togglePushToLog();
await noodlr.runNpcTurn();
```

## A note on keys and privacy

Provider keys are stored as world settings, which in Foundry means a determined player can read them
from their own client. Use a credit-capped key you're willing to rotate. The memory service secret is
stored per-client and stays on the GM's machine.

Audio and images generated for the table are written to your world's data folder and served like any
other Foundry asset, so treat "shared with the table" as "reachable by anyone with the URL". Content you
hide from players is never uploaded or broadcast — it stays in the GM's browser.

## Development

```bash
npm install
npm run build      # bundles src/ -> dist/noodlr.js
npm run watch      # rebuild on change
npm run check      # tsc --noEmit
npm run lint       # eslint
npm run format     # prettier --write
```

Copy or symlink the folder into `Data/modules/noodlr`. A distributable build needs `module.json`,
`dist/`, `templates/`, `styles/`, `lang/`, `prompts/`, `models/`, `LICENSE`, and `changelog.md`.

Release notes live in [changelog.md](changelog.md), which
[Big Bad Module Manager](https://github.com/thejoester/bbmm) surfaces to your GM after an update.

## License

MIT — see [LICENSE](LICENSE).
