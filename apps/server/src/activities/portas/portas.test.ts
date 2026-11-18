import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavGrid, PORTAS, ZoneIndex, buildStationMap, dist, doorsOf, hearing, type Emote, type MapDef, type Vec2 } from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { PortasActivity } from "./portas.ts";

const MAP: MapDef = buildStationMap();
const ZONES = new ZoneIndex(MAP.zones);
const ECLIPSE = doorsOf(MAP).find((d) => d.zoneId === "eclipse")!;
const DENTRO = { x: -19, z: -2 };
const DENTRO_2 = { x: -18.5, z: 1 };

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

/** Sala falsa: posições, nomes e eventos registrados. */
class FakeHost implements ActivityHost {
  readonly map = MAP;
  readonly nav = NavGrid.fromMap(MAP);
  readonly zones = ZONES;
  readonly store = { get: <T>(_k: string, f: T): T => f, set: () => undefined } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  events: Sent[] = [];
  changed(_a: Activity): void {}
  event(_a: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string> }): void {
    this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) });
  }
  players(): string[] {
    return [...this.pos.keys()];
  }
  playerName(id: string) {
    return this.names.get(id);
  }
  playerPos(id: string) {
    return this.pos.get(id);
  }
  playerZone(id: string) {
    const p = this.pos.get(id);
    return p ? this.zones.zoneAt(p) : undefined;
  }
  emote(_id: string, _e: Emote): void {}
  setHeld(): void {}
  objects(type: string) {
    return MAP.objects.filter((o) => o.type === type);
  }
  claimSeat(): string | null {
    return null;
  }
  notify(): void {}
  near(id: string, p: Vec2, range: number): boolean {
    const at = this.pos.get(id);
    return !!at && dist(at, p) <= range;
  }
  put(id: string, p: Vec2): void {
    this.pos.set(id, p);
    this.names.set(id, id[0]!.toUpperCase() + id.slice(1));
  }
  to(id: string): string[] {
    return this.events.filter((e) => e.to?.includes(id)).map((e) => e.ev);
  }
}

let host: FakeHost;
let act: PortasActivity;
let refreshes: number;
let now: number;

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  host = new FakeHost();
  act = new PortasActivity(host);
  refreshes = 0;
  act.onPrivacyChange(() => refreshes++);
});
afterEach(() => vi.restoreAllMocks());

const door = () => act.snapshot().doors.eclipse!;
const zoneOf = (p: Vec2) => ZONES.zoneAt(p);

