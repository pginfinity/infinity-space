import { beforeAll, describe, expect, it } from "vitest";
import { HEARING, hearing, NavGrid, ZoneIndex, buildStationMap, dist, type MapDef, type Vec2 } from "./index.ts";

let map: MapDef;
let nav: NavGrid;
let zones: ZoneIndex;

beforeAll(() => {
  map = buildStationMap();
  nav = NavGrid.fromMap(map);
  zones = new ZoneIndex(map.zones);
});

const at = (pos: Vec2) => ({ pos, zone: zones.zoneAt(pos) });
const zone = (id: string) => map.zones.find((z) => z.id === id)!;

describe("planta Estação Infinity", () => {
  it("não repete ids de objetos, zonas nem mesas", () => {
    for (const list of [map.objects, map.zones, map.desks]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size, JSON.stringify(ids.filter((id, i) => ids.indexOf(id) !== i))).toBe(ids.length);
    }
  });

  it("tem mesas de trabalho suficientes para o time (o dobro do pico de 20 pessoas)", () => {
    expect(map.desks.length).toBeGreaterThanOrEqual(40);
  });

  it("tem todas as áreas da empresa", () => {
    const teams = new Set(map.zones.map((z) => z.team).filter(Boolean));
    for (const t of ["Desenvolvimento", "Produto & Design", "Automação & IA", "Diretoria", "Marketing & Criação", "Comercial", "Gestão & Projetos"]) expect(teams.has(t), t).toBe(true);
    for (const id of ["atrio", "orbita", "lua", "arcade", "cafe", "auditorio"]) expect(zone(id), id).toBeDefined();
  });

  it("cada sala listada tem placa e identidade visual", () => {
    const signed = new Set(map.signs.map((s) => s.zoneId));
    for (const z of map.zones.filter((z) => z.listed)) {
      expect(signed.has(z.id), `placa de ${z.name}`).toBe(true);
      expect(z.theme?.accent, `cor de ${z.name}`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("toda TV tem tela e toda sala de reunião tem TV", () => {
    for (const o of map.objects.filter((o) => o.type === "tv")) expect(o.screenId, o.id).toBeTruthy();
    const screens = new Set(map.objects.map((o) => o.screenId));
    for (const z of map.zones.filter((z) => z.kind === "meeting")) expect(screens.has(z.id), z.id).toBe(true);
  });

  it("mesas de jogo têm partida e cadeiras ligadas aos lugares", () => {
    const tables = map.objects.filter((o) => o.type === "chess-table" || o.type === "connect4-table");
    expect(tables.length).toBeGreaterThanOrEqual(4);
    for (const t of tables) {
      expect(t.gameId, t.id).toBeTruthy();
      const seats = map.objects.filter((o) => o.gameId === t.gameId && o.gameSeat !== undefined).map((o) => o.gameSeat);
      expect(seats.sort(), t.id).toEqual([0, 1]);
    }
  });

  it("objetos ficam dentro da estação", () => {
    for (const o of map.objects) {
      expect(Math.abs(o.pos.x), o.id).toBeLessThan(26);
      expect(o.pos.z, o.id).toBeGreaterThan(-19);
      expect(o.pos.z, o.id).toBeLessThan(22);
    }
  });
});

describe("navegação", () => {
  it("todo ponto de chegada é andável", () => {
    for (const s of map.spawns) expect(nav.isWalkable(s), JSON.stringify(s)).toBe(true);
  });

  it("a escultura, as paredes e o lado de fora bloqueiam", () => {
    const star = map.objects.find((o) => o.type === "sculpture")!;
    expect(nav.isWalkable(star.pos)).toBe(false);
    const w = map.walls[0]!;
    expect(nav.isWalkable({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 })).toBe(false);
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

  it("chega perto de todo lugar de sentar, jogar e usar", () => {
    const start = map.spawns[0]!;
    for (const o of map.objects) {
      if (!o.interact) continue;
      for (const p of [o.interact.point, ...(o.interact.more ?? [])]) {
        const path = nav.findPath(start, p);
        expect(path, o.id).not.toBeNull();
        expect(dist(path!.at(-1)!, p), `${o.id} (${o.type})`).toBeLessThanOrEqual(o.interact.radius);
      }
    }
  });

  it("passa por todas as portas (alcança o centro de cada sala)", () => {
    const start = map.spawns[0]!;
    for (const z of map.zones.filter((z) => z.listed)) {
      const c = { x: z.polygon.reduce((s, p) => s + p.x, 0) / z.polygon.length, z: z.polygon.reduce((s, p) => s + p.z, 0) / z.polygon.length };
      const path = nav.findPath(start, c);
      expect(path, z.name).not.toBeNull();
      expect(zones.zoneAt(path!.at(-1)!)?.id, z.name).toBe(z.id);
    }
  });
});

describe("audição", () => {
  it("ouve com volume cheio quem está perto no corredor", () => {
    const h = hearing(map.walls, at({ x: 0, z: -5.5 }), at({ x: 1, z: -5.5 }));
    expect(h).toMatchObject({ mode: "clear", gain: 1 });
  });

  it("o volume cai com a distância e, de longe, chega abafado", () => {
    const mid = hearing(map.walls, at({ x: 0, z: -5.5 }), at({ x: 4, z: -5.5 }));
    expect(mid.mode).toBe("clear");
    expect(mid.gain).toBeLessThan(1);
    expect(mid.gain).toBeGreaterThanOrEqual(HEARING.edgeGain);
    const far = hearing(map.walls, at({ x: 0, z: -5.5 }), at({ x: 9, z: -5.5 }));
    expect(far.mode).toBe("ambient");
    expect(far.muffled).toBe(true);
  });

  it("na sala de reunião todos se ouvem e quem está fora não ouve nada", () => {
    const a = { x: -22, z: -1 };
    const b = { x: -19.5, z: 1.5 };
    const corridor = { x: -21, z: -5.5 };
    expect(at(a).zone?.kind).toBe("meeting");
    expect(hearing(map.walls, at(a), at(b))).toMatchObject({ mode: "clear", gain: 1 });
    expect(hearing(map.walls, at(corridor), at(a)).mode).toBe("none");
  });

  it("cabine de foco é isolada", () => {
    const inside = { x: 24.5, z: -2.4 };
    const hall = { x: 20.5, z: -2.4 };
    expect(at(inside).zone?.kind).toBe("focus");
    expect(hearing(map.walls, at(hall), at(inside)).mode).toBe("none");
  });

  it("quem está no palco é ouvido no auditório inteiro, e ninguém de fora ouve", () => {
    const stage = { x: 24.5, z: 17 };
    const back = { x: 11.6, z: 20 };
    const corridor = { x: 15, z: 10.5 };
    expect(at(stage).zone?.kind).toBe("stage");
    expect(hearing(map.walls, at(back), at(stage))).toMatchObject({ mode: "clear", gain: 1 });
    expect(hearing(map.walls, at(corridor), at(stage)).mode).toBe("none");
  });

  it("parede entre salas abertas abafa", () => {
    // Dev Lab e Produto & Design são vizinhos, separados por parede.
    const h = hearing(map.walls, at({ x: -12.8, z: -11 }), at({ x: -11.2, z: -11 }));
    expect(h.mode).toBe("ambient");
    expect(h.muffled).toBe(true);
  });
});
