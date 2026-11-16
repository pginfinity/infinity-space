import type { Vec2 } from "../../geometry.ts";

/**
 * Botão de deploy do Dev Lab: contagem 3-2-1 para quem está perto e um foguete decolando do
 * berço do lado de fora da estação, cruzando o céu de todo mundo. Conta os deploys do mês
 * (do time, sem nomes).
 */

export const DEPLOY_ID = "deploy";
export const DEPLOY_KIND = "deploy";
/** Distância máxima (m) do botão para apertar. */
export const DEPLOY_RANGE = 2.4;
/** Quem está a até esta distância do botão (sem parede no meio) vê a contagem. */
export const DEPLOY_WATCH_RANGE = 10;
export const DEPLOY_COUNTDOWN_MS = 3000;
/** Duração do voo do foguete (do berço até sumir no espaço). */
export const DEPLOY_FLIGHT_MS = 6000;
/** Intervalo mínimo entre um lançamento e o próximo aperto (o foguete novo precisa encaixar). */
export const DEPLOY_COOLDOWN_MS = 20_000;
/**
 * Berço do foguete: do lado de fora da janela norte do Dev Lab, preso ao casco por uma treliça.
 * Fora da área andável (a estação acaba em z = -19).
 */
export const DEPLOY_PAD: Readonly<Vec2> = { x: -16.5, z: -21.4 };
/** Altura da base do foguete no berço. */
export const DEPLOY_PAD_Y = 0.5;

export type DeployPhase = "idle" | "countdown" | "flight";

export interface DeployState {
  /** Mês da contagem, "AAAA-MM". */
  month: string;
  /** Deploys no mês (do time inteiro, sem nomes). */
  count: number;
  phase: DeployPhase;
}

/** Evento "countdown" (para todos; o cliente mostra a contagem só para quem está perto). */
export interface DeployCountdown {
  name: string;
  ms: number;
}

/** Evento "launch" (para todos). */
export interface DeployLaunch {
  count: number;
  ms: number;
}

/** Evento "busy" (só para quem apertou): o foguete ainda não está pronto. */
export interface DeployBusy {
  ms: number;
}

/**
 * Progresso (0..1) ao longo da rota do foguete em função do tempo de voo: começa devagar
 * (ignição e subida) e acelera, como um lançamento de verdade.
 */
export function deployProgress(elapsedMs: number, flightMs = DEPLOY_FLIGHT_MS): number {
  const t = Math.min(1, Math.max(0, elapsedMs / flightMs));
  // Curva de aceleração suave: t^2.2 no começo, quase linear no fim.
  return Math.pow(t, 2.2) * 0.55 + t * 0.45 * t;
}

/** Quantos segundos faltam na contagem (3, 2, 1) ou 0 na decolagem. */
export function deployCountdownDigit(elapsedMs: number, totalMs = DEPLOY_COUNTDOWN_MS): number {
  return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
}
