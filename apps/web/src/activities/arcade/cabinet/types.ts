import type { CabGameId } from "@infinity/world";

/** Controles lidos a cada passo (1/60 s). "Pressed" = apertou neste passo. */
export interface CabInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  firePressed: boolean;
  leftPressed: boolean;
  rightPressed: boolean;
  /** Mouse sobre a tela, em pixels da tela do jogo (null = fora). */
  mouseX: number | null;
}

export const NO_INPUT: CabInput = { left: false, right: false, up: false, down: false, fire: false, firePressed: false, leftPressed: false, rightPressed: false, mouseX: null };

/** Passo fixo da lógica dos fliperamas. */
export const CAB_DT = 1 / 60;

/** Um jogo de fliperama: lógica em passos fixos e desenho numa tela de 224×256. */
export interface CabGame {
  readonly id: CabGameId;
  score: number;
  lives: number;
  level: number;
  over: boolean;
  step(input: CabInput): void;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
  /** Sons pendentes (o painel toca e esvazia). */
  sounds: string[];
}
