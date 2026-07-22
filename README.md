# Noodlr — AI Dungeon Master for Foundry VTT

Noodlr is an AI Dungeon Master module for [Foundry VTT](https://foundryvtt.com/)
(game-system-agnostic by design, with D&D 5e as the first-class test case).

**Core thesis:** modern flagship LLMs are already competent, creative game masters. What
they lack is (1) reliable memory, (2) authoritative game state, and (3) restraint. Noodlr
supplies all three:

- a real vector/RAG memory service ([`noodlr-memory`](https://github.com/)), queried at
  prompt-assembly time;
- ground-truth state injected from Foundry itself (HP, initiative, conditions, dice); and
- a deliberate refusal to AI-ify mechanics that automation modules (Midi QoL, DAE,
  Chris's Premades, Gambit's, …) already handle perfectly.

> Status: **v0.1.0, pre-parity.** The code builds clean and is type-checked, but has not
> yet been smoke-tested inside a live Foundry v14 world. Treat this as an early build.

## Design principles

1. **No hardcoded game-system rules.** Rules live in the RAG (`rules` silo) and the
   model's own competence. The module ships zero rules logic.
2. **Mechanics belong to mechanics modules.** Noodlr narrates, decides, and adjudicates;
   it does not re-implement automation.
3. **Two provider shapes only:** OpenRouter (API key) or any hand-entered
   OpenAI-compatible base URL (+ optional key). Applied uniformly to Chat, Embeddings,
   TTS, Image, and Transcription.
4. **Foundry is the source of truth.** Dice are never model-rolled — a `{{roll:XdY}}`
   macro runs a real Foundry `Roll`. The combat tracker is rebuilt from Foundry each turn.

## Features

- **Chat co-pilot** — streaming DM chat with markdown, real dice macros, per-user
  identity, and the built-in Dungeon Master system prompt (fully overridable, 65k chars).
- **Memory (RAG)** — connect to the `noodlr-memory` service: siloed vector DBs, hybrid
  retrieval, optional Agent-Mode query decomposition, compendium ingestion matrix, and
  TXT/PDF upload. Graceful degradation when the service is offline.
- **Prompt architecture** — keyword/constant lorebook (World Info), author's note at
  depth, post-history instructions, an auto-swapped combat reminder, a token-budgeted
  context assembler, and a 📜 Chronicle review pipeline (promote canon to the lorebook or
  ingest as event memories).
- **Media** — TTS (OpenAI-compatible `/audio/speech`, dynamic voice list, optional
  auto-read), image generation (OpenAI/SD-compatible with SD params + prompt expansion),
  and push-to-log voice capture (segmented transcription → chat + session journal +
  periodic RAG ingest).
- **Combat co-pilot** — a ground-truth ⚔️ state block rebuilt from Foundry each turn, and
  AI-run NPC/monster turns that decide + narrate while real dice and your automation
  modules resolve the mechanics.

## Requirements

- Foundry VTT **v14** (verified; minimum v13).
- An OpenRouter key **or** any OpenAI-compatible endpoint for Chat (and optionally
  Embeddings/TTS/Image/Transcription).
- Optional but recommended: a running
  [`noodlr-memory`](https://github.com/) service for long-term memory.

## Install (development)

```bash
npm install
npm run build      # bundles src/ -> dist/noodlr.js
npm run watch      # rebuild on change
npm run check      # tsc --noEmit
npm run lint       # eslint
npm run format     # prettier --write
```

Then symlink or copy this folder into your Foundry `Data/modules/noodlr` directory and
enable **Noodlr — AI Dungeon Master** in your world. The distributed module needs:
`module.json`, `dist/`, `templates/`, `styles/`, `lang/`, and `LICENSE`.

## Configure

Open **Game Settings → Configure Settings → Noodlr**:

- **Chat provider / model / key** (native settings) — start here.
- **Configure Noodlr** — edit the DM system prompt, author's note, post-history, combat
  reminder, and the combat NPC-turn prompt; test the chat connection.
- **Manage Memory** — point at the `noodlr-memory` service, test it, view/reset silos,
  and ingest compendia or files.
- **Edit Lorebook** / **Review Chronicle** — manage World Info and promote captured canon.

Open the chat panel from the scene-controls dragon button or `Ctrl+Shift+N`. The
push-to-log mic button floats at the bottom-center of the screen.

## Console API

```js
const noodlr = game.modules.get("noodlr").api;
noodlr.openChat();
noodlr.openMemory();
noodlr.speak("The tavern door creaks open.");
await noodlr.generateSceneImage("a rain-lashed harbor at dusk");
noodlr.togglePushToLog();
await noodlr.runNpcTurn();
```

## License

MIT — see [LICENSE](LICENSE).
