// Orchestrates the full "make an image and show everyone" flow: generate -> persist to disk
// (+ update the continuity ledger for keyed entities) -> broadcast to all connected players
// via Foundry's ImagePopout share -> optionally drop a chat card and ingest the prompt/tags
// into the `scenes` RAG silo. Triggered by the scene-control button and the chat command.

import { MODULE_ID, log } from "../constants";
import { generateSceneImage, ImageError } from "./image";
import { saveMedia, transcodeImage } from "./storage";
import { getImagePersist, IMAGE_KIND_META, type ImageKind } from "./config";
import {
  artifactFlags,
  attachArtifactControls,
  type ArtifactCommit,
  type ArtifactInput,
} from "../output/artifacts";
import { bumpStats } from "../util/stats";
import { narrator } from "../util/speaker";

/** Resolve the v13 ImagePopout class (namespaced), falling back to the legacy global. */
function imagePopout(): any {
  const ns = (foundry as any).applications?.apps?.ImagePopout;
  return ns ?? (globalThis as any).ImagePopout;
}

/**
 * Display a media file (image OR video — ImagePopout's src accepts both) locally and, when
 * `broadcast` is true (the default), share it with every connected user via Foundry's built-in
 * broadcast. Pass broadcast=false for "hidden" GM-prep output (shows only on the GM's screen).
 *
 * When `message` (the artifact chat card) is supplied, the Retry/Reject controls are drawn in the
 * pop-out's lower-right for the DM/author while the 60 s window is open — this is the window most
 * users watch, so the controls belong here as well as on the chat card. Retry/Reject closes this
 * pop-out. The broadcast copies on other clients never get controls (only the author/DM acts).
 */
export async function shareMediaPopout(
  src: string,
  title: string,
  opts: { broadcast?: boolean; message?: any } = {},
): Promise<void> {
  const broadcast = opts.broadcast ?? true;
  const IP = imagePopout();
  if (!IP) {
    log("ImagePopout unavailable; cannot display media");
    return;
  }
  const pop = new IP({ src, window: { title } });
  await pop.render(true);
  if (opts.message) {
    const root = pop.element as HTMLElement | undefined;
    if (root)
      attachArtifactControls(root, opts.message, { overlay: true, afterRetire: () => pop.close() });
  }
  if (!broadcast) return;
  try {
    // Broadcasts to all connected users (they get their own popout).
    pop.shareImage();
  } catch (err) {
    log("shareImage failed:", err);
  }
}

/**
 * Post a lightweight chat card referencing a stored media file (never inline base64). When an
 * `artifact` is supplied the card carries the Retry/Reject + deferred-commit flag (see
 * output/artifacts.ts); otherwise it's a plain scene-art card.
 */
export async function postMediaCard(
  path: string,
  title: string,
  kind: "image" | "video" | "audio" = "image",
  artifact?: ArtifactInput,
  opts: { whisperGM?: boolean } = {},
): Promise<any> {
  try {
    const ChatMessage = (globalThis as any).ChatMessage;
    const safeTitle = foundry.utils.escapeHTML(title);
    const safePath = foundry.utils.escapeHTML(path);
    const media =
      kind === "video"
        ? `<video src="${safePath}" controls style="width:100%;border-radius:4px;margin-top:4px"></video>`
        : kind === "audio"
          ? `<audio src="${safePath}" controls style="width:100%;margin-top:4px"></audio>`
          : `<img src="${safePath}" alt="${safeTitle}" style="width:100%;border-radius:4px;margin-top:4px" />`;
    const content = `<div class="noodlr-scene-art"><strong>${safeTitle}</strong>${media}</div>`;
    const flags = artifact ? artifactFlags(artifact) : { [MODULE_ID]: { sceneArt: true } };
    const data: Record<string, unknown> = { content, flags, speaker: narrator() };
    // "Hidden" output whispers to GMs only, so players never see the prep card.
    if (opts.whisperGM) {
      data.whisper = ChatMessage.getWhisperRecipients("GM").map((u: any) => u.id);
    }
    return await ChatMessage.create(data);
  } catch (err) {
    log("could not post media chat card:", err);
    return null;
  }
}

