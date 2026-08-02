# Changelog

All notable changes to Noodlr, newest first. Written for GMs rather than developers.

## 0.4.19

- **Memory service: pick how the browser reaches it.** A browser cannot open a Unix socket, so a
  service reached over one is only usable through the web server that already serves Foundry. Memory
  Configuration now offers "Behind the Foundry server" (give it the proxied path, e.g. `/memory`)
  alongside the old direct URL, shows the exact address it will call, and warns when the URL points
  at `127.0.0.1` — which means your own desktop, not the Foundry host.
- Test connection now reports into the window instead of a toast that vanishes, and explains
  unreachable results (socket vs TCP, wrong bind address, missing proxy location, mixed content).
- Text in Noodlr windows can be selected and copied again; a Foundry style change had started
  winning over ours.
- The "Test voice output" box arrives with a sample phrase in it, and refills itself if you empty
  it, instead of failing the test with nothing to say.

## 0.4.18

Settings reorganized, and prompts are no longer hidden from you.

- **Configuration is now five topic windows** instead of one endless page: Memory Configuration,
  Text Generation, Audio Generation, Image Generation, and Security. Nothing was removed — TTS,
  music, and transcription live under Audio; the four picture generators and video under Image; API
  keys under Security.
- **Every prompt field arrives filled in with Noodlr's own wording**, and what you see is exactly
  what gets sent. Previously an empty box quietly meant "use the built-in prompt", so the ~1,000-token
  Gamemaster prompt was neither visible nor editable. Each field now has its own **Reset** button, and
  clearing a field really does send nothing.
- **Two prompts became editable for the first time:** the players' chatbot prompt (the one that keeps
  it from handing out your secrets) and the roll adjudicator prompt. Image prompt-expansion
  instructions are editable too.
- **The assistant can be renamed.** Text Generation → "The GM assistant's name" (default
  Polly Histor). The new name appears in both chat panels and on the chat cards it posts.
- Author's note depth, context token budget, memory writes, and scene awareness moved out of
  Foundry's own settings list into Text Generation, next to the prompts they affect.
- Toolbar: the dead dragon button is gone, and each role now sees only its own chat button — GMs the
  co-pilot, players the table bot. Both still post their public answers to Foundry's chat log.
- A few fields whose shipped wording is still being written read `TBD_IGNORE_ME_FOR_NOW`. That is a
  placeholder, not a bug: it is stripped before anything is sent, so write over it or leave it alone.

Upgrading an existing world: any prompt field you had left empty is filled with its shipped default
once, on the first load. Fields you had actually written are untouched.

## 0.4.17

- Fixed duplicated work when more than one person is logged in with Gamemaster rights. Transcripts
  were posted, journaled, and written to memory once per GM client; generated speech could also
  collide over the same filename. One designated GM now does the work for the table.

## 0.4.16

- "Hide from players" is now one-shot: it clears itself after the prompt is accepted, so the next
  reply isn't hidden by accident.
- Retrying a hidden reply keeps it hidden. Previously Retry could re-run the prompt in full view of
  the players.

## 0.4.15

- Fixed broadcast speech being saved with a non-audio file extension, which made players' browsers
  refuse to play it ("Invalid URI").
- Hidden replies are badged **GM ONLY** in the panel.

## 0.4.14

- **Fixed the players' chatbot never answering.** The module was not requesting a socket namespace,
  so Foundry silently discarded every question players sent to the GM's client. Requires a world
  restart to take effect, not just a page reload.

## 0.4.13

- Hidden narration is never spoken to the table. Text was hidden correctly, but its audio was still
  broadcast — which spoiled surprises.
- Generated speech is queued instead of overlapping when several replies finish together.

## 0.4.12

- Scene awareness now includes the token roster, filtered by privilege: the GM sees hidden tokens and
  hit points, players see neither.
- Generated speech plays on every connected client, not only the machine that produced it.

## 0.4.11

- The GM's client acknowledges a relayed player question, and a standby GM takes over if the
  designated one doesn't pick it up — so a player learns the relay failed instead of waiting.
- Answers from the players' chatbot are spoken aloud.

## 0.4.10

- Every step of the player question round trip is now time-bound, so it can fail loudly instead of
  hanging forever.

## 0.4.9

- Added opt-in debug logging for both chatbots, and stopped silently swallowing rerank and relay
  failures (an OpenRouter rerank 404 now explains itself).

## 0.4.8

- **Scene awareness (Tipster):** each request quietly carries the live state of the active scene —
  name and size, in-world date and time, lighting, ambient sound, named regions. Read fresh from
  Foundry every time and never stored, so it cannot go stale.

## 0.4.6 – 0.4.7

- **A separate chatbot for players:** answers what the party already knows, and asks for a real
  Foundry roll before revealing anything hidden. Questions are relayed to the GM's client, so no
  API key or GM-only memory is ever exposed to a player's browser.
- Memory reorganized into purpose-scoped collections, with a searchable Memory browser on the
  toolbar and GM tools for editing what Noodlr remembers.
- Renamed Dungeon Master to Gamemaster throughout the interface.

## 0.4.0 – 0.4.5

- **RAG Lite:** a built-in memory backend that runs entirely in the browser, so long-term memory
  works with nothing to install. The standalone `noodlr-memory` service remains the other option.
- Retry / Reject controls on every AI output, with a 60-second window before it is committed to
  memory; outputs are shared with players by default, with a "Hide output" toggle for prep.
- Structured file import (JSON / YAML / CSV) into memory.
- Opt-in, confidence-gated web-search fallback for when memory comes up short.
- A raw memory-query inspector plus context-size statistics in Diagnostics.
- Context budget raised to 64,000 tokens, with a warning when it exceeds the model's own window.

## 0.3.0

- Four independent picture generators (scene art, portrait, token, battlemap), each with its own
  model, style prompt, and size.
- One shared OpenRouter key for every OpenRouter-backed feature.

## 0.2.x

- Configuration grouped by feature, with write-only API keys and live OpenRouter model lists filtered
  by what each feature can actually use.
- Music, video, and rerank support; per-creature-type voices; an inline TTS self-test that diagnoses
  CORS and mixed-content failures; a Diagnostics window.
- Generated scene art is broadcast to the table, saved to disk, and tracked so a subject keeps a
  consistent look.
- Memory access is GM-gated, and the memory service secret is stored per-browser so it is never
  replicated to players.

## 0.1.0

- First working module: streaming chat against OpenRouter or any OpenAI-compatible endpoint, the
  Noodlr Gamemaster prompt, real Foundry dice via `{{roll:...}}`, long-term memory, the prompt
  architecture (lorebook, author's note, post-history), TTS, image generation, push-to-log
  transcription, and the combat co-pilot.
