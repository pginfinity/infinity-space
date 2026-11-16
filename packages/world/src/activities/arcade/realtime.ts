/**
 * Base dos jogos de dois em tempo real do Arcade (hockey de mesa, pingue-pongue).
 *
 * - O servidor é a autoridade: simula a física em passos fixos de `RT_STEP` e manda um quadro
 *   (`"f"`) a cada `RT_FRAME_EVERY` passos para quem joga e quem assiste por perto.
 * - Quem joga prevê a partida localmente com a mesma física (resposta imediata do controle) e
 *   reconcilia com cada quadro do servidor. Os pedidos de movimento levam o passo previsto (`t`),
 *   e o servidor aplica cada um no passo certo: as duas simulações andam juntas.
 * - Coordenadas da mesa: metros, `x` na largura, `z` no comprimento. O lugar 0 defende o lado +z.
 */

import type { Vec2 } from "../../geometry.ts";

/** Passo da física (s). */
export const RT_STEP = 1 / 120;
/** Um quadro para os clientes a cada tantos passos (30 Hz). */
export const RT_FRAME_EVERY = 4;
/** O cliente envia o alvo do controle a cada tantos passos (40 Hz), sempre no mesmo ritmo dos dois lados. */
export const RT_INPUT_EVERY = 3;
/** Quanto o passo de um pedido pode estar à frente do servidor (antecipação máxima aceita). */
export const RT_MAX_LEAD = 60;
/** Quem assiste a até esta distância (m) da mesa recebe os quadros. */
export const RT_WATCH_RANGE = 9;
/** Contagem antes de cada partida (ms). */
export const RT_COUNTDOWN_MS = 3000;
/** Pausa depois de cada ponto (ms). */
export const RT_POINT_PAUSE_MS = 1200;

export type DuelPhase = "waiting" | "countdown" | "playing" | "finished";
export type DuelEnd = "score" | "resign" | "left" | null;

/** Estado de uma mesa de jogo em tempo real (snapshot da atividade). */
export interface DuelState {
  /** Id de quem está em cada lugar. */
  seats: [string | null, string | null];
  /** Nome de quem está em cada lugar. */
  names: [string | null, string | null];
  /** Quem jogou a partida atual (ou a última), mesmo depois de levantar. */
  players: [string | null, string | null];
  phase: DuelPhase;
  score: [number, number];
  winner: number | null;
  reason: DuelEnd;
  /** Número da partida nesta mesa. */
  round: number;
  rematch: [boolean, boolean];
  /** Contagem: ms que faltavam quando o estado saiu do servidor. */
  countdown: number;
  /** Quem saca (pingue-pongue) ou repõe o disco (hockey). */
  serve: number;
}

/** Alvo do controle de quem joga, já em coordenadas da mesa. `a` = ação (sacar). */
export interface RtTarget extends Vec2 {
  a?: number;
}

/** Bits de acontecimentos de um passo (para som e efeitos). */
export const RT_EV = {
  wall: 1,
  hit0: 2,
  hit1: 4,
  /** Ponto do lugar 0. */
  point0: 8,
  /** Ponto do lugar 1. */
  point1: 16,
  /** Quique na mesa (pingue-pongue). */
  bounce: 32,
  /** Bola fora (pingue-pongue). */
  out: 64,
} as const;

/** Quadro do servidor: `[passo, bandeiras, eventos desde o último quadro, ...estado codificado]`. */
export type RtFrame = number[];
/** Bandeira do quadro: partida parada (contagem, pausa depois do ponto, fim). */
export const RT_FRAME_PAUSED = 1;

/** Arredonda para milímetros (inteiros pequenos viajam com poucos bytes). */
export const rtMm = (v: number): number => Math.round(v * 1000);
export const rtM = (v: number): number => v / 1000;

/** Placar de vitória: chegou a `win` pontos com `by` de vantagem. */
export function duelWinner(score: readonly [number, number], win: number, by = 1): number | null {
  for (const s of [0, 1] as const) {
    const o = score[s === 0 ? 1 : 0];
    if (score[s] >= win && score[s] - o >= by) return s;
  }
  return null;
}

/** Estado inicial de uma mesa vazia. */
export function duelEmpty(): DuelState {
  return {
    seats: [null, null],
    names: [null, null],
    players: [null, null],
    phase: "waiting",
    score: [0, 0],
    winner: null,
    reason: null,
    round: 0,
    rematch: [false, false],
    countdown: 0,
    serve: 0,
  };
}

/** Lê um número finito de um pedido (dados de fora não são confiáveis). */
export function rtNum(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
}

/**
 * Mesa em coordenadas do mundo: o modelo é montado com a largura no x local e o comprimento no z local,
 * e o mundo gira o modelo por `PI - rot` (ver objectMatrix). Coordenadas da mesa = coordenadas locais.
 */
export function rtTableToWorld(table: { pos: Vec2; rot: number }, x: number, z: number): Vec2 {
  const t = Math.PI - table.rot;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: table.pos.x + x * c + z * s, z: table.pos.z - x * s + z * c };
}

/** Yaw (no mundo) de quem está no lado do lugar `seat` olhando para o centro da mesa. */
export function rtSeatYaw(table: { pos: Vec2; rot: number }, seat: number, L: number): number {
  const p = rtTableToWorld(table, 0, seat === 0 ? L : -L);
  return Math.atan2(table.pos.x - p.x, -(table.pos.z - p.z));
}

/** Um jogo de dois em tempo real, igual no servidor (autoridade) e no cliente (previsão). */
export interface RtGameDef<S> {
  kind: string;
  /** Comprimento da mesa (z) e a distância em pé além da cabeceira. */
  L: number;
  stand: number;
  /** Pontos para vencer e vantagem mínima. */
  win: number;
  by: number;
  /** Partida nova com `serve` repondo/sacando. */
  create(serve: number): S;
  step(s: S, targets: readonly (RtTarget | null)[], dt: number): number;
  copy(src: S, dst: S): void;
  encode(s: S): number[];
  decode(arr: readonly number[], at: number, dst: S): boolean;
  /** Posição de descanso do controle de cada lugar. */
  home(seat: number): Vec2;
  /** Alvo possível do controle de um lugar. */
  clamp(seat: number, x: number, z: number): Vec2;
  /** Quem repõe ou saca depois de um ponto. */
  nextServe(score: readonly [number, number], scorer: number, first: number): number;
  /** Arruma a mesa para a próxima jogada. */
  prepare(s: S, serve: number): void;
  /** Lugar que precisa agir para a jogada andar (saque), ou null. */
  waitingFor?(s: S): number | null;
}
