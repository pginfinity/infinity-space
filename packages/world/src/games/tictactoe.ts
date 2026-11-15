import { forfeitTwoSeats, type BaseState, type GameRules } from "./types.ts";

/** Jogo da velha: grade 3×3. Lugar 0 = X (começa), lugar 1 = O. */

export const TTT_EMPTY = -1;

export interface TicTacToeState extends BaseState {
  /** Casas em ordem de leitura (0 a 8): -1 vazio; 0 ou 1 = marca do lugar. */
  grid: number[];
  last: number | null;
  /** Casas da linha vencedora. */
  line: number[] | null;
}

/** Lance do jogo da velha: a casa (0 a 8). */
export interface TicTacToeMove {
  cell: number;
}

export const TTT_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const tictactoe: GameRules<TicTacToeState> = {
  kind: "tictactoe",
  seats: 2,

  create() {
    return { turn: 0, winner: null, draw: false, over: false, reason: null, moves: 0, grid: new Array<number>(9).fill(TTT_EMPTY), last: null, line: null };
  },

  move(state, seat, data) {
    if (state.over || seat !== state.turn) return null;
    const cell = (data as Partial<TicTacToeMove> | null | undefined)?.cell;
    if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell > 8 || state.grid[cell] !== TTT_EMPTY) return null;
    const grid = state.grid.slice();
    grid[cell] = seat;
    const next: TicTacToeState = { ...state, grid, last: cell, moves: state.moves + 1, turn: seat === 0 ? 1 : 0 };
    const won = TTT_LINES.filter((l) => l.every((i) => grid[i] === seat));
    if (won.length > 0) return { ...next, over: true, winner: seat, reason: "line", line: [...new Set(won.flat())] };
    if (next.moves >= 9) return { ...next, over: true, draw: true, reason: "full" };
    return next;
  },

  forfeit: forfeitTwoSeats,
};
