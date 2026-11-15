import { beforeEach, describe, expect, it } from "vitest";
import type { ChessState, Connect4State, GameSnapshot, MapDef, MapObject, ServerMsg, TableState } from "@infinity/world";
import { AWAY_SECONDS, GamesManager, type GameHost } from "./manager.ts";

/** Mesa de jogo falsa, só para os testes (a planta real é de outra pessoa). */
function table(id: string, type: MapObject["type"], x: number, z: number): MapObject {
  return { id: `obj-${id}`, type, pos: { x, z }, rot: 0, size: { w: 0.8, d: 0.8, h: 0.74 }, blocks: true, gameId: id };
}

const MAP: MapDef = {
  id: "teste",
  version: 1,
  name: "Mapa de teste",
  floors: [],
  walls: [],
  zones: [],
  objects: [
    table("lig4", "connect4-table", 0, 0),
    table("xadrez", "chess-table", 10, 0),
    // Sem gameId: não vira mesa.
    { ...table("solta", "chess-table", 20, 0), gameId: undefined },
    { id: "mesa", type: "desk", pos: { x: 5, z: 5 }, rot: 0, size: { w: 1, d: 1, h: 1 }, blocks: true },
  ],
  desks: [],
  signs: [],
  labels: [],
  spawns: [{ x: 0, z: 0 }],
};

class FakeHost implements GameHost {
  sent: ServerMsg[] = [];
  pos = new Map<string, { x: number; z: number }>();
  names = new Map<string, string>();
  broadcast(msg: ServerMsg): void {
    this.sent.push(msg);
  }
  playerName(id: string): string | undefined {
    return this.names.get(id);
  }
  playerPos(id: string): { x: number; z: number } | undefined {
    return this.pos.get(id);
  }
  /** Último estado transmitido de uma mesa. */
  last(tableId: string): GameSnapshot | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.t === "game" && m.game.table === tableId) return m.game;
    }
    return undefined;
  }
}

let host: FakeHost;
let games: GamesManager;

const c4 = () => games.snapshots().find((g) => g.table === "lig4")!;
const c4State = () => c4().state as TableState<Connect4State>;

/** Ana e Bruno perto da mesa de Lig 4. */
function seatBoth(): void {
  games.handle("ana", "lig4", "sit", { seat: 0 });
  games.handle("bruno", "lig4", "sit", { seat: 1 });
}

/** Joga colunas alternando quem está na vez. */
function dropAll(cols: number[]): void {
  for (const col of cols) {
    const s = c4();
    const who = s.seats[(s.state as Connect4State).turn]!;
    games.handle(who, "lig4", "move", { col });
  }
}

beforeEach(() => {
  host = new FakeHost();
  host.pos.set("ana", { x: 1, z: 0 });
  host.pos.set("bruno", { x: -1, z: 0.5 });
  host.pos.set("carla", { x: 0, z: 2 });
  host.names.set("ana", "Ana");
  host.names.set("bruno", "Bruno");
  host.names.set("carla", "Carla");
  games = new GamesManager(MAP, host);
});

