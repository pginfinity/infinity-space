import type { Zone } from "../../map/types.ts";

/**
 * Rituais do time. Daily: na sala do time (ou numa sala de reunião), quem está lá entra numa roda em
 * ordem sorteada; a pessoa da vez fala com um cronômetro suave e passa a vez.
 * Presença, não vigilância: nada fica registrado (nem quem falou, nem quanto tempo).
 */

export const DAILY_ID = "daily";
export const DAILY_KIND = "daily";
export const DAILY_TURNS = [60, 90, 120, 180] as const;

export interface DailyPerson {
  id: string;
  name: string;
}

export interface DailyRoom {
  zone: string;
  room: string;
  /** Ordem da roda. */
  order: DailyPerson[];
  /** Índice de quem fala agora. */
  current: number;
  /** Segundos sugeridos por pessoa (o cronômetro só avisa, não corta). */
  turn: number;
  /** Quando a vez atual começou (relógio do servidor, ms). */
  turnAt: number;
  by: string;
}

export interface DailyState {
  rooms: Record<string, DailyRoom>;
}

/** Dá para fazer daily nesta sala? (salas de time e salas de reunião) */
export function dailyAllowed(zone: Zone | undefined): zone is Zone {
  return !!zone && (!!zone.team || zone.kind === "meeting");
}

/** Embaralha (Fisher-Yates) com o gerador dado. */
export function dailyShuffle<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
