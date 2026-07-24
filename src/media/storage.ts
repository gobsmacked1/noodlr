// Persistent media storage for generated images. Foundry modules can write to the server's
// "data" filesystem via FilePicker; in v13 uploads into modules/systems/worlds/the data root
// are prohibited, but the top-level `assets` folder (and any new top-level folder) is allowed —
// so the default target is `assets/noodlr-out`, which also keeps users from traversing up into
// the install. We never persist audio (too large; transcription captures the meaning instead);
// images earn persistence because portrait/location continuity is worth the disk.

import { MODULE_ID, MEDIA_SETTINGS, log } from "../constants";

/** Resolve the v13 FilePicker class (namespaced), falling back to the legacy global. */
function filePicker(): any {
  const ns = (foundry as any).applications?.apps?.FilePicker;
  return ns ?? (globalThis as any).FilePicker;
}

/** Configured media output folder (relative to the data root), sans leading/trailing slashes. */
export function getMediaFolder(): string {
  const raw = (game.settings.get(MODULE_ID, MEDIA_SETTINGS.imageMediaFolder) as string) ?? "";
  return raw.trim().replace(/^\/+|\/+$/g, "") || "assets/noodlr-out";
}

export function getImagePersist(): boolean {
  return Boolean(game.settings.get(MODULE_ID, MEDIA_SETTINGS.imagePersist));
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
function extForType(type: string): string {
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
  opts: { subfolder?: string; ext?: string } = {},
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
    const name = `${slugify(baseName)}-${Date.now()}.${ext}`;
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

function readLedger(): Record<string, LedgerEntry> {
  try {
    return JSON.parse((game.settings.get(MODULE_ID, MEDIA_SETTINGS.imageLedger) as string) || "{}");
  } catch {
    return {};
  }
}

export function getLedgerEntry(name: string): LedgerEntry | undefined {
  return readLedger()[ledgerKey(name)];
}

export async function setLedgerEntry(name: string, entry: LedgerEntry): Promise<void> {
  const all = readLedger();
  all[ledgerKey(name)] = entry;
  await game.settings.set(MODULE_ID, MEDIA_SETTINGS.imageLedger, JSON.stringify(all));
}
