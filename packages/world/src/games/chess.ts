import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { forfeitTwoSeats, type BaseState, type GameRules } from "./types.ts";

/**
 * Xadrez, com as regras do chess.js. Lugar 0 = Brancas (começa), lugar 1 = Pretas.
 * O estado guarda a posição (FEN) e a lista de lances, para refazer a partida e detectar repetição.
 */

export type ChessColor = Color;
export type ChessPiece = PieceSymbol;
export type ChessSquare = Square;
export type ChessPromotion = "q" | "r" | "b" | "n";

export const CHESS_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const CHESS_PROMOTIONS: readonly ChessPromotion[] = ["q", "r", "b", "n"];

export interface ChessState extends BaseState {
  fen: string;
  /** Lances em notação UCI (e2e4, e7e8q). */
  history: string[];
  /** Os mesmos lances em notação algébrica (e4, Cxf7+...), para mostrar. */
  san: string[];
  last: { from: Square; to: Square } | null;
  /** Quem está na vez está em xeque. */
  check: boolean;
  /** Peças perdidas por cada cor (letras minúsculas: p, n, b, r, q). */
  lost: { w: PieceSymbol[]; b: PieceSymbol[] };
}

/** Lance de xadrez enviado pelo cliente. */
export interface ChessMove {
  from: string;
  to: string;
  promotion?: ChessPromotion;
}

const SQUARE = /^[a-h][1-8]$/;

export const chessSeatOf = (c: Color): number => (c === "w" ? 0 : 1);
export const chessColorOf = (seat: number): Color => (seat === 0 ? "w" : "b");

/** Refaz a partida a partir da lista de lances (mantém a contagem de repetições do chess.js). */
export function chessReplay(history: readonly string[]): Chess {
  const game = new Chess();
  for (const uci of history) game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return game;
}

/** Casas da grade em ordem de leitura (a8, b8... h1), com a peça de cada uma. */
export function chessBoard(fen: string): Array<{ square: Square; type: PieceSymbol; color: Color } | null> {
  const out: Array<{ square: Square; type: PieceSymbol; color: Color } | null> = [];
  const rows = (fen.split(" ")[0] ?? "").split("/");
  for (let r = 0; r < 8; r++) {
    const row = rows[r] ?? "8";
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) out.push(null);
        f += Number(ch);
      } else {
        const square = `${CHESS_FILES[f] ?? "a"}${8 - r}` as Square;
        out.push({ square, type: ch.toLowerCase() as PieceSymbol, color: ch === ch.toUpperCase() ? "w" : "b" });
        f++;
      }
    }
  }
  return out;
}

/** Lances legais a partir de uma casa (para o cliente destacar). */
export function chessTargets(fen: string, from: string): Array<{ to: Square; promotion: boolean; capture: boolean }> {
  if (!SQUARE.test(from)) return [];
  try {
    const game = new Chess(fen);
    const seen = new Map<Square, { to: Square; promotion: boolean; capture: boolean }>();
    for (const m of game.moves({ square: from as Square, verbose: true })) {
      if (!seen.has(m.to)) seen.set(m.to, { to: m.to, promotion: m.isPromotion(), capture: m.isCapture() });
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

/** Casa do rei de uma cor (para o destaque de xeque). */
export function chessKingSquare(fen: string, color: Color): Square | null {
  return chessBoard(fen).find((p) => p?.type === "k" && p.color === color)?.square ?? null;
}

export const chess: GameRules<ChessState> = {
  kind: "chess",
  seats: 2,

  create() {
    return { turn: 0, winner: null, draw: false, over: false, reason: null, moves: 0, fen: CHESS_START_FEN, history: [], san: [], last: null, check: false, lost: { w: [], b: [] } };
  },

  move(state, seat, data) {
    if (state.over || seat !== state.turn) return null;
    const d = data as Partial<ChessMove> | null | undefined;
    const from = d?.from;
    const to = d?.to;
    const promo = d?.promotion;
    if (typeof from !== "string" || typeof to !== "string" || !SQUARE.test(from) || !SQUARE.test(to)) return null;
    if (promo !== undefined && !CHESS_PROMOTIONS.includes(promo)) return null;

    let game: Chess;
    try {
      game = chessReplay(state.history);
    } catch {
      return null;
    }
    if (game.turn() !== chessColorOf(seat)) return null;

    const legal = game.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (legal.length === 0) return null;
    const needsPromo = legal.some((m) => m.isPromotion());
    if (needsPromo && !promo) return null;

    const played = game.move({ from, to, promotion: needsPromo ? promo : undefined });
    const lost = { w: state.lost.w.slice(), b: state.lost.b.slice() };
    if (played.captured) lost[played.color === "w" ? "b" : "w"].push(played.captured);

    const next: ChessState = {
      ...state,
      fen: game.fen(),
      history: [...state.history, played.lan],
      san: [...state.san, played.san],
      last: { from: played.from, to: played.to },
      check: game.inCheck(),
      lost,
      moves: state.moves + 1,
      turn: chessSeatOf(game.turn()),
    };

    if (game.isCheckmate()) return { ...next, over: true, winner: seat, reason: "checkmate" };
    if (game.isStalemate()) return { ...next, over: true, draw: true, reason: "stalemate" };
    if (game.isInsufficientMaterial()) return { ...next, over: true, draw: true, reason: "material" };
    if (game.isThreefoldRepetition()) return { ...next, over: true, draw: true, reason: "repetition" };
    if (game.isDrawByFiftyMoves()) return { ...next, over: true, draw: true, reason: "fifty" };
    return next;
  },

  forfeit: forfeitTwoSeats,
};
