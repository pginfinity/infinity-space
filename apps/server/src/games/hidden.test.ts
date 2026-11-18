import { beforeEach, describe, expect, it } from "vitest";
import { Packr } from "msgpackr";
import { encode } from "../codec.ts";
import {
  dominoFits,
  dominoPlayable,
  trucoCanCover,
  trucoNext,
  type DominoState,
  type GameSnapshot,
  type MapDef,
  type MapObject,
  type ServerMsg,
  type TableState,
  type TrucoState,
} from "@infinity/world";
import { GamesManager, type GameHost } from "./manager.ts";

/**
 * Mesas de vários lugares e informação escondida: o que sai do servidor para cada pessoa.
 * Dominó e truco mandam a cada um a própria visão; quem assiste nunca recebe mão nem monte.
 */

function table(id: string, type: MapObject["type"], x: number): MapObject {
  return { id: `obj-${id}`, type, pos: { x, z: 0 }, rot: 0, size: { w: 0.9, d: 0.9, h: 0.74 }, blocks: true, gameId: id };
}

const MAP: MapDef = {
  id: "teste",
  version: 1,
  name: "Mapa de teste",
  floors: [],
  walls: [],
  zones: [],
  objects: [table("domino", "domino-table", 0), table("truco", "cards-table", 10), table("damas", "checkers-table", 20)],
  desks: [],
  signs: [],
  labels: [],
  spawns: [{ x: 0, z: 0 }],
};

const PEOPLE = ["ana", "bruno", "carla", "duda", "eva"] as const;
const unpack = new Packr({ useRecords: false, int64AsType: "number" });

class FakeHost implements GameHost {
  /** Tudo o que cada pessoa recebeu (já passado por msgpack, como na rede). */
  inbox = new Map<string, ServerMsg[]>(PEOPLE.map((id) => [id, []]));
  pos = new Map<string, { x: number; z: number }>();
  private n = 0;
  private deliver(id: string, msg: ServerMsg): void {
    // Codifica como o servidor e decodifica como o cliente: confere o que de fato vai na rede.
    this.inbox.get(id)!.push(unpack.unpack(encode(msg)) as ServerMsg);
  }
  broadcast(msg: ServerMsg): void {
    for (const id of PEOPLE) this.deliver(id, msg);
  }
  broadcastEach(msgFor: (id: string) => ServerMsg): void {
    for (const id of PEOPLE) this.deliver(id, msgFor(id));
  }
  playerName(id: string): string | undefined {
    return id[0]!.toUpperCase() + id.slice(1);
  }
  playerPos(id: string): { x: number; z: number } | undefined {
    return this.pos.get(id);
  }
  random(): number {
    return (this.n += 7919);
  }
  /** Último estado de uma mesa que a pessoa recebeu. */
  last(id: string, tableId: string): GameSnapshot | undefined {
    const list = this.inbox.get(id)!;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.t === "game" && m.game.table === tableId) return m.game;
    }
    return undefined;
  }
  /** Todas as mensagens de jogo que a pessoa recebeu. */
  games(id: string): GameSnapshot[] {
    return this.inbox.get(id)!.flatMap((m) => (m.t === "game" ? [m.game] : []));
  }
}

let host: FakeHost;
let games: GamesManager;

beforeEach(() => {
  host = new FakeHost();
  for (const id of PEOPLE) host.pos.set(id, { x: 0.5, z: 0.5 });
  games = new GamesManager(MAP, host);
});

const full = <S>(t: string) => games.fullState(t) as unknown as S;
const near = (x: number) => PEOPLE.forEach((id) => host.pos.set(id, { x: x + 0.5, z: 0.5 }));

/**
 * Confere uma fotografia recebida por `viewer`: nenhuma mão alheia, nenhum monte, nenhuma semente.
 * (No fim do dominó as mãos aparecem para todos contarem os pontos.)
 */
