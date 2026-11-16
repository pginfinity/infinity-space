/**
 * Pingue-pongue visto de cima: física simplificada e regras (11 pontos, vantagem de 2, saque a cada 2).
 * O lugar 0 joga do lado +z, o lugar 1 do lado -z. As raquetes ficam atrás da própria cabeceira.
 * A altura da bola é só visual (`pongHeight`): a simulação é plana e sem trigonometria.
 */

import { RT_EV, rtM, rtMm, type RtGameDef, type RtTarget } from "./realtime.ts";

export const PONG_KIND = "pingpong";

export const PONG = {
  /** Mesa (tampo). */
  W: 1.5,
  L: 2.7,
  BALL_R: 0.02,
  /** Meia largura da raquete (generosa: a vista de cima não tem profundidade). */
  PAD_HW: 0.17,
  /** Faixa onde a raquete anda, medida a partir da cabeceira para fora. */
  PAD_NEAR: 0.06,
  PAD_FAR: 0.55,
  /** Quanto a raquete passa da largura da mesa para os lados. */
  PAD_SIDE: 0.35,
  MAX_PAD: 4.4,
  SERVE_SPEED: 2.3,
  MAX_BALL: 6.0,
  /** Cada rebatida acelera um pouco. */
  SPEEDUP: 1.055,
  /** A bola que passou desta distância além da cabeceira foi perdida. */
  MISS: 0.85,
  WIN: 11,
  BY: 2,
  STAND: 0.7,
  /** Ponto do quique visual entre a rebatida e a cabeceira do outro lado (0 a 1). */
  BOUNCE_AT: 0.68,
} as const;

/** Momento da jogada: 0 saque (bola na raquete de quem saca), 1 em jogo, 2 bola morta (ponto marcado). */
export type PongMode = 0 | 1 | 2;

export interface PongBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface PongSim {
  ball: PongBody;
  pads: [PongBody, PongBody];
  mode: PongMode;
  /** Quem saca agora. */
  server: number;
  /** Quem rebateu por último (-1 antes do saque). */
  last: number;
  /** z da última rebatida (para a altura visual e o quique). */
  hitZ: number;
  /** Já passou pelo ponto do quique nesta travessia. */
  bounced: boolean;
}

const body = (x = 0, z = 0): PongBody => ({ x, z, vx: 0, vz: 0 });

/** Lado (+1 ou -1) do lugar. */
const side = (seat: number) => (seat === 0 ? 1 : -1);

export function pongHome(seat: number): { x: number; z: number } {
  return { x: 0, z: side(seat) * (PONG.L / 2 + 0.22) };
}

export function pongCreate(server = 0): PongSim {
  const h0 = pongHome(0);
  const h1 = pongHome(1);
  const s: PongSim = { ball: body(), pads: [body(h0.x, h0.z), body(h1.x, h1.z)], mode: 0, server, last: -1, hitZ: 0, bounced: false };
  pongServe(s, server);
  return s;
}

/** Prepara o saque de `server`: bola parada na frente da raquete dele. */
export function pongServe(s: PongSim, server: number): void {
  s.mode = 0;
  s.server = server;
  s.last = -1;
  s.bounced = false;
  holdBall(s);
}

function holdBall(s: PongSim): void {
  const p = s.pads[s.server]!;
  const b = s.ball;
  b.x = p.x;
  b.z = p.z - side(s.server) * 0.09;
  b.vx = 0;
  b.vz = 0;
  s.hitZ = b.z;
}

/** Quem saca no ponto atual: troca a cada 2 pontos; a partir de 10 a 10, a cada ponto. */
export function pongServer(score: readonly [number, number], first: number): number {
  const n = score[0] + score[1];
  const turns = score[0] >= PONG.WIN - 1 && score[1] >= PONG.WIN - 1 ? (PONG.WIN - 1) + (n - 2 * (PONG.WIN - 1)) : n >> 1;
  return (first + turns) % 2;
}

export function pongClamp(seat: number, x: number, z: number): { x: number; z: number } {
  const sx = PONG.W / 2 + PONG.PAD_SIDE;
  const near = PONG.L / 2 + PONG.PAD_NEAR;
  const far = PONG.L / 2 + PONG.PAD_FAR;
  const cz = side(seat) > 0 ? Math.min(far, Math.max(near, z)) : Math.max(-far, Math.min(-near, z));
  return { x: Math.min(sx, Math.max(-sx, x)), z: cz };
}

