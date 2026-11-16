import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COPA_STATIONS,
  NavGrid,
  ORBI_PET_MS,
  PLANT_DRY_MS,
  ZoneIndex,
  buildStationMap,
  copaStationPoint,
  dist,
  orbiPoseAt,
  plantLevel,
  wallBetween,
  type CopaState,
  type HeldItem,
  type JukeboxState,
  type OrbiState,
  type PlantsState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";
import type { Store } from "../../store.ts";
import { CopaActivity } from "./copa.ts";
import { PlantsActivity } from "./plants.ts";
import { OrbiActivity } from "./orbi.ts";
import { JukeboxActivity } from "./jukebox.ts";

/** Sala de mentira: pessoas em posições controladas, eventos e itens anotados. */
function fakeHost() {
  const map = buildStationMap();
  const nav = NavGrid.fromMap(map);
  const zones = new ZoneIndex(map.zones);
  const pos = new Map<string, Vec2>();
  const names = new Map<string, string>();
  const held = new Map<string, HeldItem | null>();
  const events: Array<{ ev: string; data: unknown; to?: string[]; from?: string }> = [];
  const saved = new Map<string, unknown>();
  let changes = 0;
  const store = {
    get: <T>(k: string, d: T) => (saved.has(k) ? (saved.get(k) as T) : d),
    set: <T>(k: string, v: T) => void saved.set(k, v),
  } as unknown as Store;
  const host: ActivityHost = {
    map,
    nav,
    zones,
    store,
    changed: () => void changes++,
    event: (_a, ev, data, opts) => void events.push({ ev, data, to: opts?.to ? [...opts.to] : undefined, from: opts?.from }),
    players: () => [...pos.keys()],
    playerName: (id) => names.get(id),
    playerPos: (id) => pos.get(id),
    playerZone: (id) => (pos.get(id) ? zones.zoneAt(pos.get(id)!) : undefined),
    emote: () => undefined,
    setHeld: (id, item) => void held.set(id, item),
    objects: (type) => map.objects.filter((o) => o.type === type),
    near: (id, p, range) => {
      const at = pos.get(id);
      return !!at && dist(at, p) <= range && !wallBetween(map.walls, at, p);
    },
  };
  const put = (id: string, p: Vec2, name?: string) => {
    pos.set(id, p);
    names.set(id, name ?? names.get(id) ?? id);
  };
  return { host, map, nav, put, held, events, saved, changes: () => changes };
}

/** Ponto andável na frente de um objeto (onde a pessoa fica para usar). */
function front(nav: NavGrid, o: { pos: Vec2; rot: number }, d = 0.9): Vec2 {
  return nav.nearestWalkable({ x: o.pos.x + Math.sin(o.rot) * d, z: o.pos.z - Math.cos(o.rot) * d }, 1.5)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T14:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("copa (servidor)", () => {
  it("confere distância, prepara, entrega na mão e conta no dia", () => {
    const h = fakeHost();
    const copa = new CopaActivity(h.host);
    const machine = h.map.objects.find((o) => o.type === "coffee-machine")!;
    h.put("ana", front(h.nav, machine), "Ana");
    h.put("bia", { x: 0, z: 7.5 }, "Bia");

    // longe: recusa
    copa.handle("bia", "order", { station: machine.id, item: "coffee" });
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "far" }, to: ["bia"] });
    // item que a estação não serve: ignorado
    copa.handle("ana", "order", { station: machine.id, item: "juice" });
    expect((copa.snapshot() as CopaState).busy).toEqual({});

    copa.handle("ana", "order", { station: machine.id, item: "coffee" });
    expect((copa.snapshot() as CopaState).busy[machine.id]).toMatchObject({ id: "ana", item: "coffee" });
    expect(h.events.at(-1)).toMatchObject({ ev: "start", from: "ana" });

    // outra pessoa na mesma máquina: ocupada
    h.put("bia", front(h.nav, machine, 1.1), "Bia");
    copa.handle("bia", "order", { station: machine.id, item: "tea" });
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "busy", name: "Ana" } });

    copa.tick();
    expect(h.held.get("ana")).toBeUndefined();
    vi.advanceTimersByTime(COPA_STATIONS["coffee-machine"].prepMs + 10);
    copa.tick();
    expect(h.held.get("ana")).toBe("coffee");
    expect((copa.snapshot() as CopaState).counts.coffee).toBe(1);
    expect(h.events.at(-1)).toMatchObject({ ev: "served", data: { item: "coffee", name: "Ana" } });
    expect(h.saved.get("vivo/copa")).toMatchObject({ counts: { coffee: 1 } });
  });

  it("quem sai de perto antes de ficar pronto não recebe", () => {
    const h = fakeHost();
    const copa = new CopaActivity(h.host);
    const fridge = h.map.objects.find((o) => o.type === "fridge")!;
    h.put("ana", front(h.nav, fridge), "Ana");
    copa.handle("ana", "order", { station: fridge.id, item: "juice" });
    h.put("ana", { x: 0, z: 7.5 });
    vi.advanceTimersByTime(5000);
    copa.tick();
    expect(h.held.get("ana")).toBeUndefined();
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "away" } });
  });

  it("a pipoca é pedida na bancada, na frente da pipoqueira", () => {
    const h = fakeHost();
    const copa = new CopaActivity(h.host);
    const counter = h.map.objects.find((o) => o.type === "kitchen-counter")!;
    const spot = copaStationPoint(counter);
    h.put("ana", h.nav.nearestWalkable({ x: spot.x + 0.9, z: spot.z }, 1.5)!, "Ana");
    copa.handle("ana", "order", { station: counter.id, item: "popcorn" });
    vi.advanceTimersByTime(COPA_STATIONS["kitchen-counter"].prepMs + 10);
    copa.tick();
    expect(h.held.get("ana")).toBe("popcorn");
  });
});