function assertNoLeak(snap: GameSnapshot, viewer: string): void {
  const seat = snap.seats.indexOf(viewer);
  const state = snap.state as Record<string, unknown> & { hands?: Array<unknown[] | null>; over?: boolean };
  const json = JSON.stringify(snap);
  expect(json, "semente nunca sai do servidor").not.toContain('"seed"');
  if (Array.isArray(state.stock)) expect(state.stock, "monte nunca sai").toEqual([]);
  if (!state.hands || (snap.kind === "domino" && state.over)) return;
  const t = state as unknown as Partial<TrucoState>;
  // Truco: na mão de onze, a dupla com 11 vê a mão do parceiro; na mão de ferro, ninguém vê nada.
  const partner = (i: number) => snap.kind === "truco" && t.eleven !== null && t.eleven !== undefined && seat >= 0 && t.teamOf?.[seat] === t.eleven && t.teamOf?.[i] === t.eleven;
  state.hands.forEach((h, i) => {
    const visible = !t.iron && (i === seat || partner(i));
    if (!visible) expect(h, `${viewer} não vê a mão do lugar ${i}`).toBeNull();
  });
  // Carta coberta: na mesa, na última vaza e no fim, só quem cobriu (e o parceiro, na mão de onze) sabe qual foi.
  for (const p of [...(t.table ?? []), ...(t.prevTrick?.cards ?? [])]) {
    if (p.covered && p.seat !== seat && !partner(p.seat)) expect(p.card, `${viewer} não vê a carta coberta do lugar ${p.seat}`).toBeNull();
  }
}

/** Jogadas cobertas que chegaram a uma pessoa (na mesa e na última vaza), em todas as mensagens do truco. */
const coveredSeen = (id: string) =>
  host
    .games(id)
    .filter((g) => g.table === "truco")
    .flatMap((g) => {
      const s = g.state as TrucoState;
      return [...s.table, ...(s.prevTrick?.cards ?? [])].filter((p) => p.covered);
    });

