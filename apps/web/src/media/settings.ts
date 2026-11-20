import { create } from "zustand";

/**
 * Preferências de áudio e vídeo de cada pessoa, guardadas no navegador.
 * Nada disso sai do computador: é só como você quer ouvir e ser ouvido.
 */

export type NoiseMode = "off" | "browser" | "strong" | "max";
export type VideoQuality = "low" | "standard" | "high";
/** Sem fundo, desfoque, imagem pronta em public/fundos (créditos em docs/creditos.md) ou a da pessoa. */
export type CamBackground = "none" | "blur-light" | "blur" | "escritorio" | "estante" | "sala" | "natureza" | "espaco" | "gradiente" | "azul" | "infinity" | "custom";
export type MicMode = "open" | "ptt";

export interface MediaSettings {
  micId: string | null;
  camId: string | null;
  speakerId: string | null;
  noise: NoiseMode;
  echo: boolean;
  autoGain: boolean;
  video: VideoQuality;
  /** Microfone aberto (M liga e desliga) ou aperte-para-falar (segure M). */
  micMode: MicMode;
  /** Fundo da câmera: nenhum, desfoque, uma imagem pronta ou a sua (processado no próprio navegador). */
  camBg: CamBackground;
  /** Volume geral de quem você ouve (0 a 1.5). */
  master: number;
  /** Volume por pessoa, pelo nome (0 a 1.5). O id muda a cada conexão; o nome não. */
  people: Record<string, number>;
  /** Presença: minutos sem mexer até ficar "Ausente" sozinho (0 = desligado). Detectado só aqui. */
  awayAfter: number;
}

const KEY = "infinity.media.v1";

const DEFAULTS: MediaSettings = {
  micId: null,
  camId: null,
  speakerId: null,
  noise: "strong",
  echo: true,
  autoGain: true,
  video: "standard",
  camBg: "none",
  micMode: "open",
  master: 1,
  people: {},
  awayAfter: 0,
};

function load(): MediaSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MediaSettings>) };
  } catch {
    // sem armazenamento (janela privada): fica no padrão
  }
  return DEFAULTS;
}

export const useMediaSettings = create<MediaSettings>(() => load());

useMediaSettings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sem armazenamento: só vale nesta sessão
  }
});

export function setMediaSettings(patch: Partial<MediaSettings>): void {
  useMediaSettings.setState(patch);
}

export function personVolumeOf(name: string | undefined): number {
  if (!name) return 1;
  return useMediaSettings.getState().people[name.trim().toLowerCase()] ?? 1;
}

export function setPersonVolume(name: string, v: number): void {
  const key = name.trim().toLowerCase();
  useMediaSettings.setState((s) => ({ people: { ...s.people, [key]: Math.max(0, Math.min(1.5, v)) } }));
}

/** Resolução da câmera por qualidade escolhida. */
export const VIDEO_RES: Record<VideoQuality, { width: number; height: number; frameRate: number }> = {
  low: { width: 320, height: 180, frameRate: 15 },
  standard: { width: 640, height: 360, frameRate: 24 },
  high: { width: 1280, height: 720, frameRate: 30 },
};
