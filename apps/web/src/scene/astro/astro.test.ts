import { describe, expect, it } from "vitest";
import {
  altitudeOf,
  apply,
  azimuthOf,
  EARTH_ANGULAR_RADIUS,
  eqjToScene,
  moonPhaseKey,
  nextLightChange,
  normalize,
  raDecToEqj,
  skyAt,
  sunAboveLimb,
  upcoming,
} from "./astro.ts";
import { lightDirection, MIN_ELEVATION, officeLight } from "./light.ts";

/** Horário de São Paulo (UTC-3, sem horário de verão desde 2019). */
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("céu sobre São Paulo", () => {
  it("meio-dia de 17/11/2026: Sol quase a pino (declinação -19°, latitude -23,5° → ~85°)", () => {
    const s = skyAt(sp("2026-11-17T11:50:00"));
    expect(altitudeOf(s.sun.dir)).toBeGreaterThan(80);
  });

  it("meia-noite: Sol bem abaixo do horizonte", () => {
    expect(altitudeOf(skyAt(sp("2026-11-17T00:00:00")).sun.dir)).toBeLessThan(-40);
  });

  it("de manhã o Sol nasce no leste (x > 0); à tarde vai para o oeste", () => {
    expect(skyAt(sp("2026-11-17T08:00:00")).sun.dir[0]).toBeGreaterThan(0.3);
    expect(skyAt(sp("2026-11-17T16:00:00")).sun.dir[0]).toBeLessThan(-0.3);
  });

  it("polo norte celeste fica ao norte, 23,55° abaixo do horizonte", () => {
    const s = skyAt(sp("2026-11-17T21:00:00"));
    expect(altitudeOf(s.north)).toBeCloseTo(-23.55, 0);
    expect(Math.abs(s.north[0])).toBeLessThan(0.02);
    expect(s.north[2]).toBeLessThan(0); // norte = -z
  });

  it("Cruzeiro do Sul: Acrux (12h26m, -63°06') alto no céu da madrugada de novembro", () => {
    const acrux = apply(eqjToScene(sp("2026-11-17T04:30:00")), raDecToEqj(12.4433, -63.099));
    const alt = altitudeOf(normalize(acrux));
    expect(alt).toBeGreaterThan(25);
    expect(alt).toBeLessThan(40);
    // a sudeste (azimute entre 90° e 180°)
    const az = azimuthOf(normalize(acrux));
    expect(az).toBeGreaterThan(110);
    expect(az).toBeLessThan(180);
  });

  it("Lua de 17/11/2026: quarto crescente (lua nova em 09/11, cheia em 24/11)", () => {
    const s = skyAt(sp("2026-11-17T12:00:00"));
    expect(s.moon.fraction).toBeGreaterThan(0.4);
    expect(s.moon.fraction).toBeLessThan(0.6);
    expect(s.moon.phase).toBeGreaterThan(80);
    expect(s.moon.phase).toBeLessThan(100);
    expect(s.moon.phaseKey).toBe("quartoCrescente");
    // distância da Lua entre perigeu e apogeu; raio aparente ~0,25°
    expect(s.moon.distanceKm).toBeGreaterThan(350_000);
    expect(s.moon.distanceKm).toBeLessThan(410_000);
    expect(s.moon.radius).toBeGreaterThan(0.24);
    expect(s.moon.radius).toBeLessThan(0.29);
  });

  it("lua cheia de 03/03/2026 (eclipse total): quase toda iluminada e oposta ao Sol", () => {
    const s = skyAt(new Date("2026-03-03T11:33:00Z"));
    expect(s.moon.fraction).toBeGreaterThan(0.99);
    expect(s.moon.phaseKey).toBe("cheia");
    const dot = s.moon.dir[0] * s.sun.dir[0] + s.moon.dir[1] * s.sun.dir[1] + s.moon.dir[2] * s.sun.dir[2];
    expect(dot).toBeLessThan(-0.99);
    // A Lua está dentro da sombra da Terra: perto do eixo anti-Sol (umbra ~0,73 raio terrestre).
    const g = s.moon.geo;
    const t = -(g[0] * s.sun.dir[0] + g[1] * s.sun.dir[1] + g[2] * s.sun.dir[2]);
    const off = Math.hypot(g[0] + s.sun.dir[0] * t, g[1] + s.sun.dir[1] * t, g[2] + s.sun.dir[2] * t);
    expect(off).toBeLessThan(0.6);
  });

  it("planetas: quatro, com magnitudes plausíveis (Vênus o mais brilhante)", () => {
    const s = skyAt(sp("2026-11-17T21:00:00"));
    expect(s.planets.map((p) => p.key)).toEqual(["venus", "marte", "jupiter", "saturno"]);
    const venus = s.planets[0]!;
    for (const p of s.planets) {
      expect(p.mag).toBeGreaterThan(-5);
      expect(p.mag).toBeLessThan(2);
      expect(Math.hypot(...p.dir)).toBeCloseTo(1, 6);
      expect(venus.mag).toBeLessThanOrEqual(p.mag);
    }
  });

  it("fases: nomes nas faixas certas", () => {
    expect(moonPhaseKey(0)).toBe("nova");
    expect(moonPhaseKey(45)).toBe("crescente");
    expect(moonPhaseKey(90)).toBe("quartoCrescente");
    expect(moonPhaseKey(135)).toBe("gibosaCrescente");
    expect(moonPhaseKey(180)).toBe("cheia");
    expect(moonPhaseKey(225)).toBe("gibosaMinguante");
    expect(moonPhaseKey(270)).toBe("quartoMinguante");
    expect(moonPhaseKey(315)).toBe("minguante");
    expect(moonPhaseKey(359)).toBe("nova");
  });
});