describe("dominó pelo servidor", () => {
  it("com 4: começa quando enche, e cada um recebe só a própria mão", () => {
    PEOPLE.slice(0, 4).forEach((id, seat) => games.handle(id, "domino", "sit", { seat }));
    const s = full<DominoState>("domino");
    expect(s.active).toEqual([0, 1, 2, 3]);
    PEOPLE.slice(0, 4).forEach((id, seat) => {
      const got = host.last(id, "domino")!.state as TableState<DominoState>;
      expect(got.hands[seat]).toEqual(s.hands[seat]);
      expect(got.hands.filter((h) => h !== null)).toHaveLength(1);
      expect(got.counts).toEqual([7, 7, 7, 7]);
    });
    const eva = host.last("eva", "domino")!.state as TableState<DominoState>;
    expect(eva.hands).toEqual([null, null, null, null]);
    expect(eva.counts).toEqual([7, 7, 7, 7]);
  });

  it("com 2: quem está sentado começa (op start); quem assiste não começa nem joga", () => {
    games.handle("ana", "domino", "sit", { seat: 0 });
    games.handle("eva", "domino", "start", undefined);
    games.handle("ana", "domino", "start", undefined); // sozinha não dá
    expect(games.snapshots().find((g) => g.table === "domino")!.phase).toBe("waiting");
    games.handle("bruno", "domino", "sit", { seat: 2 });
    games.handle("eva", "domino", "start", undefined);
    expect(games.snapshots().find((g) => g.table === "domino")!.phase).toBe("waiting");
    games.handle("bruno", "domino", "start", undefined);
    const s = full<DominoState>("domino");
    expect(s.active).toEqual([0, 2]);
    expect(s.stock).toHaveLength(14);
    const who = s.active.find((x) => x !== s.turn)!;
    const before = host.inbox.get("eva")!.length;
    games.handle("eva", "domino", "move", { play: s.opener });
    games.handle(who === 0 ? "ana" : "bruno", "domino", "move", { play: s.opener });
    expect(host.inbox.get("eva")!.length).toBe(before);
    games.handle(s.turn === 0 ? "ana" : "bruno", "domino", "move", { play: s.opener });
    expect(full<DominoState>("domino").chain).toHaveLength(1);
  });

  it("partida inteira de 3: nada escondido vaza em mensagem nenhuma, até o fim", () => {
    for (const [id, seat] of [
      ["ana", 0],
      ["bruno", 1],
      ["carla", 3],
    ] as const)
      games.handle(id, "domino", "sit", { seat });
    games.handle("carla", "domino", "start", undefined);
    const idOf = ["ana", "bruno", null, "carla"];
    for (let guard = 0; guard < 200; guard++) {
      const s = full<DominoState>("domino");
      if (s.over) break;
      const me = idOf[s.turn]!;
      const hand = s.hands[s.turn]!;
      const ok = dominoPlayable(s, hand);
      if (ok.length > 0) {
        const tile = ok[0]!;
        const fits = dominoFits(tile, s.ends);
        games.handle(me, "domino", "move", { play: tile, end: fits[0] });
      } else if (s.stock.length > 0) games.handle(me, "domino", "move", { draw: true });
      else games.handle(me, "domino", "move", { pass: true });
    }
    const end = full<DominoState>("domino");
    expect(end.over).toBe(true);
    expect(["domino", "locked"]).toContain(end.reason);
    for (const id of PEOPLE) {
      const list = host.games(id).filter((g) => g.table === "domino");
      expect(list.length).toBeGreaterThan(10);
      for (const g of list) assertNoLeak(g, id);
    }
    // Quem assiste nunca viu mão nenhuma antes do fim.
    for (const g of host.games("eva").filter((x) => x.table === "domino" && x.phase === "playing")) {
      expect((g.state as DominoState).hands).toEqual([null, null, null, null]);
    }
  });

  it("o welcome de cada pessoa traz a própria visão; sem pessoa, a de quem assiste", () => {
    games.handle("ana", "domino", "sit", { seat: 0 });
    games.handle("bruno", "domino", "sit", { seat: 1 });
    games.handle("ana", "domino", "start", undefined);
    const s = full<DominoState>("domino");
    const mine = games.snapshots("ana").find((g) => g.table === "domino")!.state as DominoState;
    expect(mine.hands[0]).toEqual(s.hands[0]);
    expect(mine.hands[1]).toBeNull();
    const anyone = games.snapshots().find((g) => g.table === "domino")!.state as DominoState;
    expect(anyone.hands).toEqual([null, null, null, null]);
    expect(anyone.stock).toEqual([]);
  });

  it("levantar no meio da partida em duplas: a outra dupla vence", () => {
    PEOPLE.slice(0, 4).forEach((id, seat) => games.handle(id, "domino", "sit", { seat }));
    games.handle("bruno", "domino", "stand", undefined);
    const g = games.snapshots().find((x) => x.table === "domino")!;
    expect(g.phase).toBe("finished");
    expect(g.state).toMatchObject({ winners: [0, 2], quit: 1, reason: "left" });
  });

  it("revanche em mesa de vários lugares: todos votam e ninguém troca de lugar", () => {
    for (const [id, seat] of [
      ["ana", 0],
      ["bruno", 1],
      ["carla", 2],
    ] as const)
      games.handle(id, "domino", "sit", { seat });
    games.handle("ana", "domino", "start", undefined);
    games.handle("ana", "domino", "resign", undefined);
    const seatsBefore = games.snapshots().find((x) => x.table === "domino")!.seats;
    games.handle("ana", "domino", "rematch", { on: true });
    games.handle("bruno", "domino", "rematch", { on: true });
    expect(games.snapshots().find((x) => x.table === "domino")!.phase).toBe("finished");
    games.handle("carla", "domino", "rematch", { on: true });
    const g = games.snapshots().find((x) => x.table === "domino")!;
    expect(g.phase).toBe("playing");
    expect(g.seats).toEqual(seatsBefore);
    expect((g.state as TableState).round).toBe(2);
  });
});