function movePad(p: PongBody, seat: number, target: RtTarget | null, dt: number): void {
  if (!target) {
    p.vx = 0;
    p.vz = 0;
    return;
  }
  const t = pongClamp(seat, target.x, target.z);
  let dx = t.x - p.x;
  let dz = t.z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const max = PONG.MAX_PAD * dt;
  if (d > max) {
    dx = (dx / d) * max;
    dz = (dz / d) * max;
  }
  p.x += dx;
  p.z += dz;
  p.vx = dx / dt;
  p.vz = dz / dt;
}

/** Rebatida: ângulo pelo ponto da raquete onde a bola pegou, mais um pouco do movimento da raquete. */
function returnBall(s: PongSim, seat: number): void {
  const b = s.ball;
  const p = s.pads[seat]!;
  const speed0 = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
  // raquete indo para a frente dá uma cortada
  const push = -side(seat) * p.vz;
  let speed = Math.min(PONG.MAX_BALL, Math.max(PONG.SERVE_SPEED, speed0 * PONG.SPEEDUP) * (1 + Math.min(0.22, Math.max(0, push) * 0.06)));
  if (speed > PONG.MAX_BALL) speed = PONG.MAX_BALL;
  const u = Math.max(-1, Math.min(1, (b.x - p.x) / PONG.PAD_HW));
  const maxX = speed * 0.55;
  const vx = Math.max(-maxX, Math.min(maxX, u * speed * 0.42 + p.vx * 0.25));
  b.vx = vx;
  b.vz = -side(seat) * Math.sqrt(speed * speed - vx * vx);
  b.z = p.z - side(seat) * (PONG.BALL_R + 0.002);
  s.last = seat;
  s.hitZ = b.z;
  s.bounced = false;
}

/**
 * Um passo. `targets[i].a` = 1 pede o saque (só vale para quem saca). Devolve os bits de RT_EV;
 * num ponto a bola fica morta (modo 2) e quem chama marca o ponto e prepara o próximo saque.
 */
export function pongStep(s: PongSim, targets: readonly (RtTarget | null)[], dt: number): number {
  let ev = 0;
  const b = s.ball;
  const prevRel = [b.z - s.pads[0].z, b.z - s.pads[1].z];
  movePad(s.pads[0], 0, targets[0] ?? null, dt);
  movePad(s.pads[1], 1, targets[1] ?? null, dt);
  if (s.mode === 2) return 0;
  if (s.mode === 0) {
    holdBall(s);
    if (targets[s.server]?.a) {
      const p = s.pads[s.server]!;
      s.mode = 1;
      s.last = s.server;
      s.bounced = false;
      // saque: um pouco do movimento lateral da raquete e puxado para o meio da mesa
      const vx = Math.max(-0.9, Math.min(0.9, p.vx * 0.22 - b.x * 0.5));
      b.vx = vx;
      b.vz = -side(s.server) * Math.sqrt(PONG.SERVE_SPEED * PONG.SERVE_SPEED - vx * vx);
      s.hitZ = b.z;
      ev |= s.server === 0 ? RT_EV.hit0 : RT_EV.hit1;
    }
    return ev;
  }

  b.x += b.vx * dt;
  b.z += b.vz * dt;
  const recv = s.last === 0 ? 1 : 0;
  const dir = side(recv);
  const end = dir * (PONG.L / 2);

  // quique visual no lado de quem recebe
  if (!s.bounced) {
    const total = Math.abs(end - s.hitZ);
    if (Math.abs(b.z - s.hitZ) >= total * PONG.BOUNCE_AT) {
      s.bounced = true;
      if (Math.abs(b.x) <= PONG.W / 2 + PONG.BALL_R) ev |= RT_EV.bounce;
    }
  }
  // passou da cabeceira de quem recebe: fora da mesa é ponto de quem recebe
  if (dir * b.z >= PONG.L / 2 && dir * (b.z - b.vz * dt) < PONG.L / 2 && Math.abs(b.x) > PONG.W / 2 + PONG.BALL_R) {
    s.mode = 2;
    return ev | RT_EV.out | (recv === 0 ? RT_EV.point0 : RT_EV.point1);
  }
  // raquete de quem recebe: a bola cruzou a linha da raquete (contando o movimento dela)
  const p = s.pads[recv]!;
  const rel = b.z - p.z;
  if (prevRel[recv]! * dir < 0 && rel * dir >= 0 && Math.abs(b.x - p.x) <= PONG.PAD_HW + PONG.BALL_R) {
    returnBall(s, recv);
    return ev | (recv === 0 ? RT_EV.hit0 : RT_EV.hit1);
  }
  // perdeu a bola
  if (dir * b.z > PONG.L / 2 + PONG.MISS) {
    s.mode = 2;
    return ev | (s.last === 0 ? RT_EV.point0 : RT_EV.point1);
  }
  return ev;
}

