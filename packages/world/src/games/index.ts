import type { ObjectType } from "../map/types.ts";
import { chess } from "./chess.ts";
import { connect4 } from "./connect4.ts";
import { tictactoe } from "./tictactoe.ts";
import type { BaseState, GameRules } from "./types.ts";

export * from "./types.ts";
export * from "./chess.ts";
export * from "./connect4.ts";
export * from "./tictactoe.ts";

/** Mapeia o tipo de mesa do mapa para o tipo de jogo. */
export const GAME_OF_TABLE: Partial<Record<ObjectType, string>> = {
  "chess-table": "chess",
  "connect4-table": "connect4",
  "tictactoe-table": "tictactoe",
};

/** Regras de cada jogo, pelo tipo de jogo. */
export const GAMES: Record<string, GameRules<BaseState>> = {
  chess: chess as unknown as GameRules<BaseState>,
  connect4: connect4 as unknown as GameRules<BaseState>,
  tictactoe: tictactoe as unknown as GameRules<BaseState>,
};

/** Tipo de jogo de um objeto do mapa (null se não for mesa de jogo). */
export function gameKindOf(o: { type: string; gameId?: string }): string | null {
  if (!o.gameId) return null;
  return (GAME_OF_TABLE as Record<string, string | undefined>)[o.type] ?? null;
}
