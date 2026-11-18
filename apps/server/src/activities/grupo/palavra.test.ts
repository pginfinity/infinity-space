import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NavGrid,
  PAL_COOP_NAME,
  PAL_FLAG_MS,
  PAL_GUESS_GAP_MS,
  PAL_HINT_GAP_MS,
  PAL_MAX_CARDS,
  PAL_MAX_THEMES,
  PAL_READY_MS,
  PAL_SKIPS,
  PAL_TURN_END_MS,
  ZoneIndex,
  buildStationMap,
  dist,
  grupoFold,
  palRole,
  palSeedBank,
  wallBetween,
  type PalBank,
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
  /** Store em memória (como o de verdade: o mesmo objeto pode ser lido por uma atividade nova, "depois de reiniciar"). */
  readonly data: Map<string, unknown>;
  readonly store: Store;
  constructor(data = new Map<string, unknown>()) {
    this.data = data;
    this.store = {
      get: <T>(k: string, f: T): T => (data.has(k) ? (JSON.parse(JSON.stringify(data.get(k))) as T) : f),
      set: <T>(k: string, v: T): void => void data.set(k, JSON.parse(JSON.stringify(v ?? null))),
    } as unknown as Store;
  }
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
      // Cópia do que foi mandado (como na rede): mudanças depois do envio não alteram o evento.
      event: (_a, ev, data, opts) => void this.events.push({ ev, data: JSON.parse(JSON.stringify(data ?? null)), ...(opts?.to ? { to: [...opts.to] } : {}) }),
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
 * assim como os temas (ids e nomes: "espaco" é tema e também proibida de "astronauta").
 */