export interface CreateImageInput {
  /** The scene/subject description (text after the command, or the dialog input). */
  description: string;
  /** Optional entity name for continuity (portraits, recurring NPCs/locations). */
  entityKey?: string;
  /** Popout/chat title; defaults to the entity name or a generic label. */
  title?: string;
  /** GM-prep mode: show only on the GM's screen (no broadcast; card whispered to GMs). */
  hidden?: boolean;
}

/**
 * Generate an image and share it with the table. `kind` selects the generator (scene art,
 * portrait, token, or map) — each with its own provider/prompts, output folder, and aspect
 * ratio. All kinds save as .webp at the model's returned resolution. Persists to disk + the
 * per-kind continuity ledger when persistence is enabled; always displays even if persistence
 * fails.
 */
export async function createAndShareImage(
  input: CreateImageInput,
  kind: ImageKind = "image",
): Promise<void> {
  const meta = IMAGE_KIND_META[kind];
  const title = (input.title || input.entityKey || "Noodlr scene art").trim();
  ui.notifications?.info(game.i18n.localize("NOODLR.Media.Image.Generating"));

  let result;
  try {
    result = await generateSceneImage(input.description, { entityKey: input.entityKey, kind });
  } catch (err) {
    const msg = err instanceof ImageError ? err.message : String(err);
    ui.notifications?.error(game.i18n.format("NOODLR.Media.Image.Failed", { error: msg }));
    return;
  }

  // Persist (best effort). On success we display the stored path (light) and can post a card;
  // on failure we still display the in-memory data URL so the table sees the art.
  let path: string | null = null;
  if (getImagePersist(kind)) {
    // All kinds save as .webp (format conversion only — we keep the model's returned
    // resolution; aspect ratio was requested at generation time).
    let toSave: string | Blob = result.src;
    let ext: string = meta.ext;
    if (meta.ext === "webp") {
      const t = await transcodeImage(result.src, { format: "webp" });
      toSave = t.blob;
      ext = t.ext;
    }
    path = await saveMedia(toSave, input.entityKey || title, {
      subfolder: meta.subfolder || undefined,
      ext,
    });
  }

  const displaySrc = path ?? result.src;

  // Post the card with a Retry/Reject artifact FIRST so the pop-out can carry the same controls.
  // The RAG scene-meta ingest and the continuity ledger write are DEFERRED into the artifact
  // commit (run by the GM only if the output survives the 60 s window), so a rejected/retried
  // image never pollutes memory or the ledger.
  let message: any = null;
  if (path) {
    const label = input.entityKey ? `Image of ${input.entityKey}` : "Scene image";
    const commit: ArtifactCommit = {
      rag: {
        // Shared art is scene context the players saw -> player_locations; hidden GM prep -> gm_locations.
        silo: input.hidden ? "gm_locations" : "player_locations",
        text: `${label}: ${result.prompt}`,
        metadata: {
          source: "image",
          entity: input.entityKey ?? "",
          path,
          ts: Date.now(),
          ...(input.entityKey ? { entities: [input.entityKey] } : {}),
        },
      },
    };
    if (meta.keyed && input.entityKey) {
      commit.ledger = {
        kind,
        entityKey: input.entityKey,
        entry: {
          seed: result.seed,
          prompt: result.anchor ?? "",
          model: result.model,
          path,
          ts: Date.now(),
        },
      };
    }
    message = await postMediaCard(
      path,
      title,
      "image",
      {
        gen: { fn: "image", kind, description: input.description, entityKey: input.entityKey },
        commit,
      },
      { whisperGM: input.hidden },
    );
  }

  await shareMediaPopout(displaySrc, title, { broadcast: !input.hidden, message });
  bumpStats({ images: 1 });
}