/** Altura visual da bola acima do tampo (m): arco até o quique e subida até a raquete. */
export function pongHeight(s: PongSim): number {
  if (s.mode === 0) return 0.16;
  const recv = s.last === 0 ? 1 : 0;
  const end = side(recv) * (PONG.L / 2);
  const total = Math.max(0.2, Math.abs(end - s.hitZ));
  const u = Math.abs(s.ball.z - s.hitZ) / total;
  const ub = PONG.BOUNCE_AT;
  if (u < ub) {
    const k = u / ub;
    return 0.12 * (1 - k) + 0.26 * Math.sin(Math.PI * k) + PONG.BALL_R;
  }
  const k = Math.min(1.6, (u - ub) / (1 - ub));
  return 0.24 * Math.sin(Math.min(Math.PI * 0.62, (Math.PI * k) / 2)) + PONG.BALL_R;
}

export function pongCopy(a: PongSim, b: PongSim): void {
  copyBody(a.ball, b.ball);
  copyBody(a.pads[0], b.pads[0]);
  copyBody(a.pads[1], b.pads[1]);
  b.mode = a.mode;
  b.server = a.server;
  b.last = a.last;
  b.hitZ = a.hitZ;
  b.bounced = a.bounced;
}

function copyBody(a: PongBody, b: PongBody): void {
  b.x = a.x;
  b.z = a.z;
  b.vx = a.vx;
  b.vz = a.vz;
}

export function pongEncode(s: PongSim): number[] {
  const out: number[] = [];
  for (const q of [s.ball, s.pads[0], s.pads[1]]) out.push(rtMm(q.x), rtMm(q.z), rtMm(q.vx), rtMm(q.vz));
  out.push(s.mode, s.server, s.last, rtMm(s.hitZ), s.bounced ? 1 : 0);
  return out;
}

export function pongDecode(arr: readonly number[], at: number, dst: PongSim): boolean {
  if (arr.length < at + 17) return false;
  const v = (i: number) => arr[at + i] ?? 0;
  [dst.ball, dst.pads[0], dst.pads[1]].forEach((q, k) => {
    q.x = rtM(v(k * 4));
    q.z = rtM(v(k * 4 + 1));
    q.vx = rtM(v(k * 4 + 2));
    q.vz = rtM(v(k * 4 + 3));
  });
  const mode = v(12);
  dst.mode = mode === 1 ? 1 : mode === 2 ? 2 : 0;
  dst.server = v(13) === 1 ? 1 : 0;
  dst.last = v(14) === 0 ? 0 : v(14) === 1 ? 1 : -1;
  dst.hitZ = rtM(v(15));
  dst.bounced = v(16) === 1;
  return true;
}

export const PONG_DEF: RtGameDef<PongSim> = {
  kind: PONG_KIND,
  L: PONG.L,
  stand: PONG.STAND,
  win: PONG.WIN,
  by: PONG.BY,
  create: pongCreate,
  step: pongStep,
  copy: pongCopy,
  encode: pongEncode,
  decode: pongDecode,
  clamp: pongClamp,
  home: pongHome,
  nextServe: (score, _scorer, first) => pongServer(score, first),
  prepare: pongServe,
  waitingFor: (s) => (s.mode === 0 ? s.server : null),
};