function expectHidden(s: PalState, card: PalCardEvent): void {
  const { done: _done, themes: _themes, catalog: _catalog, feed, ...rest } = s;
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

describe("Palavra secreta no servidor: editor de cartas", () => {
  const FAR = { x: -8.6, z: 0.5 };
  const CARD = { word: "Titanic", forbidden: ["navio", "iceberg", "afundar", "Jack"] };
  /** Último banco mandado (e para quem). */
  const lastBank = () => {
    const e = h.evs("bank").at(-1)!;
    return { bank: e.data as PalBank, to: e.to };
  };
  const lastError = () => h.evs("bankError").at(-1);
  const themeId = (label: string) => st().catalog.find((t) => t.label === label)!.id;
  const count = (label: string) => st().catalog.find((t) => t.label === label)?.count;

  beforeEach(() => {
    ["Ana", "Bruno", "Caio", "Duda"].forEach((n, i) => h.add("abcd"[i]!, n, MKT(i)));
    h.add("f", "Fábio", FAR);
    h.add("x", "Xavier", LOBBY);
  });

  it("só perto do painel e sem partida; o banco vai só para quem pediu", () => {
    expect(h.zones.zoneAt(FAR)?.id).toBe("marketing");
    pal.handle("f", "bank", {});
    pal.handle("x", "bank", {});
    expect(h.evs("bank")).toHaveLength(0);
    expect(h.evs("bankError").map((e) => [e.to, e.data])).toEqual([
      [["f"], { reason: "near" }],
      [["x"], { reason: "near" }],
    ]);
    // De longe, nada muda.
    pal.handle("f", "themeAdd", { label: "Filmes" });
    expect(st().catalog).toHaveLength(5);
    pal.handle("a", "bank", {});
    const { bank, to } = lastBank();
    expect(to).toEqual(["a"]);
    expect(bank.themes).toHaveLength(5);
    expect(bank.themes.flatMap((t) => t.cards)).toHaveLength(150);
    // O estado público tem só o resumo dos temas (nome e quantas cartas).
    expect(st().catalog.map((t) => t.count)).toEqual([30, 30, 30, 30, 30]);
    expect(Object.keys(st().catalog[0]!).sort()).toEqual(["count", "id", "label"]);
    // Operação desconhecida não responde nada.
    const before = h.events.length;
    pal.handle("a", "bankDump", {});
    expect(h.events).toHaveLength(before);
  });

  it("cria, edita, move e apaga cartas e temas, com validação no servidor", () => {
    pal.handle("a", "themeAdd", { label: "x" });
    expect(lastError()).toMatchObject({ to: ["a"], data: { reason: "label" } });
    pal.handle("a", "themeAdd", { label: "  ESPACO " });
    expect(lastError()!.data).toEqual({ reason: "themeDup" });
    pal.handle("a", "themeAdd", { label: "Filmes" });
    const filmes = themeId("Filmes");
    expect(count("Filmes")).toBe(0);
    // Todos os temas estavam escolhidos: o novo entra na escolha.
    expect(st().themes).toContain(filmes);

    // Carta: o servidor confere tudo (o cliente só avisa antes).
    const save = (data: Record<string, unknown>) => pal.handle("a", "cardSave", { theme: filmes, ...data });
    save({ ...CARD, forbidden: ["navio", "iceberg", "afundar"] });
    expect(lastError()!.data).toEqual({ reason: "forbidden" });
    save({ ...CARD, forbidden: ["navio", "iceberg", "Navio", "Jack"] });
    expect(lastError()!.data).toEqual({ reason: "repeat" });
    save({ ...CARD, forbidden: ["navio", "iceberg", "titanic", "Jack"] });
    expect(lastError()!.data).toEqual({ reason: "repeat" });
    save({ ...CARD, word: "Quasar" });
    expect(lastError()!.data).toEqual({ reason: "reserved" });
    save({ ...CARD, word: "" });
    expect(lastError()!.data).toEqual({ reason: "word" });
    expect(count("Filmes")).toBe(0);
    save(CARD);
    expect(count("Filmes")).toBe(1);
    let card = lastBank().bank.themes.find((t) => t.id === filmes)!.cards[0]!;
    expect(card).toMatchObject(CARD);
    // A carta nunca aparece no estado público.
    expect(JSON.stringify(st())).not.toContain("Titanic");
    // Repetida no mesmo tema (sem acento nem maiúscula), não.
    save({ ...CARD, word: "  TITANIC " });
    expect(lastError()!.data).toEqual({ reason: "duplicate" });
    // Tema que não existe: nada acontece.
    const n = h.events.length;
    pal.handle("a", "cardSave", { ...CARD, theme: "nao-existe" });
    expect(h.events).toHaveLength(n);

    // Editar a própria carta (mesma palavra) vale; ela continua uma só.
    save({ ...CARD, id: card.id, forbidden: ["navio", "gelo", "afundar", "Rose"] });
    card = lastBank().bank.themes.find((t) => t.id === filmes)!.cards[0]!;
    expect(card.forbidden).toEqual(["navio", "gelo", "afundar", "Rose"]);
    expect(count("Filmes")).toBe(1);
    // Mudar de tema: sai de Filmes e entra em Espaço.
    pal.handle("a", "cardSave", { ...CARD, id: card.id, theme: "espaco" });
    expect(count("Filmes")).toBe(0);
    expect(count("Espaço")).toBe(31);
    pal.handle("a", "cardDelete", { id: card.id });
    expect(count("Espaço")).toBe(30);

    // Renomear (sem repetir nome de outro tema) e apagar tema.
    pal.handle("a", "themeRename", { id: filmes, label: "cultura BRASILEIRA" });
    expect(lastError()!.data).toEqual({ reason: "themeDup" });
    pal.handle("a", "themeRename", { id: filmes, label: "Cinema" });
    expect(st().catalog.find((t) => t.id === filmes)!.label).toBe("Cinema");
    // Com a mesa aberta (lobby), a dona escolhe só o tema novo e depois o apaga.
    pal.handle("a", "join", {});
    pal.handle("a", "config", { themes: [filmes] });
    expect(st().themes).toEqual([filmes]);
    pal.handle("a", "themeDelete", { id: filmes });
    expect(st().catalog.some((t) => t.id === filmes)).toBe(false);
    // A escolha da mesa ficou vazia: volta a ter todos os temas.
    expect(st().themes).toEqual(st().catalog.map((t) => t.id));
    // Toda resposta do editor foi só para quem editou.
    expect(h.evs("bank").every((e) => e.to?.length === 1 && e.to[0] === "a")).toBe(true);
    expect(h.evs("bankError").every((e) => e.to?.length === 1 && e.to[0] === "a")).toBe(true);
  });

  it("limites: temas, cartas por tema e o último tema não sai", () => {
    for (let i = st().catalog.length; i < PAL_MAX_THEMES; i++) pal.handle("a", "themeAdd", { label: `Tema ${i}` });
    expect(st().catalog).toHaveLength(PAL_MAX_THEMES);
    pal.handle("a", "themeAdd", { label: "Mais um" });
    expect(lastError()!.data).toEqual({ reason: "full" });
    const t = st().catalog.at(-1)!.id;
    for (let i = 0; i < PAL_MAX_CARDS; i++) pal.handle("a", "cardSave", { theme: t, word: `palavra ${i}`, forbidden: ["um", "dois", "tres", "quatro"] });
    expect(st().catalog.at(-1)!.count).toBe(PAL_MAX_CARDS);
    pal.handle("a", "cardSave", { theme: t, word: "sobrando", forbidden: ["um", "dois", "tres", "quatro"] });
    expect(lastError()!.data).toEqual({ reason: "full" });
    // Mover para um tema cheio também não.
    const lua = lastBank().bank.themes.find((x) => x.id === "espaco")!.cards[0]!;
    pal.handle("a", "cardSave", { theme: t, id: lua.id, word: lua.word, forbidden: lua.forbidden });
    expect(lastError()!.data).toEqual({ reason: "full" });
    for (const x of st().catalog.slice(1)) pal.handle("a", "themeDelete", { id: x.id });
    expect(st().catalog).toHaveLength(1);
    pal.handle("a", "themeDelete", { id: st().catalog[0]!.id });
    expect(lastError()!.data).toEqual({ reason: "lastTheme" });
    expect(st().catalog).toHaveLength(1);
  });

  it("banco salvo no store sobrevive ao reinício; restaurar volta às 150 originais", () => {
    expect(h.data.has("grupo/palavra-banco")).toBe(false);
    pal.handle("a", "themeAdd", { label: "Filmes" });
    pal.handle("a", "cardSave", { ...CARD, theme: themeId("Filmes") });
    pal.handle("a", "cardDelete", { id: "espaco-1" });
    expect(h.data.get("grupo/palavra-banco")).toMatchObject({ version: 1 });

    // "Reinício": atividade nova, mesmo store.
    let again = new PalavraActivity(h.api());
    let s = again.snapshot() as PalState;
    expect(s.catalog.map((t) => [t.label, t.count])).toContainEqual(["Filmes", 1]);
    expect(s.catalog.find((t) => t.id === "espaco")!.count).toBe(29);
    again.handle("a", "bank", {});
    expect(lastBank().bank.themes.find((t) => t.label === "Filmes")!.cards[0]).toMatchObject(CARD);

    // Restaurar: as 150 originais, e nada guardado (vale o banco do código).
    again.handle("a", "bankReset", {});
    const { bank, to } = lastBank();
    expect(to).toEqual(["a"]);
    expect(bank).toEqual(palSeedBank());
    expect(h.data.get("grupo/palavra-banco")).toBeNull();
    again = new PalavraActivity(h.api());
    s = again.snapshot() as PalState;
    expect(s.catalog.map((t) => t.count)).toEqual([30, 30, 30, 30, 30]);

    // Arquivo estragado: volta ao original sem quebrar.
    h.data.set("grupo/palavra-banco", { themes: "lixo" });
    s = new PalavraActivity(h.api()).snapshot() as PalState;
    expect(s.catalog).toHaveLength(5);
  });

  it("a partida usa o banco editado: tema novo com uma carta vai para quem dá as dicas", () => {
    pal.handle("a", "themeAdd", { label: "Vazio" });
    pal.handle("a", "themeAdd", { label: "Filmes" });
    pal.handle("a", "cardSave", { ...CARD, theme: themeId("Filmes") });
    for (const id of "abc") pal.handle(id, "join", {});
    // Só um tema sem cartas: não começa.
    pal.handle("a", "config", { themes: [themeId("Vazio")] });
    pal.handle("a", "start", {});
    expect(st().phase).toBe("lobby");
    pal.handle("a", "config", { themes: [themeId("Filmes")] });
    pal.handle("a", "start", {});
    expect(st().phase).toBe("ready");
    const giver = st().giver!;
    pal.handle(giver, "go", {});
    const { card, to } = h.lastCard();
    expect(to).toEqual([giver]);
    expect(card).toMatchObject({ word: "Titanic", forbidden: CARD.forbidden, theme: themeId("Filmes"), themeLabel: "Filmes" });
    expectHidden(st(), card);
    // Acertou: com uma carta só, ela volta.
    const guesser = st().players.find((p) => p.id !== giver)!.id;
    pal.handle(guesser, "guess", { text: "titanic" });
    expect(st().teams[0]!.score).toBe(1);
    expect(h.lastCard().card.word).toBe("Titanic");
  });

  it("não vaza: no meio da partida ninguém recebe o banco, nem quem chuta", () => {
    for (const id of "abcd") pal.handle(id, "join", {});
    // No lobby, quem está perto pode abrir o editor.
    pal.handle("b", "bank", {});
    expect(lastBank().to).toEqual(["b"]);
    pal.handle("a", "start", {});
    const banks = h.evs("bank").length;
    const ops: [string, Record<string, unknown>][] = [
      ["bank", {}],
      ["themeAdd", { label: "Filmes" }],
      ["cardSave", { ...CARD, theme: "espaco" }],
      ["cardDelete", { id: "espaco-1" }],
      ["themeDelete", { id: "espaco" }],
      ["bankReset", {}],
    ];
    // Todo mundo (quem joga, quem está longe, quem está fora) tenta tudo: só recebe "partida em andamento".
    const tryAll = () => {
      for (const id of "abcdfx")
        for (const [op, data] of ops) {
          pal.handle(id, op, data);
          expect(lastError()).toEqual({ ev: "bankError", data: { reason: "playing" }, to: [id] });
        }
    };
    for (let t = 0; t < 4; t++) {
      const s = st();
      const giver = s.giver!;
      const guesser = s.players.find((p) => p.team === s.team && p.id !== giver)!.id;
      tryAll(); // pronto para começar
      pal.handle(giver, "go", {});
      tryAll(); // vez rolando
      // Quem chuta, especificamente, pede o banco: nada chega.
      pal.handle(guesser, "bank", {});
      expect(h.evs("bank")).toHaveLength(banks);
      advance(60_000);
      tryAll(); // resumo da vez
      advance(PAL_TURN_END_MS + 10);
    }
    expect(st().phase).toBe("final");
    expect(h.evs("bank")).toHaveLength(banks);
    // Nada mudou no banco durante a partida.
    expect(st().catalog.map((t) => t.count)).toEqual([30, 30, 30, 30, 30]);
    // Nenhum evento para todos (sem destinatário) leva a lista de cartas.
    const broadcast = h.events.filter((e) => !e.to);
    expect(broadcast.some((e) => JSON.stringify(e.data).includes('"cards"'))).toBe(false);
    // Acabou a partida: o editor volta a funcionar.
    pal.handle("a", "bank", {});
    expect(lastBank().to).toEqual(["a"]);
  });
});

describe("Palavra secreta no servidor: cooperativo com 4 ou mais", () => {
  const ids = ["a", "b", "c", "d", "e"];
  beforeEach(() => {
    ["Ana", "Bruno", "Caio", "Duda", "Eva"].forEach((n, i) => h.add(ids[i]!, n, MKT(i)));
    for (const id of ids) pal.handle(id, "join", {});
  });

  it("o dono escolhe todos juntos: um time só, só o dicador vê a carta, ninguém fiscaliza", () => {
    expect(st().mode).toBe("teams");
    pal.handle("b", "config", { mode: "coop" });
    expect(st().mode).toBe("teams");
    pal.handle("a", "config", { mode: "solo" });
    expect(st().mode).toBe("teams");
    pal.handle("a", "config", { mode: "coop", seconds: 30 });
    expect(st()).toMatchObject({ mode: "coop", seconds: 30 });
    pal.handle("a", "start", {});
    expect(st()).toMatchObject({ phase: "ready", coop: true, turns: 5, teams: [{ name: PAL_COOP_NAME, score: 0 }] });
    expect(st().players.every((p) => p.team === 0)).toBe(true);
    const givers: string[] = [];
    for (let t = 0; t < 5; t++) {
      const giver = st().giver!;
      givers.push(giver);
      const others = st().players.filter((p) => p.id !== giver).map((p) => p.id);
      pal.handle(giver, "go", {});
      const { card, to } = h.lastCard();
      expect(to).toEqual([giver]);
      expectHidden(st(), card);
      // Todo mundo chuta; ninguém aponta "Proibida!".
      for (const o of others) expect(palRole(st(), o)).toBe("guesser");
      pal.handle(others[0]!, "flag", {});
      expect(st().flag).toBeNull();
      pal.handle(others[t % others.length]!, "guess", { text: card.word });
      expect(st().teams[0]!.score).toBe(t + 1);
      advance(30_000);
      advance(PAL_TURN_END_MS + 10);
    }
    expect(new Set(givers).size).toBe(5);
    expect(st()).toMatchObject({ phase: "final", coop: true, winner: null });
    expect(h.evs("final").at(-1)!.data).toMatchObject({ coop: true, winner: null });

    // Jogar de novo: o modo continua; voltando a dois times, os times saem equilibrados.
    pal.handle("c", "again", {});
    expect(st()).toMatchObject({ phase: "lobby", mode: "coop" });
    pal.handle("a", "config", { mode: "teams" });
    const sizes = [0, 1].map((t) => st().players.filter((p) => p.team === t).length).sort();
    expect(sizes).toEqual([2, 3]);
    pal.handle("a", "start", {});
    expect(st()).toMatchObject({ coop: false, turns: 6 });
  });

  it("com 3 pessoas, dois times não vale: a partida é cooperativa", () => {
    pal.handle("d", "leave", {});
    pal.handle("e", "leave", {});
    expect(st().mode).toBe("teams");
    pal.handle("a", "start", {});
    expect(st()).toMatchObject({ coop: true, turns: 3 });
  });
});
