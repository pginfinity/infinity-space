import type { LocalVideoTrack } from "livekit-client";
import { BackgroundProcessor, supportsBackgroundProcessors, type BackgroundProcessorWrapper, type SwitchBackgroundProcessorOptions } from "@livekit/track-processors";
import type { CamBackground } from "./settings.ts";

/**
 * Fundo da câmera (desfoque, imagem pronta ou a sua), feito no próprio navegador com o MediaPipe.
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

const CUSTOM_KEY = "infinity.media.fundo.v1";

/** A imagem de fundo que a pessoa subiu: fica só neste navegador, nunca vai para o servidor. */
export function customBackground(): string | null {
  try {
    return localStorage.getItem(CUSTOM_KEY);
  } catch {
    return null;
  }
}

export function clearCustomBackground(): void {
  try {
    localStorage.removeItem(CUSTOM_KEY);
  } catch {
    /* navegador sem armazenamento: não havia nada guardado */
  }
}

/** Recorta a imagem escolhida para 1280x720 e guarda neste navegador. Lança erro se não for imagem ou não couber. */
export async function saveCustomBackground(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 20_000_000) throw new Error("imagem inválida");
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const k = Math.max(c.width / bmp.width, c.height / bmp.height);
  c.getContext("2d")!.drawImage(bmp, (c.width - bmp.width * k) / 2, (c.height - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  bmp.close();
  const url = c.toDataURL("image/jpeg", 0.85);
  localStorage.setItem(CUSTOM_KEY, url);
  return url;
}

function options(mode: CamBackground): SwitchBackgroundProcessorOptions {
  // O processador desfoca em 1/4 da resolução: raio 8 fica leve, 32 bem forte.
  if (mode === "blur-light") return { mode: "background-blur", blurRadius: 8 };
  if (mode === "blur") return { mode: "background-blur", blurRadius: 32 };
  if (mode === "none") return { mode: "disabled" };
  const imagePath = mode === "custom" ? customBackground() : `/fundos/${mode}.jpg`;
  return imagePath ? { mode: "virtual-background", imagePath } : { mode: "disabled" };
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
