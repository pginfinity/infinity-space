import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { officeLight, sunAt, sunOnEarth } from "./sun.ts";

/** Meio-dia solar em Florianópolis (longitude -48,55°) ≈ 15h14 UTC. */
const noonUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 15, 14));

describe("Sol sobre Florianópolis", () => {
  it("meio-dia no solstício de dezembro: Sol quase a pino (~86°)", () => {
    expect(sunAt(noonUtc(2026, 12, 21)).altitude).toBeGreaterThan(83);
  });

  it("meio-dia no solstício de junho: Sol baixo (~39°)", () => {
    const a = sunAt(noonUtc(2026, 6, 21)).altitude;
    expect(a).toBeGreaterThan(35);
    expect(a).toBeLessThan(43);
  });

  it("meia-noite: Sol abaixo do horizonte", () => {
    expect(sunAt(new Date(Date.UTC(2026, 10, 16, 3, 14))).altitude).toBeLessThan(-30);
  });

  it("de manhã o Sol vem do leste; à tarde, do oeste", () => {
    expect(sunAt(new Date(Date.UTC(2026, 10, 16, 12, 0))).enu.x).toBeGreaterThan(0);
    expect(sunAt(new Date(Date.UTC(2026, 10, 16, 19, 0))).enu.x).toBeLessThan(0);
  });

  it("no referencial da Terra, o Sol do meio-dia aponta para a estação", () => {
    const up = new THREE.Vector3(-60, 760, 260).normalize();
    const dir = sunOnEarth(sunAt(noonUtc(2026, 12, 21)).enu, up);
    expect(dir.dot(up)).toBeGreaterThan(0.99);
  });

  it("luz do escritório: dia forte, fim de tarde dourado, noite mais suave", () => {
    const day = officeLight(40);
    const dusk = officeLight(2);
    const night = officeLight(-30);
    expect(day.intensity).toBeGreaterThan(night.intensity);
    expect(dusk.color.r).toBeGreaterThan(dusk.color.b);
    expect(night.color.b).toBeGreaterThan(night.color.r - 0.1);
  });
});
