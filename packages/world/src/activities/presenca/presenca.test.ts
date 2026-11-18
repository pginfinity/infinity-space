import { describe, expect, it } from "vitest";
import { wallBetween, ZoneIndex } from "../../audio.ts";
import { POSE_HZ, RUN_SPEED } from "../../constants.ts";
import { dist, pointInPolygon } from "../../geometry.ts";
import { buildStationMap } from "../../map/estacao.ts";
import { NavGrid } from "../../nav.ts";
import {
  PRESENCA_DASH_SPEED,
  PRESENCA_PERSONAL,
  chamadoPathLength,
  presencaFreeSpot,
  presencaRoomSpot,
  seguirCanEnter,
  seguirClip,
  seguirCycle,
  seguirGoal,
} from "./index.ts";

const MAP = buildStationMap();
const NAV = NavGrid.fromMap(MAP);
const ZONES = new ZoneIndex(MAP.zones);
const zoneAt = (p: { x: number; z: number }) => ZONES.zoneAt(p);
const zone = (id: string) => MAP.zones.find((z) => z.id === id)!;

describe("seguir", () => {
  it("não deixa formar roda", () => {
    const f = new Map([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(seguirCycle(f, "c", "a")).toBe(true);
    expect(seguirCycle(f, "b", "a")).toBe(true);
    expect(seguirCycle(f, "d", "a")).toBe(false);
    expect(seguirCycle(new Map(), "a", "a")).toBe(true);
  });

  it("o alvo fica atrás de quem é seguido, do lado de quem segue", () => {
    const g = seguirGoal({ x: 0, z: 0 }, { x: 5, z: 0 }, 1.2);
    expect(g.x).toBeCloseTo(1.2);
    expect(g.z).toBeCloseTo(0);
    // Em cima: escolhe um lado qualquer, sem dividir por zero.
    expect(dist(seguirGoal({ x: 1, z: 1 }, { x: 1, z: 1 }, 1.2), { x: 1, z: 1 })).toBeCloseTo(1.2);
  });

  it("sala fechada só com quem é seguido lá dentro; cabine individual nunca", () => {
    const lua = zone("eclipse");
    const cabine = zone("foco-1");
    const atrio = zone("atrio");
    expect(seguirCanEnter(atrio, undefined, undefined)).toBe(true);
    expect(seguirCanEnter(undefined, undefined, undefined)).toBe(true);
    expect(seguirCanEnter(lua, "atrio", "atrio")).toBe(false);
    expect(seguirCanEnter(lua, "eclipse", "atrio")).toBe(true);
    expect(seguirCanEnter(cabine, "foco-1", "foco-hall")).toBe(false);
    // Já estava lá dentro: pode andar para sair.
    expect(seguirCanEnter(lua, "atrio", "eclipse")).toBe(true);
  });

  it("corta a rota antes da porta da Sala Eclipse quando quem é seguido não está lá", () => {
    const from = { x: -17.4, z: 10.6 };
    const to = { x: -19, z: 5 };
    const path = NAV.findPath(from, to)!;
    expect(path).not.toBeNull();
    const fora = seguirClip(from, path, zoneAt, "corredor-sul", zoneAt(from)?.id);
    expect(fora.clipped).toBe(true);
    const end = fora.path.at(-1) ?? from;
    expect(zoneAt(end)?.id).not.toBe("eclipse");
    expect(end.z).toBeGreaterThan(9);
    // Com a pessoa lá dentro, entra.
    const dentro = seguirClip(from, path, zoneAt, "eclipse", zoneAt(from)?.id);
    expect(dentro.clipped).toBe(false);
    expect(dentro.path.at(-1)).toEqual(path.at(-1));
  });

  it("não entra na cabine individual nem com a pessoa lá dentro", () => {
    const cab = zone("foco-1");
    const inside = presencaRoomSpot(NAV, cab)!;
    const from = { x: 20.5, z: 2 };
    const path = NAV.findPath(from, inside)!;
    const r = seguirClip(from, path, zoneAt, "foco-1", "foco-hall");
    expect(r.clipped).toBe(true);
    for (const p of r.path) expect(zoneAt(p)?.id).not.toBe("foco-1");
  });
});

describe("lugar livre perto de alguém", () => {
  it("é andável, sem parede no meio e longe dos outros", () => {
    const center = { x: -2, z: 3.5 };
    const others = [center, { x: -2, z: 2.4 }, { x: -0.9, z: 3.5 }];
    const p = presencaFreeSpot(NAV, MAP.walls, center, others)!;
    expect(p).not.toBeNull();
    expect(NAV.isWalkable(p)).toBe(true);
    expect(wallBetween(MAP.walls, center, p)).toBe(false);
    for (const o of others) expect(dist(o, p)).toBeGreaterThanOrEqual(PRESENCA_PERSONAL);
    expect(dist(p, center)).toBeLessThan(3.1);
  });

  it("prefere o lado de onde a pessoa vem", () => {
    const center = { x: -2, z: 3.5 };
    const p = presencaFreeSpot(NAV, MAP.walls, center, [center], { x: -2, z: -10 })!;
    expect(p.z).toBeLessThan(center.z);
  });

  it("dentro de uma sala de reunião, fica do lado de dentro", () => {
    const lua = zone("eclipse");
    const center = { x: -18, z: 4 };
    const p = presencaFreeSpot(NAV, MAP.walls, center, [center], { x: 0, z: 10 })!;
    expect(pointInPolygon(p, lua.polygon)).toBe(true);
  });
});

describe("ponto de chegada das salas", () => {
  it("toda sala listada tem um ponto andável, dentro dela e alcançável", () => {
    const start = MAP.spawns[0]!;
    for (const z of MAP.zones.filter((z) => z.listed && z.kind !== "stage")) {
      const p = presencaRoomSpot(NAV, z);
      expect(p, z.name).not.toBeNull();
      expect(pointInPolygon(p!, z.polygon), z.name).toBe(true);
      expect(NAV.isWalkable(p!), z.name).toBe(true);
      expect(NAV.findPath(start, p!), z.name).not.toBeNull();
    }
  });
});

describe("travessia rápida", () => {
  it("cada pose cabe na validação de velocidade da sala, com folga", () => {
    // Pior caso realista: uma pose a cada 1,5 quadro de 60 Hz, chegando com metade do intervalo.
    const interval = 1.25 / POSE_HZ;
    const step = PRESENCA_DASH_SPEED * interval;
    const allowed = RUN_SPEED * 1.6 * (interval / 2) + 0.5;
    expect(step).toBeLessThan(allowed);
  });

  it("mede o caminho a partir da origem", () => {
    expect(chamadoPathLength({ x: 0, z: 0 }, [{ x: 3, z: 4 }, { x: 3, z: 10 }])).toBeCloseTo(11);
    expect(chamadoPathLength({ x: 0, z: 0 }, [])).toBe(0);
  });
});
