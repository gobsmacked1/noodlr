// Display a generated scene image: open it in an ImagePopout and post it to Foundry chat.

import { MODULE_ID, log } from "../constants";

export async function showSceneImage(src: string, prompt: string): Promise<void> {
  // Popout viewer.
  try {
    const ImagePopout = foundry.applications?.apps?.ImagePopout;
    if (ImagePopout) {
      new ImagePopout({ src, window: { title: "Noodlr — Scene Art" } }).render({ force: true });
    }
  } catch (err) {
    log("could not open image popout:", err);
  }

  // Chat card.
  try {
    const ChatMessage = (globalThis as any).ChatMessage;
    const caption = foundry.utils.escapeHTML(prompt).slice(0, 500);
    await ChatMessage.create({
      content: `<figure class="noodlr-scene-art"><img src="${src}" alt="scene art" style="max-width:100%;border-radius:6px;" /><figcaption>${caption}</figcaption></figure>`,
      flags: { [MODULE_ID]: { sceneArt: true } },
    });
  } catch (err) {
    log("could not post image to chat:", err);
  }
}
