// Persistent media storage for generated images. Foundry modules can write to the server's
// "data" filesystem via FilePicker. We never persist audio (too large; transcription captures the
// meaning instead); images earn persistence because portrait/location continuity is worth the disk.
//
// WORLD-SCOPED SINCE v0.7.5, and the reason is not tidiness. `assets/` is a sibling of `worlds/`,
// so the old default put every world on a host in ONE output folder — and RAG Lite keeps its silos
// under this same folder (`<mediaFolder>/memory/<silo>.json`), so two campaigns shared one memory
// index and each retrieved the other's lore. That is the GM's own secrets crossing between
// campaigns, which is a far worse failure than a portrait being overwritten.
//
// The v13 note this file used to carry — that uploads into `worlds/` are prohibited — is about the
// FilePicker's own BROWSER UI. It does not apply to a module's `upload` call, and `worlds/<id>/assets`
// is where core itself puts a world's extracted media. Verified against a live server: the write
// succeeds and the file is fetchable over the routed URL exactly like one under `assets/`.

import { MODULE_ID, MEDIA_SETTINGS, log } from "../constants";
import { imageKey, type ImageKind } from "./config";

/**
 * Where every world's media went before v0.7.5. Read by NOTHING — it exists only so the migration
 * below can recognise the literal a world may still hold in its setting.
 */
const LEGACY_MEDIA_FOLDER = "assets/noodlr-out";

function filePicker(): any {
  const ns = (foundry as any).applications?.apps?.FilePicker;
  return ns ?? (globalThis as any).FilePicker;
}

/**
 * This world's media folder, used when the setting is empty.
 *
 * NOTHING falls back to the shared folder — retiring it is the point of this release, and a world
 * must never read or write another world's tree. `game.world.id` is present for the whole lifetime
 * of a loaded world, which is the only context module code runs in, so the placeholder is a guard
 * against building a path out of `undefined` rather than a case that happens.
 */
export function defaultMediaFolder(): string {
  return `worlds/${(game as any)?.world?.id ?? "unknown"}/assets/noodlr-out`;
}

/** Configured base media output folder (relative to the data root), sans slashes. */
export function getMediaFolder(): string {
  const raw = (game.settings.get(MODULE_ID, MEDIA_SETTINGS.imageMediaFolder) as string) ?? "";
  return raw.trim().replace(/^\/+|\/+$/g, "") || defaultMediaFolder();
}

/**
 * Move a world off the pre-v0.7.5 shared literal, once, and only if it still holds exactly that.
 *
 * Every world that has ever opened the Image window holds an explicit value, because the old form
 * saved `folder || "assets/noodlr-out"` on every save — so "deliberately shared" was never
 * expressible and cannot be distinguished now. The literal comparison is what bounds the damage:
 * any OTHER path is a value somebody chose and is left alone, which is the case worth protecting.
 * A world that meant to share the old default is moved and says so in the log. Same shape as
 * `seedPromptDefaults`, and the same reason it is safe exactly once.
 *
 * It clears the setting rather than writing the new path, so the folder keeps resolving from the
 * world id — a stored literal would go stale if the world were ever duplicated under a new id.
 *
 * FILES ARE NOT MOVED. Foundry offers no rename and copying a campaign's art through the browser
 * would be a long unattended upload; every path already written into a chat card or an actor's
 * `img` stays valid. Anything the GM wants in the new tree they move on the server.
 */
export async function scopeMediaFolder(): Promise<void> {
  try {
    if (game.settings.get(MODULE_ID, MEDIA_SETTINGS.mediaFolderScoped)) return;
    const raw = (game.settings.get(MODULE_ID, MEDIA_SETTINGS.imageMediaFolder) as string) ?? "";
    if (raw.trim() === LEGACY_MEDIA_FOLDER) {
      await game.settings.set(MODULE_ID, MEDIA_SETTINGS.imageMediaFolder, "");
      log(
        `media folder is now this world's own (${defaultMediaFolder()}); files already written stay where they are`,
      );
    }
    await game.settings.set(MODULE_ID, MEDIA_SETTINGS.mediaFolderScoped, true);
  } catch (err) {
    log("scopeMediaFolder:", String(err));
  }
}

/**
 * Ensure the output folder (and each parent segment) exists. Idempotent: an "already exists"
 * error is the normal case and swallowed. Called once on ready and before each save.
 */
export async function ensureMediaFolder(folder = getMediaFolder()): Promise<void> {
  const fp = filePicker();
  if (!fp?.createDirectory) return;
  let path = "";
  for (const part of folder.split("/").filter(Boolean)) {
    path = path ? `${path}/${part}` : part;
    try {
      await fp.createDirectory("data", path);
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (!/exist/i.test(msg)) log("ensureMediaFolder:", msg);
    }
  }
}