describe("plantas (servidor)", () => {
  it("rega quem está perto, salva a hora e atualiza a contagem do time", () => {
    const h = fakeHost();
    const plants = new PlantsActivity(h.host);
    const s0 = plants.snapshot() as PlantsState;
    expect(s0.total).toBeGreaterThan(20);
    // acha uma planta com sede e chega perto dela
    const now = Date.now();
    const thirsty = h.map.objects.find((o) => o.type.startsWith("plant") && plantLevel(s0.wateredAt[o.id], now) < 0.3 && o.type !== "plant-small")!;
    expect(thirsty).toBeTruthy();
    h.put("ana", h.nav.nearestWalkable(thirsty.pos, 1.5)!, "Ana");
    h.put("bia", { x: 0, z: 7.5 }, "Bia");
    plants.handle("bia", "water", { plant: thirsty.id });
    expect((plants.snapshot() as PlantsState).wateredAt[thirsty.id]).toBe(s0.wateredAt[thirsty.id]);

    plants.handle("ana", "water", { plant: thirsty.id });
    const s1 = plants.snapshot() as PlantsState;
    expect(s1.wateredAt[thirsty.id]).toBe(now);
    expect(h.events.at(-1)).toMatchObject({ ev: "water", data: { plant: thirsty.id, name: "Ana" }, from: "ana" });
    expect((h.saved.get("vivo/plantas") as { wateredAt: Record<string, number> }).wateredAt[thirsty.id]).toBe(now);
    expect(s1.happy).toBeGreaterThanOrEqual(s0.happy);

    // regada agora: avisar que já está cheia
    vi.advanceTimersByTime(5000);
    plants.handle("ana", "water", { plant: thirsty.id });
    expect(h.events.at(-1)).toMatchObject({ ev: "full", to: ["ana"] });
  });

  it("três dias sem rega: todas murcham e a contagem cai", () => {
    const h = fakeHost();
    const plants = new PlantsActivity(h.host);
    vi.advanceTimersByTime(PLANT_DRY_MS);
    plants.tick();
    expect((plants.snapshot() as PlantsState).happy).toBe(0);
  });

  it("pega o regador só na estação de rega", () => {
    const h = fakeHost();
    const plants = new PlantsActivity(h.host);
    const st = h.map.objects.find((o) => o.type === "watering-station")!;
    h.put("ana", { x: 0, z: 7.5 });
    plants.handle("ana", "can", undefined);
    expect(h.held.get("ana")).toBeUndefined();
    h.put("ana", front(h.nav, st));
    plants.handle("ana", "can", undefined);
    expect(h.held.get("ana")).toBe("watering-can");
  });
});

