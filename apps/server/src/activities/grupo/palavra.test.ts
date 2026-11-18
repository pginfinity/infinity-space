import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NavGrid,
  PAL_FLAG_MS,
  PAL_GUESS_GAP_MS,
  PAL_HINT_GAP_MS,
  PAL_READY_MS,
  PAL_SKIPS,
  PAL_TURN_END_MS,
  ZoneIndex,
  buildStationMap,
  dist,
  grupoFold,
  wallBetween,
  type PalCardEvent,
  type PalState,
  type Vec2,
} from "@infinity/world";
import type { ActivityHost } from "../types.ts";
import type { Store } from "../../store.ts";
import { PalavraActivity } from "./palavra.ts";

/** Anfitrião falso: pessoas na planta real, eventos gravados e "um jogo por vez" configurável. */
class Host {
  readonly map = buildStationMap();
  readonly nav = NavGrid.fromMap(this.map);
  readonly zones = new ZoneIndex(this.map.zones);
  readonly store = { get: <T>(_k: string, f: T): T => f, set: () => undefined } as unknown as Store;
  readonly pos = new Map<string, Vec2>();
  readonly names = new Map<string, string>();
  events: { ev: string; data: unknown; to?: string[] }[] = [];
  notes: { id: string; text: string }[] = [];
  /** Jogo em que cada pessoa está no meio de uma partida (para o claimSeat). */
  busy = new Map<string, string>();

  api(): ActivityHost {
    return {
      map: this.map,
      nav: this.nav,
      zones: this.zones,
      store: this.store,
      changed: () => undefined,
      event: (_a, ev, data, opts) => void this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) }),
      players: () => [...this.pos.keys()],
      playerName: (id) => this.names.get(id),
      playerPos: (id) => this.pos.get(id),
      playerZone: (id) => {
        const p = this.pos.get(id);
        return p ? this.zones.zoneAt(p) : undefined;
      },
      emote: () => undefined,
      setHeld: () => undefined,
      objects: (t) => this.map.objects.filter((o) => o.type === t),
      claimSeat: (id) => this.busy.get(id) ?? null,
      notify: (id, text) => void this.notes.push({ id, text }),
      near: (id, p, r) => {
        const at = this.pos.get(id);
        return !!at && dist(at, p) <= r && !wallBetween(this.map.walls, at, p);
      },
    };
  }

  add(id: string, name: string, at: Vec2): void {
    this.pos.set(id, at);
    this.names.set(id, name);
  }

  evs(ev: string) {
    return this.events.filter((e) => e.ev === ev);
  }

  /** Última carta mandada e para quem foi. */
  lastCard(): { card: PalCardEvent; to: string[] } {
    const e = this.evs("card").at(-1)!;
    return { card: e.data as PalCardEvent, to: e.to ?? [] };
  }
}

/** Todos os textos de um objeto (para conferir que a carta não está no estado público). */
function texts(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => texts(x, out));
  return out;
}

/**
 * A carta (palavra e proibidas) não aparece em nenhum texto do estado público. As cartas já
 * resolvidas podem aparecer (e uma delas pode ser proibida da carta atual), então ficam de fora,
 * assim como os ids dos temas ("espaco" é tema e também proibida de "astronauta").
 */
function expectHidden(s: PalState, card: PalCardEvent): void {
  const { done: _done, themes: _themes, feed, ...rest } = s;
  const shown = [rest, feed.filter((f) => f.k !== "hit" && f.k !== "skip" && f.k !== "forbidden")];
  const folded = texts(shown).map(grupoFold);
  for (const w of [card.word, ...card.forbidden]) expect(folded).not.toContain(grupoFold(w));
}

const MKT = (i: number) => ({ x: -10 + i * 0.8, z: 6.6 });
const LOBBY = { x: 1, z: 7.5 };

let h: Host;
let pal: PalavraActivity;
const st = () => pal.snapshot() as PalState;
const advance = (ms: number) => {
  vi.advanceTimersByTime(ms);
  pal.tick();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
  h = new Host();
  pal = new PalavraActivity(h.api());
});
afterEach(() => vi.useRealTimers());

