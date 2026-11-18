import { create } from "zustand";
import { setQuality, useQuality } from "./quality.ts";

/**
 * Computador que não aguenta o visual completo: nos primeiros segundos de uso (janela em foco,
 * depois de compilar os shaders), mede os quadros por segundo. Abaixo de SLOW_FPS, sugere o modo
 * leve uma vez, com um clique (ui/PerfSuggestion.tsx). Navegador sem aceleração de vídeo (desenho
 * por software) sugere na hora, explicando o porquê.
 *
 * A resposta fica salva neste navegador e a sugestão não volta; dá para mudar quando quiser em
 * Ajustes › Gráficos. Nada sai do navegador (é só o desempenho desta máquina).
 */

/** Abaixo disso (mediana de quadros por segundo) o escritório trava ao andar. */
export const SLOW_FPS = 30;
/** Segundos ignorados no começo (shaders, texturas, primeira montagem) e segundos medidos. */
export const WARMUP_S = 5;
export const WINDOW_S = 10;

const KEY = "infinity.qualidade.sugestao.v1";

export type PerfReason = "slow" | "software";

interface PerfUi {
  /** Cartão na tela: por quê e quantos quadros por segundo (quando mediu). */
  suggest: { reason: PerfReason; fps: number | null } | null;
}
export const usePerf = create<PerfUi>(() => ({ suggest: null }));

/** Mediana de quadros por segundo de uma lista de intervalos entre quadros (segundos). */
export function medianFps(dts: readonly number[]): number {
  if (dts.length === 0) return 0;
  const s = [...dts].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const dt = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return dt > 0 ? 1 / dt : 0;
}

/** Desenho por software (aceleração de vídeo desligada ou sem driver). */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(renderer);
}

function answered(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
function remember(answer: "leve" | "manter"): void {
  try {
    localStorage.setItem(KEY, answer);
  } catch {
    // só nesta sessão
  }
}

// Testes automatizados rodam sem placa de vídeo: lá a sugestão só aparece quando pedida (?sugerirleve).
const forced = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("sugerirleve");
const automated = typeof navigator !== "undefined" && navigator.webdriver === true;

const st = { done: false, elapsed: 0, samples: [] as number[] };

function eligible(): boolean {
  if (st.done) return false;
  if (useQuality.getState().mode === "leve" || answered()) {
    st.done = true;
    return false;
  }
  if (automated && !forced) {
    st.done = true;
    return false;
  }
  return true;
}

function finish(reason: PerfReason, fps: number | null): void {
  st.done = true;
  st.samples = [];
  if (reason === "slow" && fps !== null && fps >= SLOW_FPS) return;
  usePerf.setState({ suggest: { reason, fps: fps === null ? null : Math.round(fps) } });
}

/** O contexto de desenho começou: confere se é por software. */
export function perfStart(renderer: string): void {
  if (!eligible()) return;
  if (forced) return finish("slow", 18);
  if (isSoftwareRenderer(renderer)) finish("software", null);
}

/** Um quadro desenhado (intervalo em segundos desde o anterior). */
export function perfFrame(dt: number): void {
  if (!eligible()) return;
  // Só conta com a janela à vista e em foco (fora de foco o escritório desenha devagar de propósito)
  // e ignora travadas isoladas (troca de aba, compilação).
  if (typeof document !== "undefined" && (document.visibilityState !== "visible" || !document.hasFocus())) return;
  if (dt <= 0 || dt > 0.5) return;
  st.elapsed += dt;
  if (st.elapsed < WARMUP_S) return;
  st.samples.push(dt);
  if (st.elapsed >= WARMUP_S + WINDOW_S) finish("slow", medianFps(st.samples));
}

/** Resposta do cartão. */
export function acceptLight(): void {
  remember("leve");
  usePerf.setState({ suggest: null });
  setQuality("leve");
}
export function keepQuality(): void {
  remember("manter");
  usePerf.setState({ suggest: null });
}
