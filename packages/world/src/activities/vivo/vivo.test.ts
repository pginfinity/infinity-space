import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { NavGrid } from "../../nav.ts";
import { HELD_ITEMS } from "../../protocol.ts";
import { vivoDay, vivoHash } from "./day.ts";
import { COPA_STATIONS, COPA_STATION_TYPES, copaCount, copaCountsFor, copaEmptyCounts, copaProgress, copaServes } from "./copa.ts";
import { PLANT_DRY_MS, PLANT_HAPPY, plantInitialWateredAt, plantLevel, plantSadAt, plantStage, plantWilt, plantsHappyCount } from "./plants.ts";
import { orbiArriveAt, orbiPathLength, orbiPoseAt, orbiTrimPath, ORBI_ZONES } from "./orbi.ts";
import { JUKEBOX_PER_PERSON, JUKEBOX_QUEUE_MAX, jukeboxAdvance, jukeboxCanAdd, jukeboxCleanTracks, jukeboxOffset, type JukeboxState } from "./jukebox.ts";
import { VIVO_HELD, heldGestureGap, isHeldItem } from "./held.ts";

const map = buildStationMap();

describe("vivo: dia e hash", () => {
  it("o dia vira à meia-noite de Florianópolis, não à meia-noite UTC", () => {
    // 02:30 UTC de 15/11 ainda é 14/11 em Florianópolis (UTC-3).
    expect(vivoDay(Date.UTC(2026, 10, 15, 2, 30))).toBe("2026-11-14");
    expect(vivoDay(Date.UTC(2026, 10, 15, 3, 30))).toBe("2026-11-15");
  });
  it("hash estável entre 0 e 1", () => {
    expect(vivoHash("planta-1")).toBe(vivoHash("planta-1"));
    for (const s of ["a", "b", "plant-tall-3", ""]) {
      expect(vivoHash(s)).toBeGreaterThanOrEqual(0);
      expect(vivoHash(s)).toBeLessThan(1);
    }
  });
});

describe("vivo: copa", () => {
  it("cada estação da copa existe no mapa e serve só o próprio cardápio", () => {
    for (const t of COPA_STATION_TYPES) expect(map.objects.some((o) => o.type === t)).toBe(true);
    expect(copaServes("coffee-machine", "coffee")).toBe(true);
    expect(copaServes("coffee-machine", "tea")).toBe(true);
    expect(copaServes("coffee-machine", "juice")).toBe(false);
    expect(copaServes("fridge", "juice")).toBe(true);
    expect(copaServes("kitchen-counter", "popcorn")).toBe(true);
    expect(copaServes("water-cooler", "water")).toBe(true);
    expect(copaServes("sofa", "coffee")).toBe(false);
    expect(copaServes("coffee-machine", { item: "coffee" })).toBe(false);
    for (const r of Object.values(COPA_STATIONS)) {
      expect(r.prepMs).toBeGreaterThan(500);
      expect(r.prepMs).toBeLessThan(6000);
      for (const it of r.items) expect((HELD_ITEMS as readonly string[]).includes(it)).toBe(true);
    }
  });

  it("o contador soma no dia e zera quando o dia vira", () => {
    const day1 = Date.UTC(2026, 10, 15, 15);
    const day2 = Date.UTC(2026, 10, 16, 15);
    let s = { day: "", counts: copaEmptyCounts() };
    s = copaCount(s, "coffee", day1);
    s = copaCount(s, "coffee", day1 + 1000);
    s = copaCount(s, "tea", day1 + 2000);
    expect(s.counts).toMatchObject({ coffee: 2, tea: 1, water: 0 });
    s = copaCount(s, "water", day2);
    expect(s.day).toBe("2026-11-16");
    expect(s.counts).toMatchObject({ coffee: 0, tea: 0, water: 1 });
    expect(copaCountsFor(s, "2026-11-17").water).toBe(0);
  });

  it("progresso do preparo vai de 0 a 1", () => {
    expect(copaProgress({ at: 1000, until: 3000 }, 0)).toBe(0);
    expect(copaProgress({ at: 1000, until: 3000 }, 2000)).toBeCloseTo(0.5);
    expect(copaProgress({ at: 1000, until: 3000 }, 9000)).toBe(1);
  });
});

