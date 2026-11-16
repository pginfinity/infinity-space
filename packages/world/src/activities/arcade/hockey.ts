/**
 * Hockey de mesa: física pura (o servidor simula, quem joga prevê com o mesmo código).
 * Campo visto de cima; o lugar 0 defende o gol do lado +z, o lugar 1 o do lado -z.
 * Sem trigonometria na simulação: só + − × ÷ e raiz, para servidor e navegador darem o mesmo resultado.
 */

import { RT_EV, rtM, rtMm, type RtGameDef, type RtTarget } from "./realtime.ts";

export const HOCKEY_KIND = "airhockey";

export const HOCKEY = {
  /** Largura e comprimento do campo (por dentro das bordas da mesa). */
  W: 0.96,
  L: 1.86,
  /** Boca do gol. */
  GOAL: 0.3,
  PUCK_R: 0.032,
  MALLET_R: 0.05,
  /** Velocidade máxima do disco e do rebatedor (m/s). */
  MAX_PUCK: 4.2,
  MAX_MALLET: 3.4,
  /** Perda de velocidade do disco por segundo (o colchão de ar quase não freia). */
  DRAG: 0.22,
  /** Restituição das bordas e do rebatedor. */
  WALL_E: 0.86,
  HIT_E: 0.92,
  /** Vence quem fizer 7. */
  WIN: 7,
  /** Quem joga fica em pé a esta distância além da cabeceira. */
  STAND: 0.42,
} as const;

export interface HockeyBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface HockeySim {
  puck: HockeyBody;
  mallets: [HockeyBody, HockeyBody];
}

const body = (x = 0, z = 0): HockeyBody => ({ x, z, vx: 0, vz: 0 });

/** Posição de descanso do rebatedor de cada lugar (perto do próprio gol). */
export function hockeyHome(seat: number): { x: number; z: number } {
  const z = HOCKEY.L / 2 - 0.18;
  return { x: 0, z: seat === 0 ? z : -z };
}

/** Partida nova: rebatedores em casa e o disco parado no lado de quem repõe (`serve`). */
export function hockeyCreate(serve = 0): HockeySim {
  const h0 = hockeyHome(0);
  const h1 = hockeyHome(1);
  const s: HockeySim = { puck: body(), mallets: [body(h0.x, h0.z), body(h1.x, h1.z)] };
  hockeyServe(s, serve);
  return s;
}

/** Repõe o disco parado no meio do campo de quem sofreu o gol (ou de quem começa). */
export function hockeyServe(s: HockeySim, seat: number): void {
  const p = s.puck;
  p.x = 0;
  p.z = (seat === 0 ? 1 : -1) * HOCKEY.L * 0.25;
  p.vx = 0;
  p.vz = 0;
}

/** Limita o alvo do rebatedor ao campo do próprio lugar. */
export function hockeyClamp(seat: number, x: number, z: number): { x: number; z: number } {
  const r = HOCKEY.MALLET_R;
  const cx = Math.min(HOCKEY.W / 2 - r, Math.max(-HOCKEY.W / 2 + r, x));
  const lo = seat === 0 ? r * 0.4 : -HOCKEY.L / 2 + r;
  const hi = seat === 0 ? HOCKEY.L / 2 - r : -r * 0.4;
  return { x: cx, z: Math.min(hi, Math.max(lo, z)) };
}

/** Anda com o rebatedor rumo ao alvo, com velocidade limitada (o servidor confere a física, não a mão). */
function moveMallet(m: HockeyBody, seat: number, target: RtTarget | null, dt: number): void {
  if (!target) {
    m.vx = 0;
    m.vz = 0;
    return;
  }
  const t = hockeyClamp(seat, target.x, target.z);
  let dx = t.x - m.x;
  let dz = t.z - m.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const max = HOCKEY.MAX_MALLET * dt;
  if (d > max) {
    dx = (dx / d) * max;
    dz = (dz / d) * max;
  }
  m.x += dx;
  m.z += dz;
  m.vx = dx / dt;
  m.vz = dz / dt;
}

function capSpeed(b: HockeyBody, max: number): void {
  const v2 = b.vx * b.vx + b.vz * b.vz;
  if (v2 > max * max) {
    const k = max / Math.sqrt(v2);
    b.vx *= k;
    b.vz *= k;
  }
}

/** Disco contra rebatedor (massa infinita). Devolve true se bateu. */
function collide(p: HockeyBody, m: HockeyBody): boolean {
  const dx = p.x - m.x;
  const dz = p.z - m.z;
  const min = HOCKEY.PUCK_R + HOCKEY.MALLET_R;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 1e-12 ? dx / d : 0;
  const nz = d2 > 1e-12 ? dz / d : 1;
  // tira o disco de dentro do rebatedor
  p.x = m.x + nx * (min + 1e-4);
  p.z = m.z + nz * (min + 1e-4);
  const vn = (p.vx - m.vx) * nx + (p.vz - m.vz) * nz;
  if (vn < 0) {
    p.vx -= (1 + HOCKEY.HIT_E) * vn * nx;
    p.vz -= (1 + HOCKEY.HIT_E) * vn * nz;
  }
  capSpeed(p, HOCKEY.MAX_PUCK);
  return true;
}

