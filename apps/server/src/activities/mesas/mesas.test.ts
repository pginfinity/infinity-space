import { describe, expect, it } from "vitest";
import {
  MESAS_NOTE_COOLDOWN_MS,
  MESAS_PEOPLE_MAX,
  NavGrid,
  ZoneIndex,
  buildStationMap,
  mesasDayEnd,
  mesasDesks,
  type Emote,
  type MapDef,
  type MesasPrivate,
  type MesasState,
  type Vec2,
} from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { MesasActivity } from "./desks.ts";
import { mesasAdmin } from "./admin.ts";

const MAP: MapDef = buildStationMap();
const DESKS = mesasDesks(MAP);
const D1 = DESKS[0]!;
const D2 = DESKS[1]!;
const NOW = Date.UTC(2026, 10, 15, 17, 0);

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

/** Sala falsa com o mapa de verdade: posições e nomes na mão, eventos e avisos gravados, sem paredes. */
class FakeHost implements ActivityHost {
  readonly map = MAP;
  readonly nav = NavGrid.fromMap(MAP);
  readonly zones = new ZoneIndex(MAP.zones);
  readonly mem = new Map<string, unknown>();
  readonly store = {
    get: <T>(k: string, f: T): T => (this.mem.has(k) ? (this.mem.get(k) as T) : f),
    set: <T>(k: string, v: T): void => void this.mem.set(k, v),
  } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  events: Sent[] = [];
  notes: Array<[string, string]> = [];
  dirty = 0;
  add(id: string, name: string, p: Vec2): void {
    this.names.set(id, name);
    this.pos.set(id, p);
  }
  changed(_a: Activity): void {
    this.dirty++;
  }
  event(_a: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string> }): void {
    this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) });
  }
  players(): string[] {
    return [...this.pos.keys()];
  }
  playerName(id: string): string | undefined {
    return this.names.get(id);
  }
  playerPos(id: string): Vec2 | undefined {
    return this.pos.get(id);
  }
  playerZone() {
    return undefined;
  }
  emote(_id: string, _e: Emote): void {}
  setHeld(): void {}
  objects() {
    return [];
  }
  claimSeat(): string | null {
    return null;
  }
  notify(id: string, text: string): void {
    this.notes.push([id, text]);
  }
  near(id: string, p: Vec2, range: number): boolean {
    const q = this.pos.get(id);
    return !!q && Math.hypot(q.x - p.x, q.z - p.z) <= range;
  }
  /** Último evento com esse nome para uma pessoa. */
  lastTo<T>(ev: string, id: string): T | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.ev === ev && e.to?.includes(id)) return e.data as T;
    }
    return undefined;
  }
}

function setup(opts: { admins?: string[] } = {}) {
  const host = new FakeHost();
  let now = NOW;
  const act = new MesasActivity(host, { now: () => now, devAdmin: true, admin: (_id, name) => (opts.admins ?? []).includes(name) });
  return { host, act, advance: (ms: number) => (now += ms), state: () => act.snapshot() as MesasState };
}

const far = { x: 0, z: 0 };

describe("mesas no servidor: check-in", () => {
  it("só sentado na cadeira; quem chega depois vê a mesa ocupada", () => {
    const { host, act, state } = setup();
    host.add("a", "Ana", far);
    host.add("b", "Bruno", D1.seat);
    act.handle("a", "checkin", { desk: D1.id });
    expect(host.lastTo("recusa", "a")).toEqual({ code: "longe" });
    host.pos.set("a", D1.seat);
    act.handle("a", "checkin", { desk: D1.id });
    expect(state().checkins[D1.id]).toEqual({ name: "Ana", until: mesasDayEnd(NOW) });
    expect(host.lastTo("ok", "a")).toEqual({ op: "checkin", desk: D1.id });
    act.handle("b", "checkin", { desk: D1.id });
    expect(host.lastTo("recusa", "b")).toEqual({ code: "ocupada", name: "Ana" });
    // Mesa que não existe: nada acontece.
    const before = host.dirty;
    act.handle("a", "checkin", { desk: "nao-existe" });
    act.handle("a", "checkin", { desk: 7 });
    expect(host.dirty).toBe(before);
  });

  it("atalho da última mesa, liberar e meia-noite", () => {
    const { host, act, state, advance } = setup();
    host.add("a", "Ana", D1.seat);
    act.handle("a", "checkin-ultima", undefined);
    expect(host.lastTo("recusa", "a")).toEqual({ code: "sem-ultima" });
    act.handle("a", "checkin", { desk: D1.id });
    expect(host.lastTo<MesasPrivate>("privado", "a")?.last).toBe(D1.id);
    act.handle("a", "checkout", undefined);
    expect(state().checkins).toEqual({});
    // De longe, o atalho põe a Ana de volta na última mesa.
    host.pos.set("a", far);
    act.handle("a", "checkin-ultima", undefined);
    expect(state().checkins[D1.id]?.name).toBe("Ana");
    // Meia-noite: o tique limpa o check-in.
    advance(mesasDayEnd(NOW) - NOW);
    act.tick(1.1);
    expect(state().checkins).toEqual({});
  });

  it("objetos pessoais: só do catálogo, até três, persistidos", () => {
    const { host, act, state } = setup();
    host.add("a", "Ana", far);
    act.handle("a", "objetos", { items: ["caneca", "foguete", "nada", "cacto", "globo"] });
    expect(state().items).toEqual({ ana: ["caneca", "foguete", "cacto"] });
    expect((host.mem.get("mesas/estado") as MesasState).items.ana).toEqual(["caneca", "foguete", "cacto"]);
    // Limite de pessoas guardadas (com login desligado qualquer nome entra).
    for (let i = 0; i < MESAS_PEOPLE_MAX + 5; i++) {
      host.add(`p${i}`, `Pessoa ${i}`, far);
      act.handle(`p${i}`, "objetos", { items: ["cubo"] });
    }
    expect(Object.keys(state().items).length).toBe(MESAS_PEOPLE_MAX);
    // Quem já está na lista continua podendo trocar.
    act.handle("a", "objetos", { items: ["globo"] });
    expect(state().items.ana).toEqual(["globo"]);
    act.handle("a", "objetos", { items: ["caneca", "foguete", "cacto"] });
    // Um servidor novo lê o que ficou salvo.
    const again = new MesasActivity(host, { now: () => NOW });
    expect((again.snapshot() as MesasState).items.ana).toEqual(["caneca", "foguete", "cacto"]);
  });
});

