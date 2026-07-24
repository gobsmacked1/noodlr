// Orchestration for the two new generative pillars:
//  - Music: generate -> save to <mediaFolder>/music -> add to a Foundry Playlist and play
//    (Playlists give loop/crossfade/scene-linking for ambient & combat tracks) + chat card.
//  - Video: generate (async poll) -> save to <mediaFolder>/video -> broadcast via ImagePopout
//    (its src accepts video) to all participants + chat card. Reuses the image share helpers.

import { log } from "../constants";
import { getMusicConfig, getVideoConfig } from "./config";
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

  await addToPlaylist(cfg.playlist, path, input.description || "Noodlr track");
  await postMediaCard(path, input.description || "Noodlr music", "audio");
  bumpStats({ music: 1 });
}

/** Find/create the named Playlist, add the track, and start playing it. GM only (needs create). */
async function addToPlaylist(playlistName: string, path: string, title: string): Promise<void> {
  try {
    const PlaylistCls = (globalThis as any).Playlist;
    let pl = game.playlists?.getName(playlistName);
    if (!pl) pl = await PlaylistCls.create({ name: playlistName });
    if (!pl) return;
    const created = await pl.createEmbeddedDocuments("PlaylistSound", [
      { name: title.slice(0, 120), path, repeat: false, volume: 0.8 },
    ]);
    const sound = Array.isArray(created) ? created[0] : created;
    if (sound) await pl.playSound(sound);
  } catch (err) {
    log("could not add track to playlist:", err);
    ui.notifications?.warn(game.i18n.localize("NOODLR.Media.Music.NoPlaylist"));
  }
}

/**
 * Generate a video (async), persist it, and broadcast it to every participant. GM-only unless
 * the "allow players" toggle is on (enforced by the caller).
 */
export async function createAndShareVideo(input: {
  description: string;
  seconds?: number;
}): Promise<void> {
  const cfg = getVideoConfig();
  const duration = clamp(input.seconds ?? cfg.duration, 6, 30);
  ui.notifications?.info(game.i18n.localize("NOODLR.Media.Video.Generating"));

  let result;
  try {
    result = await generateVideo(input.description, {
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
  await shareMediaPopout(path, input.description || "Noodlr video");
  await postMediaCard(path, input.description || "Noodlr video", "video");
  bumpStats({ video: 1 });
}
