import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavGrid, ZoneIndex, buildStationMap, dist, focoSeatPoints, wallBetween, type FocoState, type Vec2 } from "@infinity/world";
import type { ActivityHost } from "../types.ts";
import type { Store } from "../../store.ts";
import { FocoActivity } from "./index.ts";

/** Sala de mentira: pessoas em posições controladas. */
function setup(dev = false) {
  const map = buildStationMap();
  const zones = new ZoneIndex(map.zones);
  const pos = new Map<string, Vec2>();
  const saved = new Map<string, unknown>();
  let changes = 0;
  const host = {
    map,
    nav: NavGrid.fromMap(map),
    zones,
    store: { get: (_k: string, d: unknown) => d, set: (k: string, v: unknown) => void saved.set(k, v) } as unknown as Store,
    changed: () => void changes++,
    event: () => undefined,
    players: () => [...pos.keys()],
    playerName: (id: string) => id,
    playerPos: (id: string) => pos.get(id),
    playerZone: (id: string) => (pos.get(id) ? zones.zoneAt(pos.get(id)!) : undefined),
    emote: () => undefined,
    setHeld: () => undefined,
    objects: (type: string) => map.objects.filter((o) => o.type === type),
    claimSeat: () => null,
    notify: () => undefined,
    near: (id: string, p: Vec2, range: number) => {
      const at = pos.get(id);
      return !!at && dist(at, p) <= range && !wallBetween(map.walls, at, p);
    },
  } as unknown as ActivityHost;
  const act = new FocoActivity(host, dev);
  const seats = focoSeatPoints(map);
  const st = () => act.snapshot() as FocoState & { now: number };
  return { act, pos, seats, st, saved, changes: () => changes };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T13:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("mesa de foco (servidor)", () => {
  it("só senta quem está no lugar; o primeiro começa o relógio", () => {
    const { act, pos, seats, st } = setup();
    pos.set("ana", { x: 0, z: 7.5 });
    act.handle("ana", "sit", { seat: 0 });
    expect(st().startAt).toBeNull();
    pos.set("ana", seats[0]!);
    act.handle("ana", "sit", { seat: "0" });
    act.handle("ana", "sit", { seat: 9 });
    expect(st().startAt).toBeNull();
    act.handle("ana", "sit", { seat: 0 });
    expect(st().seats[0]).toBe("ana");
    expect(st().startAt).toBe(Date.now());
  });

  it("quem chega no meio entra no ciclo em andamento", () => {
    const { act, pos, seats, st } = setup();
    pos.set("ana", seats[0]!);
    act.handle("ana", "sit", { seat: 0 });
    const start = st().startAt;
    vi.advanceTimersByTime(17 * 60_000);
    pos.set("bruno", seats[2]!);
    act.handle("bruno", "sit", { seat: 2 });
    expect(st().startAt).toBe(start);
    expect(st().seats).toEqual(["ana", null, "bruno", null]);
  });

  it("quem não está sentado não mexe no relógio; pausar precisa de todos", () => {
    const { act, pos, seats, st } = setup();
    pos.set("ana", seats[0]!);
    pos.set("bruno", seats[1]!);
    pos.set("caio", { x: 20.8, z: 5 });
    act.handle("ana", "sit", { seat: 0 });
    act.handle("bruno", "sit", { seat: 1 });
    act.handle("caio", "vote", { op: "pause" });
    expect(st().vote).toBeNull();
    act.handle("ana", "vote", { op: "pause" });
    expect(st().pausedAt).toBeNull();
    act.handle("ana", "vote", { op: "parar-tudo" });
    expect(st().vote?.op).toBe("pause");
    act.handle("bruno", "vote", { op: "pause" });
    expect(st().pausedAt).toBe(Date.now());
  });

  it("quem levanta e anda para longe sai sozinho; mesa vazia zera", () => {
    const { act, pos, seats, st } = setup();
    pos.set("ana", seats[0]!);
    pos.set("bruno", seats[1]!);
    act.handle("ana", "sit", { seat: 0 });
    act.handle("bruno", "sit", { seat: 1 });
    pos.set("ana", { x: 20.8, z: 6 });
    act.tick();
    expect(st().seats).toEqual([null, "bruno", null, null]);
    act.leave("bruno");
    expect(st()).toMatchObject({ seats: [null, null, null, null], startAt: null, pausedAt: null, vote: null });
  });

  it("pular fase só fora de produção (testes)", () => {
    const prod = setup(false);
    prod.pos.set("ana", prod.seats[0]!);
    prod.act.handle("ana", "sit", { seat: 0 });
    const s0 = prod.st().startAt;
    prod.act.handle("ana", "dev-skip", undefined);
    expect(prod.st().startAt).toBe(s0);
    const dev = setup(true);
    dev.pos.set("ana", dev.seats[0]!);
    dev.act.handle("ana", "dev-skip", undefined);
    expect(dev.st().startAt).toBeNull();
    dev.act.handle("ana", "sit", { seat: 0 });
    dev.act.handle("ana", "dev-skip", undefined);
    expect(Date.now() - dev.st().startAt!).toBe(25 * 60_000 - 2000);
  });

  it("nada é salvo e o estado não tem contagem por pessoa", () => {
    const { act, pos, seats, st, saved } = setup();
    pos.set("ana", seats[0]!);
    act.handle("ana", "sit", { seat: 0 });
    act.handle("ana", "vote", { op: "restart" });
    act.handle("ana", "leave", undefined);
    expect(saved.size).toBe(0);
    expect(Object.keys(st()).sort()).toEqual(["now", "pausedAt", "seats", "startAt", "vote"]);
  });
});
