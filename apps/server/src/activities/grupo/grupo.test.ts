import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NavGrid,
  QUIZ_READY_MS,
  STOP_GRACE_MS,
  STOP_SPIN_MS,
  ZoneIndex,
  buildStationMap,
  dist,
  wallBetween,
  type DrawState,
  type QuizBank,
  type QuizState,
  type StopState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";
import type { Store } from "../../store.ts";
import create from "./index.ts";

/** Anfitrião falso: pessoas com posição na planta real, eventos e estado gravados. */
class Host {
  readonly map = buildStationMap();
  readonly nav = NavGrid.fromMap(this.map);
  readonly zones = new ZoneIndex(this.map.zones);
  readonly data = new Map<string, unknown>();
  readonly store = {
    get: <T>(k: string, f: T): T => (this.data.has(k) ? (this.data.get(k) as T) : f),
    set: <T>(k: string, v: T): void => void this.data.set(k, v),
  } as unknown as Store;
  readonly pos = new Map<string, Vec2>();
  readonly names = new Map<string, string>();
  events: { act: string; ev: string; data: unknown; to?: string[] }[] = [];
  emotes: { id: string; e: string }[] = [];
  changes = 0;

  api(): ActivityHost {
    return {
      map: this.map,
      nav: this.nav,
      zones: this.zones,
      store: this.store,
      changed: () => void this.changes++,
      event: (act, ev, data, opts) => void this.events.push({ act: act.id, ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) }),
      players: () => [...this.pos.keys()],
      playerName: (id) => this.names.get(id),
      playerPos: (id) => this.pos.get(id),
      playerZone: (id) => {
        const p = this.pos.get(id);
        return p ? this.zones.zoneAt(p) : undefined;
      },
      emote: (id, e) => void this.emotes.push({ id, e }),
      setHeld: () => undefined,
      objects: (t) => this.map.objects.filter((o) => o.type === t),
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

  evs(ev: string): { act: string; ev: string; data: unknown; to?: string[] }[] {
    return this.events.filter((e) => e.ev === ev);
  }
}

let h: Host;
let acts: Activity[];
const get = (id: string) => acts.find((a) => a.id === id)!;
const tick = () => acts.forEach((a) => a.tick?.(1 / 15));
const advance = (ms: number) => {
  vi.advanceTimersByTime(ms);
  tick();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T15:00:00Z"));
  h = new Host();
  acts = create(h.api());
});
afterEach(() => vi.useRealTimers());

const STAGE = { x: 24.5, z: 17 };
const AUD = (i: number) => ({ x: 12 + i, z: 15 });
const LOBBY = { x: 1, z: 7.5 };