describe("truco pelo servidor", () => {
  beforeEach(() => near(10));

  it("mano a mano em lugares frente a frente; cada um vê só as próprias cartas; quem assiste, nenhuma", () => {
    games.handle("ana", "truco", "sit", { seat: 0 });
    games.handle("bruno", "truco", "sit", { seat: 2 });
    games.handle("carla", "truco", "sit", { seat: 1 });
    games.handle("ana", "truco", "start", undefined); // três não pode
    expect(games.snapshots().find((x) => x.table === "truco")!.phase).toBe("waiting");
    games.handle("carla", "truco", "stand", undefined);
    games.handle("ana", "truco", "start", undefined);
    const s = full<TrucoState>("truco");
    expect(s.active).toEqual([0, 2]);
    const ana = host.last("ana", "truco")!.state as TrucoState;
    const bruno = host.last("bruno", "truco")!.state as TrucoState;
    const eva = host.last("eva", "truco")!.state as TrucoState;
    expect(ana.hands[0]).toEqual(s.hands[0]);
    expect(ana.hands[2]).toBeNull();
    expect(bruno.hands[2]).toEqual(s.hands[2]);
    expect(bruno.hands[0]).toBeNull();
    expect(eva.hands).toEqual([null, null, null, null]);
    for (const id of PEOPLE) for (const g of host.games(id)) expect(JSON.stringify(g)).not.toContain('"seed"');
  });

  it("pedido de truco: quem responde é a outra dupla, mesmo fora da vez", () => {
    PEOPLE.slice(0, 4).forEach((id, seat) => games.handle(id, "truco", "sit", { seat }));
    const s = full<TrucoState>("truco");
    const ids = PEOPLE.slice(0, 4);
    games.handle(ids[s.turn]!, "truco", "move", { truco: true });
    const asked = full<TrucoState>("truco");
    expect(asked.raise).not.toBeNull();
    // O parceiro de quem pediu não responde; o segundo da outra dupla (fora da vez) responde.
    games.handle(ids[(s.turn + 2) % 4]!, "truco", "move", { answer: "accept" });
    expect(full<TrucoState>("truco").raise).not.toBeNull();
    const other = asked.acting!.find((x) => x !== asked.turn)!;
    games.handle(ids[other]!, "truco", "move", { answer: "accept" });
    expect(full<TrucoState>("truco")).toMatchObject({ raise: null, stake: 3 });
    // Cada um continua vendo só a própria mão.
    ids.forEach((id, seat) => {
      const got = host.last(id, "truco")!.state as TrucoState;
      expect(got.hands.filter((h) => h !== null)).toHaveLength(1);
      expect(got.hands[seat]).toEqual(full<TrucoState>("truco").hands[seat]);
    });
  });

  it("mão nova a cada vaza decidida, com cartas novas e ainda escondidas", () => {
    games.handle("ana", "truco", "sit", { seat: 0 });
    games.handle("bruno", "truco", "sit", { seat: 1 });
    games.handle("ana", "truco", "start", undefined);
    const ids = ["ana", "bruno"];
    const first = full<TrucoState>("truco");
    // Quem está na vez pede truco e o outro corre: mão nova.
    games.handle(ids[first.turn]!, "truco", "move", { truco: true });
    games.handle(ids[1 - first.turn]!, "truco", "move", { answer: "run" });
    const second = full<TrucoState>("truco");
    expect(second.hand).toBe(2);
    expect(second.score[first.teamOf[first.turn]!]).toBe(1);
    const eva = host.last("eva", "truco")!.state as TrucoState;
    expect(eva.hands).toEqual([null, null, null, null]);
    expect(eva.hand).toBe(2);
  });

  it("carta coberta: só quem cobriu recebe a carta; o outro e quem assiste recebem só as costas", () => {
    games.handle("ana", "truco", "sit", { seat: 0 });
    games.handle("bruno", "truco", "sit", { seat: 1 });
    games.handle("ana", "truco", "start", undefined);
    const ids = ["ana", "bruno"];
    const s0 = full<TrucoState>("truco");
    // Na primeira vaza o servidor recusa a coberta.
    games.handle(ids[s0.turn]!, "truco", "move", { play: 0, cover: true });
    expect(full<TrucoState>("truco").moves).toBe(s0.moves);
    games.handle(ids[s0.turn]!, "truco", "move", { play: 0 });
    games.handle(ids[trucoNext(s0, s0.turn)]!, "truco", "move", { play: 0 });
    const s1 = full<TrucoState>("truco");
    expect(s1.tricks).toHaveLength(1);
    // Segunda vaza: quem abre cobre a primeira carta da mão.
    const coverer = s1.turn;
    const card = s1.hands[coverer]![0]!;
    games.handle(ids[coverer]!, "truco", "move", { play: 0, cover: true });
    expect(full<TrucoState>("truco").table).toEqual([{ seat: coverer, card, covered: true }]);
    const mine = host.last(ids[coverer]!, "truco")!.state as TrucoState;
    const theirs = host.last(ids[1 - coverer]!, "truco")!.state as TrucoState;
    const eva = host.last("eva", "truco")!.state as TrucoState;
    expect(mine.table).toEqual([{ seat: coverer, card, covered: true }]);
    expect(theirs.table).toEqual([{ seat: coverer, card: null, covered: true }]);
    expect(eva.table).toEqual([{ seat: coverer, card: null, covered: true }]);
    // O welcome de quem entra agora também vem sem a carta.
    expect((games.snapshots("eva").find((g) => g.table === "truco")!.state as TrucoState).table[0]?.card).toBeNull();
    expect((games.snapshots(ids[coverer]).find((g) => g.table === "truco")!.state as TrucoState).table[0]?.card).toBe(card);

    // O outro responde e a vaza fecha (a coberta perde); a carta continua escondida na última vaza.
    games.handle(ids[1 - coverer]!, "truco", "move", { play: 0 });
    const s2 = full<TrucoState>("truco");
    if (s2.hand === s1.hand) {
      expect(s2.prevTrick?.cards[0]).toEqual({ seat: coverer, card, covered: true });
      expect((host.last(ids[1 - coverer]!, "truco")!.state as TrucoState).prevTrick?.cards[0]).toEqual({ seat: coverer, card: null, covered: true });
      expect((host.last(ids[coverer]!, "truco")!.state as TrucoState).prevTrick?.cards[0]).toEqual({ seat: coverer, card, covered: true });
    }
    // Em nenhuma mensagem a carta chegou a quem não cobriu.
    expect(coveredSeen(ids[1 - coverer]!).length).toBeGreaterThan(0);
    for (const id of [ids[1 - coverer]!, "eva", "carla"]) for (const p of coveredSeen(id)) expect(p.card, id).toBeNull();
    for (const p of coveredSeen(ids[coverer]!)) expect(p.card).toBe(card);
    for (const id of PEOPLE) for (const g of host.games(id).filter((x) => x.table === "truco")) assertNoLeak(g, id);
  });
});