describe("Palavra secreta no servidor: dois times", () => {
  const ids = ["a", "b", "c", "d"];
  beforeEach(() => {
    ["Ana", "Bruno", "Caio", "Duda"].forEach((n, i) => h.add(ids[i]!, n, MKT(i)));
    h.add("x", "Xavier", LOBBY);
  });

  function startGame(): void {
    pal.handle("x", "join", {});
    for (const id of ids) pal.handle(id, "join", {});
    pal.handle("a", "config", { seconds: 60, rounds: 1, themes: ["espaco", "brasil"] });
    pal.handle("a", "start", {});
  }

  /** Papéis da vez atual. */
  function roles() {
    const s = st();
    const giver = s.giver!;
    const team = s.team;
    const mates = s.players.filter((p) => p.team === team && p.id !== giver).map((p) => p.id);
    const judges = s.players.filter((p) => p.team !== team).map((p) => p.id);
    return { giver, guesser: mates[0]!, judges };
  }

  it("só quem está no Marketing entra; times equilibrados; só o dono configura e começa", () => {
    pal.handle("x", "join", {});
    expect(st().phase).toBe("idle");
    for (const id of ids) pal.handle(id, "join", {});
    expect(st()).toMatchObject({ phase: "lobby", owner: "a" });
    expect(st().players.map((p) => p.team).sort()).toEqual([0, 0, 1, 1]);
    pal.handle("b", "config", { seconds: 30 });
    expect(st().seconds).toBe(60);
    pal.handle("a", "config", { seconds: 30, rounds: 2, themes: ["espaco"] });
    expect(st()).toMatchObject({ seconds: 30, rounds: 2, themes: ["espaco"] });
    pal.handle("a", "config", { seconds: 45, themes: [] });
    expect(st()).toMatchObject({ seconds: 30, themes: ["espaco"] });
    pal.handle("b", "start", {});
    expect(st().phase).toBe("lobby");
    pal.handle("a", "start", {});
    expect(st()).toMatchObject({ phase: "ready", coop: false, turn: 1, turns: 8, teams: [{ name: "Pulsar" }, { name: "Quasar" }] });
  });

  it("rodada completa: carta escondida, acerto, pulo, proibida, dica barrada e placar", () => {
    startGame();
    const { giver, guesser, judges } = roles();
    const team = st().team;
    // Antes do dicador começar, ninguém recebe carta.
    expect(h.evs("card")).toHaveLength(0);
    pal.handle(guesser, "go", {});
    expect(st().phase).toBe("ready");
    pal.handle(giver, "go", {});
    expect(st()).toMatchObject({ phase: "playing", cardNo: 1, skips: PAL_SKIPS });

    // A carta vai só para o dicador e o time adversário; nunca para quem chuta nem para o estado.
    let { card, to } = h.lastCard();
    expect(to.sort()).toEqual([giver, ...judges].sort());
    expect(to).not.toContain(guesser);
    expect(card.forbidden.length).toBeGreaterThanOrEqual(3);
    expectHidden(st(), card);

    // Quem fiscaliza não chuta; chute errado aparece no feed.
    pal.handle(judges[0]!, "guess", { text: card.word });
    expect(st().teams[team]!.score).toBe(0);
    pal.handle(guesser, "guess", { text: "zzz" });
    expect(st().feed.at(-1)).toMatchObject({ k: "guess", text: "zzz" });

    // Acerto com maiúscula, sem acento e com espaços sobrando: +1 e próxima carta.
    vi.advanceTimersByTime(PAL_GUESS_GAP_MS);
    const shout = `  ${grupoFold(card.word).toUpperCase()}  `;
    pal.handle(guesser, "guess", { text: shout });
    expect(st().teams[team]!.score).toBe(1);
    expect(st()).toMatchObject({ cardNo: 2, gain: 1 });
    expect(st().done).toEqual([{ word: card.word, result: "hit", by: st().players.find((p) => p.id === guesser)!.name }]);
    ({ card, to } = h.lastCard());
    expect(to).not.toContain(guesser);
    expectHidden(st(), card);

    // Dica escrita com palavra proibida não sai (só o dicador fica sabendo); dica limpa vai para o feed.
    const feedBefore = st().feed.length;
    pal.handle(giver, "hint", { text: `pense em ${card.forbidden[0]}` });
    expect(st().feed).toHaveLength(feedBefore);
    const blocked = h.evs("blocked").at(-1)!;
    expect(blocked.to).toEqual([giver]);
    expect([card.word, ...card.forbidden]).toContain((blocked.data as { word: string }).word);
    vi.advanceTimersByTime(PAL_HINT_GAP_MS);
    pal.handle(giver, "hint", { text: "xyzw qwerty" });
    expect(st().feed.at(-1)).toMatchObject({ k: "hint", text: "xyzw qwerty" });
    // Só o dicador dá dica.
    pal.handle(guesser, "hint", { text: "outra" });
    expect(st().feed.at(-1)).toMatchObject({ k: "hint", text: "xyzw qwerty" });

    // Pular: só o dicador, sem perder ponto.
    pal.handle(guesser, "skip", {});
    expect(st().skips).toBe(PAL_SKIPS);
    pal.handle(giver, "skip", {});
    expect(st()).toMatchObject({ skips: PAL_SKIPS - 1, cardNo: 3, gain: 1 });
    expect(st().done.at(-1)).toEqual({ word: card.word, result: "skip" });
    ({ card } = h.lastCard());

    // Proibida!: só quem fiscaliza aponta; enquanto o dicador decide, ninguém chuta nem pula.
    pal.handle(guesser, "flag", {});
    expect(st().flag).toBeNull();
    pal.handle(judges[0]!, "flag", {});
    expect(st().flag).toMatchObject({ by: judges[0] });
    vi.advanceTimersByTime(PAL_GUESS_GAP_MS);
    pal.handle(guesser, "guess", { text: card.word });
    pal.handle(giver, "skip", {});
    expect(st()).toMatchObject({ cardNo: 3, skips: PAL_SKIPS - 1 });
    // Quem decide é o dicador: "não falei" não muda nada.
    pal.handle(judges[0]!, "judge", { ok: true });
    expect(st().flag).not.toBeNull();
    pal.handle(giver, "judge", { ok: false });
    expect(st()).toMatchObject({ flag: null, cardNo: 3, gain: 1 });
    // Segundo apontamento (de outra pessoa) e o dicador confirma: -1 e próxima carta.
    pal.handle(judges[1]!, "flag", {});
    pal.handle(giver, "judge", { ok: true });
    expect(st()).toMatchObject({ flag: null, cardNo: 4, gain: 0 });
    expect(st().teams[team]!.score).toBe(0);
    expect(st().done.at(-1)).toEqual({ word: card.word, result: "forbidden" });

    // Apontamento sem resposta expira e não vale.
    vi.advanceTimersByTime(5000);
    pal.handle(judges[0]!, "flag", {});
    expect(st().flag).not.toBeNull();
    advance(PAL_FLAG_MS + 10);
    expect(st()).toMatchObject({ flag: null, cardNo: 4 });

    // Fim do tempo: a carta da vez é revelada no resumo e a vez passa para o outro time.
    ({ card } = h.lastCard());
    advance(60_000);
    expect(st().phase).toBe("turnEnd");
    expect(st().done.at(-1)).toEqual({ word: card.word, result: "time" });
    advance(PAL_TURN_END_MS + 10);
    expect(st()).toMatchObject({ phase: "ready", turn: 2, team: 1 - team, cardNo: 0, done: [], skips: PAL_SKIPS });
    expect(st().giver).not.toBe(giver);
  });

  it("rodízio: cada um dá dicas uma vez, times alternando, e a partida acaba com o vencedor", () => {
    startGame();
    const givers: string[] = [];
    const teams: number[] = [];
    for (let t = 0; t < 4; t++) {
      const { giver, guesser } = roles();
      givers.push(giver);
      teams.push(st().team);
      // Sem "Começar", a vez começa sozinha.
      advance(PAL_READY_MS + 10);
      expect(st().phase).toBe("playing");
      // O time da primeira vez acerta duas; o outro, uma.
      const hits = t % 2 === 0 ? 2 : 1;
      for (let k = 0; k < hits; k++) {
        vi.advanceTimersByTime(PAL_GUESS_GAP_MS);
        pal.handle(guesser, "guess", { text: h.lastCard().card.word });
      }
      advance(60_000);
      advance(PAL_TURN_END_MS + 10);
    }
    expect(new Set(givers).size).toBe(4);
    expect(teams[0]).not.toBe(teams[1]);
    expect(teams[0]).toBe(teams[2]);
    const s = st();
    expect(s.phase).toBe("final");
    expect(s.teams[teams[0]!]!.score).toBe(4);
    expect(s.teams[teams[1]!]!.score).toBe(2);
    expect(s.winner).toBe(teams[0]);
    expect(h.evs("final").at(-1)!.data).toMatchObject({ winner: s.teams[teams[0]!]!.name, coop: false });
    // Jogar de novo volta ao lobby com as mesmas pessoas e placar zerado.
    pal.handle("b", "again", {});
    expect(st()).toMatchObject({ phase: "lobby", turn: 0 });
    expect(st().players).toHaveLength(4);
    expect(st().teams.every((t) => t.score === 0)).toBe(true);
  });

  it("nenhuma carta da partida vaza para quem chuta (todas as vezes)", () => {
    startGame();
    for (let t = 0; t < 4; t++) {
      const { giver, guesser } = roles();
      pal.handle(giver, "go", {});
      for (let k = 0; k < 6; k++) {
        const { card, to } = h.lastCard();
        expect(to).not.toContain(guesser);
        expect(to).toContain(giver);
        expectHidden(st(), card);
        vi.advanceTimersByTime(PAL_GUESS_GAP_MS);
        pal.handle(guesser, "guess", { text: card.word });
      }
      // Pedir a carta de novo ("sync") não adianta para quem chuta.
      const before = h.evs("card").length;
      pal.handle(guesser, "sync", {});
      expect(h.evs("card")).toHaveLength(before);
      pal.handle(giver, "sync", {});
      expect(h.lastCard().to).toEqual([giver]);
      advance(60_000);
      advance(PAL_TURN_END_MS + 10);
    }
    expect(st().phase).toBe("final");
  });

  it("dicador cai no meio da vez: a vez acaba; volta com o mesmo nome e o mesmo time", () => {
    // Seis pessoas (3 contra 3): sem o dicador, o time dele ainda joga.
    h.add("e", "Eva", MKT(4));
    h.add("f", "Fabi", MKT(5));
    for (const id of [...ids, "e", "f"]) pal.handle(id, "join", {});
    pal.handle("a", "start", {});
    expect(st().turns).toBe(6);
    const { giver } = roles();
    const myTeam = st().players.find((p) => p.id === giver)!.team;
    pal.handle(giver, "go", {});
    pal.leave(giver);
    expect(st().phase).toBe("turnEnd");
    expect(st().players.find((p) => p.id === giver)?.away).toBe(true);
    // Volta (novo id, mesmo nome) e continua no mesmo time.
    const name = h.names.get(giver)!;
    h.add("novo", name, MKT(0));
    pal.handle("novo", "join", {});
    expect(st().players.find((p) => p.id === "novo")).toMatchObject({ name, team: myTeam });
    expect(st().players).toHaveLength(6);
    expect(st().players.filter((p) => p.away)).toHaveLength(0);
  });

  it("time sem gente para chutar encerra a partida", () => {
    startGame();
    const { giver } = roles();
    pal.handle(giver, "go", {});
    const other = st().players.find((p) => p.team !== st().team)!.id;
    pal.handle(other, "leave", {});
    expect(st().phase).toBe("final");
  });

  it("um jogo por vez: no meio de outra partida não entra; aqui no meio da vez, não larga", () => {
    h.busy.set("a", "Lig 4");
    pal.handle("a", "join", {});
    expect(st().phase).toBe("idle");
    expect(h.notes.at(-1)).toMatchObject({ id: "a", text: expect.stringContaining("Lig 4") });
    h.busy.clear();
    pal.handle("a", "join", {});
    pal.handle("b", "join", {});
    // No lobby: está sentado aqui, mas pode ir para outro jogo (sai da mesa).
    expect(pal.seatLabel("a")).toBe("Palavra secreta");
    expect(pal.inMatchFor("a")).toBe(false);
    pal.releaseSeat("b");
    expect(st().players.map((p) => p.id)).toEqual(["a"]);
    pal.handle("b", "join", {});
    pal.handle("c", "join", {});
    pal.handle("a", "start", {});
    // Com a partida rolando, não larga.
    expect(pal.inMatchFor("b")).toBe(true);
    pal.releaseSeat("b");
    expect(st().players).toHaveLength(3);
    expect(pal.seatLabel("x")).toBeNull();
  });
});

