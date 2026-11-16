import { dist, type Vec2 } from "../../geometry.ts";
import type { Zone } from "../../map/types.ts";

/**
 * Seguir alguém, com aceite: uma pessoa pede, a outra topa; quem segue anda sozinho atrás de quem
 * é seguido (a ~1,2 m) até parar (botão, Esc ou qualquer movimento manual). Quem é seguido vê
 * quem está atrás e pode parar a qualquer momento.
 *
 * O seguir nunca leva ninguém para dentro de uma sala fechada em que quem é seguido não está
 * (e nunca numa cabine individual): a rota é cortada antes da porta.
 */

export const SEGUIR_ID = "seguir";
export const SEGUIR_KIND = "seguir";
/** O pedido expira em 20 s. */
export const SEGUIR_TTL_MS = 20_000;
/** Intervalo mínimo entre dois pedidos da mesma pessoa. */
export const SEGUIR_COOLDOWN_MS = 3000;
/** Quantas pessoas podem seguir a mesma pessoa ao mesmo tempo (um passeio guiado). */
export const SEGUIR_MAX = 10;
/** Distância (m) que quem segue mantém de quem é seguido. */
export const SEGUIR_GAP = 1.2;
/** Mais longe que isso (m), quem segue corre. */
export const SEGUIR_RUN_AT = 4;

/** Evento "ask" (para quem vai ser seguido). */
export interface SeguirAsk {
  from: string;
  name: string;
  ms: number;
}

/** Evento "asking" (para quem pediu). */
export interface SeguirAsking {
  to: string;
  name: string;
  ms: number;
}

/** Evento "start" (para os dois). */
export interface SeguirStart {
  follower: string;
  leader: string;
  followerName: string;
  leaderName: string;
}

export type SeguirEndReason = "declined" | "expired" | "cancel" | "stopped" | "left" | "switched";

/** Evento "end" (para os dois): o pedido ou o seguir acabou. `by` = quem parou, quando alguém parou. */
export interface SeguirEnd {
  follower: string;
  leader: string;
  reason: SeguirEndReason;
  by?: string;
}

/** Seguir `leader` criaria uma roda (A segue B que segue... A)? */
export function seguirCycle(follows: ReadonlyMap<string, string>, follower: string, leader: string): boolean {
  let cur: string | undefined = leader;
  for (let i = 0; cur !== undefined && i <= follows.size; i++) {
    if (cur === follower) return true;
    cur = follows.get(cur);
  }
  return false;
}

/** Ponto a `gap` metros de quem é seguido, do lado de quem segue (fica "atrás" enquanto anda). */
export function seguirGoal(leader: Vec2, follower: Vec2, gap = SEGUIR_GAP): Vec2 {
  const dx = follower.x - leader.x;
  const dz = follower.z - leader.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return { x: leader.x, z: leader.z + gap };
  return { x: leader.x + (dx / d) * gap, z: leader.z + (dz / d) * gap };
}

const CLOSED: ReadonlySet<Zone["kind"]> = new Set(["meeting", "office", "focus"]);

/** Sala fechada: quem está dentro só ouve quem está dentro. */
export function seguirClosed(z: Zone | undefined): boolean {
  return !!z && CLOSED.has(z.kind);
}

/**
 * O seguir pode levar alguém até este lugar? Área aberta sempre; sala fechada só se quem é
 * seguido estiver nela (cabine individual nunca), ou se quem segue já estava lá dentro.
 */
export function seguirCanEnter(z: Zone | undefined, leaderZone: string | undefined, startZone: string | undefined): boolean {
  if (!z || !CLOSED.has(z.kind)) return true;
  if (z.id === startZone) return true;
  return z.id === leaderZone && z.capacity !== 1;
}

/**
 * Corta a rota (que começa em `from`) antes de ela entrar num lugar proibido pelo seguir.
 * Quem segue para ~0,5 m antes da porta e espera ali.
 */
export function seguirClip(
  from: Vec2,
  path: readonly Vec2[],
  zoneAt: (p: Vec2) => Zone | undefined,
  leaderZone: string | undefined,
  startZone: string | undefined,
  step = 0.25,
): { path: Vec2[]; clipped: boolean } {
  const out: Vec2[] = [];
  /** Últimos pontos amostrados, com quantos pontos da rota já estavam completos (para recuar da porta). */
  const trail: Array<{ q: Vec2; done: number }> = [{ q: from, done: 0 }];
  let prev = from;
  for (const p of path) {
    const n = Math.max(1, Math.ceil(dist(prev, p) / step));
    for (let i = 1; i <= n; i++) {
      const q = { x: prev.x + ((p.x - prev.x) * i) / n, z: prev.z + ((p.z - prev.z) * i) / n };
      if (!seguirCanEnter(zoneAt(q), leaderZone, startZone)) {
        const back = trail[Math.max(0, trail.length - 3)]!;
        out.length = back.done;
        if (dist(back.q, out.length ? out[out.length - 1]! : from) > 0.05) out.push(back.q);
        return { path: out, clipped: true };
      }
      trail.push({ q, done: out.length });
      if (trail.length > 4) trail.shift();
    }
    out.push(p);
    prev = p;
  }
  return { path: out, clipped: false };
}