describe("Quiz Show no servidor", () => {
  const quiz = () => get("quiz");
  const st = () => quiz().snapshot() as QuizState;

  beforeEach(() => {
    h.add("host", "Helena", STAGE);
    h.add("a", "Ana", AUD(0));
    h.add("b", "Bruno", AUD(1));
    h.add("c", "Caio", AUD(2));
    h.add("x", "Xavier", LOBBY);
  });

  it("só quem está no palco abre; só quem está no auditório entra", () => {
    quiz().handle("a", "open", {});
    expect(st().phase).toBe("idle");
    quiz().handle("host", "open", {});
    expect(st()).toMatchObject({ phase: "lobby", host: { id: "host", name: "Helena" } });
    for (const id of ["a", "b", "c", "x", "host"]) quiz().handle(id, "join", {});
    expect(st().players.map((p) => p.name)).toEqual(["Ana", "Bruno", "Caio"]);
    // Só o apresentador configura.
    quiz().handle("a", "config", { seconds: 10 });
    expect(st().seconds).toBe(20);
    quiz().handle("host", "config", { seconds: 10, count: 5, pack: "brasil" });
    expect(st()).toMatchObject({ seconds: 10, count: 5, pack: { id: "brasil" } });
  });

  it("partida completa: resposta certa só para o apresentador, pontos por velocidade e placar final", () => {
    quiz().handle("host", "open", {});
    for (const id of ["a", "b", "c"]) quiz().handle(id, "join", {});
    quiz().handle("host", "config", { count: 5, seconds: 20 });
    quiz().handle("host", "start", {});
    expect(st()).toMatchObject({ phase: "ready", question: { n: 1, total: 5, options: [] } });
    advance(QUIZ_READY_MS + 10);
    expect(st().phase).toBe("question");
    expect(st().question!.options).toHaveLength(4);
    // A resposta certa nunca vai no estado público.
    expect(JSON.stringify(st())).not.toContain("correct\":");
    const key = h.evs("key").at(-1)!;
    expect(key.to).toEqual(["host"]);
    const correct = (key.data as { correct: number }).correct;
    const wrong = (correct + 1) % 4;

    quiz().handle("a", "answer", { n: 1, choice: correct });
    quiz().handle("a", "answer", { n: 1, choice: wrong }); // segunda resposta ignorada
    advance(6000);
    quiz().handle("b", "answer", { n: 1, choice: correct });
    quiz().handle("x", "answer", { n: 1, choice: correct }); // não está no quiz
    expect(st().answered).toBe(2);
    quiz().handle("c", "answer", { n: 1, choice: wrong });
    // Todos responderam: revela sozinho.
    expect(st().phase).toBe("reveal");
    expect(st().reveal).toEqual({ correct, counts: [0, 1, 2, 3].map((i) => (i === correct ? 2 : i === wrong ? 1 : 0)) });
    const [a, b, c] = st().players;
    expect(a!.gain).toBe(1000);
    expect(b!.gain).toBeLessThan(a!.gain);
    expect(b!.gain).toBeGreaterThan(500);
    expect(c!.gain).toBe(0);
    expect(h.emotes.filter((e) => e.e === "cheer").map((e) => e.id)).toEqual(["a", "b"]);

    // Só o apresentador avança.
    quiz().handle("a", "next", {});
    expect(st().phase).toBe("reveal");
    for (let n = 2; n <= 5; n++) {
      quiz().handle("host", "next", {});
      expect(st().question!.n).toBe(n);
      advance(QUIZ_READY_MS + 10);
      // Ninguém responde: o tempo acaba e revela.
      advance(20_000);
      expect(st().phase).toBe("reveal");
    }
    quiz().handle("host", "next", {});
    expect(st().phase).toBe("final");
    expect(h.evs("final").at(-1)!.data).toMatchObject({ winner: "Ana" });
    quiz().handle("host", "end", {});
    expect(st().phase).toBe("idle");
  });

  it("apresentador pode revelar antes e encerrar no meio (vai para o placar)", () => {
    quiz().handle("host", "open", {});
    quiz().handle("a", "join", {});
    quiz().handle("host", "start", {});
    advance(QUIZ_READY_MS + 10);
    quiz().handle("host", "reveal", {});
    expect(st().phase).toBe("reveal");
    quiz().handle("host", "end", {});
    expect(st().phase).toBe("final");
  });

  it("quem cai e volta com o mesmo nome recupera os pontos", () => {
    quiz().handle("host", "open", {});
    quiz().handle("a", "join", {});
    quiz().handle("b", "join", {});
    quiz().handle("host", "start", {});
    advance(QUIZ_READY_MS + 10);
    const correct = (h.evs("key").at(-1)!.data as { correct: number }).correct;
    quiz().handle("a", "answer", { n: 1, choice: correct });
    quiz().handle("host", "reveal", {});
    const score = st().players[0]!.score;
    h.pos.delete("a");
    quiz().leave!("a");
    expect(st().players[0]!.away).toBe(true);
    h.add("a2", "Ana", AUD(0));
    quiz().handle("a2", "join", {});
    expect(st().players[0]).toMatchObject({ id: "a2", score });
    expect(st().players[0]!.away).toBeUndefined();
  });

  it("banco de perguntas: edita do palco, valida e guarda", () => {
    quiz().handle("a", "packAdd", { title: "Onboarding" });
    expect(h.evs("bankError").at(-1)).toMatchObject({ to: ["a"], data: { reason: "stage" } });
    quiz().handle("host", "packAdd", { title: "Onboarding" });
    let bank = h.evs("bank").at(-1)!.data as QuizBank;
    const pack = bank.packs.find((p) => p.title === "Onboarding")!;
    expect(pack).toBeTruthy();
    quiz().handle("host", "qSave", { pack: pack.id, text: "Qual é a cor da nossa marca?", options: ["Laranja", "Verde", "Roxo", "Laranja"], correct: 0 });
    expect(h.evs("bankError").at(-1)!.data).toEqual({ reason: "duplicate" });
    quiz().handle("host", "qSave", { pack: pack.id, text: "Qual é a cor de destaque da marca?", options: ["Laranja", "Verde", "Roxo", "Cinza"], correct: 0 });
    bank = h.evs("bank").at(-1)!.data as QuizBank;
    const q = bank.packs.find((p) => p.id === pack.id)!.questions[0]!;
    expect(q.text).toBe("Qual é a cor de destaque da marca?");
    quiz().handle("host", "qSave", { pack: pack.id, id: q.id, text: "Qual é a cor de destaque?", options: ["Laranja", "Verde", "Roxo", "Cinza"], correct: 0 });
    bank = h.evs("bank").at(-1)!.data as QuizBank;
    expect(bank.packs.find((p) => p.id === pack.id)!.questions).toHaveLength(1);
    expect((st().packs.find((p) => p.id === pack.id) ?? { count: 0 }).count).toBe(1);
    // Guardado no store (sobrevive a reinício).
    expect((h.data.get("grupo/quiz-banco") as QuizBank).packs.some((p) => p.id === pack.id)).toBe(true);
    quiz().handle("host", "qDelete", { pack: pack.id, id: q.id });
    quiz().handle("host", "packDelete", { id: pack.id });
    bank = h.evs("bank").at(-1)!.data as QuizBank;
    expect(bank.packs.some((p) => p.id === pack.id)).toBe(false);
  });
});