describe("Palavra secreta no servidor: três pessoas, um time só", () => {
  beforeEach(() => {
    ["Ana", "Bruno", "Caio"].forEach((n, i) => h.add("abc"[i]!, n, MKT(i)));
  });

  it("cooperativo: só o dicador vê a carta, ninguém aponta proibida, todo mundo dá dicas uma vez", () => {
    pal.handle("a", "join", {});
    pal.handle("b", "join", {});
    pal.handle("a", "start", {});
    expect(st().phase).toBe("lobby"); // precisa de 3
    pal.handle("c", "join", {});
    pal.handle("a", "start", {});
    expect(st()).toMatchObject({ phase: "ready", coop: true, turns: 3, teams: [{ name: "Nebulosa", score: 0 }] });
    const givers: string[] = [];
    for (let t = 0; t < 3; t++) {
      const s = st();
      const giver = s.giver!;
      givers.push(giver);
      const others = s.players.filter((p) => p.id !== giver).map((p) => p.id);
      pal.handle(giver, "go", {});
      const { card, to } = h.lastCard();
      expect(to).toEqual([giver]);
      expectHidden(st(), card);
      pal.handle(others[0]!, "flag", {});
      expect(st().flag).toBeNull();
      // Os dois chutam; qualquer um acerta.
      pal.handle(others[1]!, "guess", { text: card.word });
      expect(st().teams[0]!.score).toBe(t + 1);
      advance(60_000);
      advance(PAL_TURN_END_MS + 10);
    }
    expect(new Set(givers).size).toBe(3);
    expect(st()).toMatchObject({ phase: "final", winner: null });
    expect(st().teams[0]!.score).toBe(3);
  });
});
