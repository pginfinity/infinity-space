import type { LocalVideoTrack } from "livekit-client";
import { BackgroundProcessor, supportsBackgroundProcessors, type BackgroundProcessorWrapper, type SwitchBackgroundProcessorOptions } from "@livekit/track-processors";
import type { CamBackground } from "./settings.ts";

/**
 * Fundo da câmera (desfoque ou fundo da Infinity), feito no próprio navegador com o MediaPipe.
 * Os arquivos vêm do nosso servidor (public/mediapipe), sem CDN de terceiros.
 */

const ASSETS = { tasksVisionFileSet: "/mediapipe/wasm", modelAssetPath: "/mediapipe/selfie_segmenter.tflite" };

export const backgroundSupported = (): boolean => {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
};

function options(mode: CamBackground): SwitchBackgroundProcessorOptions {
  if (mode === "blur") return { mode: "background-blur", blurRadius: 14 };
  if (mode === "infinity") return { mode: "virtual-background", imagePath: "/fundos/infinity.jpg" };
  return { mode: "disabled" };
}

const procs = new WeakMap<LocalVideoTrack, BackgroundProcessorWrapper>();

/** Aplica (ou tira) o fundo numa faixa de vídeo. Devolve false se o navegador não deu conta. */
export async function applyBackground(track: LocalVideoTrack, mode: CamBackground): Promise<boolean> {
  try {
    if (mode === "none") {
      if (track.getProcessor()) await track.stopProcessor();
      procs.delete(track);
      return true;
    }
    if (!backgroundSupported()) return false;
    const cur = procs.get(track);
    if (cur && track.getProcessor() === cur) {
      await cur.switchTo(options(mode));
      return true;
    }
    const p = BackgroundProcessor({ ...options(mode), assetPaths: ASSETS } as Parameters<typeof BackgroundProcessor>[0]);
    await track.setProcessor(p);
    procs.set(track, p);
    return true;
  } catch (e) {
    console.warn("[mídia] fundo da câmera indisponível:", e);
    return false;
  }
}
