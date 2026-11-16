import { describe, expect, it } from "vitest";
import { CAB_TOP, cabFmt, cabGameOfVariant, cabInsert, cabPlausible, type CabEntry } from "./cabinets.ts";

describe("fliperamas", () => {
  it("cada máquina tem um jogo pelo variant", () => {
    expect(new Set([0, 1, 2].map(cabGameOfVariant)).size).toBe(3);
    expect(cabGameOfVariant(undefined)).toBe(cabGameOfVariant(0));
    expect(cabGameOfVariant(4)).toBe(cabGameOfVariant(1));
  });

  it("recusa pontuação impossível para o tempo de partida", () => {
    expect(cabPlausible("cometa", 500, 60_000)).toBe(true);
    expect(cabPlausible("cometa", 50_000, 30_000)).toBe(false);
    expect(cabPlausible("faxina", 10, 1000)).toBe(false); // partida curta demais
    expect(cabPlausible("faxina", 0, 1000)).toBe(true);
    expect(cabPlausible("estilhaco", 12.5, 60_000)).toBe(false);
    expect(cabPlausible("estilhaco", -3, 60_000)).toBe(false);
    expect(cabPlausible("estilhaco", "999", 60_000)).toBe(false);
    expect(cabPlausible("faxina", 2_000_000, 3_600_000)).toBe(false); // acima do teto
  });

  it("ranking guarda a melhor marca de cada pessoa, até 10, empate para quem fez antes", () => {
    let board: CabEntry[] = [];
    board = cabInsert(board, { name: "Ana", score: 100, at: 1 }).board;
    board = cabInsert(board, { name: "Bruno", score: 300, at: 2 }).board;
    const worse = cabInsert(board, { name: "ana", score: 50, at: 3 });
    expect(worse.rank).toBe(null);
    expect(worse.personalBest).toBe(false);
    const better = cabInsert(board, { name: "Ana", score: 300, at: 4 });
    expect(better.rank).toBe(2);
    expect(better.board.map((e) => e.name)).toEqual(["Bruno", "Ana"]);
    for (let i = 0; i < 15; i++) board = cabInsert(board, { name: `P${i}`, score: 1000 + i, at: 10 + i }).board;
    expect(board).toHaveLength(CAB_TOP);
    expect(board[0]!.name).toBe("P14");
    const out = cabInsert(board, { name: "Zé", score: 5, at: 99 });
    expect(out.rank).toBe(null);
    expect(out.personalBest).toBe(true);
  });

  it("formata pontos com ponto de milhar", () => {
    expect(cabFmt(1234567)).toBe("1.234.567");
    expect(cabFmt(999)).toBe("999");
  });
});
