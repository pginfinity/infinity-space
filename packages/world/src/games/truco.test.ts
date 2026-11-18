import { describe, expect, it } from "vitest";
import { GAMES, GAME_OF_TABLE, gamePlayerCounts } from "./index.ts";
import {
  TRUCO_RANKS,
  TRUCO_SUITS,
  truco,
  trucoCard,
  trucoHandWinner,
  trucoManilha,
  trucoPower,
  trucoTrick,
  trucoWithScore,
  type TrucoState,
} from "./truco.ts";

/** Carta pelo nome: C("A", "paus"). */
const C = (rank: (typeof TRUCO_RANKS)[number], suit: (typeof TRUCO_SUITS)[number]) => trucoCard(TRUCO_RANKS.indexOf(rank), TRUCO_SUITS.indexOf(suit));

/** Mão de dois montada à mão. Vira 4 de ouros: manilha é o 5. Lugar 0 começa a vaza. */
function deal2(h0: number[], h1: number[], vira = C("4", "ouros")): TrucoState {
  const s = truco.create({ seated: [0, 1], seed: 1 });
  return { ...s, hands: [h0, h1, [], []], counts: [h0.length, h1.length, 0, 0], vira, manilha: trucoManilha(vira), turn: 0, lead: 0, dealer: 1, table: [], tricks: [] };
}

/** Joga a carta (pelo valor) da mão do lugar. */
function play(s: TrucoState, seat: number, card: number): TrucoState {
  const index = s.hands[seat]!.indexOf(card);
  const next = truco.move(s, seat, { play: index }, 1234);
  if (!next) throw new Error(`carta recusada: lugar ${seat}, carta ${card}`);
  return next;
}

describe("Truco: começo", () => {
  it("liga a mesa às regras, com 2 ou 4 pessoas", () => {
    expect(GAME_OF_TABLE["cards-table"]).toBe("truco");
    expect(GAMES.truco?.seats).toBe(4);
    expect(gamePlayerCounts(GAMES.truco!)).toEqual([2, 4]);
    expect(truco.create({ seated: [0, 1, 2] }).active).toEqual([]);
  });

  it("mano a mano: 3 cartas cada, vira fora das mãos, manilha é o valor seguinte", () => {
    const s = truco.create({ seated: [0, 2], seed: 9 });
    expect(s.active).toEqual([0, 2]);
    expect(s.teamOf).toEqual([0, -1, 1, -1]);
    expect(s.hands[0]).toHaveLength(3);
    expect(s.hands[2]).toHaveLength(3);
    expect(s.counts).toEqual([3, 0, 3, 0]);
    expect([...s.hands[0]!, ...s.hands[2]!]).not.toContain(s.vira);
    expect(s.manilha).toBe((s.vira % 10) + 1 === 10 ? 0 : (s.vira % 10) + 1);
    expect(s).toMatchObject({ score: [0, 0], hand: 1, stake: 1, over: false, eleven: null, iron: false });
    expect(s.turn).toBe(s.lead);
  });

  it("em quatro: duplas 0 e 2 contra 1 e 3, 12 cartas diferentes e a vira", () => {
    const s = truco.create({ seated: [0, 1, 2, 3], seed: 4 });
    expect(s.teamOf).toEqual([0, 1, 0, 1]);
    const all = [...s.hands.flatMap((h) => h ?? []), s.vira];
    expect(new Set(all).size).toBe(13);
  });

  it("a cada partida nova, outra pessoa começa", () => {
    const first = truco.create({ seated: [0, 1], seed: 1, round: 1 });
    const second = truco.create({ seated: [0, 1], seed: 1, round: 2 });
    expect(first.lead).not.toBe(second.lead);
  });
});

