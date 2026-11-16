import type { Vec2 } from "../../geometry.ts";

/**
 * Chamar alguém: um pedido "Ana está te chamando" que a pessoa topa ou recusa. Topar faz a pessoa
 * andar até quem chamou; se o caminho for longo, ela pode pedir o teleporte para um lugar livre
 * perto de quem chamou. O servidor só aceita o teleporte depois de um chamado aceito, uma vez,
 * e escolhe ele mesmo o destino (andável, sem parede no meio, longe dos outros avatares).
 */

export const CHAMADO_ID = "chamado";
export const CHAMADO_KIND = "chamado";
/** O pedido expira em 30 s. */
export const CHAMADO_TTL_MS = 30_000;
/** Um chamado a cada 20 s por pessoa. */
export const CHAMADO_COOLDOWN_MS = 20_000;
/** Depois de topar, quanto tempo a pessoa tem para pedir o teleporte. */
export const CHAMADO_TELEPORT_MS = 90_000;
/** Caminho mais longo que isso (metros): além de andar, oferece o teleporte. */
export const CHAMADO_WALK_MAX = 22;
/** Distância (m) em que a pessoa para ao chegar perto de quem chamou. */
export const CHAMADO_GAP = 1.2;

/** Evento "call" (para quem é chamado). */
export interface ChamadoInvite {
  from: string;
  name: string;
  /** Sala onde quem chamou está. */
  place: string;
  ms: number;
}

/** Evento "calling" (para quem chamou). */
export interface ChamadoCalling {
  to: string;
  name: string;
  ms: number;
}

/** Evento "go" (para quem topou): onde quem chamou está agora. */
export interface ChamadoGo {
  from: string;
  name: string;
  at: Vec2;
}

/** Evento "accepted" (para quem chamou). */
export interface ChamadoAccepted {
  by: string;
  name: string;
}

export type ChamadoEndReason = "declined" | "expired" | "cancel" | "left";

/** Evento "end" (para os dois): o chamado acabou sem ninguém ir. */
export interface ChamadoEnd {
  from: string;
  to: string;
  reason: ChamadoEndReason;
}

/**
 * Evento "travel" (só para quem topou): o destino escolhido pelo servidor.
 * `instant`: o servidor já mudou a posição (a sala manda a correção de pose).
 * `dash`: travessia rápida pelo caminho (cada passo passa pela validação normal de pose).
 */
export interface ChamadoTravel {
  from: string;
  to: Vec2;
  mode: "instant" | "dash";
}

/** Evento "warp" (para todos): efeito de teleporte no avatar de `id` por `ms`. */
export interface ChamadoWarp {
  id: string;
  ms: number;
}

/** Evento "wait" (para quem chamou cedo demais): falta `ms` para poder chamar de novo. */
export interface ChamadoWait {
  ms: number;
}

/** Comprimento de um caminho que começa em `from`. */
export function chamadoPathLength(from: Vec2, path: readonly Vec2[]): number {
  let total = 0;
  let prev = from;
  for (const p of path) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}
