import { describe, expect, it } from "vitest";
import { C4_COLS, C4_ROWS, c4DropRow, c4ValidCols, connect4, type Connect4State } from "./connect4.ts";
import { chess, chessKingSquare, chessTargets, chessBoard, type ChessState } from "./chess.ts";
import { tictactoe, type TicTacToeState } from "./tictactoe.ts";
import { GAMES, GAME_OF_TABLE, gameKindOf } from "./index.ts";

/** Joga uma sequência de lances alternando os lugares a partir de quem está na vez. */
function play<S extends { turn: number }>(rules: { move(s: S, seat: number, d: unknown): S | null }, start: S, moves: unknown[]): S {
  let s = start;
  for (const m of moves) {
    const next = rules.move(s, s.turn, m);
    if (!next) throw new Error(`lance recusado: ${JSON.stringify(m)}`);
    s = next;
  }
  return s;
}

/** Converte lances UCI ("e2e4") para o formato enviado pelo cliente. */
const uci = (list: string[]) => list.map((u) => ({ from: u.slice(0, 2), to: u.slice(2, 4) }));

describe("registro de jogos", () => {
  it("liga tipos de mesa a regras", () => {
    expect(GAME_OF_TABLE["chess-table"]).toBe("chess");
    expect(GAME_OF_TABLE["connect4-table"]).toBe("connect4");
    expect(GAMES.chess?.seats).toBe(2);
    expect(gameKindOf({ type: "connect4-table", gameId: "c4" })).toBe("connect4");
    expect(gameKindOf({ type: "connect4-table" })).toBeNull();
    expect(gameKindOf({ type: "desk", gameId: "x" })).toBeNull();
  });
});

describe("Lig 4", () => {
  it("ficha cai até o fundo e a vez alterna", () => {
    let s = connect4.create();
    expect(c4DropRow(s, 3)).toBe(C4_ROWS - 1);
    s = connect4.move(s, 0, { col: 3 })!;
    expect(s.grid[(C4_ROWS - 1) * C4_COLS + 3]).toBe(0);
    expect(s.last).toEqual({ col: 3, row: C4_ROWS - 1 });
    expect(s.turn).toBe(1);
    s = connect4.move(s, 1, { col: 3 })!;
    expect(s.last).toEqual({ col: 3, row: C4_ROWS - 2 });
    expect(s.turn).toBe(0);
  });

  it("recusa vez errada, coluna inválida e coluna cheia", () => {
    const s = connect4.create();
    expect(connect4.move(s, 1, { col: 0 })).toBeNull();
    expect(connect4.move(s, 0, { col: 7 })).toBeNull();
    expect(connect4.move(s, 0, { col: -1 })).toBeNull();
    expect(connect4.move(s, 0, { col: 1.5 })).toBeNull();
    expect(connect4.move(s, 0, "3")).toBeNull();
    expect(connect4.move(s, 0, null)).toBeNull();
    const full = play(connect4, s, [0, 0, 0, 0, 0, 0].map((col) => ({ col })));
    expect(c4DropRow(full, 0)).toBe(-1);
    expect(c4ValidCols(full)).not.toContain(0);
    expect(connect4.move(full, full.turn, { col: 0 })).toBeNull();
  });

  it("não altera o estado recebido", () => {
    const s = connect4.create();
    const copy = JSON.stringify(s);
    connect4.move(s, 0, { col: 2 });
    expect(JSON.stringify(s)).toBe(copy);
  });

  it("vitória na vertical", () => {
    const s = play(connect4, connect4.create(), [0, 1, 0, 1, 0, 1, 0].map((col) => ({ col })));
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
    expect(s.reason).toBe("line");
    expect(s.line).toHaveLength(4);
    expect(connect4.move(s, s.turn, { col: 2 })).toBeNull();
  });

  it("vitória na horizontal e nas diagonais", () => {
    const h = play(connect4, connect4.create(), [0, 0, 1, 1, 2, 2, 3].map((col) => ({ col })));
    expect(h.winner).toBe(0);
    expect(h.line!.every((c) => c.row === C4_ROWS - 1)).toBe(true);

    // Diagonal subindo para a direita, feita pelo Laranja (lugar 0).
    const d = play(connect4, connect4.create(), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3].map((col) => ({ col })));
    expect(d.winner).toBe(0);
    expect(d.line).toHaveLength(4);

    // Diagonal descendo para a direita, feita pelo Branco (lugar 1).
    const e = play(connect4, connect4.create(), [6, 3, 2, 2, 1, 0, 1, 1, 0, 6, 0, 0].map((col) => ({ col })));
    // Confere com a contagem: o Branco liga (3,5)(2,4)(1,3)(0,2).
    expect(e.winner).toBe(1);
    expect(e.line!.map((c) => `${c.col},${c.row}`).sort()).toEqual(["0,2", "1,3", "2,4", "3,5"]);
  });

  it("linha de cinco destaca todas as casas", () => {
    // Laranja: 0,1,3,4 e depois 2 no meio, ligando cinco na base.
    const s = play(connect4, connect4.create(), [0, 0, 1, 1, 3, 3, 4, 4, 2].map((col) => ({ col })));
    expect(s.winner).toBe(0);
    expect(s.line).toHaveLength(5);
  });

  it("empate com o tabuleiro cheio", () => {
    // Padrão que enche a grade sem ninguém ligar quatro.
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
    const s = play<Connect4State>(connect4, connect4.create(), order.map((col) => ({ col })));
    expect(s.over).toBe(true);
    expect(s.draw).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.reason).toBe("full");
  });

  it("desistência dá a vitória ao outro", () => {
    const s = connect4.forfeit(connect4.create(), 0, "resign");
    expect(s).toMatchObject({ over: true, winner: 1, reason: "resign" });
  });
});

