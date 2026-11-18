import { describe, expect, it } from "vitest";
import { activeShowers, activity, meteorsInMinute, nextShower, peakNear, ratePerMinute, rng, SHOWERS } from "./meteors.ts";

const byKey = (k: string) => SHOWERS.find((s) => s.key === k)!;

describe("calendário das chuvas de meteoros", () => {
  it("Leônidas: pico em 17/11 (atividade 1), fora da janela em 05/11, fraca em 22/11", () => {
    const leo = byKey("leonidas");
    expect(activity(leo, Date.UTC(2026, 10, 17, 14))).toBeCloseTo(1, 6);
    expect(activity(leo, Date.UTC(2026, 10, 5))).toBe(0);
    const late = activity(leo, Date.UTC(2026, 10, 22));
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(0.05);
  });

  it("em 17/11/2026 a chuva ativa mais forte é a das Leônidas", () => {
    const act = activeShowers(Date.UTC(2026, 10, 17, 9));
    expect(act[0]?.shower.key).toBe("leonidas");
    expect(new Date(act[0]!.peak).toISOString().slice(0, 10)).toBe("2026-11-17");
  });

  it("Quadrântidas atravessam o ano (28/12 a 12/01)", () => {
    const qua = byKey("quadrantidas");
    expect(activity(qua, Date.UTC(2026, 11, 30))).toBeGreaterThan(0);
    expect(activity(qua, Date.UTC(2027, 0, 3, 21))).toBeCloseTo(1, 6);
    expect(activity(qua, Date.UTC(2027, 0, 20))).toBe(0);
    expect(new Date(peakNear(qua, Date.UTC(2026, 11, 30))).toISOString().slice(0, 10)).toBe("2027-01-03");
  });

  it("depois das Leônidas, a próxima é a das Geminídeas", () => {
    expect(nextShower(Date.UTC(2026, 10, 17)).shower.key).toBe("geminideas");
  });

  it("taxa: zero com o radiante bem abaixo do horizonte, maior com ele alto, limitada nas chuvas fortes", () => {
    const leo = byKey("leonidas");
    expect(ratePerMinute(leo, 1, -30)).toBe(0);
    expect(ratePerMinute(leo, 1, 60)).toBeGreaterThan(ratePerMinute(leo, 1, 10));
    expect(ratePerMinute(byKey("geminideas"), 1, 90)).toBeLessThanOrEqual(6);
  });
});

describe("meteoros determinísticos", () => {
  const rates = SHOWERS.map((s) => (s.key === "leonidas" ? 3 : 0));

  it("mesmo minuto, mesmos meteoros (todos veem o mesmo céu)", () => {
    const m = Math.floor(Date.UTC(2026, 10, 17, 7, 30) / 60_000);
    expect(meteorsInMinute(m, rates)).toEqual(meteorsInMinute(m, rates));
  });

  it("começam dentro do minuto e duram menos de 2 s", () => {
    const m = Math.floor(Date.UTC(2026, 10, 17, 7, 31) / 60_000);
    for (let k = 0; k < 30; k++) {
      for (const x of meteorsInMinute(m + k, rates)) {
        expect(x.t0).toBeGreaterThanOrEqual((m + k) * 60_000);
        expect(x.t0).toBeLessThan((m + k + 1) * 60_000);
        expect(x.dur).toBeLessThan(2000);
      }
    }
  });

  it("a taxa média bate com o pedido (3/min das Leônidas + esporádicos)", () => {
    const m0 = Math.floor(Date.UTC(2026, 10, 17, 6) / 60_000);
    let leo = 0;
    for (let k = 0; k < 600; k++) leo += meteorsInMinute(m0 + k, rates).filter((x) => x.shower === SHOWERS.findIndex((s) => s.key === "leonidas")).length;
    expect(leo / 600).toBeGreaterThan(2.5);
    expect(leo / 600).toBeLessThan(3.5);
  });

  it("sem chuva ativa, só um ou outro esporádico", () => {
    const m0 = Math.floor(Date.UTC(2026, 5, 1) / 60_000);
    let n = 0;
    for (let k = 0; k < 600; k++) n += meteorsInMinute(m0 + k, SHOWERS.map(() => 0)).length;
    expect(n / 600).toBeLessThan(0.3);
    expect(n).toBeGreaterThan(0);
  });

  it("gerador pseudoaleatório reproduzível", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