describe("porta da sala", () => {
  it("só quem está dentro troca o estado; fechar admite quem está dentro", () => {
    host.put("ana", DENTRO);
    host.put("bia", DENTRO_2);
    host.put("caio", ECLIPSE.outside);
    act.handle("caio", "porta", { zone: "eclipse", state: "closed" });
    expect(door().state).toBe("open");
    act.handle("ana", "porta", { zone: "eclipse", state: "closed" });
    expect(door()).toMatchObject({ state: "closed" });
    expect(door().admitted.sort()).toEqual(["ana", "bia"]);
    expect(refreshes).toBeGreaterThan(0);
    expect(act.mayStand("caio", zoneOf(DENTRO))).toBe(false);
    expect(act.mayStand("ana", zoneOf(DENTRO))).toBe(true);
    // Estado inválido e sala inexistente: nada muda.
    act.handle("ana", "porta", { zone: "eclipse", state: "escancarada" });
    act.handle("ana", "porta", { zone: "nao-existe", state: "open" });
    expect(door().state).toBe("closed");
  });

  it("bater: quem está dentro recebe o pedido; deixar entrar admite; agora não avisa", () => {
    host.put("ana", DENTRO);
    host.put("caio", ECLIPSE.outside);
    host.put("duda", { x: ECLIPSE.outside.x + 0.5, z: ECLIPSE.outside.z });
    act.handle("ana", "porta", { zone: "eclipse", state: "closed" });
    act.handle("caio", "bater", { zone: "eclipse" });
    expect(host.events.find((e) => e.ev === "bateu")?.to).toEqual(["ana"]);
    expect(door().knocks.map((k) => k.id)).toEqual(["caio"]);
    // Bater de novo logo em seguida não repete o pedido.
    host.events = [];
    act.handle("caio", "bater", { zone: "eclipse" });
    expect(host.events.filter((e) => e.ev === "bateu")).toHaveLength(0);
    // Quem não está dentro não pode atender.
    act.handle("duda", "atender", { zone: "eclipse", who: "caio", ok: true });
    expect(door().admitted).not.toContain("caio");
    act.handle("ana", "atender", { zone: "eclipse", who: "caio", ok: true });
    expect(door().admitted).toContain("caio");
    expect(host.to("caio")).toContain("entrar");
    expect(act.mayStand("caio", zoneOf(DENTRO))).toBe(true);
    act.handle("duda", "bater", { zone: "eclipse" });
    act.handle("ana", "atender", { zone: "eclipse", who: "duda", ok: false });
    expect(host.to("duda")).toContain("agora-nao");
    expect(act.mayStand("duda", zoneOf(DENTRO))).toBe(false);
  });

  it("bater de longe ou de dentro não vale", () => {
    host.put("ana", DENTRO);
    host.put("caio", { x: ECLIPSE.outside.x + PORTAS.knockRange + 1, z: ECLIPSE.outside.z });
    act.handle("ana", "porta", { zone: "eclipse", state: "closed" });
    act.handle("caio", "bater", { zone: "eclipse" });
    act.handle("ana", "bater", { zone: "eclipse" });
    expect(door().knocks).toEqual([]);
  });

  it("não perturbe: quem bate recebe o aviso (com o bilhete) e ninguém de dentro é incomodado", () => {
    host.put("ana", DENTRO);
    host.put("caio", ECLIPSE.outside);
    act.handle("ana", "bilhete", { zone: "eclipse", text: "Em entrevista\naté 15h" });
    act.handle("ana", "porta", { zone: "eclipse", state: "locked" });
    act.handle("caio", "bater", { zone: "eclipse" });
    expect(host.events.find((e) => e.ev === "nao-perturbe")).toMatchObject({ to: ["caio"], data: { zone: "eclipse", note: "Em entrevista até 15h" } });
    expect(host.events.filter((e) => e.ev === "bateu")).toHaveLength(0);
    expect(door().knocks).toEqual([]);
  });

  it("trancar recomeça a lista: quem tinha saído um instante perde o acesso", () => {
    host.put("ana", DENTRO);
    host.put("bia", DENTRO_2);
    act.handle("ana", "porta", { zone: "eclipse", state: "closed" });
    host.put("bia", ECLIPSE.outside);
    expect(act.mayStand("bia", zoneOf(DENTRO))).toBe(true); // fechada: entra e sai livremente
    act.handle("ana", "porta", { zone: "eclipse", state: "locked" });
    expect(door().admitted).toEqual(["ana"]);
    expect(act.mayStand("bia", zoneOf(DENTRO))).toBe(false);
  });

  it("quem está fora não escreve bilhete", () => {
    host.put("caio", ECLIPSE.outside);
    act.handle("caio", "bilhete", { zone: "eclipse", text: "invasão" });
    expect(door().note).toBe("");
  });

  it("sala vazia volta a aberta, sem bilhete, depois de um instante", () => {
    host.put("ana", DENTRO);
    act.handle("ana", "porta", { zone: "eclipse", state: "locked" });
    act.handle("ana", "bilhete", { zone: "eclipse", text: "Foco" });
    host.put("ana", ECLIPSE.outside);
    act.tick();
    now += PORTAS.emptyMs - 100;
    act.tick();
    expect(door().state).toBe("locked");
    now += 200;
    act.tick();
    expect(door()).toMatchObject({ state: "open", note: "", admitted: [] });
  });

  it("regras de audição: porta fechada vira lista de admitidos", () => {
    host.put("ana", DENTRO);
    act.handle("ana", "porta", { zone: "eclipse", state: "closed" });
    expect([...(act.privacy().doors?.get("eclipse") ?? [])]).toEqual(["ana"]);
    expect(act.privacy()).toBe(act.privacy()); // mesmo objeto até mudar
  });
});

