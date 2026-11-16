import type { EscVec3 } from "./common.ts";

/**
 * Aviãozinho de papel: um recado curto que voa da mão de quem manda até quem recebe,
 * acompanhando a pessoa se ela andar. Todo mundo vê o voo; só quem recebe lê o recado.
 */

export const PLANE_ID = "aviao";
export const PLANE_KIND = "plane";
export const PLANE_MSG_MAX = 140;
/** Um avião a cada 10 s por pessoa. */
export const PLANE_COOLDOWN_MS = 10_000;
export const PLANE_MIN_MS = 3000;
export const PLANE_MAX_MS = 6000;

/** Evento "fly" (para todos): sem o texto. */
export interface PlaneFly {
  id: number;
  from: string;
  to: string;
  ms: number;
}

/** Evento "letter" (só para quem recebe). */
export interface PlaneLetter {
  id: number;
  fromName: string;
  msg: string;
  ms: number;
}

/** Evento "sent" (só para quem mandou). */
export interface PlaneSent {
  id: number;
  toName: string;
  ms: number;
}

/** Evento "busy" (só para quem mandou): espere para mandar outro. */
export interface PlaneBusy {
  ms: number;
}

/** Duração do voo pela distância: de 3 s (perto) a 6 s (do outro lado da estação). */
export function planeDuration(distance: number): number {
  const ms = 2600 + Math.max(0, distance) * 90;
  return Math.round(Math.min(PLANE_MAX_MS, Math.max(PLANE_MIN_MS, ms)));
}

/** Altura do arco (m) pela distância: voo curto é baixinho, voo longo sobe acima das paredes. */
export function planeArcHeight(distance: number): number {
  return Math.min(4.2, 0.6 + distance * 0.16);
}

/**
 * Posição do avião no instante `t` (0..1) entre `a` (mão de quem manda) e `b` (quem recebe,
 * que pode estar andando). Planeia em arco com um leve balanço lateral. Escreve em `out`.
 */
export function planeArc(a: EscVec3, b: EscVec3, t: number, out: EscVec3): EscVec3 {
  const k = Math.min(1, Math.max(0, t));
  // Sai rápido da mão e chega devagar (pouso suave).
  const e = 1 - Math.pow(1 - k, 1.6);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const h = planeArcHeight(d);
  // Balanço lateral (perpendicular à direção), some no começo e no fim.
  const sway = Math.sin(e * Math.PI * 3) * Math.sin(e * Math.PI) * Math.min(0.35, d * 0.04);
  const nx = d > 1e-6 ? -dz / d : 0;
  const nz = d > 1e-6 ? dx / d : 0;
  out.x = a.x + dx * e + nx * sway;
  out.z = a.z + dz * e + nz * sway;
  out.y = a.y + (b.y - a.y) * e + h * 4 * e * (1 - e);
  return out;
}
