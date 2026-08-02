// Audio Generation: everything that produces or consumes sound — spoken narration (TTS), generated
// music, and voice transcription (push-to-log).

import { MODULE_ID, MODULE_TITLE, MEDIA_SETTINGS } from "../constants";
import { sanitizeUserText } from "../util/sanitize";
import { getProviderView, saveProviderFromForm, type ProviderFormData } from "../providers/config";
import { getFeatureConfig } from "../providers/config";
import { isConfigured, resolveBaseUrl } from "../providers/types";
import { synthesizeSpeech, TtsError } from "../media/tts";
import {
  getTtsEnabled,
  getTtsVoice,
  getTtsAutoRead,
  getTtsBroadcast,
  getTtsPitchSupported,
  getTranscriptionEnabled,
  getPushToLogConfig,
  getMusicConfig,
} from "../media/config";
import { refreshPushToLogButton } from "../media/push-to-log";
import { NoodlrCreatureVoiceApp } from "./creature-voice-app";
import { CONFIG_WINDOW_DEFAULTS, NoodlrConfigApp } from "./config-base";

const FEATURES = ["tts", "music", "transcription"] as const;
type AudioFeature = (typeof FEATURES)[number];

const LABEL: Record<AudioFeature, string> = {
  tts: "Tts",
  music: "Music",
  transcription: "Transcription",
};

export class NoodlrAudioGenApp extends NoodlrConfigApp {
  static DEFAULT_OPTIONS = {
    ...CONFIG_WINDOW_DEFAULTS,
    id: "noodlr-audio-gen",
    window: {
      title: "NOODLR.AudioGen.Menu.Name",
      icon: "fa-solid fa-volume-high",
      resizable: true,
    },
    form: {
      handler: NoodlrAudioGenApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      testTts: NoodlrAudioGenApp.#onTestTts,
      openCreatureVoices: NoodlrAudioGenApp.#onOpenCreatureVoices,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/audio-gen.hbs` },
  };

  async _prepareContext(): Promise<Record<string, unknown>> {
    const view = (id: AudioFeature) => {
      const p = `NOODLR.Feature.${LABEL[id]}`;
      return {
        id,
        ...getProviderView(id),
        title: game.i18n.localize(`${p}.Title`),
        what: game.i18n.localize(`${p}.What`),
        requires: game.i18n.localize(`${p}.Requires`),
        without: game.i18n.localize(`${p}.Without`),
      };
    };
    const music = getMusicConfig();
    const push = getPushToLogConfig();

    return {
      moduleTitle: MODULE_TITLE,
      version: game.modules.get(MODULE_ID)?.version ?? "",

      tts: view("tts"),
      music: view("music"),
      transcription: view("transcription"),

      ttsEnabled: getTtsEnabled(),
      ttsVoice: getTtsVoice(),
      ttsAutoRead: getTtsAutoRead(),
      ttsBroadcast: getTtsBroadcast(),
      ttsPitchSupported: getTtsPitchSupported(),

      musicEnabled: music.enabled,
      musicChatTrigger: music.chatTrigger,
      musicAllowPlayers: music.allowPlayers,
      musicMinSec: music.minSec,
      musicMaxSec: music.maxSec,
      musicPlaylist: music.playlist,

      transcriptEnabled: getTranscriptionEnabled(),
      transcriptPostChat: push.postChat,
      transcriptSegment: push.segmentSeconds,
    };
  }

  static async #onSubmit(
    this: NoodlrAudioGenApp,
    _event: SubmitEvent,
    _form: HTMLFormElement,
    formData: any,
  ): Promise<void> {
    const o = foundry.utils.expandObject(formData.object ?? {});
    const set = (k: string, v: unknown) => game.settings.set(MODULE_ID, k, v);

    for (const id of FEATURES) {
      await saveProviderFromForm(id, o[id] as ProviderFormData | undefined);
    }

    await set(MEDIA_SETTINGS.ttsEnabled, Boolean(o.tts?.enabled));
    await set(MEDIA_SETTINGS.ttsVoice, String(o.tts?.voice ?? "").trim());
    await set(MEDIA_SETTINGS.ttsAutoRead, Boolean(o.tts?.autoRead));
    await set(MEDIA_SETTINGS.ttsBroadcast, Boolean(o.tts?.broadcast));
    await set(MEDIA_SETTINGS.ttsPitchSupported, Boolean(o.tts?.pitchSupported));

    await set(MEDIA_SETTINGS.musicEnabled, Boolean(o.music?.enabled));
    await set(MEDIA_SETTINGS.musicChatTrigger, Boolean(o.music?.chatTrigger));
    await set(MEDIA_SETTINGS.musicAllowPlayers, Boolean(o.music?.allowPlayers));
    await set(MEDIA_SETTINGS.musicMinSec, Math.max(1, Number(o.music?.minSec) || 15));
    await set(MEDIA_SETTINGS.musicMaxSec, Math.max(1, Number(o.music?.maxSec) || 300));
    await set(
      MEDIA_SETTINGS.musicPlaylist,
      String(o.music?.playlist ?? "Noodlr Music").trim() || "Noodlr Music",
    );

    await set(MEDIA_SETTINGS.transcriptionEnabled, Boolean(o.transcription?.enabled));
    await set(MEDIA_SETTINGS.pushToLogPostChat, Boolean(o.transcription?.postChat));
    const seg = Number(o.transcription?.segment);
    await set(MEDIA_SETTINGS.pushToLogSegmentSeconds, seg >= 5 && seg <= 60 ? seg : 20);
    // Show/hide the floating mic button to match the toggle without a reload.
    refreshPushToLogButton();

    ui.notifications?.info(game.i18n.localize("NOODLR.Settings.Saved"));
    this.render();
  }