describe("luz na estação (a 400 km, a Terra cobre ~70° em volta do nadir)", () => {
  it("raio aparente da Terra", () => {
    expect(EARTH_ANGULAR_RADIUS).toBeGreaterThan(69);
    expect(EARTH_ANGULAR_RADIUS).toBeLessThan(71);
  });

  it("dia mais longo que o de São Paulo: às 19h30 o Sol já se pôs em SP, mas a estação ainda está no Sol", () => {
    const s = skyAt(sp("2026-11-17T19:30:00"));
    expect(altitudeOf(s.sun.dir)).toBeLessThan(0);
    expect(s.station.light).toBe(1);
  });

  it("perto da meia-noite a estação fica na sombra da Terra", () => {
    const s = skyAt(sp("2026-11-17T23:30:00"));
    expect(s.station.sunAboveLimb).toBeLessThan(0);
    expect(s.station.light).toBe(0);
  });

  it("Sol a pino está bem acima da borda da Terra", () => {
    expect(sunAboveLimb([0, 1, 0])).toBeCloseTo(180 - EARTH_ANGULAR_RADIUS, 6);
    expect(sunAboveLimb([0, -1, 0])).toBeCloseTo(-EARTH_ANGULAR_RADIUS, 6);
  });

  it("acha a próxima entrada na sombra (noite de 17/11) e a saída, horas depois", () => {
    const enter = nextLightChange(sp("2026-11-17T18:00:00"));
    expect(enter?.toLight).toBe(false);
    const leave = nextLightChange(new Date(enter!.at.getTime() + 60_000));
    expect(leave?.toLight).toBe(true);
    const hours = (leave!.at.getTime() - enter!.at.getTime()) / 3600_000;
    // Noite da estação bem mais curta que a de SP (~10,7 h em novembro).
    expect(hours).toBeGreaterThan(3);
    expect(hours).toBeLessThan(9);
  });

  it("luz do escritório: forte de dia, quente perto da borda, só ambiente na sombra", () => {
    const noon = officeLight(skyAt(sp("2026-11-17T12:00:00")));
    const dusk = officeLight({ sun: { dir: [0.9, -0.3, 0.3] }, station: { sunAboveLimb: 2, light: 1 } });
    const night = officeLight(skyAt(sp("2026-11-17T23:59:00")));
    expect(noon.intensity).toBeGreaterThan(1.5);
    expect(dusk.intensity).toBeLessThan(noon.intensity);
    expect(dusk.color[0] - dusk.color[2]).toBeGreaterThan(noon.color[0] - noon.color[2]);
    expect(night.intensity).toBe(0);
    expect(night.skyColor[0]).toBeGreaterThan(night.skyColor[2]); // ambiente quente
  });

  it("direção da luz nunca fica abaixo da altura mínima (o rumo continua o do Sol)", () => {
    const d = lightDirection(normalize([1, -0.4, 0.2]));
    expect(altitudeOf(d)).toBeCloseTo(MIN_ELEVATION, 6);
    expect(Math.atan2(d[2], d[0])).toBeCloseTo(Math.atan2(0.2, 1), 6);
    expect(lightDirection([0, 1, 0])).toEqual([0, 1, 0]);
  });
});

describe("próximos acontecimentos", () => {
  const u = upcoming(sp("2026-11-17T21:00:00"));

  it("próximo eclipse solar: anular de 06/02/2027 (visível no sul da América do Sul)", () => {
    expect(u.solar.kind).toBe("annular");
    expect(u.solar.peak.toISOString().slice(0, 10)).toBe("2027-02-06");
  });

  it("próximo eclipse lunar: penumbral de 20/02/2027", () => {
    expect(u.lunar.kind).toBe("penumbral");
    expect(u.lunar.peak.toISOString().slice(0, 10)).toBe("2027-02-20");
    expect(u.lunar.now).toBe(false);
  });

  it("próximas lua cheia (24/11) e nova (09/12)", () => {
    expect(u.fullMoon.toISOString().slice(0, 10)).toBe("2026-11-24");
    expect(u.newMoon.toISOString().slice(0, 10)).toBe("2026-12-09");
  });

  it("eclipse lunar em andamento é reconhecido (03/03/2026, pico 11h33 UTC)", () => {
    const during = upcoming(new Date("2026-03-03T11:00:00Z"));
    expect(during.lunar.now).toBe(true);
    expect(during.lunar.kind).toBe("total");
  });
});
