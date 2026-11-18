import type { ObjectType } from "../map/types.ts";
import { checkers } from "./checkers.ts";
import { chess } from "./chess.ts";
import { connect4 } from "./connect4.ts";
import { domino } from "./domino.ts";
import { tictactoe } from "./tictactoe.ts";
import { truco } from "./truco.ts";
import type { BaseState, GameRules } from "./types.ts";

export * from "./types.ts";
export * from "./rng.ts";
export * from "./chess.ts";
export * from "./connect4.ts";
export * from "./tictactoe.ts";
export * from "./checkers.ts";
export * from "./domino.ts";
export * from "./truco.ts";

/** Mapeia o tipo de mesa do mapa para o tipo de jogo. */
export const GAME_OF_TABLE: Partial<Record<ObjectType, string>> = {
  "chess-table": "chess",
  "connect4-table": "connect4",
  "tictactoe-table": "tictactoe",
  "checkers-table": "checkers",
  "domino-table": "domino",
  "cards-table": "truco",
};

/** Regras de cada jogo, pelo tipo de jogo. */
export const GAMES: Record<string, GameRules<BaseState>> = {
  chess: chess as unknown as GameRules<BaseState>,
  connect4: connect4 as unknown as GameRules<BaseState>,
  tictactoe: tictactoe as unknown as GameRules<BaseState>,
  checkers: checkers as unknown as GameRules<BaseState>,
  domino: domino as unknown as GameRules<BaseState>,
  truco: truco as unknown as GameRules<BaseState>,
};

/** Tipo de jogo de um objeto do mapa (null se não for mesa de jogo). */
export function gameKindOf(o: { type: string; gameId?: string }): string | null {
  if (!o.gameId) return null;
  return (GAME_OF_TABLE as Record<string, string | undefined>)[o.type] ?? null;
}

/** Com quantas pessoas a partida pode começar (ex.: dominó 2, 3 ou 4). */
export function gamePlayerCounts(rules: Pick<GameRules<BaseState>, "seats" | "players">): readonly number[] {
  return rules.players ?? [rules.seats];
}
