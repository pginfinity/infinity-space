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
  | "left"
  /** Quem estava na vez não tinha lance (damas: sem peças ou todas bloqueadas). */
  | "nomoves"
  /** 20 lances seguidos só de damas, sem captura (damas). */
  | "kings"
  /** Alguém bateu: jogou a última pedra (dominó). */
  | "domino"
  /** Jogo trancado: ninguém tem pedra que sirva (dominó). Vence quem tem menos pontos na mão. */
  | "locked"
  /** Chegou aos pontos da partida (truco: 12). */
  | "score";

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
  /** Todos os lugares que venceram (duplas: os dois parceiros). Ausente = só `winner`. */
  winners?: number[];
  /** Outros lugares que podem agir agora, além de `turn` (truco: a dupla que responde ao pedido). */
  acting?: number[];
  /** Lugar de quem desistiu ou saiu (mesas de mais de dois lugares; nas de dois, é quem não venceu). */
  quit?: number;
}

/** Como começar uma partida. Jogos de lugares fixos (xadrez, Lig 4, velha) ignoram tudo. */
export interface CreateOptions {
  /** Lugares ocupados, em ordem. Ausente = mesa vazia (nada distribuído) nos jogos de lugares variáveis. */
  seated?: number[];
  /** Semente do embaralhamento (o servidor sorteia; os testes fixam). */
  seed?: number;
  /** Número da partida nesta mesa (1, 2...), para alternar quem começa sem trocar as pessoas de lugar. */
  round?: number;
}

/** Regras de um jogo. Tudo puro: nunca altera o estado recebido. */
export interface GameRules<S extends BaseState = BaseState> {
  kind: string;
  /** Quantos lugares a mesa tem. */
  seats: number;
  /**
   * Com quantas pessoas a partida pode acontecer (ex.: dominó [2, 3, 4], truco [2, 4]).
   * Ausente = só com a mesa cheia. Com menos gente que `seats`, quem está sentado começa pela op `start`.
   */
  players?: readonly number[];
  /** Revanche sem trocar as pessoas de lugar (o jogo alterna quem começa pelo `round`). Padrão: troca os lados. */
  keepSeats?: boolean;
  /** Estado de uma partida nova. Nos jogos de lugares fixos o lugar 0 começa. */
  create(opts?: CreateOptions): S;
  /**
   * Aplica o lance do lugar `seat`. Devolve o novo estado, ou null se o lance não vale.
   * `seed`: sorteio novo do servidor para cada lance (truco: embaralha a mão seguinte).
   */
  move(state: S, seat: number, data: unknown, seed?: number): S | null;
  /** O lugar `loser` desistiu ou abandonou: o outro lado vence. */
  forfeit(state: S, loser: number, reason: "resign" | "left"): S;
  /**
   * Informação escondida: o estado como o lugar `viewer` pode ver (-1 = quem assiste).
   * Sem esta função, todos recebem o estado inteiro (xadrez, Lig 4, velha, damas).
   * Com ela, o servidor manda a cada pessoa só a própria visão (mãos e monte escondidos).
   */
  view?(state: S, viewer: number): S;
}

/** Dados que a plataforma junta ao estado do jogo no `GameSnapshot.state`. */
export interface TableMeta {
  /** Votos de revanche, por lugar (só valem com a partida encerrada). */
  rematch: boolean[];
  /** Número da partida nesta mesa; muda a cada partida nova. */
  round: number;
  /** Nome de quem está em cada lugar (null = vago). */
  names: Array<string | null>;
  /** Nome de quem jogou a partida atual (ou a última), por lugar. Fica mesmo depois que a pessoa levanta. */
  players: Array<string | null>;
}

/** O que vai em `GameSnapshot.state`. */
export type TableState<S extends BaseState = BaseState> = S & TableMeta;

/** Fim de jogo por desistência/abandono, igual para todos os jogos de dois lugares. */
export function forfeitTwoSeats<S extends BaseState>(state: S, loser: number, reason: "resign" | "left"): S {
  if (state.over) return state;
  return { ...state, over: true, draw: false, winner: loser === 0 ? 1 : 0, reason };
}

/**
 * Fim por desistência/abandono em mesa de vários lugares: com duplas, a outra dupla vence;
 * sem duplas, vencem todos os outros que estavam jogando.
 */
export function forfeitGroup<S extends BaseState & { active: number[]; teamOf: number[] }>(state: S, loser: number, reason: "resign" | "left"): S {
  if (state.over || !state.active.includes(loser)) return state;
  const team = state.teamOf[loser] ?? -1;
  const winners = state.active.filter((s) => s !== loser && (team < 0 || state.teamOf[s] !== team));
  return { ...state, over: true, draw: false, winner: winners[0] ?? null, winners, reason, quit: loser, acting: undefined };
}

/** Todos os lugares que venceram a partida (duplas: os dois). */
export function winnersOf(s: Pick<BaseState, "winner" | "winners">): number[] {
  return s.winners ?? (s.winner === null ? [] : [s.winner]);
}

/** O lugar pode agir agora? (é a vez dele, ou ele está entre quem responde). */
export function canAct(s: Pick<BaseState, "turn" | "acting" | "over">, seat: number): boolean {
  return !s.over && seat >= 0 && (s.turn === seat || !!s.acting?.includes(seat));
}
