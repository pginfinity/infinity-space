import { describe, expect, it } from "vitest";
import type { Vec3 } from "./astro.ts";
import { passesInWindow, SAT_SLOTS, SAT_WINDOW, satellitesAt } from "./satellites.ts";

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("satélites passando", () => {
  it("mesma janela, mesmas passagens (céu igual para todos)", () => {
    const k = Math.floor(Date.UTC(2026, 10, 19, 15) / SAT_WINDOW);
    expect(passesInWindow(k)).toEqual(passesInWindow(k));
  });

  it("~0,85 passagem a cada 5 min, arco perpendicular ao ponto de partida, começa acima de -15°", () => {
    const k0 = Math.floor(Date.UTC(2026, 0, 1) / SAT_WINDOW);
    let total = 0;
    for (let k = k0; k < k0 + 2000; k++) {
      for (const p of passesInWindow(k)) {
        total++;
        expect(len(p.start)).toBeCloseTo(1, 6);
        expect(len(p.toward)).toBeCloseTo(1, 6);
        expect(dot(p.start, p.toward)).toBeCloseTo(0, 6);
        expect(p.start[1]).toBeGreaterThan(Math.sin((-15.01 * Math.PI) / 180));
        expect(p.t0).toBeGreaterThanOrEqual(k * SAT_WINDOW);
        expect(p.t0).toBeLessThan((k + 1) * SAT_WINDOW);
      }
    }
    // floor(r·2,6): 0, 1 ou 2 passagens → média (1 + 2·0,6) / 2,6 ≈ 0,85 por janela
    expect(total / 2000).toBeGreaterThan(0.75);
    expect(total / 2000).toBeLessThan(0.95);
  });

  it("satellitesAt: direção unitária, mais apagado nas pontas, nunca passa de SAT_SLOTS", () => {
    const k = Math.floor(Date.UTC(2026, 10, 19, 15) / SAT_WINDOW);
    let p = passesInWindow(k)[0];
    for (let j = k + 1; !p; j++) p = passesInWindow(j)[0];
    const out: Array<{ dir: Vec3; mag: number }> = [];
    const mid = p.t0 + p.dur / 2;
    const n = satellitesAt(mid, out);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(SAT_SLOTS);
    const i = out.findIndex((s) => Math.abs(s.mag - p.mag) < 1e-9);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(len(out[i]!.dir)).toBeCloseTo(1, 6);
    // na ponta: 4 magnitudes mais fraco
    satellitesAt(p.t0 + 1, out);
    expect(out.some((s) => s.mag > p.mag + 3.9)).toBe(true);
  });
});
