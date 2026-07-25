// Orchestration for the two new generative pillars:
//  - Music: generate -> save to <mediaFolder>/music -> add to a Foundry Playlist and play
//    (Playlists give loop/crossfade/scene-linking for ambient & combat tracks) + chat card.
//  - Video: generate (async poll) -> save to <mediaFolder>/video -> broadcast via ImagePopout
//    (its src accepts video) to all participants + chat card. Reuses the image share helpers.

import { log } from "../constants";
import { getMusicConfig, getVideoConfig, getImageParams } from "./config";
import { generateMusic, MusicError } from "./music";
import { generateVideo, VideoError } from "./video";
import { saveMedia } from "./storage";
import { shareMediaPopout, postMediaCard } from "./scene-art";
import { bumpStats } from "../util/stats";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Generate music and deliver it to the table via a Foundry Playlist. Duration for chat models
 * (e.g. lyria) isn't a hard API parameter, so we fold the requested length into the prompt as a
 * best-effort hint and clamp it to the configured min/max.
 */
export async function createAndPlayMusic(input: {
  description: string;
  seconds?: number;
  /** GM-prep mode: don't play to the shared playlist; whisper a preview card to GMs only. */
  hidden?: boolean;
}): Promise<void> {
  const cfg = getMusicConfig();
  const seconds = clamp(input.seconds ?? cfg.minSec, cfg.minSec, cfg.maxSec);
  ui.notifications?.info(game.i18n.localize("NOODLR.Media.Music.Generating"));

  let result;
  try {
    const prompt = `${input.description}\n\n(Target length: about ${seconds} seconds. Instrumental unless lyrics are requested.)`;
    result = await generateMusic(prompt);
  } catch (err) {
    const msg = err instanceof MusicError ? err.message : String(err);
    ui.notifications?.error(game.i18n.format("NOODLR.Media.Music.Failed", { error: msg }));
    return;
  }

  const path = await saveMedia(result.blob, input.description || "music", {
    subfolder: "music",
    ext: result.format === "mp3" ? "mp3" : result.format,
  });
  if (!path) {
    ui.notifications?.error(game.i18n.localize("NOODLR.Media.Music.NoSave"));
    return;
  }

  // Hidden (GM prep): skip the shared playlist so nothing plays for the table; the whispered
  // preview card lets the GM audition the track privately.
  const handle = input.hidden
    ? null
    : await addToPlaylist(cfg.playlist, path, input.description || "Noodlr track");
  // Retry/Reject: the RAG commit is deferred to the GM after the 60 s window; Reject also removes
  // the generated PlaylistSound so a discarded track doesn't linger in the playlist.
  await postMediaCard(
    path,
    input.description || "Noodlr music",
    "audio",
    {
      gen: { fn: "music", description: input.description, seconds },
      commit: {
        rag: {
          silo: "scenes",
          text: `Music cue: ${input.description}`,
          metadata: { source: "music", path, ts: Date.now() },
        },
      },
      cleanup: handle ? { playlist: handle } : undefined,
    },
    { whisperGM: input.hidden },
  );
  bumpStats({ music: 1 });
}

/**
 * Find/create the named Playlist, add the track, and start playing it. GM only (needs create).
 * Returns the created {playlistId, soundId} so a rejected track can be removed later.
 */
async function addToPlaylist(
  playlistName: string,
  path: string,
  title: string,
): Promise<{ playlistId: string; soundId: string } | null> {
  try {
    const PlaylistCls = (globalThis as any).Playlist;
    let pl = game.playlists?.getName(playlistName);
    if (!pl) pl = await PlaylistCls.create({ name: playlistName });
    if (!pl) return null;
    const created = await pl.createEmbeddedDocuments("PlaylistSound", [
      { name: title.slice(0, 120), path, repeat: false, volume: 0.8 },
    ]);
    const sound = Array.isArray(created) ? created[0] : created;
    if (sound) await pl.playSound(sound);
    return sound ? { playlistId: pl.id, soundId: sound.id } : null;
  } catch (err) {
    log("could not add track to playlist:", err);
    ui.notifications?.warn(game.i18n.localize("NOODLR.Media.Music.NoPlaylist"));
    return null;
  }
}

/**
 * Generate a video (async), persist it, and broadcast it to every participant. GM-only unless
 * the "allow players" toggle is on (enforced by the caller).
 */
export async function createAndShareVideo(input: {
  description: string;
  seconds?: number;
  /** GM-prep mode: show only on the GM's screen (no broadcast; card whispered to GMs). */
  hidden?: boolean;
}): Promise<void> {
  const cfg = getVideoConfig();
  const duration = clamp(input.seconds ?? cfg.duration, 6, 30);
  ui.notifications?.info(game.i18n.localize("NOODLR.Media.Video.Generating"));

  // Reuse the image generator's Positive/Negative style so video matches the look of stills.
  // The video API has no native negative_prompt field, so we fold it into the prompt text
  // (best-effort — some models heed "Avoid:" phrasing, others ignore it).
  const { positive, negative } = getImageParams();
  const prompt = [
    positive.trim() ? positive.trim() : null,
    input.description.trim(),
    negative.trim() ? `Avoid: ${negative.trim()}.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let result;
  try {
    result = await generateVideo(prompt, {
      duration,
      resolution: cfg.resolution,
      aspect: cfg.aspect,
      onStatus: (s) => log(`video job: ${s}`),
    });
  } catch (err) {
    const msg = err instanceof VideoError ? err.message : String(err);
    ui.notifications?.error(game.i18n.format("NOODLR.Media.Video.Failed", { error: msg }));
    return;
  }

  // Persist the downloaded bytes locally. The remote URL needs auth to fetch, so players can't
  // load it directly — a local copy is required to display/broadcast.
  const path = await saveMedia(result.blob, input.description || "video", {
    subfolder: "video",
    ext: "mp4",
  });
  if (!path) {
    ui.notifications?.error(game.i18n.localize("NOODLR.Media.Video.NoSave"));
    return;
  }
  await shareMediaPopout(path, input.description || "Noodlr video", !input.hidden);
  await postMediaCard(
    path,
    input.description || "Noodlr video",
    "video",
    {
      gen: { fn: "video", description: input.description, seconds: duration },
      commit: {
        rag: {
          silo: "scenes",
          text: `Video: ${input.description}`,
          metadata: { source: "video", path, ts: Date.now() },
        },
      },
    },
    { whisperGM: input.hidden },
  );
  bumpStats({ video: 1 });
}