describe("Xadrez", () => {
  it("começa com as brancas e aceita lances legais", () => {
    let s: ChessState = chess.create();
    expect(s.turn).toBe(0);
    s = chess.move(s, 0, { from: "e2", to: "e4" })!;
    expect(s.turn).toBe(1);
    expect(s.last).toEqual({ from: "e2", to: "e4" });
    expect(s.san).toEqual(["e4"]);
    expect(s.history).toEqual(["e2e4"]);
  });

  it("recusa vez errada, lance ilegal e dados estranhos", () => {
    const s = chess.create();
    expect(chess.move(s, 1, { from: "e7", to: "e5" })).toBeNull();
    expect(chess.move(s, 0, { from: "e2", to: "e5" })).toBeNull();
    expect(chess.move(s, 0, { from: "e7", to: "e5" })).toBeNull();
    expect(chess.move(s, 0, { from: "z9", to: "e4" })).toBeNull();
    expect(chess.move(s, 0, { from: "e2", to: "e4", promotion: "k" })).toBeNull();
    expect(chess.move(s, 0, null)).toBeNull();
  });

  it("xeque-mate do pastor encerra com vitória", () => {
    const s = play(chess, chess.create(), [
      { from: "f2", to: "f3" },
      { from: "e7", to: "e5" },
      { from: "g2", to: "g4" },
      { from: "d8", to: "h4" },
    ]);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(1);
    expect(s.reason).toBe("checkmate");
    expect(s.check).toBe(true);
    expect(chessKingSquare(s.fen, "w")).toBe("e1");
  });

  it("captura entra na lista de peças perdidas", () => {
    const s = play(chess, chess.create(), [
      { from: "e2", to: "e4" },
      { from: "d7", to: "d5" },
      { from: "e4", to: "d5" },
    ]);
    expect(s.lost.b).toEqual(["p"]);
    expect(s.lost.w).toEqual([]);
  });

  it("promoção exige escolher a peça", () => {
    // 1. h4 g5 2. hxg5 f6 3. gxf6 e6 4. f7+ Re7: o peão branco em f7 pode capturar em g8 e promover.
    const s = play(chess, chess.create(), uci(["h2h4", "g7g5", "h4g5", "f7f6", "g5f6", "e7e6", "f6f7", "e8e7"]));
    expect(chessTargets(s.fen, "f7").find((t) => t.to === "g8")).toMatchObject({ promotion: true, capture: true });
    expect(chess.move(s, 0, { from: "f7", to: "g8" })).toBeNull();
    const promoted = chess.move(s, 0, { from: "f7", to: "g8", promotion: "n" })!;
    expect(promoted.history.at(-1)).toBe("f7g8n");
    expect(promoted.lost.b).toEqual(["p", "p", "n"]);
    expect(chessBoard(promoted.fen).find((p) => p?.square === "g8")).toMatchObject({ type: "n", color: "w" });
  });

  it("afogamento empata", () => {
    // Partida conhecida que termina em afogamento em 10 lances (Sam Loyd).
    const s = play(
      chess,
      chess.create(),
      uci(["e2e3", "a7a5", "d1h5", "a8a6", "h5a5", "h7h5", "h2h4", "a6h6", "a5c7", "f7f6", "c7d7", "e8f7", "d7b7", "d8d3", "b7b8", "d3h7", "b8c8", "f7g6", "c8e6"]),
    );
    expect(s.over).toBe(true);
    expect(s.draw).toBe(true);
    expect(s.reason).toBe("stalemate");
  });

  it("repetição tripla empata", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    const s = play(chess, chess.create(), uci([...shuffle, ...shuffle]));
    expect(s.over).toBe(true);
    expect(s.reason).toBe("repetition");
  });

  it("lances legais a partir de uma casa", () => {
    const t = chessTargets(chess.create().fen, "g1").map((x) => x.to).sort();
    expect(t).toEqual(["f3", "h3"]);
    expect(chessTargets(chess.create().fen, "e4")).toEqual([]);
    expect(chessBoard(chess.create().fen)).toHaveLength(64);
  });
});

describe("Jogo da velha", () => {
  it("vitória na diagonal e empate", () => {
    const w = play<TicTacToeState>(tictactoe, tictactoe.create(), [0, 1, 4, 2, 8].map((cell) => ({ cell })));
    expect(w).toMatchObject({ over: true, winner: 0, reason: "line" });
    expect(w.line!.sort()).toEqual([0, 4, 8]);

    const d = play<TicTacToeState>(tictactoe, tictactoe.create(), [0, 1, 2, 4, 3, 5, 7, 6, 8].map((cell) => ({ cell })));
    expect(d).toMatchObject({ over: true, draw: true, reason: "full" });
  });

  it("recusa casa ocupada e vez errada", () => {
    const s = tictactoe.move(tictactoe.create(), 0, { cell: 4 })!;
    expect(tictactoe.move(s, 1, { cell: 4 })).toBeNull();
    expect(tictactoe.move(s, 0, { cell: 3 })).toBeNull();
    expect(tictactoe.move(s, 1, { cell: 9 })).toBeNull();
  });
});
