import { create } from "zustand";
import { impTaskSpots, type ImpRoleEvent, type ImpTaskSpot } from "@infinity/world";
import { world } from "../../world/world.ts";

/** Estado só desta pessoa no Impostor (papel, tarefa em andamento) e os pontos de tarefa do mapa. */

let spotsCache: Map<string, ImpTaskSpot> | null = null;
export function impSpots(): Map<string, ImpTaskSpot> {
  if (!spotsCache) {
    const w = world();
    spotsCache = new Map(impTaskSpots(w.map, w.nav).map((s) => [s.id, s]));
  }
  return spotsCache;
}

export interface ImpLocal {
  role: (ImpRoleEvent & { at: number }) | null;
  /** Tarefa em andamento: começou em `start` (performance.now). */
  working: { task: string; start: number } | null;
  /** Já pedi o papel nesta partida (reconexão). */
  asked: number;
}
export const useImpLocal = create<ImpLocal>(() => ({ role: null, working: null, asked: -1 }));