  static #onOpenCreatureVoices(): void {
    new NoodlrCreatureVoiceApp().render({ force: true });
  }

  /**
   * Synthesize a short phrase with the SAVED TTS config and report the outcome inline under the
   * field. TTS breaks in ways the provider can't tell you about from the browser — a local endpoint
   * that "works on its own" often fails here on mixed content (HTTPS page -> HTTP endpoint) or CORS,
   * so we detect the tell-tale fetch TypeError and explain it.
   */
  static async #onTestTts(this: NoodlrAudioGenApp): Promise<void> {
    const root = this.rootEl();
    const statusEl = root?.querySelector<HTMLElement>('[data-role="tts-test-status"]');
    const input = root?.querySelector<HTMLInputElement>('[data-role="tts-test-input"]');
    const setStatus = (kind: "pending" | "ok" | "warn" | "error", msg: string) => {
      if (!statusEl) return;
      statusEl.className = `noodlr-test-status noodlr-test-status--${kind}`;
      statusEl.textContent = msg;
    };

    const cfg = getFeatureConfig("tts");
    if (!isConfigured(cfg)) {
      setStatus("warn", game.i18n.localize("NOODLR.Media.TtsTest.NotConfigured"));
      return;
    }

    // An empty box would send nothing to synthesize and come back as a provider error, which reads
    // like a broken endpoint. Put the sample phrase back and show it, so the test stays meaningful.
    const sample = game.i18n.localize("NOODLR.Media.TtsTest.Sample");
    const text = sanitizeUserText(input?.value, { maxLength: 140, allowNewlines: false }) || sample;
    if (input && input.value.trim() !== text) input.value = text;
    const endpoint = `${resolveBaseUrl(cfg)}/audio/speech`;
    setStatus("pending", game.i18n.format("NOODLR.Media.TtsTest.Working", { endpoint }));

    try {
      const blob = await synthesizeSpeech(text);
      const kb = Math.max(1, Math.round(blob.size / 1024));
      // Play it so the audio path is exercised end-to-end too.
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.addEventListener("ended", () => URL.revokeObjectURL(objectUrl));
      void audio.play().catch(() => URL.revokeObjectURL(objectUrl));
      setStatus(
        "ok",
        game.i18n.format("NOODLR.Media.TtsTest.Ok", { kb, type: blob.type || "audio" }),
      );
    } catch (err) {
      if (err instanceof TtsError) {
        setStatus("error", err.message);
      } else if (err instanceof TypeError) {
        // fetch() rejects with TypeError for CORS / mixed-content / DNS / connection refused.
        setStatus("error", game.i18n.format("NOODLR.Media.TtsTest.Network", { endpoint }));
      } else {
        setStatus("error", String(err));
      }
    }
  }
}
