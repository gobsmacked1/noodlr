// Orchestrates the full "make an image and show everyone" flow: generate -> persist to disk
// (+ update the continuity ledger for keyed entities) -> broadcast to all connected players
// via Foundry's ImagePopout share -> optionally drop a chat card and ingest the prompt/tags
// into the `scenes` RAG silo. Triggered by the scene-control button and the chat command.

import { MODULE_ID, log } from "../constants";
import { generateSceneImage, ImageError } from "./image";
import { getImagePersist, saveImage, setLedgerEntry } from "./storage";
import { getRagClient, isRagEnabled, getEmbedOverride } from "../rag/config";

/** Resolve the v13 ImagePopout class (namespaced), falling back to the legacy global. */
function imagePopout(): any {
  const ns = (foundry as any).applications?.apps?.ImagePopout;
  return ns ?? (globalThis as any).ImagePopout;
}

/** Display an image locally and share it with every connected user. */
async function displayAndShare(src: string, title: string): Promise<void> {
  const IP = imagePopout();
  if (!IP) {
    log("ImagePopout unavailable; cannot display image");
    return;
  }
  const pop = new IP({ src, window: { title } });
  await pop.render(true);
  try {
    // Broadcasts the image to all connected users (they get their own popout).
    pop.shareImage();
  } catch (err) {
    log("shareImage failed:", err);
  }
}

/** Post a lightweight chat card referencing the stored image (never inline base64). */
async function postImageCard(path: string, title: string): Promise<void> {
  try {
    const ChatMessage = (globalThis as any).ChatMessage;
    const safeTitle = foundry.utils.escapeHTML(title);
    const safePath = foundry.utils.escapeHTML(path);
    const content = `<div class="noodlr-scene-art"><strong>${safeTitle}</strong><img src="${safePath}" alt="${safeTitle}" style="width:100%;border-radius:4px;margin-top:4px" /></div>`;
    await ChatMessage.create({ content, flags: { [MODULE_ID]: { sceneArt: true } } });
  } catch (err) {
    log("could not post image chat card:", err);
  }
}

/** Ingest image metadata (not pixels) into the `scenes` silo for later retrieval. GM only. */
async function ingestSceneMeta(prompt: string, path: string, entityKey?: string): Promise<void> {
  if (!isRagEnabled() || !game.user?.isGM) return;
  try {
    const label = entityKey ? `Image of ${entityKey}` : "Scene image";
    await getRagClient().ingest(
      "scenes",
      [
        {
          text: `${label}: ${prompt}`,
          metadata: {
            source: "image",
            entity: entityKey ?? "",
            path,
            ts: Date.now(),
            ...(entityKey ? { entities: [entityKey] } : {}),
          },
        },
      ],
      getEmbedOverride(),
    );
  } catch (err) {
    log("scene image RAG ingest failed:", err);
  }
}

export interface CreateImageInput {
  /** The scene/subject description (text after the command, or the dialog input). */
  description: string;
  /** Optional entity name for continuity (portraits, recurring NPCs/locations). */
  entityKey?: string;
  /** Popout/chat title; defaults to the entity name or a generic label. */
  title?: string;
}

/**
 * Generate an image and share it with the table. Persists to disk (and the continuity ledger)
 * when persistence is enabled and storage succeeds; always displays even if persistence fails.
 */
export async function createAndShareImage(input: CreateImageInput): Promise<void> {
  const title = (input.title || input.entityKey || "Noodlr scene art").trim();
  ui.notifications?.info(game.i18n.localize("NOODLR.Media.Image.Generating"));

  let result;
  try {
    result = await generateSceneImage(input.description, { entityKey: input.entityKey });
  } catch (err) {
    const msg = err instanceof ImageError ? err.message : String(err);
    ui.notifications?.error(game.i18n.format("NOODLR.Media.Image.Failed", { error: msg }));
    return;
  }

  // Persist (best effort). On success we display the stored path (light) and can post a card;
  // on failure we still display the in-memory data URL so the table sees the art.
  let path: string | null = null;
  if (getImagePersist()) {
    path = await saveImage(result.src, input.entityKey || title);
    if (path) {
      if (input.entityKey) {
        await setLedgerEntry(input.entityKey, {
          seed: result.seed,
          prompt: result.anchor ?? "",
          model: result.model,
          path,
          ts: Date.now(),
        });
      }
      void ingestSceneMeta(result.prompt, path, input.entityKey);
    }
  }

  const displaySrc = path ?? result.src;
  await displayAndShare(displaySrc, title);
  if (path) await postImageCard(path, title);
}