describe("Desenhe e adivinhe no servidor", () => {
  const ORBITA = (i: number) => ({ x: -23 + i, z: -2.5 });
  let id: string;
  const draw = () => get(id);
  const st = () => draw().snapshot() as DrawState;

  beforeEach(() => {
    const board = h.map.objects.find((o) => o.type === "whiteboard" && o.zoneId === "orbita")!;
    id = `desenho-${board.id}`;
    h.add("a", "Ana", ORBITA(0));
    h.add("b", "Bruno", ORBITA(1));
    h.add("c", "Caio", ORBITA(2));
    h.add("x", "Xavier", LOBBY);
  });

  it("cada quadro branco vira um jogo; só quem está na sala entra", () => {
    expect(acts.filter((a) => a.kind === "drawguess").length).toBe(h.map.objects.filter((o) => o.type === "whiteboard").length);
    draw().handle("x", "join", {});
    expect(st().phase).toBe("idle");
    draw().handle("a", "join", {});
    draw().handle("b", "join", {});
    expect(st()).toMatchObject({ phase: "lobby", owner: "a", zone: "orbita" });
    expect(st().players.map((p) => p.name)).toEqual(["Ana", "Bruno"]);
  });

  it("vez completa: palavra só para quem desenha, 'quase' só para quem chutou, pontos para os dois", () => {
    for (const p of ["a", "b", "c"]) draw().handle(p, "join", {});
    draw().handle("a", "config", { rounds: 1, seconds: 60 });
    draw().handle("a", "start", {});
    expect(st()).toMatchObject({ phase: "choosing", drawer: "a", round: 1 });
    const choices = h.evs("choices").at(-1)!;
    expect(choices.to).toEqual(["a"]);
    draw().handle("a", "choose", { i: 1 });
    expect(st().phase).toBe("drawing");
    const word = (h.evs("word").at(-1)!.data as { word: string }).word;
    expect(h.evs("word").at(-1)!.to).toEqual(["a"]);
    expect(JSON.stringify(st())).not.toContain(word);
    expect(st().hint.length).toBe(word.length);

    // Traços: só quem desenha.
    draw().handle("b", "begin", { s: 1, c: 0, w: 1, p: [10, 10, 20, 20] });
    expect(h.evs("begin")).toHaveLength(0);
    draw().handle("a", "begin", { s: 1, c: 0, w: 1, p: [10, 10, 20, 20] });
    draw().handle("a", "pts", { s: 1, p: [30, 30] });
    expect(h.evs("begin")).toHaveLength(1);
    expect(h.evs("pts")).toHaveLength(1);
    draw().handle("x", "sync", {});
    expect(h.evs("canvas").at(-1)).toMatchObject({ to: ["x"], data: { strokes: [{ s: 1, p: [10, 10, 20, 20, 30, 30] }] } });

    // Chute errado aparece no feed; perto vai só para quem chutou.
    draw().handle("b", "guess", { text: "zzzzzz" });
    expect(st().feed.at(-1)).toMatchObject({ k: "guess", name: "Bruno", text: "zzzzzz" });
    vi.advanceTimersByTime(1000);
    const close = word.length >= 4 ? word.slice(0, -1) + (word.endsWith("x") ? "y" : "x") : null;
    if (close) {
      draw().handle("b", "guess", { text: close });
      expect(h.evs("close").at(-1)).toMatchObject({ to: ["b"] });
      expect(st().feed.at(-1)!.text).not.toBe(close);
      vi.advanceTimersByTime(1000);
    }
    draw().handle("b", "guess", { text: word.toUpperCase() });
    const [a, b] = st().players;
    expect(b!.guessed).toBe(true);
    expect(b!.gain).toBeGreaterThan(0);
    expect(a!.gain).toBeGreaterThan(0);
    vi.advanceTimersByTime(1000);
    draw().handle("c", "guess", { text: word });
    // Todos acertaram: fim da vez, palavra revelada.
    expect(st()).toMatchObject({ phase: "turnEnd", word });
    advance(6000);
    expect(st()).toMatchObject({ phase: "choosing", drawer: "b" });
  });

  it("quem desenha sair encerra a vez; sozinho, o jogo acaba", () => {
    for (const p of ["a", "b"]) draw().handle(p, "join", {});
    draw().handle("a", "start", {});
    draw().handle("a", "choose", { i: 0 });
    draw().handle("a", "leave", {});
    expect(st().phase).toBe("final");
  });
});