describe("mesas no servidor: recados", () => {
  it("privado: só a dona e quem escreveu recebem; só perto da mesa; espera entre recados", () => {
    const { host, act, advance } = setup();
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", far);
    host.add("c", "Carla", far);
    act.handle("a", "checkin", { desk: D1.id });
    act.handle("b", "recado", { desk: D1.id, text: "Passei aqui" });
    expect(host.lastTo("recusa", "b")).toEqual({ code: "longe" });
    host.pos.set("b", D1.pos);
    host.events = [];
    act.handle("b", "recado", { desk: D1.id, text: "  Passei aqui, me chama quando voltar  " });
    const ana = host.lastTo<MesasPrivate>("privado", "a")!;
    expect(ana.inbox.map((n) => [n.fromName, n.text])).toEqual([["Bruno", "Passei aqui, me chama quando voltar"]]);
    expect(host.lastTo<MesasPrivate>("privado", "b")!.sent).toHaveLength(1);
    // A Carla não recebe nada, e o recado não está no estado público.
    expect(host.events.some((e) => e.to?.includes("c"))).toBe(false);
    expect(host.events.some((e) => !e.to)).toBe(false);
    expect(JSON.stringify(act.snapshot())).not.toContain("Passei");
    // Espera entre recados.
    act.handle("b", "recado", { desk: D1.id, text: "outro" });
    expect(host.lastTo<{ code: string }>("recusa", "b")?.code).toBe("espera");
    advance(MESAS_NOTE_COOLDOWN_MS + 1);
    act.handle("b", "recado", { desk: D1.id, text: "x".repeat(400) });
    expect(host.lastTo<MesasPrivate>("privado", "a")!.inbox[1]!.text).toHaveLength(140);
    // A Ana não deixa recado na própria mesa; ninguém deixa em mesa livre.
    act.handle("a", "recado", { desk: D1.id, text: "eu" });
    expect(host.lastTo("recusa", "a")).toEqual({ code: "propria" });
    host.pos.set("b", D2.pos);
    act.handle("b", "recado", { desk: D2.id, text: "oi" });
    expect(host.lastTo<{ code: string }>("recusa", "b")?.code).toBe("livre");
  });

  it("a espera entre recados vale pela pessoa, não pela conexão", () => {
    const { host, act } = setup();
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", D1.pos);
    act.handle("a", "checkin", { desk: D1.id });
    act.handle("b", "recado", { desk: D1.id, text: "um" });
    // Bruno reconecta (id novo) e tenta de novo na hora.
    host.pos.delete("b");
    act.leave("b");
    host.add("b2", "Bruno", D1.pos);
    act.handle("b2", "recado", { desk: D1.id, text: "dois" });
    expect(host.lastTo<{ code: string }>("recusa", "b2")?.code).toBe("espera");
  });

  it("apagar: a dona ou quem escreveu; outra pessoa não", () => {
    const { host, act } = setup();
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", D1.pos);
    host.add("c", "Carla", D1.pos);
    act.handle("a", "checkin", { desk: D1.id });
    act.handle("b", "recado", { desk: D1.id, text: "oi" });
    const id = host.lastTo<MesasPrivate>("privado", "a")!.inbox[0]!.id;
    act.handle("c", "apagar", { id });
    expect(host.lastTo<MesasPrivate>("privado", "a")!.inbox).toHaveLength(1);
    act.handle("a", "apagar", { id });
    expect(host.lastTo<MesasPrivate>("privado", "a")!.inbox).toHaveLength(0);
    expect(host.lastTo<MesasPrivate>("privado", "b")!.sent).toHaveLength(0);
  });

  it("a dona vê os recados ao entrar de novo (outra conexão, mesmo nome)", () => {
    const { host, act } = setup();
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", D1.pos);
    act.handle("a", "checkin", { desk: D1.id });
    act.handle("b", "recado", { desk: D1.id, text: "volto já" });
    host.pos.delete("a");
    act.leave("a");
    host.add("a2", "ana", far);
    act.join("a2");
    expect(host.lastTo<MesasPrivate>("privado", "a2")!.inbox.map((n) => n.text)).toEqual(["volto já"]);
  });
});

