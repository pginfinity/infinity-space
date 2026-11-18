import { beforeAll, describe, expect, it } from "vitest";
import { NavGrid, ZoneIndex, buildStationMap, dist, type MapDef, type ObjectType } from "../index.ts";

/** Homenagens do pacote easter: cada uma existe, fica fora da Sala Eclipse e dá para chegar perto. */

const TYPES: ObjectType[] = ["lens-rack", "crooked-book", "pill-dish", "brick-pillar", "fancy-pen", "barrel", "ramen-bowl", "duck-family"];

let map: MapDef;
let nav: NavGrid;
let zones: ZoneIndex;

beforeAll(() => {
  map = buildStationMap();
  nav = NavGrid.fromMap(map);
  zones = new ZoneIndex(map.zones);
});

describe("homenagens (pacote easter)", () => {
  it("cada tipo aparece no mapa (as pílulas são duas: vermelha e azul)", () => {
    for (const t of TYPES) expect(map.objects.filter((o) => o.type === t).length, t).toBeGreaterThan(0);
    const pills = map.objects.filter((o) => o.type === "pill-dish").map((o) => o.variant ?? 0);
    expect(pills.sort()).toEqual([0, 1]);
  });

  it("nenhuma fica na Sala Eclipse nem tem ponto de interação (não entram no guia)", () => {
    for (const o of map.objects.filter((x) => TYPES.includes(x.type))) {
      expect(zones.zoneAt(o.pos)?.id, o.id).not.toBe("eclipse");
      expect(o.interact, o.id).toBeUndefined();
    }
  });

  it("dá para chegar perto de cada uma a partir da chegada", () => {
    const start = map.spawns[0]!;
    for (const o of map.objects.filter((x) => TYPES.includes(x.type))) {
      const path = nav.findPath(start, o.pos);
      expect(path, o.id).not.toBeNull();
      // O alvo do pacote alcança ~1,3 m: o fim da rota tem que ficar dentro disso.
      expect(dist(path!.at(-1)!, o.pos), o.id).toBeLessThan(1.25);
    }
  });

  it("o que bloqueia não fecha passagem: as salas continuam alcançáveis pelo centro", () => {
    const start = map.spawns[0]!;
    for (const id of ["dev", "arcade"]) {
      const z = map.zones.find((x) => x.id === id)!;
      const c = { x: z.polygon.reduce((s, p) => s + p.x, 0) / 4, z: z.polygon.reduce((s, p) => s + p.z, 0) / 4 };
      expect(nav.findPath(start, c), id).not.toBeNull();
    }
  });
});