describe("Truco: manilha e força das cartas", () => {
  it("manilha vem da vira e ganha de qualquer carta comum; entre manilhas vale o naipe (paus é o zap)", () => {
    const vira = C("K", "ouros");
    const m = trucoManilha(vira);
    expect(TRUCO_RANKS[m]).toBe("A");
    const order = [C("4", "copas"), C("7", "paus"), C("Q", "ouros"), C("J", "copas"), C("K", "paus"), C("2", "ouros"), C("3", "espadas"), C("A", "ouros"), C("A", "espadas"), C("A", "copas"), C("A", "paus")];
    const powers = order.map((c) => trucoPower(c, m));
    expect([...powers].sort((a, b) => a - b)).toEqual(powers);
    expect(new Set(powers).size).toBe(powers.length);
  });

  it("vira 3 dá manilha 4 (dá a volta)", () => {
    expect(TRUCO_RANKS[trucoManilha(C("3", "copas"))]).toBe("4");
    expect(TRUCO_RANKS[trucoManilha(C("7", "paus"))]).toBe("Q");
  });

  it("vaza: carta comum igual de duplas diferentes empata; da mesma dupla, a dupla leva", () => {
    const teamOf = [0, 1, 0, 1];
    const m = trucoManilha(C("4", "ouros")); // manilha 5
    const tie = trucoTrick(
      [
        { seat: 0, card: C("3", "ouros") },
        { seat: 1, card: C("3", "copas") },
        { seat: 2, card: C("2", "paus") },
        { seat: 3, card: C("K", "paus") },
      ],
      m,
      teamOf,
    );
    expect(tie).toEqual({ team: -1, seat: 0 });
    const partners = trucoTrick(
      [
        { seat: 1, card: C("2", "ouros") },
        { seat: 2, card: C("3", "ouros") },
        { seat: 3, card: C("7", "paus") },
        { seat: 0, card: C("3", "paus") },
      ],
      m,
      teamOf,
    );
    expect(partners).toEqual({ team: 0, seat: 2 });
    const manilha = trucoTrick(
      [
        { seat: 0, card: C("3", "ouros") },
        { seat: 1, card: C("5", "ouros") },
      ],
      m,
      [0, 1],
    );
    expect(manilha).toEqual({ team: 1, seat: 1 });
  });

  it("quem leva a mão pelas vazas, com empates", () => {
    expect(trucoHandWinner([0])).toBeNull();
    expect(trucoHandWinner([0, 0])).toBe(0);
    expect(trucoHandWinner([0, 1])).toBeNull();
    expect(trucoHandWinner([0, 1, 1])).toBe(1);
    expect(trucoHandWinner([1, 0, 1])).toBe(1);
    // Empate na primeira: quem ganhar a segunda leva.
    expect(trucoHandWinner([-1, 1])).toBe(1);
    // Ganhou a primeira e empatou a segunda: leva quem ganhou a primeira.
    expect(trucoHandWinner([0, -1])).toBe(0);
    // Empate nas duas primeiras: a terceira decide.
    expect(trucoHandWinner([-1, -1])).toBeNull();
    expect(trucoHandWinner([-1, -1, 0])).toBe(0);
    // Uma para cada e empate na terceira: leva quem ganhou a primeira.
    expect(trucoHandWinner([1, 0, -1])).toBe(1);
    // Três empates: ninguém marca.
    expect(trucoHandWinner([-1, -1, -1])).toBe(-1);
  });
});

describe("Truco: jogando a mão", () => {
  it("melhor de três: marca 1 ponto e dá as cartas da próxima mão", () => {
    let s = deal2([C("3", "ouros"), C("7", "copas"), C("K", "espadas")], [C("2", "paus"), C("A", "copas"), C("4", "espadas")]);
    expect(truco.move(s, 1, { play: 0 })).toBeNull(); // não é a vez
    expect(truco.move(s, 0, { play: 3 })).toBeNull(); // não tem essa carta
    expect(truco.move(s, 0, { play: "3" })).toBeNull();
    s = play(s, 0, C("3", "ouros"));
    expect(s.turn).toBe(1);
    expect(s.counts[0]).toBe(2);
    s = play(s, 1, C("2", "paus"));
    expect(s.tricks).toEqual([0]);
    expect(s.prevTrick).toMatchObject({ team: 0, seat: 0 });
    expect(s.turn).toBe(0);
    s = play(s, 0, C("7", "copas"));
    s = play(s, 1, C("A", "copas"));
    expect(s.tricks).toEqual([0, 1]);
    expect(s.turn).toBe(1); // quem levou começa
    s = play(s, 1, C("4", "espadas"));
    s = play(s, 0, C("K", "espadas"));
    expect(s.score).toEqual([1, 0]);
    expect(s.lastHand).toEqual({ hand: 1, team: 0, points: 1, how: "tricks" });
    expect(s).toMatchObject({ hand: 2, dealer: 0, lead: 1, turn: 1, stake: 1, tricks: [], table: [] });
    expect(s.counts).toEqual([3, 3, 0, 0]);
  });

  it("primeira vaza empatada: a segunda decide", () => {
    let s = deal2([C("3", "ouros"), C("7", "copas"), C("K", "espadas")], [C("3", "copas"), C("A", "copas"), C("4", "espadas")]);
    s = play(s, 0, C("3", "ouros"));
    s = play(s, 1, C("3", "copas"));
    expect(s.tricks).toEqual([-1]);
    expect(s.turn).toBe(0);
    s = play(s, 0, C("K", "espadas"));
    s = play(s, 1, C("4", "espadas"));
    expect(s.score).toEqual([1, 0]);
  });
});