describe("vivo: plantas", () => {
  it("a água cai de 1 a 0 em cerca de 3 dias", () => {
    const t0 = 1_000_000;
    expect(plantLevel(t0, t0)).toBe(1);
    expect(plantLevel(t0, t0 + PLANT_DRY_MS / 2)).toBeCloseTo(0.5);
    expect(plantLevel(t0, t0 + PLANT_DRY_MS * 2)).toBe(0);
    expect(plantLevel(undefined, t0)).toBe(0);
    expect(PLANT_DRY_MS).toBe(3 * 86_400_000);
  });

  it("murcha aos poucos e conta como feliz até o limite", () => {
    expect(plantWilt(1)).toBe(0);
    expect(plantWilt(0.6)).toBe(0);
    expect(plantWilt(0.3)).toBeGreaterThan(0.2);
    expect(plantWilt(0.05)).toBeGreaterThan(0.95);
    expect(plantStage(0.9)).toBe("happy");
    expect(plantStage(0.3)).toBe("thirsty");
    expect(plantStage(0.05)).toBe("wilted");
    const t0 = 5_000_000;
    expect(plantLevel(t0, plantSadAt(t0))).toBeCloseTo(PLANT_HAPPY);
  });

  it("a estação nasce com plantas espalhadas pelo ciclo (algumas pedindo água)", () => {
    const now = Date.UTC(2026, 10, 15);
    const ids = map.objects.filter((o) => o.type.startsWith("plant")).map((o) => o.id);
    expect(ids.length).toBeGreaterThan(20);
    const watered = Object.fromEntries(ids.map((id) => [id, plantInitialWateredAt(id, now)]));
    const happy = plantsHappyCount(watered, ids, now);
    expect(happy).toBeGreaterThan(0);
    expect(happy).toBeLessThan(ids.length);
    for (const id of ids) expect(watered[id]).toBe(plantInitialWateredAt(id, now));
  });
});

describe("vivo: Orbi", () => {
  const s = { from: { x: 0, z: 0 }, path: [{ x: 3, z: 0 }, { x: 3, z: 4 }], speed: 1, startAt: 10_000, yaw: 0 };

  it("anda pelo trajeto com a mesma posição para todos no mesmo instante", () => {
    expect(orbiPathLength(s.from, s.path)).toBe(7);
    expect(orbiArriveAt(s)).toBe(17_000);
    const a = orbiPoseAt(s, 9_000);
    expect([a.x, a.z, a.moving]).toEqual([0, 0, true]);
    const b = orbiPoseAt(s, 11_500);
    expect(b.x).toBeCloseTo(1.5);
    expect(b.yaw).toBeCloseTo(Math.PI / 2); // indo para o leste
    const c = orbiPoseAt(s, 15_000);
    expect([c.x, c.z]).toEqual([3, 2]);
    expect(c.yaw).toBeCloseTo(Math.PI); // indo para o sul
    const d = orbiPoseAt(s, 60_000);
    expect([d.x, d.z, d.moving]).toEqual([3, 4, false]);
  });

  it("parado, olha para o yaw guardado", () => {
    const p = orbiPoseAt({ ...s, path: [], yaw: 1.2 }, 99_999);
    expect(p).toMatchObject({ x: 0, z: 0, yaw: 1.2, moving: false });
  });

  it("para a uma distância de quem chamou", () => {
    const trimmed = orbiTrimPath(s.from, s.path, 1.5);
    expect(orbiPathLength(s.from, trimmed)).toBeCloseTo(5.5);
    expect(trimmed.at(-1)).toEqual({ x: 3, z: 2.5 });
    expect(orbiTrimPath(s.from, [{ x: 1, z: 0 }], 1.5)).toEqual([]);
  });

  it("as áreas do passeio existem e têm chão andável", () => {
    const nav = NavGrid.fromMap(map);
    for (const id of ORBI_ZONES) {
      const z = map.zones.find((zz) => zz.id === id);
      expect(z, id).toBeTruthy();
      expect(["open"]).toContain(z!.kind);
      const c = z!.polygon.reduce((acc, p) => ({ x: acc.x + p.x / z!.polygon.length, z: acc.z + p.z / z!.polygon.length }), { x: 0, z: 0 });
      expect(nav.nearestWalkable(c, 4), id).toBeTruthy();
    }
  });
});

