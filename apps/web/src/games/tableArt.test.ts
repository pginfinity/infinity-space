import { describe, expect, it } from "vitest";
import { DOMINO_TILES, domino, type DominoLink } from "@infinity/world";
import { SNAKE_ROW, dominoSnake } from "./tableArt.ts";

/** Fileira válida montada à mão: cada pedra encosta na anterior pelo número igual. */
function chain(pairs: Array<[number, number]>): DominoLink[] {
  return pairs.map(([a, b]) => ({ tile: DOMINO_TILES.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b)), a, b, by: 0 }));
}

describe("cobrinha do dominó", () => {
  const links = chain([
    [6, 6],
    [6, 1],
    [1, 1],
    [1, 4],
    [4, 2],
    [2, 2],
    [2, 5],
    [5, 3],
    [3, 3],
    [3, 0],
    [0, 4],
    [4, 4],
    [4, 6],
    [6, 5],
  ]);

  it("cabe nas colunas, quebra a fileira e alterna o sentido", () => {
    const { places, rows } = dominoSnake(links, 10);
    expect(rows).toBeGreaterThan(1);
    for (const p of places) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(10);
    }
    // Bucha em pé, comum deitada.
    expect(places[0]).toMatchObject({ w: 1, h: 2 });
    expect(places[1]).toMatchObject({ w: 2, h: 1 });
  });

  it("números iguais se encostam no desenho, nos dois sentidos", () => {
    const { places } = dominoSnake(links, 10);
    for (let i = 1; i < places.length; i++) {
      const prev = places[i - 1]!;
      const cur = places[i]!;
      const sameRow = Math.floor(prev.y / SNAKE_ROW) === Math.floor(cur.y / SNAKE_ROW);
      if (!sameRow) continue;
      // Indo para a direita, o número da direita da anterior encosta no da esquerda da atual; voltando, o contrário.
      const rightward = cur.x > prev.x;
      if (rightward) expect(prev.second).toBe(cur.first);
      else expect(prev.first).toBe(cur.second);
    }
  });

  it("serve para a fileira de uma partida de verdade", () => {
    let s = domino.create({ seated: [0, 1, 2, 3], seed: 9 });
    s = domino.move(s, s.turn, { play: s.opener })!;
    expect(dominoSnake(s.chain, 14).places).toHaveLength(1);
  });
});
