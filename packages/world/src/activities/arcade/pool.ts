/**
 * Sinuca por turnos: física 2D determinística (o servidor simula a tacada inteira e manda o resultado;
 * os clientes refazem a mesma conta para animar) e regras simplificadas de bola 8:
 * cada pessoa fica com um grupo (lisas 1–7 ou listradas 9–15) e, com o grupo limpo, encaçapa a 8.
 * Só + − × ÷ e raiz na simulação, para servidor e navegador chegarem nas mesmas posições.
 */

import type { Vec2 } from "../../geometry.ts";
import type { DuelPhase } from "./realtime.ts";

export const POOL_KIND = "pool";

export const POOL = {
  /** Metade do campo por dentro das tabelas (m). */
  HW: 0.585,
  HL: 1.16,
  R: 0.028,
  POCKET_CORNER: 0.064,
  POCKET_SIDE: 0.06,
  /** Desaceleração rolando (m/s²). */
  FRICTION: 0.72,
  CUSHION_E: 0.78,
  BALL_E: 0.95,
  /** Velocidade da branca com força 1 (m/s). */
  MAX_SPEED: 5.4,
  STEP: 1 / 240,
  MAX_TIME: 25,
  STOP: 0.004,
  /** Distância em pé além da cabeceira. */
  STAND: 0.5,
  /** Comprimento da mesa (para os pontos em pé). */
  L: 2.6,
} as const;

export type PoolGroup = "lisas" | "listradas";

/** Bolas paradas: posição de cada uma (0 = branca, 8 = preta); null = encaçapada. */
export type PoolBalls = Array<[number, number] | null>;

export interface PoolShot {
  /** Primeira bola que a branca tocou (null = não tocou em nada). */
  first: number | null;
  /** Encaçapadas, na ordem. */
  pocketed: number[];
  balls: PoolBalls;
  /** Duração da animação (s). */
  time: number;
}

export function poolGroupOf(ball: number): PoolGroup | null {
  if (ball >= 1 && ball <= 7) return "lisas";
  if (ball >= 9 && ball <= 15) return "listradas";
  return null;
}

export function poolPockets(): Vec2[] {
  const { HW, HL } = POOL;
  const o = 0.012;
  return [
    { x: -HW - o, z: -HL - o },
    { x: HW + o, z: -HL - o },
    { x: -HW - o, z: HL + o },
    { x: HW + o, z: HL + o },
    { x: -HW - o, z: 0 },
    { x: HW + o, z: 0 },
  ];
}

/** Lugar da branca (cabeceira do lado +z). */
export const POOL_HEAD: Vec2 = { x: 0, z: POOL.HL / 2 };

/** Triângulo arrumado no lado -z, com a 8 no meio da terceira fileira e um canto de cada grupo. */
export function poolRack(): PoolBalls {
  const balls: PoolBalls = new Array(16).fill(null);
  balls[0] = [POOL_HEAD.x, POOL_HEAD.z];
  // ordem fixa (sem sorteio): o servidor e os testes sempre começam iguais
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 15, 7];
  const d = POOL.R * 2 + 0.0005;
  const rowStep = d * 0.8660254037844386;
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      const b = order[k++]!;
      balls[b] = [(i - row / 2) * d, -POOL.HL / 2 - row * rowStep];
    }
  }
  return balls;
}

/**
 * Simula a tacada até tudo parar. `dir` precisa ser unitário (o servidor normaliza e manda o mesmo número
 * para os clientes). `frame` recebe as posições a cada 1/60 s (para animar).
 */