describe("Truco: pedir, aceitar, correr e aumentar", () => {
  const start = () => deal2([C("3", "ouros"), C("7", "copas"), C("K", "espadas")], [C("2", "paus"), C("A", "copas"), C("4", "espadas")]);

  it("truco aceito: a mão vale 3 e quem pediu continua jogando; a mesma dupla não aumenta de novo", () => {
    let s = start();
    expect(truco.move(s, 1, { truco: true })).toBeNull(); // fora da vez
    s = truco.move(s, 0, { truco: true })!;
    expect(s.raise).toMatchObject({ by: 0, team: 0, to: 3 });
    expect(s).toMatchObject({ turn: 1, acting: [1] });
    expect(truco.move(s, 0, { play: 0 })).toBeNull(); // esperando resposta
    expect(truco.move(s, 0, { answer: "accept" })).toBeNull(); // quem pediu não responde
    s = truco.move(s, 1, { answer: "accept" })!;
    expect(s).toMatchObject({ stake: 3, raise: null, raisedBy: 0, turn: 0 });
    expect(s.acting).toBeUndefined();
    expect(truco.move(s, 0, { truco: true })).toBeNull();
    s = play(s, 0, C("3", "ouros"));
    // Agora o outro lado pode pedir seis.
    s = truco.move(s, 1, { truco: true })!;
    expect(s.raise).toMatchObject({ by: 1, to: 6 });
  });

  it("correr do truco dá o valor de antes a quem pediu", () => {
    let s = truco.move(start(), 0, { truco: true })!;
    s = truco.move(s, 1, { answer: "run" }, 77)!;
    expect(s.score).toEqual([1, 0]);
    expect(s.lastHand).toEqual({ hand: 1, team: 0, points: 1, how: "run" });
    expect(s.hand).toBe(2);
  });

  it("seis em cima do truco: o truco fica aceito e quem pediu primeiro responde; correr dá 3", () => {
    let s = truco.move(start(), 0, { truco: true })!;
    s = truco.move(s, 1, { answer: "raise" })!;
    expect(s).toMatchObject({ stake: 3, raise: { by: 1, team: 1, to: 6, turn: 0 }, turn: 0, acting: [0] });
    const accepted = truco.move(s, 0, { answer: "accept" })!;
    expect(accepted).toMatchObject({ stake: 6, turn: 0, raisedBy: 1 });
    const ran = truco.move(s, 0, { answer: "run" })!;
    expect(ran.score).toEqual([0, 3]);
    // Nove e doze; depois de doze não tem mais.
    let up = truco.move(s, 0, { answer: "raise" })!;
    expect(up.raise?.to).toBe(9);
    up = truco.move(up, 1, { answer: "raise" })!;
    expect(up.raise?.to).toBe(12);
    expect(truco.move(up, 0, { answer: "raise" })).toBeNull();
    expect(truco.move(up, 0, { answer: "accept" })!.stake).toBe(12);
  });

  it("em quatro, qualquer um da outra dupla responde", () => {
    let s = truco.create({ seated: [0, 1, 2, 3], seed: 3 });
    const caller = s.turn;
    s = truco.move(s, caller, { truco: true })!;
    const foes = [0, 1, 2, 3].filter((x) => s.teamOf[x] !== s.teamOf[caller]);
    expect([...(s.acting ?? [])].sort()).toEqual(foes);
    expect(truco.move(s, (caller + 2) % 4, { answer: "accept" })).toBeNull(); // parceiro de quem pediu
    expect(truco.move(s, foes[1]!, { answer: "accept" })!.stake).toBe(3);
  });
});