describe("GamesManager", () => {
  it("cria uma mesa por objeto com gameId reconhecido", () => {
    const list = games.snapshots();
    expect(list.map((g) => [g.table, g.kind]).sort()).toEqual([
      ["lig4", "connect4"],
      ["xadrez", "chess"],
    ]);
    expect(c4()).toMatchObject({ seats: [null, null], phase: "waiting" });
  });

  it("senta, transmite para todos e começa quando os lugares enchem", () => {
    games.handle("ana", "lig4", "sit", { seat: 0 });
    expect(host.last("lig4")).toMatchObject({ seats: ["ana", null], phase: "waiting" });
    expect((host.last("lig4")!.state as TableState).names).toEqual(["Ana", null]);
    games.handle("bruno", "lig4", "sit", {});
    expect(c4()).toMatchObject({ seats: ["ana", "bruno"], phase: "playing" });
    expect(c4State().round).toBe(1);
    expect(c4State().turn).toBe(0);
  });

  it("recusa sentar longe da mesa, em lugar ocupado ou em mesa inexistente", () => {
    host.pos.set("longe", { x: 4, z: 0 });
    games.handle("longe", "lig4", "sit", {});
    games.handle("sumido", "lig4", "sit", {});
    expect(c4().seats).toEqual([null, null]);

    games.handle("ana", "lig4", "sit", { seat: 0 });
    const before = host.sent.length;
    games.handle("bruno", "lig4", "sit", { seat: 0 });
    games.handle("bruno", "lig4", "sit", { seat: 5 });
    games.handle("bruno", "nada", "sit", {});
    expect(host.sent.length).toBe(before);
    expect(c4().seats).toEqual(["ana", null]);
  });

  it("troca de lugar enquanto espera", () => {
    games.handle("ana", "lig4", "sit", { seat: 0 });
    games.handle("ana", "lig4", "sit", { seat: 1 });
    expect(c4().seats).toEqual([null, "ana"]);
  });

  it("joga em turnos e recusa vez errada, quem não está sentado e lance inválido", () => {
    seatBoth();
    const before = host.sent.length;
    games.handle("bruno", "lig4", "move", { col: 3 }); // não é a vez dele
    games.handle("carla", "lig4", "move", { col: 3 }); // espectadora
    games.handle("ana", "lig4", "move", { col: 9 }); // coluna inexistente
    games.handle("ana", "lig4", "move", "lixo");
    expect(host.sent.length).toBe(before);

    games.handle("ana", "lig4", "move", { col: 3 });
    expect(c4State().last).toEqual({ col: 3, row: 5 });
    expect(c4State().turn).toBe(1);
    games.handle("ana", "lig4", "move", { col: 3 }); // de novo: recusado
    expect(c4State().moves).toBe(1);
  });

  it("vitória encerra a partida e ninguém joga depois", () => {
    seatBoth();
    dropAll([0, 1, 0, 1, 0, 1, 0]);
    expect(c4().phase).toBe("finished");
    expect(c4State()).toMatchObject({ over: true, winner: 0, reason: "line" });
    expect(c4State().line).toHaveLength(4);
    games.handle("bruno", "lig4", "move", { col: 2 });
    expect(c4State().moves).toBe(7);
  });

  it("revanche precisa dos dois e troca os lados", () => {
    seatBoth();
    dropAll([0, 1, 0, 1, 0, 1, 0]);
    games.handle("ana", "lig4", "rematch", undefined);
    expect(c4State().rematch).toEqual([true, false]);
    expect(c4().phase).toBe("finished");
    games.handle("carla", "lig4", "rematch", undefined); // espectadora não vota
    expect(c4State().rematch).toEqual([true, false]);
    games.handle("bruno", "lig4", "rematch", { on: true });
    expect(c4()).toMatchObject({ seats: ["bruno", "ana"], phase: "playing" });
    expect(c4State()).toMatchObject({ moves: 0, over: false, round: 2, rematch: [false, false] });
  });

  it("desistência dá a vitória ao outro", () => {
    seatBoth();
    games.handle("ana", "lig4", "move", { col: 3 });
    games.handle("carla", "lig4", "resign", undefined); // espectadora não desiste por ninguém
    expect(c4().phase).toBe("playing");
    games.handle("ana", "lig4", "resign", undefined);
    expect(c4().phase).toBe("finished");
    expect(c4State()).toMatchObject({ winner: 1, reason: "resign" });
  });

  it("levantar no meio da partida é abandono", () => {
    seatBoth();
    games.handle("bruno", "lig4", "stand", undefined);
    expect(c4()).toMatchObject({ seats: ["ana", null], phase: "finished" });
    expect(c4State()).toMatchObject({ winner: 0, reason: "left" });
    // Outra pessoa senta no lugar vago e começa uma partida nova.
    games.handle("carla", "lig4", "sit", {});
    expect(c4()).toMatchObject({ seats: ["ana", "carla"], phase: "playing" });
    expect(c4State().moves).toBe(0);
  });

  it("sair da sala no meio da partida libera o lugar e o outro vence", () => {
    seatBoth();
    games.handle("ana", "lig4", "move", { col: 2 });
    games.leave("ana");
    expect(c4()).toMatchObject({ seats: [null, "bruno"], phase: "finished" });
    expect(c4State()).toMatchObject({ winner: 1, reason: "left" });
    expect(host.last("lig4")?.seats).toEqual([null, "bruno"]);
    // Bruno levanta: a mesa vazia volta a esperar, com o tabuleiro limpo.
    games.handle("bruno", "lig4", "stand", undefined);
    expect(c4()).toMatchObject({ seats: [null, null], phase: "waiting" });
    expect(c4State().moves).toBe(0);
  });

  it("não senta em outra mesa no meio de uma partida", () => {
    seatBoth();
    host.pos.set("ana", { x: 10, z: 1 });
    games.handle("ana", "xadrez", "sit", {});
    expect(games.snapshots().find((g) => g.table === "xadrez")!.seats).toEqual([null, null]);
  });

  it("sentar em outra mesa sem partida rolando libera o lugar antigo", () => {
    games.handle("ana", "lig4", "sit", {});
    host.pos.set("ana", { x: 10, z: 1 });
    games.handle("ana", "xadrez", "sit", {});
    expect(c4().seats).toEqual([null, null]);
    expect(games.snapshots().find((g) => g.table === "xadrez")!.seats).toEqual(["ana", null]);
  });

  it("libera o lugar de quem foi embora sem levantar (fora de partida)", () => {
    games.handle("ana", "lig4", "sit", {});
    host.pos.set("ana", { x: 30, z: 0 });
    for (let i = 0; i < AWAY_SECONDS * 15 + 2; i++) games.tick(1 / 15);
    expect(c4().seats).toEqual([null, null]);

    // Com partida rolando, ninguém perde o lugar por se afastar.
    host.pos.set("ana", { x: 1, z: 0 });
    seatBoth();
    host.pos.set("ana", { x: 30, z: 0 });
    for (let i = 0; i < AWAY_SECONDS * 15 + 2; i++) games.tick(1 / 15);
    expect(c4()).toMatchObject({ seats: ["ana", "bruno"], phase: "playing" });
  });

  it("xadrez: lances validados no servidor até o xeque-mate", () => {
    host.pos.set("ana", { x: 10, z: 1 });
    host.pos.set("bruno", { x: 9, z: 0 });
    games.handle("ana", "xadrez", "sit", { seat: 0 });
    games.handle("bruno", "xadrez", "sit", { seat: 1 });
    const chess = () => games.snapshots().find((g) => g.table === "xadrez")!;
    games.handle("ana", "xadrez", "move", { from: "e2", to: "e5" }); // ilegal
    games.handle("bruno", "xadrez", "move", { from: "e7", to: "e5" }); // fora da vez
    expect((chess().state as ChessState).moves).toBe(0);
    games.handle("ana", "xadrez", "move", { from: "f2", to: "f3" });
    games.handle("bruno", "xadrez", "move", { from: "e7", to: "e5" });
    games.handle("ana", "xadrez", "move", { from: "g2", to: "g4" });
    games.handle("bruno", "xadrez", "move", { from: "d8", to: "h4" });
    expect(chess().phase).toBe("finished");
    expect(chess().state).toMatchObject({ winner: 1, reason: "checkmate", check: true });
  });
});