describe("Orbi (servidor)", () => {
  function runFor(a: Activity, ms: number) {
    for (let t = 0; t < ms; t += 66) {
      vi.advanceTimersByTime(66);
      a.tick?.(1 / 15);
    }
  }

  it("passeia só por áreas comuns e por chão andável", () => {
    const h = fakeHost();
    const orbi = new OrbiActivity(h.host);
    const zonesSeen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      runFor(orbi, 3000);
      const s = orbi.snapshot() as OrbiState;
      const p = orbiPoseAt(s, Date.now());
      expect(h.nav.isWalkable(p) || h.nav.nearestWalkable(p, 0.6) !== null).toBe(true);
      const z = h.host.zones.zoneAt(p);
      if (z) zonesSeen.add(z.kind);
      if (s.mode === "wander") for (const q of s.path) expect(["meeting", "focus", "office"]).not.toContain(h.host.zones.zoneAt(q)?.kind);
    }
    expect(zonesSeen.has("open")).toBe(true);
  });

  it("segue quem chama, para do lado e larga quando pedem", () => {
    const h = fakeHost();
    const orbi = new OrbiActivity(h.host);
    const s0 = orbi.snapshot() as OrbiState;
    const at = orbiPoseAt(s0, Date.now());
    h.put("ana", h.nav.nearestWalkable({ x: at.x + 3, z: at.z }, 2)!, "Ana");
    orbi.handle("ana", "call", undefined);
    expect((orbi.snapshot() as OrbiState)).toMatchObject({ mode: "follow", follow: { id: "ana", name: "Ana" } });
    // Ana anda; o Orbi vai atrás e fica a pouco mais de um metro
    h.put("ana", { x: 1, z: 2.8 });
    runFor(orbi, 9000);
    const p = orbiPoseAt(orbi.snapshot() as OrbiState, Date.now());
    expect(dist(p, { x: 1, z: 2.8 })).toBeLessThan(2.4);
    expect(dist(p, { x: 1, z: 2.8 })).toBeGreaterThan(0.6);
    // carinho
    h.put("ana", { x: p.x + 1, z: p.z });
    orbi.handle("ana", "pet", undefined);
    expect((orbi.snapshot() as OrbiState).mode).toBe("pet");
    expect(h.events.at(-1)).toMatchObject({ ev: "pet", data: { name: "Ana" } });
    runFor(orbi, ORBI_PET_MS + 200);
    expect((orbi.snapshot() as OrbiState).mode).toBe("follow");
    orbi.handle("ana", "dismiss", undefined);
    expect((orbi.snapshot() as OrbiState)).toMatchObject({ mode: "rest", follow: null });
  });

  it("não atende quem está longe nem entra em sala de reunião atrás de alguém", () => {
    const h = fakeHost();
    const orbi = new OrbiActivity(h.host);
    h.put("longe", { x: -20, z: 18 });
    orbi.handle("longe", "call", undefined);
    expect((orbi.snapshot() as OrbiState).mode).not.toBe("follow");
    const at = orbiPoseAt(orbi.snapshot() as OrbiState, Date.now());
    h.put("ana", h.nav.nearestWalkable({ x: at.x + 2, z: at.z }, 2)!);
    orbi.handle("ana", "call", undefined);
    h.put("ana", { x: -21, z: 1 }); // Sala Órbita
    runFor(orbi, 1000);
    expect((orbi.snapshot() as OrbiState).follow).toBeNull();
    expect(h.events.at(-1)).toMatchObject({ ev: "bye", data: { reason: "room" }, to: ["ana"] });
  });
});

describe("jukebox (servidor)", () => {
  it("fila com limite por pessoa, toca na ordem e pula", () => {
    const h = fakeHost();
    const juke = new JukeboxActivity(h.host);
    const box = h.map.objects.find((o) => o.type === "jukebox")!;
    h.put("ana", front(h.nav, box), "Ana");
    h.put("bia", { x: 0, z: 7.5 }, "Bia");
    juke.handle("bia", "add", { track: "lagoa" });
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "far" } });
    juke.handle("ana", "add", { track: "nao-existe" });
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "unknown" } });
    juke.handle("ana", "add", { track: "lagoa" });
    juke.handle("ana", "add", { track: "evoluir" });
    juke.handle("ana", "add", { track: "orbita-baixa" });
    let s = juke.snapshot() as JukeboxState;
    expect(s.playing).toMatchObject({ track: "lagoa", by: "Ana", startAt: Date.now() });
    expect(s.queue.map((e) => e.track)).toEqual(["evoluir", "orbita-baixa"]);
    // Ana já tem duas na fila: a terceira é recusada
    juke.handle("ana", "add", { track: "janela-leste" });
    expect(h.events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "limit" } });
    // a faixa acaba e a próxima começa no fim exato dela
    const end = s.playing!.startAt + 160_000;
    vi.setSystemTime(end + 500);
    juke.tick();
    s = juke.snapshot() as JukeboxState;
    expect(s.playing).toMatchObject({ track: "evoluir", startAt: end });
    juke.handle("ana", "skip", undefined);
    expect((juke.snapshot() as JukeboxState).playing?.track).toBe("orbita-baixa");
  });
});