describe("vivo: jukebox", () => {
  const len: Record<string, number> = { a: 60, b: 90, c: 30 };
  const seconds = (id: string) => len[id];
  const known = (id: string) => id in len;

  it("confere faixa, fila cheia e limite por pessoa", () => {
    const s: JukeboxState = { playing: null, queue: [], now: 0 };
    expect(jukeboxCanAdd(s, "p1", "zzz", known)).toBe("unknown");
    expect(jukeboxCanAdd(s, "p1", "a", known)).toBeNull();
    const mine = Array.from({ length: JUKEBOX_PER_PERSON }, () => ({ track: "a", by: "Ana", byId: "p1" }));
    expect(jukeboxCanAdd({ ...s, queue: mine }, "p1", "b", known)).toBe("limit");
    expect(jukeboxCanAdd({ ...s, queue: mine }, "p2", "b", known)).toBeNull();
    const full = Array.from({ length: JUKEBOX_QUEUE_MAX }, (_, i) => ({ track: "a", by: "X", byId: `p${i}` }));
    expect(jukeboxCanAdd({ ...s, queue: full }, "nova", "b", known)).toBe("full");
  });

  it("puxa a próxima faixa exatamente quando a anterior acaba", () => {
    let s: JukeboxState = { playing: null, queue: [{ track: "a", by: "Ana", byId: "1" }, { track: "c", by: "Bia", byId: "2" }], now: 0 };
    s = jukeboxAdvance(s, 1000, seconds);
    expect(s.playing).toMatchObject({ track: "a", startAt: 1000 });
    expect(s.queue).toHaveLength(1);
    const same = jukeboxAdvance(s, 30_000, seconds);
    expect(same).toBe(s);
    s = jukeboxAdvance(s, 61_500, seconds);
    expect(s.playing).toMatchObject({ track: "c", startAt: 61_000 });
    s = jukeboxAdvance(s, 200_000, seconds);
    expect(s.playing).toBeNull();
    expect(jukeboxOffset({ startAt: 1000 }, 4000)).toBe(3);
  });

  it("limpa a lista de faixas do JSON", () => {
    const clean = jukeboxCleanTracks([
      { id: "ok-1", title: "Ok", mood: "calmo", seconds: 120, prompt: "x" },
      { id: "ok-1", title: "Repetida", seconds: 120 },
      { id: "Errado Id", title: "x", seconds: 120 },
      { id: "curta", title: "x", seconds: 3 },
      null,
    ]);
    expect(clean.map((t) => t.id)).toEqual(["ok-1"]);
    expect(clean[0]!.file).toBe("/music/ok-1.mp3");
  });
});

describe("vivo: itens na mão", () => {
  it("todo item da lista tem jeito de segurar e gesto", () => {
    for (const it of HELD_ITEMS) expect(VIVO_HELD[it]).toBeTruthy();
    expect(isHeldItem("coffee")).toBe(true);
    expect(isHeldItem("bazuca")).toBe(false);
  });
  it("intervalo do gesto parado fica entre 6,5 e 14 s", () => {
    for (let i = 0; i < 50; i++) {
      const g = heldGestureGap(0.37, i);
      expect(g).toBeGreaterThanOrEqual(6500);
      expect(g).toBeLessThanOrEqual(14000);
    }
  });
});