describe("mesas no servidor: mesas fixas", () => {
  it("só admin marca; a mesa fixa recusa check-in de outra pessoa e avisa quem perdeu o lugar", () => {
    const { host, act, state } = setup({ admins: ["Diretora"] });
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", far);
    host.add("d", "Diretora", far);
    act.handle("a", "checkin", { desk: D1.id });
    act.handle("b", "fixar", { desk: D1.id, name: "Bruno" });
    expect(host.lastTo("recusa", "b")).toEqual({ code: "admin" });
    expect(state().fixed).toEqual({});
    act.handle("d", "fixar", { desk: D1.id, name: "Bruno" });
    expect(state().fixed).toEqual({ [D1.id]: "Bruno" });
    expect(state().checkins[D1.id]).toBeUndefined();
    expect(host.notes.map(([id]) => id)).toEqual(["a"]);
    act.handle("a", "checkin", { desk: D1.id });
    expect(host.lastTo("recusa", "a")).toEqual({ code: "fixa", name: "Bruno" });
    // Desfazer.
    act.handle("d", "fixar", { desk: D1.id, name: "" });
    expect(state().fixed).toEqual({});
  });

  it("gancho de desenvolvimento libera o admin só para a conexão que pediu", () => {
    const { host, act, state } = setup();
    host.add("a", "Ana", far);
    host.add("b", "Bruno", far);
    act.handle("a", "admin-dev", { on: true });
    expect(host.lastTo<MesasPrivate>("privado", "a")?.admin).toBe(true);
    act.handle("a", "fixar", { desk: D2.id, name: "Carla" });
    expect(state().fixed[D2.id]).toBe("Carla");
    act.handle("b", "fixar", { desk: D2.id, name: "" });
    expect(state().fixed[D2.id]).toBe("Carla");
  });

  it("com login ligado, o gancho de desenvolvimento não vale e o papel vem da conta", () => {
    const host = new FakeHost();
    host.mem.set("auth/usuarios", {
      "dir@x.io": { email: "dir@x.io", name: "Diretora", role: "admin", createdAt: 0 },
      "ana@x.io": { email: "ana@x.io", name: "Ana", role: "member", createdAt: 0 },
    });
    const opts = mesasAdmin(host.store, { AUTH_REQUIRED: "true" });
    expect(opts.devAdmin).toBe(false);
    expect(opts.admin("1", "Diretora")).toBe(true);
    expect(opts.admin("2", "Ana")).toBe(false);
    expect(opts.admin("3", "Ninguém")).toBe(false);
    // Nome repetido com uma conta comum: ninguém com esse nome administra.
    host.mem.set("auth/usuarios", { ...(host.mem.get("auth/usuarios") as object), "x@x.io": { email: "x@x.io", name: "diretora", role: "member", createdAt: 0 } });
    expect(opts.admin("1", "Diretora")).toBe(false);
    const act = new MesasActivity(host, { ...opts, now: () => NOW });
    host.add("a", "Ana", far);
    act.handle("a", "admin-dev", { on: true });
    act.handle("a", "fixar", { desk: D1.id, name: "Ana" });
    expect((act.snapshot() as MesasState).fixed).toEqual({});
  });

  it("sem login: MESAS_ADMINS por nome ou * para todos", () => {
    const host = new FakeHost();
    expect(mesasAdmin(host.store, { MESAS_ADMINS: "Ana, Bruno" }).admin("1", "ana")).toBe(true);
    expect(mesasAdmin(host.store, { MESAS_ADMINS: "Ana" }).admin("1", "Carla")).toBe(false);
    expect(mesasAdmin(host.store, { MESAS_ADMINS: "*" }).admin("1", "Carla")).toBe(true);
    expect(mesasAdmin(host.store, {}).admin("1", "Carla")).toBe(false);
  });
});

describe("mesas no servidor: privacidade", () => {
  it("o estado público não tem horário de chegada: o 'até' é a meia-noite, igual para todos", () => {
    const { host, act, state, advance } = setup();
    host.add("a", "Ana", D1.seat);
    host.add("b", "Bruno", D2.seat);
    act.handle("a", "checkin", { desk: D1.id });
    advance(3 * 3600 * 1000);
    act.handle("b", "checkin", { desk: D2.id });
    expect(state().checkins[D1.id]!.until).toBe(state().checkins[D2.id]!.until);
    expect(Object.keys(state().checkins[D1.id]!).sort()).toEqual(["name", "until"]);
  });
});