describe("roda fechada", () => {
  const A = { x: 0, z: -5.5 };
  const B = { x: 1.5, z: -5.5 };
  const C = { x: 3.8, z: -5.5 };

  it("fecha com os vizinhos diretos, aceita pedido e some quando todos se afastam", () => {
    host.put("ana", A);
    host.put("bia", B);
    host.put("caio", C);
    act.handle("ana", "roda", { with: ["bia", "caio"] });
    const c = act.snapshot().circles[0]!;
    expect(c.members.sort()).toEqual(["ana", "bia"]);
    expect(act.privacy().circles?.get("bia")).toBe(c.id);
    expect(host.events.find((e) => e.ev === "roda-fechada")?.to?.sort()).toEqual(["ana", "bia"]);
    // A roda isola quem está fora (mesmo perto).
    const at = (id: string) => ({ id, pos: host.pos.get(id)!, zone: zoneOf(host.pos.get(id)!) });
    expect(hearing(MAP.walls, at("caio"), at("bia"), { privacy: act.privacy() }).mode).toBe("none");
    // Caio pede para entrar; Bia aceita.
    act.handle("caio", "roda-pedir", { circle: c.id });
    expect(act.snapshot().circles[0]!.asks.map((a) => a.id)).toEqual(["caio"]);
    act.handle("bia", "roda-atender", { circle: c.id, who: "caio", ok: true });
    expect(act.snapshot().circles[0]!.members).toContain("caio");
    expect(host.to("caio")).toContain("roda-entrou");
    // Todos se afastam: a roda some.
    host.put("bia", { x: 12, z: -5.5 });
    host.put("caio", { x: -12, z: -5.5 });
    act.tick();
    expect(act.snapshot().circles).toEqual([]);
    expect(act.privacy().circles?.size).toBe(0);
  });

  it("sozinho não fecha; quem já está numa roda não fecha outra", () => {
    host.put("ana", A);
    act.handle("ana", "roda", {});
    expect(host.to("ana")).toContain("roda-sozinho");
    host.put("bia", B);
    act.handle("ana", "roda", {});
    act.handle("bia", "roda", {});
    expect(act.snapshot().circles).toHaveLength(1);
  });

  it("quem sai da conexão sai da roda", () => {
    host.put("ana", A);
    host.put("bia", B);
    act.handle("ana", "roda", {});
    host.pos.delete("bia");
    act.leave("bia");
    expect(act.snapshot().circles).toEqual([]);
  });
});

describe("sussurro", () => {
  it("só as duas pessoas sabem; a regra restringe a voz; soltar desfaz", () => {
    host.put("ana", { x: 0, z: -5.5 });
    host.put("bia", { x: 1, z: -5.5 });
    act.handle("ana", "sussurro", { to: "bia" });
    expect(act.privacy().whispers?.get("ana")).toBe("bia");
    expect(JSON.stringify(act.snapshot())).not.toMatch(/ana|bia/); // nada de sussurro no estado público
    const ev = host.events.filter((e) => e.ev.startsWith("sussurro"));
    expect(ev.every((e) => e.to && e.to.length === 1 && ["ana", "bia"].includes(e.to[0]!))).toBe(true);
    expect(host.to("bia")).toContain("sussurro");
    act.handle("ana", "sussurro-fim", undefined);
    expect(act.privacy().whispers?.has("ana")).toBe(false);
  });

  it("alvo inválido: a voz não vai para ninguém (lado seguro), em vez de voltar para todos", () => {
    host.put("ana", { x: 0, z: -5.5 });
    act.handle("ana", "sussurro", { to: 42 });
    expect(act.privacy().whispers?.get("ana")).toBe("");
    act.handle("ana", "sussurro", { to: "ana" });
    expect(act.privacy().whispers?.get("ana")).toBe("");
  });

  it("quem sussurra sai: o sussurro acaba", () => {
    host.put("ana", { x: 0, z: -5.5 });
    host.put("bia", { x: 1, z: -5.5 });
    act.handle("ana", "sussurro", { to: "bia" });
    act.leave("ana");
    expect(act.privacy().whispers?.size).toBe(0);
  });
});
