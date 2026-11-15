import { beforeAll, describe, expect, it } from "vitest";
import { HEARING, hearing, NavGrid, ZoneIndex } from "./index.ts";
import { buildCirculoMap, wingPoint } from "./map/circulo.ts";
import type { MapDef } from "./map/types.ts";
import { dist, type Vec2 } from "./geometry.ts";

let map: MapDef;
let nav: NavGrid;
let zones: ZoneIndex;

beforeAll(() => {
  map = buildCirculoMap();
  nav = NavGrid.fromMap(map);
  zones = new ZoneIndex(map.zones);
});

const at = (pos: Vec2) => ({ pos, zone: zones.zoneAt(pos) });

describe("planta Círculo de Evolução", () => {
  it("tem as sete alas na ordem do método", () => {
    expect(map.wings.map((w) => w.letter).join("")).toBe("EVOLUIR");
  });

  it("não repete ids de objetos, zonas nem mesas", () => {
    for (const list of [map.objects, map.zones, map.desks]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("tem mesas suficientes para o time (rotativas incluídas)", () => {
    expect(map.desks.length).toBeGreaterThanOrEqual(60);
  });

  it("coloca toda mesa dentro de uma zona", () => {
    for (const d of map.desks) expect(zones.zoneAt(d.seat), d.id).toBeDefined();
  });

  it("tem TVs para compartilhar tela em todas as salas de reunião", () => {
    const screens = new Set(map.objects.filter((o) => o.type === "tv").map((o) => o.screenId));
    for (const z of map.zones.filter((z) => z.kind === "meeting")) expect(screens.has(z.id), z.id).toBe(true);
    expect(screens.has("auditorio")).toBe(true);
    expect(screens.has("lounge")).toBe(true);
  });
});

describe("navegação", () => {
  it("todo ponto de chegada é andável", () => {
    for (const s of map.spawns) expect(nav.isWalkable(s)).toBe(true);
  });

  it("a escultura central e as paredes bloqueiam", () => {
    expect(nav.isWalkable({ x: 0, z: 0 })).toBe(false);
    const wall = map.walls[0]!;
    expect(nav.isWalkable({ x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 })).toBe(false);
  });

  it("fora da estação não é andável", () => {
    expect(nav.isWalkable({ x: 0, z: -40 })).toBe(false);
  });

  it("chega a todas as cadeiras de mesa a partir da chegada", () => {
    const start = map.spawns[0]!;
    for (const d of map.desks) {
      const path = nav.findPath(start, d.seat);
      expect(path, d.id).not.toBeNull();
      expect(dist(path!.at(-1)!, d.seat), d.id).toBeLessThan(0.6);
    }
  });

  it("chega perto de todo objeto interativo", () => {
    const start = map.spawns[0]!;
    for (const o of map.objects) {
      if (!o.interact) continue;
      const path = nav.findPath(start, o.interact.point);
      expect(path, o.id).not.toBeNull();
      expect(dist(path!.at(-1)!, o.interact.point), o.id).toBeLessThanOrEqual(o.interact.radius);
    }
  });

  it("desliza na parede em vez de atravessar", () => {
    const wing = map.wings[0]!;
    const near = wingPoint(wing, 24.4, 0);
    const moved = nav.move(near, { x: (wingPoint(wing, 26, 0).x - near.x), z: (wingPoint(wing, 26, 0).z - near.z) });
    expect(nav.isWalkable(moved)).toBe(true);
    expect(dist(moved, { x: 0, z: 0 })).toBeLessThan(25);
  });
});

describe("audição", () => {
  const wing = () => map.wings[1]!;

  it("ouve com volume cheio quem está perto", () => {
    const a = wingPoint(wing(), 16, -1);
    const b = wingPoint(wing(), 16.8, -1);
    const h = hearing(map.walls, at(a), at(b));
    expect(h.mode).toBe("clear");
    expect(h.gain).toBe(1);
  });

  it("o volume cai com a distância dentro da conversa", () => {
    const a = wingPoint(wing(), 13, -1);
    const b = wingPoint(wing(), 17, -1);
    const h = hearing(map.walls, at(a), at(b));
    expect(h.mode).toBe("clear");
    expect(h.gain).toBeLessThan(1);
    expect(h.gain).toBeGreaterThanOrEqual(HEARING.edgeGain);
  });

  it("de longe, chega abafado", () => {
    const a = wingPoint(wing(), 13, -5);
    const b = wingPoint(wing(), 21, -1);
    const h = hearing(map.walls, at(a), at(b));
    expect(h.mode).toBe("ambient");
    expect(h.muffled).toBe(true);
    expect(h.gain).toBeLessThanOrEqual(HEARING.ambientGain);
  });

  it("dentro da sala de reunião todos se ouvem e quem está fora não ouve nada", () => {
    const inA = wingPoint(wing(), 20.5, 3);
    const inB = wingPoint(wing(), 24, 5.5);
    const outside = wingPoint(wing(), 20.5, 1.2);
    expect(at(inA).zone?.kind).toBe("meeting");
    expect(hearing(map.walls, at(inA), at(inB))).toMatchObject({ mode: "clear", gain: 1 });
    expect(hearing(map.walls, at(outside), at(inA)).mode).toBe("none");
    expect(hearing(map.walls, at(inA), at(outside)).mode).toBe("none");
  });

  it("parede no caminho abafa a conversa", () => {
    // Um no átrio, encostado na parede; outro do outro lado, na ala.
    const w = map.wings[0]!;
    const hubSide = wingPoint(w, 8.3, 3.2);
    const wingSide = wingPoint(w, 12.6, 3.2);
    const h = hearing(map.walls, at(hubSide), at(wingSide));
    expect(h.mode).toBe("ambient");
    expect(h.muffled).toBe(true);
  });

  it("quem está no palco é ouvido no auditório inteiro, e ninguém de fora ouve", () => {
    const rev = map.wings[6]!;
    const stage = wingPoint(rev, 24, 0);
    const lastRow = wingPoint(rev, 17.6, 4.5);
    const outside = wingPoint(rev, 14, 0);
    expect(at(stage).zone?.kind).toBe("stage");
    expect(hearing(map.walls, at(lastRow), at(stage))).toMatchObject({ mode: "clear", gain: 1 });
    expect(hearing(map.walls, at(outside), at(stage)).mode).toBe("none");
  });

  it("o megafone chega a áreas abertas distantes", () => {
    const a = wingPoint(map.wings[0]!, 16, 0);
    const b = wingPoint(map.wings[3]!, 16, 0);
    expect(hearing(map.walls, at(a), at(b)).mode).toBe("none");
    expect(hearing(map.walls, at(a), at(b), { megaphone: true }).mode).toBe("clear");
  });
});
