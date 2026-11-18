import { describe, expect, it } from "vitest";
import { DOMINO_TILES, domino, dominoFits, dominoPlayable, type DominoLink, type DominoState } from "./domino.ts";
import { GAMES, GAME_OF_TABLE, gamePlayerCounts } from "./index.ts";

/** Id da pedra [a, b]. */
const T = (a: number, b: number) => DOMINO_TILES.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));

/** Mesa montada à mão: fileira (como pares [esq, dir]), mãos e monte. */
function table(o: { chain: Array<[number, number]>; hands: number[][]; stock?: number[]; turn?: number; seated?: number[] }): DominoState {
  const seated = o.seated ?? o.hands.map((_, i) => i).filter((i) => o.hands[i]!.length > 0 || i < 2);
  const base = domino.create({ seated, seed: 1 });
  const chain: DominoLink[] = o.chain.map(([a, b]) => ({ tile: T(a, b), a, b, by: 0 }));
  const hands = base.hands.map((_, i) => o.hands[i] ?? []);
  const stock = o.stock ?? [];
  return {
    ...base,
    chain,
    ends: chain.length ? [chain[0]!.a, chain.at(-1)!.b] : null,
    hands,
    counts: hands.map((h) => h.length),
    stock,
    stockCount: stock.length,
    turn: o.turn ?? 0,
    opener: chain.length ? chain[0]!.tile : base.opener,
  };
}

describe("Dominó: começo", () => {
  it("liga a mesa às regras, de 2 a 4 pessoas", () => {
    expect(GAME_OF_TABLE["domino-table"]).toBe("domino");
    expect(GAMES.domino?.seats).toBe(4);
    expect(gamePlayerCounts(GAMES.domino!)).toEqual([2, 3, 4]);
  });

  it("mesa vazia não distribui nada", () => {
    const s = domino.create();
    expect(s.active).toEqual([]);
    expect(s.hands.every((h) => h?.length === 0)).toBe(true);
  });

  it("com 2: 7 pedras cada, 14 no monte; começa quem tem a maior bucha, jogando-a", () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const s = domino.create({ seated: [0, 2], seed });
      expect(s.active).toEqual([0, 2]);
      expect(s.hands[0]).toHaveLength(7);
      expect(s.hands[2]).toHaveLength(7);
      expect(s.hands[1]).toEqual([]);
      expect(s.stock).toHaveLength(14);
      expect(s.stockCount).toBe(14);
      const all = [...s.hands[0]!, ...s.hands[2]!, ...s.stock];
      expect(new Set(all).size).toBe(28);
      const doubles = [...s.hands[0]!, ...s.hands[2]!].filter((t) => DOMINO_TILES[t]![0] === DOMINO_TILES[t]![1]);
      const best = Math.max(...doubles.map((t) => DOMINO_TILES[t]![0]));
      expect(DOMINO_TILES[s.opener!]).toEqual([best, best]);
      expect(s.hands[s.turn]).toContain(s.opener);
      expect(s.teamOf).toEqual([-1, -1, -1, -1]);
    }
  });

  it("com 4: em duplas (0 e 2 contra 1 e 3), sem monte, e quem tem o 6-6 começa", () => {
    const s = domino.create({ seated: [0, 1, 2, 3], seed: 7 });
    expect(s.stock).toEqual([]);
    expect(s.teamOf).toEqual([0, 1, 0, 1]);
    expect(s.opener).toBe(T(6, 6));
    expect(s.hands[s.turn]).toContain(T(6, 6));
  });

  it("a mesma semente dá a mesma distribuição", () => {
    expect(domino.create({ seated: [0, 1, 2], seed: 5 })).toEqual(domino.create({ seated: [0, 1, 2], seed: 5 }));
    expect(domino.create({ seated: [0, 1, 2], seed: 5 }).hands).not.toEqual(domino.create({ seated: [0, 1, 2], seed: 6 }).hands);
  });
});