/**
 * Um passo da física. `targets[i]` é para onde o lugar i leva o rebatedor (null = parado).
 * Devolve os acontecimentos do passo (bits de RT_EV). Num gol, o disco para dentro do gol:
 * quem chama (o servidor) marca o ponto e repõe o disco.
 */
export function hockeyStep(s: HockeySim, targets: readonly (RtTarget | null)[], dt: number): number {
  let ev = 0;
  moveMallet(s.mallets[0], 0, targets[0] ?? null, dt);
  moveMallet(s.mallets[1], 1, targets[1] ?? null, dt);
  const p = s.puck;
  const k = Math.max(0, 1 - HOCKEY.DRAG * dt);
  p.vx *= k;
  p.vz *= k;
  p.x += p.vx * dt;
  p.z += p.vz * dt;

  if (collide(p, s.mallets[0])) ev |= RT_EV.hit0;
  if (collide(p, s.mallets[1])) ev |= RT_EV.hit1;

  const r = HOCKEY.PUCK_R;
  const hw = HOCKEY.W / 2;
  const hl = HOCKEY.L / 2;
  if (p.x < -hw + r) {
    p.x = -hw + r;
    if (p.vx < 0) p.vx = -p.vx * HOCKEY.WALL_E;
    ev |= RT_EV.wall;
  } else if (p.x > hw - r) {
    p.x = hw - r;
    if (p.vx > 0) p.vx = -p.vx * HOCKEY.WALL_E;
    ev |= RT_EV.wall;
  }
  const inMouth = Math.abs(p.x) < HOCKEY.GOAL / 2 - r * 0.25;
  if (inMouth && (p.z > hl + r || p.z < -hl - r)) {
    // entrou: o gol do lado +z é do lugar 0, então o ponto é do lugar 1 (e vice-versa)
    ev |= p.z > 0 ? RT_EV.point1 : RT_EV.point0;
    p.vx = 0;
    p.vz = 0;
    return ev;
  }
  if (!inMouth) {
    if (p.z > hl - r) {
      p.z = hl - r;
      if (p.vz > 0) p.vz = -p.vz * HOCKEY.WALL_E;
      ev |= RT_EV.wall;
    } else if (p.z < -hl + r) {
      p.z = -hl + r;
      if (p.vz < 0) p.vz = -p.vz * HOCKEY.WALL_E;
      ev |= RT_EV.wall;
    }
  }
  return ev;
}

export function hockeyCopy(src: HockeySim, dst: HockeySim): void {
  copyBody(src.puck, dst.puck);
  copyBody(src.mallets[0], dst.mallets[0]);
  copyBody(src.mallets[1], dst.mallets[1]);
}

function copyBody(a: HockeyBody, b: HockeyBody): void {
  b.x = a.x;
  b.z = a.z;
  b.vx = a.vx;
  b.vz = a.vz;
}

/** Estado em milímetros (vai nos quadros do servidor). */
export function hockeyEncode(s: HockeySim): number[] {
  const p = s.puck;
  const [a, b] = s.mallets;
  return [rtMm(p.x), rtMm(p.z), rtMm(p.vx), rtMm(p.vz), rtMm(a.x), rtMm(a.z), rtMm(a.vx), rtMm(a.vz), rtMm(b.x), rtMm(b.z), rtMm(b.vx), rtMm(b.vz)];
}

/** Lê o estado de um quadro (`arr` a partir de `at`). Devolve false se faltar dado. */
export function hockeyDecode(arr: readonly number[], at: number, dst: HockeySim): boolean {
  if (arr.length < at + 12) return false;
  const v = (i: number) => rtM(arr[at + i] ?? 0);
  const set = (b: HockeyBody, i: number) => {
    b.x = v(i);
    b.z = v(i + 1);
    b.vx = v(i + 2);
    b.vz = v(i + 3);
  };
  set(dst.puck, 0);
  set(dst.mallets[0], 4);
  set(dst.mallets[1], 8);
  return true;
}

export const HOCKEY_DEF: RtGameDef<HockeySim> = {
  kind: HOCKEY_KIND,
  L: HOCKEY.L,
  stand: HOCKEY.STAND,
  win: HOCKEY.WIN,
  by: 1,
  create: hockeyCreate,
  step: hockeyStep,
  copy: hockeyCopy,
  encode: hockeyEncode,
  decode: hockeyDecode,
  clamp: hockeyClamp,
  home: hockeyHome,
  // quem sofreu o gol repõe o disco
  nextServe: (_score, scorer) => (scorer === 0 ? 1 : 0),
  prepare: hockeyServe,
};
