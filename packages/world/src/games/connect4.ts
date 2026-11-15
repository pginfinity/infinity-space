import { forfeitTwoSeats, type BaseState, type GameRules } from "./types.ts";

/**
 * Lig 4: grade de 7 colunas × 6 linhas, fichas caem até o fundo da coluna.
 * Lugar 0 = Laranja (começa), lugar 1 = Branco. Quem ligar quatro em linha vence.
 */

export const C4_COLS = 7;
export const C4_ROWS = 6;
export const C4_EMPTY = -1;

export interface C4Cell {
  col: number;
  row: number;
}

export interface Connect4State extends BaseState {
  /**
   * Grade em ordem de leitura: `grid[row * 7 + col]`, linha 0 no topo e 5 no fundo.
   * -1 = vazio; 0 ou 1 = ficha do lugar.
   */
  grid: number[];
  /** Onde caiu a última ficha. */
  last: C4Cell | null;
  /** Casas da(s) linha(s) vencedora(s). */
  line: C4Cell[] | null;
}

/** Lance do Lig 4: a coluna (0 a 6). */
export interface Connect4Move {
  col: number;
}

export function c4Index(col: number, row: number): number {
  return row * C4_COLS + col;
}

export function c4At(s: Pick<Connect4State, "grid">, col: number, row: number): number {
  if (col < 0 || col >= C4_COLS || row < 0 || row >= C4_ROWS) return C4_EMPTY;
  return s.grid[c4Index(col, row)] ?? C4_EMPTY;
}

/** Linha onde uma ficha solta na coluna vai parar, ou -1 se a coluna está cheia. */
export function c4DropRow(s: Pick<Connect4State, "grid">, col: number): number {
  for (let row = C4_ROWS - 1; row >= 0; row--) if (c4At(s, col, row) === C4_EMPTY) return row;
  return -1;
}

/** Colunas que ainda aceitam ficha. */
export function c4ValidCols(s: Pick<Connect4State, "grid">): number[] {
  const out: number[] = [];
  for (let c = 0; c < C4_COLS; c++) if (c4DropRow(s, c) >= 0) out.push(c);
  return out;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Todas as casas em linhas de 4+ que passam por (col, row), da cor que está lá. */
export function c4LinesThrough(s: Pick<Connect4State, "grid">, col: number, row: number): C4Cell[] {
  const who = c4At(s, col, row);
  if (who === C4_EMPTY) return [];
  const found: C4Cell[] = [];
  for (const [dc, dr] of DIRS) {
    const run: C4Cell[] = [{ col, row }];
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c4At(s, c, r) === who) {
        run.push({ col: c, row: r });
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (run.length >= 4) for (const cell of run) if (!found.some((f) => f.col === cell.col && f.row === cell.row)) found.push(cell);
  }
  return found;
}

export const connect4: GameRules<Connect4State> = {
  kind: "connect4",
  seats: 2,

  create() {
    return { turn: 0, winner: null, draw: false, over: false, reason: null, moves: 0, grid: new Array<number>(C4_COLS * C4_ROWS).fill(C4_EMPTY), last: null, line: null };
  },

  move(state, seat, data) {
    if (state.over || seat !== state.turn) return null;
    const col = (data as Partial<Connect4Move> | null | undefined)?.col;
    if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col >= C4_COLS) return null;
    const row = c4DropRow(state, col);
    if (row < 0) return null;

    const grid = state.grid.slice();
    grid[c4Index(col, row)] = seat;
    const next: Connect4State = { ...state, grid, last: { col, row }, moves: state.moves + 1, turn: seat === 0 ? 1 : 0 };
    const line = c4LinesThrough(next, col, row);
    if (line.length > 0) return { ...next, over: true, winner: seat, reason: "line", line };
    if (next.moves >= C4_COLS * C4_ROWS) return { ...next, over: true, draw: true, reason: "full" };
    return next;
  },

  forfeit: forfeitTwoSeats,
};
