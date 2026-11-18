import { create } from "zustand";

/**
 * Qualidade gráfica, escolhida por cada pessoa (fica no navegador). Vale para o 3D e, nas sombras e
 * efeitos de imagem, também para o 2D.
 * - auto: começa no máximo e baixa a resolução sozinha se o computador não acompanhar;
 * - leve: resolução reduzida e sem suavização de bordas (computador mais fraco);
 * - alta: resolução cheia até 2x (telas de alta densidade, placa de vídeo boa).
 * O 2D já é leve por natureza (pixel art em meia resolução).
 */
export type Quality = "auto" | "leve" | "alta";

const KEY = "infinity.qualidade.v1";

function load(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "auto" || v === "leve" || v === "alta") return v;
  } catch {
    // sem armazenamento: padrão
  }
  // Navegador automatizado (testes, sem placa de vídeo): começa no leve, sem sombras nem efeitos.
  if (typeof navigator !== "undefined" && navigator.webdriver) return "leve";
  return "auto";
}

export const useQuality = create<{ mode: Quality }>(() => ({ mode: load() }));

export function setQuality(mode: Quality): void {
  useQuality.setState({ mode });
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // só nesta sessão
  }
}

/** Resolução máxima do 3D para o modo (multiplicador sobre o pixel CSS). */
export function maxDpr(mode: Quality): number {
  const screen = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  if (mode === "leve") return 0.75;
  return Math.min(screen, mode === "alta" ? 2 : 1.5);
}

/** Menor resolução que o modo automático usa antes de desistir de baixar mais. */
export const MIN_AUTO_DPR = 0.7;
