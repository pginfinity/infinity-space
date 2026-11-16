import { COPA_ID, JUKEBOX_ID, ORBI_ID, PLANTS_ID } from "@infinity/world";
import { useActs } from "../registry.ts";

/**
 * Relógio do servidor no cliente. Cada estado do pacote leva `now` (a hora do servidor quando saiu);
 * daqui sai a diferença para o relógio local. Serve para o Orbi andar e a jukebox tocar no mesmo
 * ponto para todo mundo, sem depender do relógio de cada máquina.
 */

let offset = 0;
let known = false;

export function noteServerNow(serverNow: number): void {
  if (!Number.isFinite(serverNow)) return;
  const sample = serverNow - Date.now();
  // A rede só atrasa: amostras novas e coerentes refinam aos poucos; um salto grande (relógio mudou) troca de vez.
  if (!known || Math.abs(sample - offset) > 1500) offset = sample;
  else offset += (sample - offset) * 0.25;
  known = true;
}

/** Agora, no relógio do servidor (ms). */
export function serverNow(): number {
  return Date.now() + offset;
}

const IDS = [COPA_ID, PLANTS_ID, ORBI_ID, JUKEBOX_ID];

useActs.subscribe((s, prev) => {
  for (const id of IDS) {
    const a = s.acts[id];
    if (a && a !== prev.acts[id]) noteServerNow((a.state as { now?: number } | undefined)?.now ?? NaN);
  }
});
