import { describe, expect, it } from "vitest";
import { CHECKERS_EMPTY, CHECKERS_KING_DRAW, CHECKERS_PIECE as P, checkers, checkersMoves, checkersSquare, checkersSquareName, type CheckersState } from "./checkers.ts";
import { GAMES, GAME_OF_TABLE } from "./index.ts";

const sq = checkersSquare;
const path = (...names: string[]) => ({ path: names.map(sq) });

/** Estado com só as peças pedidas (nome da casa → código da peça). */
function position(pieces: Record<string, number>, turn = 0): CheckersState {
  const board = new Array<number>(64).fill(CHECKERS_EMPTY);
  for (const [name, p] of Object.entries(pieces)) board[sq(name)] = p;
  return { ...checkers.create(), board, turn, seen: {} };
}

/** Joga uma lista de lances (caminhos por nome de casa), sempre por quem está na vez. */
function play(s: CheckersState, ...moves: string[][]): CheckersState {
  for (const m of moves) {
    const next = checkers.move(s, s.turn, path(...m));
    if (!next) throw new Error(`lance recusado: ${m.join("-")}`);
    s = next;
  }
  return s;
}

const names = (list: Array<{ path: number[] }>) => list.map((m) => m.path.map(checkersSquareName).join("-")).sort();

describe("Damas: registro e começo", () => {
  it("liga a mesa às regras", () => {
    expect(GAME_OF_TABLE["checkers-table"]).toBe("checkers");
    expect(GAMES.checkers?.seats).toBe(2);
  });

  it("12 pedras de cada lado nas casas escuras; as Claras começam com 7 lances", () => {
    const s = checkers.create();
    expect(s.board.filter((p) => p === P.man0)).toHaveLength(12);
    expect(s.board.filter((p) => p === P.man1)).toHaveLength(12);
    expect(s.board[sq("a1")]).toBe(P.man0);
    expect(s.board[sq("h8")]).toBe(P.man1);
    expect(s.board[sq("b1")]).toBe(CHECKERS_EMPTY);
    expect(s.turn).toBe(0);
    expect(names(checkersMoves(s))).toEqual(["a3-b4", "c3-b4", "c3-d4", "e3-d4", "e3-f4", "g3-f4", "g3-h4"]);
  });
});

