import { registerActivity, sendAct } from "../registry.ts";
import { useApp } from "../../state/store.ts";

/**
 * Caneta sobre a tela compartilhada (servidor: apps/server/src/activities/tela).
 * Os traços chegam aqui e o visualizador da tela (ui/ScreenShares.tsx) desenha e apaga sozinho.
 */

export interface Stroke {
  screen: string;
  pts: number[];
  c: number;
  at: number;
}

/** Cores das canetas (uma por pessoa, pelo índice). */
export const PEN_COLORS = ["#00B7FF", "#EE5C29", "#2BC48A", "#F2B134", "#F2F0EF"];
/** Quanto tempo um traço fica na tela antes de sumir (ms). */
export const STROKE_LIFE = 6000;

const strokes: Stroke[] = [];

/** Traços recentes de uma tela (os velhos saem sozinhos). */
export function strokesOf(screen: string, now = performance.now()): Stroke[] {
  while (strokes.length && now - strokes[0]!.at > STROKE_LIFE) strokes.shift();
  return strokes.filter((s) => s.screen === screen);
}

export function sendStroke(screen: string, pts: number[], c: number): void {
  strokes.push({ screen, pts, c, at: performance.now() });
  sendAct("anotacao", "stroke", { screen, pts, c });
}

registerActivity({
  name: "tela/anotacao",
  kinds: ["annotate"],
  onEvent: (e) => {
    if (e.ev !== "stroke") return;
    // O próprio traço já foi desenhado na hora (sem esperar a volta do servidor).
    if (e.from && e.from === useApp.getState().selfId) return;
    const d = e.data as { screen: string; pts: number[]; c: number };
    strokes.push({ screen: d.screen, pts: d.pts, c: d.c, at: performance.now() });
  },
});