export function poolSimulate(start: PoolBalls, dir: Vec2, power: number, frame?: (t: number, xs: Float64Array, zs: Float64Array, inside: Uint8Array) => void): PoolShot {
  const n = 16;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const vx = new Float64Array(n);
  const vz = new Float64Array(n);
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = start[i];
    if (p) {
      x[i] = p[0];
      z[i] = p[1];
    } else inside[i] = 1;
  }
  const speed = Math.min(1, Math.max(0, power)) * POOL.MAX_SPEED;
  vx[0] = dir.x * speed;
  vz[0] = dir.z * speed;
  const pockets = poolPockets();
  const R = POOL.R;
  const D2 = 4 * R * R;
  const dt = POOL.STEP;
  let first: number | null = null;
  const pocketed: number[] = [];
  let t = 0;
  let nextFrame = 0;
  for (; t < POOL.MAX_TIME; t += dt) {
    let moving = false;
    for (let i = 0; i < n; i++) {
      if (inside[i]) continue;
      const v2 = vx[i]! * vx[i]! + vz[i]! * vz[i]!;
      if (v2 === 0) continue;
      const v = Math.sqrt(v2);
      const nv = v - POOL.FRICTION * dt;
      if (nv <= POOL.STOP) {
        vx[i] = 0;
        vz[i] = 0;
        continue;
      }
      moving = true;
      vx[i] = (vx[i]! * nv) / v;
      vz[i] = (vz[i]! * nv) / v;
      x[i] = x[i]! + vx[i]! * dt;
      z[i] = z[i]! + vz[i]! * dt;
    }
    // bola com bola (massas iguais)
    for (let i = 0; i < n; i++) {
      if (inside[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (inside[j]) continue;
        const dx = x[j]! - x[i]!;
        const dz = z[j]! - z[i]!;
        const d2 = dx * dx + dz * dz;
        if (d2 >= D2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const rel = (vx[i]! - vx[j]!) * nx + (vz[i]! - vz[j]!) * nz;
        if (rel > 0) {
          const imp = ((1 + POOL.BALL_E) / 2) * rel;
          vx[i] = vx[i]! - imp * nx;
          vz[i] = vz[i]! - imp * nz;
          vx[j] = vx[j]! + imp * nx;
          vz[j] = vz[j]! + imp * nz;
          moving = true;
          if (first === null && (i === 0 || j === 0)) first = i === 0 ? j : i;
        }
        const push = (2 * R - d) / 2;
        x[i] = x[i]! - nx * push;
        z[i] = z[i]! - nz * push;
        x[j] = x[j]! + nx * push;
        z[j] = z[j]! + nz * push;
      }
    }
    // caçapas antes das tabelas (a bola que chega no canto cai)
    for (let i = 0; i < n; i++) {
      if (inside[i]) continue;
      for (let k = 0; k < pockets.length; k++) {
        const p = pockets[k]!;
        const r = k < 4 ? POOL.POCKET_CORNER : POOL.POCKET_SIDE;
        const dx = x[i]! - p.x;
        const dz = z[i]! - p.z;
        if (dx * dx + dz * dz < r * r) {
          inside[i] = 1;
          vx[i] = 0;
          vz[i] = 0;
          pocketed.push(i);
          break;
        }
      }
    }
    // tabelas
    const hw = POOL.HW - R;
    const hl = POOL.HL - R;
    for (let i = 0; i < n; i++) {
      if (inside[i]) continue;
      if (x[i]! < -hw) {
        x[i] = -hw;
        if (vx[i]! < 0) vx[i] = -vx[i]! * POOL.CUSHION_E;
      } else if (x[i]! > hw) {
        x[i] = hw;
        if (vx[i]! > 0) vx[i] = -vx[i]! * POOL.CUSHION_E;
      }
      if (z[i]! < -hl) {
        z[i] = -hl;
        if (vz[i]! < 0) vz[i] = -vz[i]! * POOL.CUSHION_E;
      } else if (z[i]! > hl) {
        z[i] = hl;
        if (vz[i]! > 0) vz[i] = -vz[i]! * POOL.CUSHION_E;
      }
    }
    if (frame && t >= nextFrame) {
      frame(t, x, z, inside);
      nextFrame += 1 / 60;
    }
    if (!moving) break;
  }
  const balls: PoolBalls = [];
  for (let i = 0; i < n; i++) balls.push(inside[i] ? null : [x[i]!, z[i]!]);
  if (frame) frame(t, x, z, inside);
  return { first, pocketed, balls, time: t };
}

// ---------------------------------------------------------------- regras

export type PoolFoul = "scratch" | "nohit" | "wrong" | null;

export interface PoolLast {
  by: number;
  dir: Vec2;
  power: number;
  before: PoolBalls;
  pocketed: number[];
  foul: PoolFoul;
  /** Quem tacou continua. */
  keep: boolean;
  /** Duração da animação (s). */
  time: number;
}

export interface PoolState {
  seats: [string | null, string | null];
  names: [string | null, string | null];
  players: [string | null, string | null];
  phase: DuelPhase;
  round: number;
  rematch: [boolean, boolean];
  turn: number;
  groups: [PoolGroup | null, PoolGroup | null];
  balls: PoolBalls;
  /** Número da tacada (muda a cada tacada: os clientes animam a `last`). */
  shot: number;
  last: PoolLast | null;
  winner: number | null;
  reason: "eight" | "eightEarly" | "eightScratch" | "resign" | "left" | null;
}

export function poolEmpty(): PoolState {
  return {
    seats: [null, null],
    names: [null, null],
    players: [null, null],
    phase: "waiting",
    round: 0,
    rematch: [false, false],
    turn: 0,
    groups: [null, null],
    balls: poolRack(),
    shot: 0,
    last: null,
    winner: null,
    reason: null,
  };
}

/** Bolas do grupo que ainda estão na mesa. */
export function poolLeft(balls: PoolBalls, g: PoolGroup | null): number {
  if (!g) return 7;
  let n = 0;
  for (let b = 1; b <= 15; b++) if (poolGroupOf(b) === g && balls[b]) n++;
  return n;
}

/** Põe uma bola num ponto livre perto de `at` (andando no eixo z). */
function respot(balls: PoolBalls, ball: number, at: Vec2): void {
  for (let k = 0; k < 40; k++) {
    const z = at.z + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * POOL.R * 2.2;
    const free = balls.every((p, i) => i === ball || !p || (p[0] - at.x) * (p[0] - at.x) + (p[1] - z) * (p[1] - z) > 4 * POOL.R * POOL.R * 1.1);
    if (free && Math.abs(z) < POOL.HL - POOL.R) {
      balls[ball] = [at.x, z];
      return;
    }
  }
  balls[ball] = [at.x, at.z];
}

/**
 * Aplica as regras ao resultado da tacada de `seat`. Devolve o estado novo (puro).
 * Simplificações: sem "bola na mão" (a branca volta para a cabeceira) e a 8 na saída volta para o lugar.
 */
export function poolRules(s: PoolState, seat: number, dir: Vec2, power: number, shot: PoolShot): PoolState {
  const before = s.balls;
  const balls = shot.balls.map((p) => (p ? ([p[0], p[1]] as [number, number]) : null));
  const groups: [PoolGroup | null, PoolGroup | null] = [s.groups[0], s.groups[1]];
  const mine = groups[seat] ?? null;
  const other = seat === 0 ? 1 : 0;
  const isBreak = s.shot === 0 || s.last === null;
  const scratch = shot.pocketed.includes(0);
  const eightIn = shot.pocketed.includes(8);
  const clearedBefore = mine !== null && poolLeft(before, mine) === 0;
  let foul: PoolFoul = null;
  if (scratch) foul = "scratch";
  else if (shot.first === null) foul = "nohit";
  else if (shot.first === 8 && !clearedBefore && !isBreak) foul = "wrong";
  else if (mine && shot.first !== 8 && poolGroupOf(shot.first) !== mine) foul = "wrong";

  const next: PoolState = { ...s, balls, groups, shot: s.shot + 1, last: { by: seat, dir, power, before, pocketed: shot.pocketed, foul, keep: false, time: shot.time } };

  if (eightIn) {
    if (isBreak) respot(balls, 8, { x: 0, z: -POOL.HL / 2 });
    else {
      const win = clearedBefore && !foul;
      next.phase = "finished";
      next.winner = win ? seat : other;
      next.reason = win ? "eight" : scratch ? "eightScratch" : "eightEarly";
      return next;
    }
  }
  if (scratch) respot(balls, 0, POOL_HEAD);

  // mesa aberta: a primeira bola de grupo encaçapada (sem falta) define os grupos
  let my = mine;
  if (!my && !foul && !isBreak) {
    const firstGroup = shot.pocketed.map(poolGroupOf).find((g) => g !== null) ?? null;
    if (firstGroup) {
      my = firstGroup;
      groups[seat] = firstGroup;
      groups[other] = firstGroup === "lisas" ? "listradas" : "lisas";
    }
  }
  const pocketedMine = shot.pocketed.some((b) => (my ? poolGroupOf(b) === my : poolGroupOf(b) !== null));
  const keep = !foul && pocketedMine;
  next.last!.keep = keep;
  next.turn = keep ? seat : other;
  return next;
}