/** Make a short, filesystem-safe slug from arbitrary text. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

/** Pick a file extension from a MIME type, defaulting to png (image path is the common case). */
export function extForType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("jpeg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("png")) return "png";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg") || t.includes("opus")) return "ogg";
  if (t.includes("flac")) return "flac";
  if (t.includes("mp4")) return "mp4";
  if (t.includes("webm")) return "webm";
  if (t.startsWith("audio/")) return "mp3";
  if (t.startsWith("video/")) return "mp4";
  return "png";
}

/**
 * Save media (a Blob, or a data:/http(s) URL that we fetch) into the media folder — optionally a
 * subfolder like "music" or "video". Returns the stored path (relative to the data root, usable
 * directly as a src) or null on failure — callers fall back to the in-memory src.
 */
export async function saveMedia(
  src: string | Blob,
  baseName: string,
  opts: { subfolder?: string; ext?: string; fileName?: string } = {},
): Promise<string | null> {
  const fp = filePicker();
  if (!fp?.upload) return null;
  try {
    // data: and http(s) URLs are both fetchable to a Blob; images arrive as same-origin data:
    // URLs (b64_json) so no CORS concern. When fetching a URL, verify the response is OK so we
    // never persist an error body (e.g. a 401 JSON) as if it were media.
    let blob: Blob;
    if (typeof src === "string") {
      const resp = await fetch(src);
      if (!resp.ok) {
        log(`saveMedia: source fetch failed (${resp.status})`);
        return null;
      }
      blob = await resp.blob();
    } else {
      blob = src;
    }
    const ext = opts.ext ?? extForType(blob.type);
    // An explicit fileName deliberately overwrites any previous file of that name. Foundry exposes
    // no delete API, so a caller that writes repeatedly (speech) must reuse a bounded set of names
    // or it grows the data folder forever.
    const name = opts.fileName ?? `${slugify(baseName)}-${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    const folder = opts.subfolder ? `${getMediaFolder()}/${opts.subfolder}` : getMediaFolder();
    await ensureMediaFolder(folder);
    const res = await fp.upload("data", folder, file, {}, { notify: false });
    return typeof res?.path === "string" ? res.path : `${folder}/${name}`;
  } catch (err) {
    log("saveMedia failed:", err);
    return null;
  }
}

/** Save an image into the media folder (thin wrapper over saveMedia). */
export function saveImage(src: string, baseName: string): Promise<string | null> {
  return saveMedia(src, baseName);
}

/**
 * Transcode a generated image (data:/http(s) URL) to a Blob in the requested format, optionally
 * resizing to exact dimensions. Used to enforce .webp output and locked resolutions (portrait/
 * token) client-side, since text-to-image providers don't reliably honor size/format requests.
 * Falls back to fetching the original bytes if the canvas path fails (e.g. a tainted image).
 */
export async function transcodeImage(
  src: string,
  opts: { format?: "webp" | "png"; width?: number; height?: number; quality?: number } = {},
): Promise<{ blob: Blob; ext: string }> {
  const format = opts.format ?? "webp";
  const mime = format === "png" ? "image/png" : "image/webp";
  try {
    const img = await loadImage(src);
    const w = opts.width && opts.width > 0 ? opts.width : img.naturalWidth || img.width;
    const h = opts.height && opts.height > 0 ? opts.height : img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, opts.quality ?? 0.92),
    );
    if (!blob) throw new Error("canvas.toBlob returned null");
    return { blob, ext: format };
  } catch (err) {
    log("transcodeImage failed, falling back to original bytes:", err);
    const resp = await fetch(src);
    const blob = await resp.blob();
    return { blob, ext: extForType(blob.type) };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// ---- Continuity ledger ---------------------------------------------------------------------
// A world-scoped map keyed by normalized entity name. Storing a stable appearance description
// plus a concrete seed lets recurring characters/locations regenerate with a recognizable look
// instead of drifting scene to scene.

export interface LedgerEntry {
  /** Concrete seed reused for this entity so the look stays stable. */
  seed: number;
  /** The stable appearance/anchor description captured on first generation. */
  prompt: string;
  /** Model used (a look also depends on the model). */
  model: string;
  /** Last stored image path. */
  path: string;
  ts: number;
}

export function ledgerKey(name: string): string {
  return name.trim().toLowerCase();
}

// Each image kind keeps its OWN ledger so a "goblin" portrait and a "goblin" token don't
// collide on one seed/appearance (they're different aspects of the same subject).
function readLedger(kind: ImageKind): Record<string, LedgerEntry> {
  try {
    return JSON.parse((game.settings.get(MODULE_ID, imageKey(kind, "ledger")) as string) || "{}");
  } catch {
    return {};
  }
}

export function getLedgerEntry(kind: ImageKind, name: string): LedgerEntry | undefined {
  return readLedger(kind)[ledgerKey(name)];
}

export async function setLedgerEntry(
  kind: ImageKind,
  name: string,
  entry: LedgerEntry,
): Promise<void> {
  const all = readLedger(kind);
  all[ledgerKey(name)] = entry;
  await game.settings.set(MODULE_ID, imageKey(kind, "ledger"), JSON.stringify(all));
}