describe("Stop no servidor", () => {
  const CAFE = (i: number) => ({ x: -8 + i, z: 18 });
  const stop = () => get("stop");
  const st = () => stop().snapshot() as StopState;

  beforeEach(() => {
    h.add("a", "Ana", CAFE(0));
    h.add("b", "Bruno", CAFE(1));
    h.add("x", "Xavier", LOBBY);
  });

  it("rodada completa: respostas escondidas, STOP, votação e pontos 10/5/0", () => {
    stop().handle("x", "join", {});
    expect(st().phase).toBe("idle");
    stop().handle("a", "join", {});
    stop().handle("b", "join", {});
    stop().handle("a", "config", { categories: ["Nome", "Animal", "Cor"], rounds: 1, seconds: 60 });
    stop().handle("a", "start", {});
    expect(st().phase).toBe("spin");
    const L = st().letter!;
    advance(STOP_SPIN_MS + 10);
    expect(st().phase).toBe("playing");
    const word = (s: string) => L + s;
    stop().handle("b", "draft", { answers: [word("ia"), word("aaa"), ""] });
    expect(st().players[1]!.filled).toBe(2);
    expect(JSON.stringify(st())).not.toContain(word("aaa"));
    // STOP só com tudo preenchido.
    stop().handle("b", "stop", { answers: [word("ia"), word("aaa"), ""] });
    expect(st().phase).toBe("playing");
    stop().handle("a", "stop", { answers: [word("ia"), word("bbb"), word("ccc")] });
    expect(st()).toMatchObject({ phase: "stopping", stoppedBy: "Ana" });
    stop().handle("b", "draft", { answers: [word("ia"), word("aaa"), "Zzz"] });
    advance(STOP_GRACE_MS + 10);
    expect(st().phase).toBe("review");
    expect(st().answers!.b).toEqual([word("ia"), word("aaa"), "Zzz"]);
    // Bruno anula o animal da Ana (com 2 jogadores, 1 voto basta); ninguém vota em si mesmo.
    stop().handle("b", "vote", { player: "a", cat: 1, on: true });
    stop().handle("a", "vote", { player: "a", cat: 2, on: true });
    expect(Object.keys(st().votes)).toEqual(["a:1"]);
    stop().handle("a", "ready", {});
    expect(st().phase).toBe("review");
    stop().handle("b", "ready", {});
    expect(st().phase).toBe("results");
    // Nome repetido (5 cada), animal da Ana anulado (0), do Bruno único (10), cor da Ana (10), do Bruno fora da letra (0).
    expect(st().points).toEqual({ a: [5, 0, 10], b: [5, 10, 0] });
    expect(st().players.map((p) => p.score)).toEqual([15, 15]);
    stop().handle("a", "next", {});
    expect(st().phase).toBe("final");
  });

  it("sem STOP, o tempo acaba e vai para a validação", () => {
    stop().handle("a", "join", {});
    stop().handle("b", "join", {});
    stop().handle("a", "start", {});
    advance(STOP_SPIN_MS + 10);
    advance(st().seconds * 1000 + 10);
    expect(st().phase).toBe("stopping");
    advance(STOP_GRACE_MS + 10);
    expect(st().phase).toBe("review");
    expect(st().stoppedBy).toBeNull();
  });
});