describe("Damas: lances válidos e inválidos", () => {
  it("recusa vez errada, pedra para trás, casa ocupada, salto sem peça e dados ruins", () => {
    const s = checkers.create();
    expect(checkers.move(s, 1, path("f6", "e5"))).toBeNull(); // não é a vez das Escuras
    expect(checkers.move(s, 0, path("c3", "c4"))).toBeNull(); // não é diagonal
    expect(checkers.move(s, 0, path("b2", "c3"))).toBeNull(); // casa ocupada
    expect(checkers.move(s, 0, path("c3", "e5"))).toBeNull(); // salto sem peça no meio
    expect(checkers.move(s, 0, path("c3"))).toBeNull();
    expect(checkers.move(s, 0, { path: [99, 3] })).toBeNull();
    expect(checkers.move(s, 0, "c3d4")).toBeNull();
    expect(checkers.move(s, 0, null)).toBeNull();
    const back = position({ d4: P.man0, h8: P.man1 });
    expect(checkers.move(back, 0, path("d4", "c3"))).toBeNull(); // pedra só anda para a frente
    expect(checkers.move(back, 0, path("d4", "e5"))).not.toBeNull();
  });

  it("não altera o estado recebido", () => {
    const s = checkers.create();
    const copy = JSON.stringify(s);
    checkers.move(s, 0, path("c3", "d4"));
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("Damas: captura", () => {
  it("captura é obrigatória: com uma tomada possível, lance simples é recusado", () => {
    // 1. c3-d4 f6-e5: as Claras são obrigadas a tomar em e5.
    const s = play(checkers.create(), ["c3", "d4"], ["f6", "e5"]);
    expect(names(checkersMoves(s))).toEqual(["d4-f6"]);
    expect(checkers.move(s, 0, path("a3", "b4"))).toBeNull();
    const taken = checkers.move(s, 0, path("d4", "f6"))!;
    expect(taken.board[sq("e5")]).toBe(CHECKERS_EMPTY);
    expect(taken.lost).toEqual([0, 1]);
    expect(taken.last).toEqual({ path: [sq("d4"), sq("f6")], captured: [sq("e5")] });
    // As Escuras respondem tomando de volta (duas opções, as duas obrigatórias de considerar).
    expect(names(checkersMoves(taken))).toEqual(["e7-g5", "g7-e5"]);
  });

  it("lei da maioria: só vale a captura que toma mais peças", () => {
    // a3 pode tomar 1 (b4); e3 pode tomar 2 (f4 e f6, terminando em e7).
    const s = position({ a3: P.man0, e3: P.man0, b4: P.man1, f4: P.man1, f6: P.man1, h8: P.man1 });
    expect(names(checkersMoves(s))).toEqual(["e3-g5-e7"]);
    expect(checkers.move(s, 0, path("a3", "c5"))).toBeNull();
    expect(checkers.move(s, 0, path("e3", "g5"))).toBeNull(); // parar no meio da sequência não vale
    const done = checkers.move(s, 0, path("e3", "g5", "e7"))!;
    expect(done.board[sq("f4")]).toBe(CHECKERS_EMPTY);
    expect(done.board[sq("f6")]).toBe(CHECKERS_EMPTY);
    expect(done.board[sq("e7")]).toBe(P.man0);
    expect(done.lost[1]).toBe(2);
  });

  it("pedra captura para trás", () => {
    const s = position({ d4: P.man0, c3: P.man1, h8: P.man1 });
    expect(names(checkersMoves(s))).toEqual(["d4-b2"]);
  });

  it("não pula a mesma peça duas vezes e a peça tomada bloqueia até o fim da sequência", () => {
    // Dama em a1 com pedras em c3 e e5 na mesma diagonal: toma c3 e para em d4 (e5 logo depois bloqueia o voo),
    // depois toma e5. Não dá para pular c3 de novo na volta.
    const s = position({ a1: P.king0, c3: P.man1, e5: P.man1, h2: P.man1 });
    const moves = checkersMoves(s);
    expect(moves.every((m) => new Set(m.captured).size === m.captured.length)).toBe(true);
    expect(Math.max(...moves.map((m) => m.captured.length))).toBe(2);
    expect(names(moves)).toContain("a1-d4-f6");
  });

  it("dama voa: anda várias casas e captura de longe, parando em qualquer casa depois", () => {
    const free = position({ a1: P.king0, h8: P.man1 });
    expect(names(checkersMoves(free))).toEqual(["a1-b2", "a1-c3", "a1-d4", "a1-e5", "a1-f6", "a1-g7"]);
    const s = position({ a1: P.king0, d4: P.man1, a7: P.man1 });
    expect(names(checkersMoves(s))).toEqual(["a1-e5", "a1-f6", "a1-g7", "a1-h8"]);
    const far = checkers.move(s, 0, path("a1", "g7"))!;
    expect(far.board[sq("g7")]).toBe(P.king0);
    expect(far.board[sq("d4")]).toBe(CHECKERS_EMPTY);
  });
});

describe("Damas: promoção", () => {
  it("pedra que termina na última linha vira dama", () => {
    const s = position({ c7: P.man0, h2: P.man1 });
    const next = checkers.move(s, 0, path("c7", "d8"))!;
    expect(next.board[sq("d8")]).toBe(P.king0);
    const dark = position({ f2: P.man1, a7: P.man0 }, 1);
    expect(checkers.move(dark, 1, path("f2", "g1"))!.board[sq("g1")]).toBe(P.king1);
  });

  it("passando pela última linha no meio de uma captura que continua, não promove", () => {
    // b6 toma c7 (cai em d8, última linha) e continua tomando e7, terminando em f6.
    const s = position({ b6: P.man0, c7: P.man1, e7: P.man1, h2: P.man1 });
    expect(names(checkersMoves(s))).toEqual(["b6-d8-f6"]);
    const next = checkers.move(s, 0, path("b6", "d8", "f6"))!;
    expect(next.board[sq("f6")]).toBe(P.man0);
    expect(next.board[sq("d8")]).toBe(CHECKERS_EMPTY);
  });
});

describe("Damas: fim de jogo", () => {
  it("quem fica sem peças (ou sem lances) perde", () => {
    const s = position({ d4: P.man0, e5: P.man1 });
    const won = checkers.move(s, 0, path("d4", "f6"))!;
    expect(won).toMatchObject({ over: true, winner: 0, reason: "nomoves" });
    expect(checkers.move(won, 1, path("f6", "e5"))).toBeNull();

    // Bloqueada: a pedra escura em a7 não tem para onde ir (b6 ocupada pela clara, que não pode ser tomada).
    const blocked = position({ a7: P.man1, b6: P.man0, c5: P.man0, h2: P.man0 });
    const end = checkers.move(blocked, 0, path("h2", "g3"))!;
    expect(end).toMatchObject({ over: true, winner: 0, reason: "nomoves" });
  });

  it("empate com 20 lances seguidos só de damas, sem captura", () => {
    const s = { ...position({ a1: P.king0, h2: P.king1 }), kingMoves: CHECKERS_KING_DRAW - 1 };
    const next = checkers.move(s, 0, path("a1", "b2"))!;
    expect(next).toMatchObject({ over: true, draw: true, winner: null, reason: "kings" });
    // Pedra andando zera a contagem.
    const reset = checkers.move({ ...position({ a1: P.king0, c3: P.man0, h2: P.king1 }), kingMoves: 19 }, 0, path("c3", "d4"))!;
    expect(reset.kingMoves).toBe(0);
    expect(reset.over).toBe(false);
  });

  it("empate pela mesma posição pela terceira vez", () => {
    let s = position({ a1: P.king0, h2: P.king1 });
    for (let i = 0; i < 2; i++) s = play(s, ["a1", "b2"], ["h2", "g1"], ["b2", "a1"], ["g1", "h2"]);
    expect(s.over).toBe(false);
    s = play(s, ["a1", "b2"]);
    expect(s).toMatchObject({ over: true, draw: true, reason: "repetition" });
  });

  it("desistência dá a vitória ao outro lado", () => {
    expect(checkers.forfeit(checkers.create(), 0, "resign")).toMatchObject({ over: true, winner: 1, reason: "resign" });
  });
});
