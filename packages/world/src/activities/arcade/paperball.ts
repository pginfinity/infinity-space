/**
 * Bolinha de papel na lixeira: mira (direção) e força decidem onde a bolinha cai. Tudo determinístico:
 * o servidor calcula o resultado com a posição que ele conhece; o cliente anima a mesma conta na hora.
 * Sequência de acertos por pessoa (some ao errar) e recorde do dia (zera à meia-noite de Brasília).
 */

import type { Vec2 } from "../../geometry.ts";

export const PAPER_ID = "bolinha";
export const PAPER_KIND = "paperball";

export const PAPER = {
  /** Alcance com força 0 e com força 1 (m). */
  MIN: 0.8,
  MAX: 7.2,
  /** Raio de acerto (boca da lixeira com uma folga) e da "trave". */
  HIT_R: 0.26,
  RIM_R: 0.4,
  /** De mais perto que isso não conta para a sequência. */
  MIN_DIST: 2.5,
  /** Distância máxima da lixeira para arremessar. */
  RANGE: 8,
  COOLDOWN_MS: 650,
  /** Alturas: mão de quem arremessa e boca da lixeira. */
  HAND: 1.15,
  BIN_TOP: 0.5,
} as const;

export type PaperResult = "hit" | "rim" | "miss" | "close";

export interface PaperState {
  /** Dia do recorde ("AAAA-MM-DD", horário de Brasília). */
  day: string;
  record: { name: string; streak: number } | null;
}

/** Evento "throw". */
export interface PaperThrow {
  id: string;
  name: string;
  from: Vec2;
  to: Vec2;
  bin: string | null;
  result: PaperResult;
  streak: number;
  /** Bateu o recorde do dia. */
  record: boolean;
}

/** Onde a bolinha cai: na direção da mira, mais longe quanto mais força. */
export function paperLanding(from: Vec2, dir: Vec2, power: number): Vec2 {
  const len = Math.hypot(dir.x, dir.z) || 1;
  const p = Math.min(1, Math.max(0, power));
  const d = PAPER.MIN + p * (PAPER.MAX - PAPER.MIN);
  return { x: from.x + (dir.x / len) * d, z: from.z + (dir.z / len) * d };
}

/** Resultado do arremesso contra a lixeira (centro `bin`). */
export function paperOutcome(from: Vec2, landing: Vec2, bin: Vec2): PaperResult {
  const miss = Math.hypot(landing.x - bin.x, landing.z - bin.z);
  if (miss <= PAPER.HIT_R) return Math.hypot(from.x - bin.x, from.z - bin.z) < PAPER.MIN_DIST ? "close" : "hit";
  if (miss <= PAPER.RIM_R) return "rim";
  return "miss";
}

/** Tempo de voo (s): arremessos longos demoram mais. */
export function paperFlight(from: Vec2, to: Vec2): number {
  return 0.45 + Math.hypot(to.x - from.x, to.z - from.z) * 0.085;
}

/** Posição da bolinha em `u` (0 a 1) do voo, em arco, terminando na altura `endY`. */
export function paperArc(from: Vec2, to: Vec2, u: number, endY: number, out: { x: number; y: number; z: number }): void {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const apex = 0.55 + d * 0.16;
  const k = Math.min(1, Math.max(0, u));
  out.x = from.x + (to.x - from.x) * k;
  out.z = from.z + (to.z - from.z) * k;
  out.y = PAPER.HAND + (endY - PAPER.HAND) * k + 4 * apex * k * (1 - k);
}

/** Dia no horário de Brasília (o recorde zera à meia-noite daqui). */
export function paperDay(at: number): string {
  // Brasília não tem horário de verão desde 2019: UTC-3 fixo
  const d = new Date(at - 3 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
