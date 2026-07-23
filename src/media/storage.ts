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

/**
 * Save an image (data: URL or remote URL) into the media folder. Returns the stored path
 * (relative to the data root, usable directly as an <img> src / ImagePopout src) or null on
 * failure — callers fall back to the in-memory src so display still works without persistence.
 */
export async function saveImage(src: string, baseName: string): Promise<string | null> {
  const fp = filePicker();
  if (!fp?.upload) return null;
  try {
    // Both data: and http(s) URLs are fetchable to a Blob here; we request b64_json from
    // providers so `src` is normally a same-origin data: URL (no CORS concern).
    const blob = await (await fetch(src)).blob();
    const ext = blob.type.includes("jpeg")
      ? "jpg"
      : blob.type.includes("webp")
        ? "webp"
        : blob.type.includes("gif")
          ? "gif"
          : "png";
    const name = `${slugify(baseName)}-${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: blob.type || "image/png" });
    const folder = getMediaFolder();
    await ensureMediaFolder(folder);
    const res = await fp.upload("data", folder, file, {}, { notify: false });
    return typeof res?.path === "string" ? res.path : `${folder}/${name}`;
  } catch (err) {
    log("saveImage failed:", err);
    return null;
  }
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
