/**
 * Tipos comuns a todos os jogos de mesa. Cada jogo implementa `GameRules` com funções puras:
 * o servidor usa para validar e aplicar lances, o cliente para desenhar e sugerir lances.
 */

/** Por que a partida acabou. */
export type EndReason =
  /** Ligou quatro (Lig 4) ou três (jogo da velha) em linha. */
  | "line"
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "fifty"
  | "material"
  /** Tabuleiro cheio sem vencedor. */
  | "full"
  | "resign"
  /** Quem perdeu se levantou ou saiu da sala no meio da partida. */
  | "left";

/** Campos que todo estado de jogo tem. */
export interface BaseState {
  /** Lugar (índice em `seats`) de quem joga agora. */
  turn: number;
  /** Lugar de quem venceu; null enquanto não acabou ou se empatou. */
  winner: number | null;
  draw: boolean;
  over: boolean;
  reason: EndReason | null;
  /** Lances já jogados. */
  moves: number;
}

/** Regras de um jogo. Tudo puro: nunca altera o estado recebido. */
export interface GameRules<S extends BaseState = BaseState> {
  kind: string;
  /** Quantos lugares a mesa tem. */
  seats: number;
  /** Estado de uma partida nova. O lugar 0 começa. */
  create(): S;
  /** Aplica o lance do lugar `seat`. Devolve o novo estado, ou null se o lance não vale. */
  move(state: S, seat: number, data: unknown): S | null;
  /** O lugar `loser` desistiu ou abandonou: o outro vence. */
  forfeit(state: S, loser: number, reason: "resign" | "left"): S;
}

/** Dados que a plataforma junta ao estado do jogo no `GameSnapshot.state`. */
export interface TableMeta {
  /** Votos de revanche, por lugar (só valem com a partida encerrada). */
  rematch: boolean[];
  /** Número da partida nesta mesa; muda a cada partida nova. */
  round: number;
  /** Nome de quem está em cada lugar (null = vago). */
  names: Array<string | null>;
}

/** O que vai em `GameSnapshot.state`. */
export type TableState<S extends BaseState = BaseState> = S & TableMeta;

/** Fim de jogo por desistência/abandono, igual para todos os jogos de dois lugares. */
export function forfeitTwoSeats<S extends BaseState>(state: S, loser: number, reason: "resign" | "left"): S {
  if (state.over) return state;
  return { ...state, over: true, draw: false, winner: loser === 0 ? 1 : 0, reason };
}
