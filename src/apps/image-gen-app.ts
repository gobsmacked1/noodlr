// Image Generation: the four still-image generators (scene art, portrait, token, map) and video.

import { MODULE_ID, MODULE_TITLE, MEDIA_SETTINGS } from "../constants";
import { promptFieldView } from "../prompts/fields";
import { getProviderView, saveProviderFromForm, type ProviderFormData } from "../providers/config";
import {
  getImageParams,
  getImageChatTrigger,
  getImageAllowPlayers,
  getImagePersist,
  getVideoConfig,
  IMAGE_KINDS,
  IMAGE_KIND_META,
  IMAGE_SIZE_PRESETS,
  isCustomSize,
  normalizeCustomSize,
  imageKey,
  type ImageKind,
} from "../media/config";
import { getMediaFolder } from "../media/storage";
import { CONFIG_WINDOW_DEFAULTS, NoodlrConfigApp } from "./config-base";

export class NoodlrImageGenApp extends NoodlrConfigApp {
  static DEFAULT_OPTIONS = {
    ...CONFIG_WINDOW_DEFAULTS,
    id: "noodlr-image-gen",
    window: {
      title: "NOODLR.ImageGen.Menu.Name",
      icon: "fa-solid fa-image",
      resizable: true,
    },
    form: {
      handler: NoodlrImageGenApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      resetPromptField: NoodlrConfigApp.onResetPromptField,
      browseMediaFolder: NoodlrImageGenApp.#onBrowseMediaFolder,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/image-gen.hbs` },
  };

  async _prepareContext(): Promise<Record<string, unknown>> {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const imageKinds = IMAGE_KINDS.map((kind: ImageKind) => {
      const meta = IMAGE_KIND_META[kind];
      const params = getImageParams(kind);
      const p = `NOODLR.Media.Kind.${cap(kind)}`;
      return {
        id: kind,
        ...getProviderView(kind),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
        icon: meta.icon,
        isScene: kind === "image",
        isMap: kind === "map",
        subfolder: meta.subfolder,
        ext: meta.ext,
        // The three prompt fields render through the shared partial, which also gives each its own
        // Reset. `systemPrompt` drives the optional prompt expansion and previously had no UI at all.
        positive: promptFieldView(imageKey(kind, "positive")),
        negative: promptFieldView(imageKey(kind, "negative")),
        expandPrompt: promptFieldView(imageKey(kind, "systemPrompt")),
        expand: params.expand,
        steps: params.steps,
        cfg: params.cfg,
        sampler: params.sampler,
        seed: params.seed,
        sizeNull: params.size.trim() === "",
        sizeCustom: isCustomSize(params.size),
        customW: isCustomSize(params.size) ? params.size.split(/[x×]/i)[0] : "",
        customH: isCustomSize(params.size) ? params.size.split(/[x×]/i)[1] : "",
        sizeOptions: IMAGE_SIZE_PRESETS.map((s) => ({
          value: s.value,
          label: s.label,
          selected: s.value === params.size,
        })),
        persist: getImagePersist(kind),
        chatTrigger: getImageChatTrigger(kind),
        allowPlayers: getImageAllowPlayers(kind),
        mediaFolder: getMediaFolder(),
      };
    });

    const video = getVideoConfig();
    const p = "NOODLR.Feature.Video";
    return {
      moduleTitle: MODULE_TITLE,
      version: game.modules.get(MODULE_ID)?.version ?? "",
      imageKinds,
      video: {
        id: "video",
        ...getProviderView("video"),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
      },
      videoEnabled: video.enabled,
      videoChatTrigger: video.chatTrigger,
      videoAllowPlayers: video.allowPlayers,
      videoDuration: video.duration,
      videoResolution: video.resolution,
      videoAspect: video.aspect,
    };
  }

  static async #onSubmit(
    this: NoodlrImageGenApp,
    _event: SubmitEvent,
    form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    const set = (k: string, v: unknown) => game.settings.set(MODULE_ID, k, v);

    for (const id of [...IMAGE_KINDS, "video"] as const) {
      await saveProviderFromForm(id, o[id] as ProviderFormData | undefined);
    }

    // Positive / negative / expansion prompts are persisted by the shared prompt-field collector.
    await this.savePromptFields(form);

    for (const kind of IMAGE_KINDS) {
      const meta = IMAGE_KIND_META[kind];
      const d = (o[kind] ?? {}) as Record<string, unknown>;
      const ik = (field: string) => imageKey(kind, field);
      await set(ik("expandPrompt"), Boolean(d.expand));
      await set(ik("steps"), Number(d.steps) || 20);
      await set(ik("cfg"), Number(d.cfg) || 7.0);
      await set(ik("sampler"), String(d.sampler ?? "Euler a").trim());
      await set(ik("seed"), Number.isFinite(Number(d.seed)) ? Number(d.seed) : -1);
      // Size: a preset "WxH", "" (native), or "custom" -> build from the width/height inputs.
      const sizeSel = String(d.size ?? meta.defaultSize);
      let size = sizeSel;
      if (sizeSel === "custom") {
        size = normalizeCustomSize(`${d.customW ?? ""}x${d.customH ?? ""}`) || meta.defaultSize;
      }
      await set(ik("size"), size);
      await set(ik("persist"), Boolean(d.persist));
      await set(ik("chatTrigger"), Boolean(d.chatTrigger));
      await set(ik("allowPlayers"), Boolean(d.allowPlayers));
    }
    const folder = String(o.image?.mediaFolder ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    await set(MEDIA_SETTINGS.imageMediaFolder, folder || "assets/noodlr-out");

    await set(MEDIA_SETTINGS.videoEnabled, Boolean(o.video?.enabled));
    await set(MEDIA_SETTINGS.videoChatTrigger, Boolean(o.video?.chatTrigger));
    await set(MEDIA_SETTINGS.videoAllowPlayers, Boolean(o.video?.allowPlayers));
    await set(MEDIA_SETTINGS.videoDuration, Math.max(1, Number(o.video?.duration) || 8));
    await set(
      MEDIA_SETTINGS.videoResolution,
      String(o.video?.resolution ?? "720p").trim() || "720p",
    );
    await set(MEDIA_SETTINGS.videoAspect, String(o.video?.aspect ?? "16:9").trim() || "16:9");

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  /**
   * Open Foundry's FilePicker in folder mode to choose/create the media output folder. The
   * FilePicker is constrained to the "data" source, so users can't traverse above the data root —
   * and v13 only permits uploads to allowed folders (assets/… or new top-level dirs).
   */
  static async #onBrowseMediaFolder(this: NoodlrImageGenApp): Promise<void> {
    const input = this.rootEl()?.querySelector<HTMLInputElement>('input[name="image.mediaFolder"]');
    const FP =
      (foundry as unknown as { applications?: { apps?: { FilePicker?: unknown } } }).applications
        ?.apps?.FilePicker ?? (globalThis as unknown as { FilePicker?: unknown }).FilePicker;
    if (!FP || !input) {
      ui.notifications?.warn(game.i18n.localize("NOODLR.Media.ImageFolder.NoPicker"));
      return;
    }
    const picker = new (FP as new (opts: Record<string, unknown>) => unknown)({
      type: "folder",
      source: "data",
      current: input.value.trim() || "assets/noodlr-out",
      callback: (path: string) => {
        input.value = String(path ?? "").replace(/^\/+|\/+$/g, "");
      },
    });
    (picker as { render: (force: boolean) => void }).render(true);
  }
}