describe("Truco: mão de onze, mão de ferro e fim da partida", () => {
  it("mão de onze: a dupla com 11 decide; jogando vale 3, correndo os outros marcam 1; sem truco", () => {
    const s = trucoWithScore(truco.create({ seated: [0, 1, 2, 3], seed: 2 }), [11, 5]);
    expect(s).toMatchObject({ eleven: 0, deciding: true, iron: false });
    expect([...(s.acting ?? [])].sort()).toEqual([0, 2]);
    expect(truco.move(s, s.turn, { play: 0 })).toBeNull();
    expect(truco.move(s, 1, { eleven: "play" })).toBeNull(); // a outra dupla não decide
    const played = truco.move(s, 2, { eleven: "play" })!;
    expect(played).toMatchObject({ deciding: false, stake: 3, turn: s.lead });
    expect(truco.move(played, played.turn, { truco: true })).toBeNull();
    const ran = truco.move(s, 0, { eleven: "run" }, 5)!;
    expect(ran.score).toEqual([11, 6]);
    expect(ran.lastHand).toMatchObject({ team: 1, points: 1, how: "eleven" });
  });

  it("na mão de onze a dupla vê as cartas do parceiro; a outra dupla não", () => {
    const s = trucoWithScore(truco.create({ seated: [0, 1, 2, 3], seed: 2 }), [11, 5]);
    expect(truco.view!(s, 0).hands[2]).toEqual(s.hands[2]);
    expect(truco.view!(s, 2).hands[0]).toEqual(s.hands[0]);
    expect(truco.view!(s, 1).hands[3]).toBeNull();
    expect(truco.view!(s, 1).hands[0]).toBeNull();
  });

  it("mão de ferro: as duas com 11, ninguém vê as próprias cartas e não tem truco", () => {
    const s = trucoWithScore(truco.create({ seated: [0, 1], seed: 2 }), [11, 11]);
    expect(s).toMatchObject({ iron: true, eleven: null, deciding: false, stake: 1 });
    expect(truco.view!(s, s.turn).hands).toEqual([null, null, null, null]);
    expect(truco.move(s, s.turn, { truco: true })).toBeNull();
    expect(truco.move(s, s.turn, { play: 0 })).not.toBeNull();
  });

  it("chegar a 12 encerra a partida e a dupla vence", () => {
    let s = { ...deal2([C("3", "ouros"), C("2", "copas"), C("K", "espadas")], [C("4", "paus"), C("6", "copas"), C("4", "espadas")]), score: [10, 4] as [number, number] };
    s = truco.move(s, 0, { truco: true })!;
    s = truco.move(s, 1, { answer: "accept" })!;
    s = play(s, 0, C("3", "ouros"));
    s = play(s, 1, C("4", "paus"));
    s = play(s, 0, C("2", "copas"));
    s = play(s, 1, C("6", "copas"));
    expect(s).toMatchObject({ over: true, winner: 0, winners: [0], reason: "score", score: [12, 4] });
    expect(truco.move(s, s.turn, { play: 0 })).toBeNull();
  });

  it("abandono: a outra dupla vence", () => {
    const s = truco.create({ seated: [0, 1, 2, 3], seed: 3 });
    expect(truco.forfeit(s, 2, "left")).toMatchObject({ over: true, winners: [1, 3], quit: 2, reason: "left" });
  });
});

describe("Truco: informação escondida", () => {
  it("cada um vê só a própria mão; quem assiste vê só quantas cartas; a semente nunca sai", () => {
    const s = truco.create({ seated: [0, 1, 2, 3], seed: 21 });
    expect(s.seed).toBeTypeOf("number");
    for (const viewer of [0, 1, 2, 3]) {
      const v = truco.view!(s, viewer);
      expect(v.hands[viewer]).toEqual(s.hands[viewer]);
      expect(v.hands.filter((h) => h !== null)).toHaveLength(1);
      expect("seed" in v).toBe(false);
      expect(v.counts).toEqual([3, 3, 3, 3]);
      expect(v.vira).toBe(s.vira);
    }
    const spectator = truco.view!(s, -1);
    expect(spectator.hands).toEqual([null, null, null, null]);
    expect("seed" in spectator).toBe(false);
    // A visão não muda o estado do servidor.
    expect(s.hands[0]).toHaveLength(3);
  });
});