describe("truco: partida inteira", () => {
  beforeEach(() => near(10));

  it("em quatro até 12 pontos, com pedidos, mão de onze e tudo: nada escondido vaza", () => {
    const ids = PEOPLE.slice(0, 4);
    ids.forEach((id, seat) => games.handle(id, "truco", "sit", { seat }));
    let step = 0;
    for (let guard = 0; guard < 3000; guard++) {
      const s = full<TrucoState>("truco");
      if (s.over) break;
      step++;
      if (s.deciding) games.handle(ids[s.turn]!, "truco", "move", { eleven: step % 3 === 0 ? "run" : "play" });
      else if (s.raise) games.handle(ids[s.acting!.at(-1)!]!, "truco", "move", { answer: step % 4 === 0 ? "run" : step % 4 === 1 ? "raise" : "accept" });
      else if (step % 5 === 0 && s.eleven === null && !s.iron && s.raisedBy !== s.teamOf[s.turn] && s.stake < 12) games.handle(ids[s.turn]!, "truco", "move", { truco: true });
      // De vez em quando, da segunda vaza em diante, a carta vai coberta.
      else if (step % 3 === 1 && trucoCanCover(s)) games.handle(ids[s.turn]!, "truco", "move", { play: step % (s.counts[s.turn] ?? 1), cover: true });
      else games.handle(ids[s.turn]!, "truco", "move", { play: step % (s.counts[s.turn] ?? 1) });
      expect(full<TrucoState>("truco").moves, "todo lance da simulação é aceito").toBeGreaterThan(s.moves);
    }
    const end = full<TrucoState>("truco");
    expect(end).toMatchObject({ over: true, reason: "score" });
    expect(Math.max(...end.score)).toBe(12);
    for (const id of PEOPLE) {
      const list = host.games(id).filter((g) => g.table === "truco");
      expect(list.length).toBeGreaterThan(20);
      for (const g of list) assertNoLeak(g, id);
    }
    // A simulação cobriu cartas de verdade, e quem assiste nunca viu nenhuma.
    expect(coveredSeen("eva").length).toBeGreaterThan(0);
    expect(coveredSeen("eva").every((p) => p.card === null)).toBe(true);
  });
});

describe("damas pelo servidor (sem nada escondido)", () => {
  beforeEach(() => near(20));

  it("todos recebem o mesmo estado e o lance é conferido", () => {
    games.handle("ana", "damas", "sit", { seat: 0 });
    games.handle("bruno", "damas", "sit", { seat: 1 });
    games.handle("ana", "damas", "move", { path: [42, 35] }); // c3-d4 (casas 42 → 35)
    games.handle("bruno", "damas", "move", { path: [42, 35] }); // fora da vez
    const a = host.last("ana", "damas")!;
    const e = host.last("eva", "damas")!;
    expect(a).toEqual(e);
    expect((e.state as { moves: number }).moves).toBe(1);
  });
});