describe("Dominó: lances", () => {
  it("a primeira pedra tem de ser a maior bucha; vez errada e pedra alheia são recusadas", () => {
    const s = domino.create({ seated: [0, 1, 2, 3], seed: 7 });
    const other = s.hands[s.turn]!.find((t) => t !== s.opener)!;
    expect(domino.move(s, s.turn, { play: other })).toBeNull();
    const notMe = s.active.find((x) => x !== s.turn)!;
    expect(domino.move(s, notMe, { play: s.hands[notMe]![0] })).toBeNull();
    expect(domino.move(s, s.turn, { play: s.hands[notMe]![0] })).toBeNull();
    expect(domino.move(s, s.turn, { play: "6-6" })).toBeNull();
    expect(domino.move(s, s.turn, null)).toBeNull();
    const next = domino.move(s, s.turn, { play: s.opener })!;
    expect(next.chain).toEqual([{ tile: T(6, 6), a: 6, b: 6, by: s.turn }]);
    expect(next.ends).toEqual([6, 6]);
    expect(next.turn).toBe((s.turn + 1) % 4);
    expect(next.counts[s.turn]).toBe(6);
  });

  it("encaixa nas pontas; se serve nas duas com números diferentes, precisa dizer a ponta", () => {
    const s = table({ chain: [[3, 5]], hands: [[T(3, 5), T(1, 2)], [T(0, 0)]], stock: [T(6, 6)] });
    expect(dominoFits(T(3, 5), s.ends)).toEqual([0, 1]);
    expect(domino.move(s, 0, { play: T(1, 2) })).toBeNull(); // não serve
    expect(domino.move(s, 0, { play: T(3, 5) })).toBeNull(); // ponta ambígua
    const left = domino.move(s, 0, { play: T(3, 5), end: 0 })!;
    expect(left.chain.map((l) => [l.a, l.b])).toEqual([
      [5, 3],
      [3, 5],
    ]);
    expect(left.ends).toEqual([5, 5]);
    const right = domino.move(s, 0, { play: T(3, 5), end: 1 })!;
    expect(right.ends).toEqual([3, 3]);
    expect(domino.move(s, 0, { play: T(3, 5), end: 2 })).toBeNull();
  });

  it("compra só sem pedra que sirva, e compra até achar uma", () => {
    const s = table({ chain: [[4, 4]], hands: [[T(0, 1), T(2, 3)], [T(5, 5)]], stock: [T(0, 2), T(1, 1), T(4, 6), T(6, 6)] });
    expect(domino.move(s, 0, { pass: true })).toBeNull(); // com monte, não passa
    const drew = domino.move(s, 0, { draw: true })!;
    expect(drew.last).toMatchObject({ action: "draw", drew: 3 });
    expect(drew.hands[0]).toContain(T(4, 6));
    expect(drew.stock).toEqual([T(6, 6)]);
    expect(drew.stockCount).toBe(1);
    expect(drew.turn).toBe(0); // continua a vez: agora joga
    expect(domino.move(drew, 0, { draw: true })).toBeNull(); // já tem pedra que serve
    expect(domino.move(drew, 0, { play: T(4, 6) })).not.toBeNull();
  });

  it("sem monte e sem pedra que sirva, passa a vez (com 4 é sempre assim)", () => {
    const s = table({ chain: [[4, 4]], hands: [[T(0, 1)], [T(4, 5), T(2, 2)], [T(0, 2)], [T(1, 3)]], seated: [0, 1, 2, 3] });
    expect(domino.move(s, 0, { draw: true })).toBeNull();
    expect(domino.move(s, 0, { play: T(0, 1) })).toBeNull();
    const passed = domino.move(s, 0, { pass: true })!;
    expect(passed.turn).toBe(1);
    expect(passed.last).toMatchObject({ seat: 0, action: "pass" });
    expect(domino.move(passed, 1, { pass: true })).toBeNull(); // tem pedra: não passa
  });

  it("não altera o estado recebido", () => {
    const s = domino.create({ seated: [0, 1], seed: 3 });
    const copy = JSON.stringify(s);
    domino.move(s, s.turn, { play: s.opener });
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("Dominó: fim de partida", () => {
  it("quem joga a última pedra bate e vence com a dupla", () => {
    const s = table({ chain: [[2, 4]], hands: [[T(4, 6)], [T(0, 0), T(1, 1)], [T(3, 3)], [T(5, 5)]], seated: [0, 1, 2, 3] });
    const won = domino.move(s, 0, { play: T(4, 6) })!;
    expect(won).toMatchObject({ over: true, winner: 0, winners: [0, 2], reason: "domino" });
    expect(won.pips).toEqual([0, 2, 6, 10]);
    expect(domino.move(won, won.turn, { pass: true })).toBeNull();
  });

  it("trancado: vence quem tem menos pontos (sem duplas)", () => {
    // Pontas 6 e 6 depois do lance; ninguém tem 6 e não há monte.
    const s = table({ chain: [[6, 2]], hands: [[T(2, 6), T(0, 1)], [T(5, 5), T(4, 3)], [T(0, 0)]], seated: [0, 1, 2] });
    const end = domino.move(s, 0, { play: T(2, 6), end: 1 })!;
    expect(end.ends).toEqual([6, 6]);
    expect(end).toMatchObject({ over: true, reason: "locked", winner: 2, winners: [2] });
    expect(end.pips).toEqual([1, 17, 0, 0]);
    expect(dominoPlayable(end, end.hands[1]!)).toEqual([]);
  });

  it("trancado em duplas soma os pontos da dupla; soma igual empata", () => {
    const base = { chain: [[6, 2]] as Array<[number, number]>, seated: [0, 1, 2, 3] };
    // Dupla 0+2: 1 + 9 = 10; dupla 1+3: 0 + 12 = 12 → vence a dupla 0+2, mesmo com o lugar 1 zerado de pontos.
    const team = domino.move(table({ ...base, hands: [[T(2, 6), T(0, 1)], [T(0, 0)], [T(4, 5)], [T(5, 5), T(1, 1)]] }), 0, { play: T(2, 6), end: 1 })!;
    expect(team).toMatchObject({ over: true, reason: "locked", winners: [0, 2] });
    // Dupla 0+2: 3 + 0; dupla 1+3: 2 + 1 → empate.
    const tie = domino.move(table({ ...base, hands: [[T(2, 6), T(0, 3)], [T(1, 1)], [T(0, 0)], [T(0, 1)]] }), 0, { play: T(2, 6), end: 1 })!;
    expect(tie).toMatchObject({ over: true, reason: "locked", draw: true, winner: null });
  });

  it("abandono: com duplas a outra dupla vence; sem duplas, vencem os outros", () => {
    const four = domino.create({ seated: [0, 1, 2, 3], seed: 1 });
    expect(domino.forfeit(four, 1, "left")).toMatchObject({ over: true, winners: [0, 2], reason: "left", quit: 1 });
    const three = domino.create({ seated: [0, 1, 3], seed: 1 });
    expect(domino.forfeit(three, 3, "resign")).toMatchObject({ over: true, winners: [0, 1], quit: 3 });
  });
});

describe("Dominó: informação escondida", () => {
  it("cada um vê só a própria mão; quem assiste não vê mão nenhuma; o monte nunca sai", () => {
    const s = domino.create({ seated: [0, 1, 2], seed: 11 });
    for (const viewer of [0, 1, 2]) {
      const v = domino.view!(s, viewer);
      expect(v.hands[viewer]).toEqual(s.hands[viewer]);
      for (const other of [0, 1, 2, 3].filter((x) => x !== viewer)) expect(v.hands[other]).toBeNull();
      expect(v.stock).toEqual([]);
      expect(v.stockCount).toBe(7);
      expect(v.counts).toEqual(s.counts);
    }
    const spectator = domino.view!(s, -1);
    expect(spectator.hands).toEqual([null, null, null, null]);
    expect(spectator.stock).toEqual([]);
    // Nenhuma pedra das mãos aparece em lugar nenhum da visão de quem assiste (antes da primeira pedra na mesa).
    const json = JSON.stringify(spectator);
    expect(json).not.toContain(JSON.stringify(s.hands[0]));
    expect(json).not.toContain(JSON.stringify(s.stock));
    // A visão não muda o estado do servidor.
    expect(s.stock).toHaveLength(7);
  });

  it("no fim, as mãos aparecem para todos contarem os pontos (o monte continua escondido)", () => {
    const s = table({ chain: [[2, 4]], hands: [[T(4, 6)], [T(0, 0), T(1, 1)]], stock: [T(6, 6), T(5, 5)] });
    const won = domino.move(s, 0, { play: T(4, 6) })!;
    const v = domino.view!(won, -1);
    expect(v.hands[1]).toEqual([T(0, 0), T(1, 1)]);
    expect(v.stock).toEqual([]);
  });
});
