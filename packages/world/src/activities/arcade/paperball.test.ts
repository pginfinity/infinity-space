import { describe, expect, it } from "vitest";
import { PAPER, paperArc, paperDay, paperFlight, paperLanding, paperOutcome } from "./paperball.ts";

describe("bolinha de papel", () => {
  it("a força decide a distância, a mira a direção", () => {
    const a = paperLanding({ x: 0, z: 0 }, { x: 0, z: -2 }, 0);
    expect(a.z).toBeCloseTo(-PAPER.MIN, 6);
    const b = paperLanding({ x: 0, z: 0 }, { x: 3, z: 0 }, 1);
    expect(b.x).toBeCloseTo(PAPER.MAX, 6);
    expect(paperLanding({ x: 0, z: 0 }, { x: 1, z: 0 }, 9).x).toBeCloseTo(PAPER.MAX, 6);
  });

  it("acerto, trave, erro e de perto demais", () => {
    const bin = { x: 4, z: 0 };
    const far = { x: 0, z: 0 };
    expect(paperOutcome(far, { x: 4.1, z: 0.1 }, bin)).toBe("hit");
    expect(paperOutcome(far, { x: 4.33, z: 0 }, bin)).toBe("rim");
    expect(paperOutcome(far, { x: 5, z: 0 }, bin)).toBe("miss");
    expect(paperOutcome({ x: 3, z: 0 }, { x: 4, z: 0 }, bin)).toBe("close");
    // força certa para a distância acerta
    const p = (4 - PAPER.MIN) / (PAPER.MAX - PAPER.MIN);
    expect(paperOutcome(far, paperLanding(far, { x: 1, z: 0 }, p), bin)).toBe("hit");
  });

  it("o voo sai da mão, sobe e termina na altura pedida", () => {
    const o = { x: 0, y: 0, z: 0 };
    paperArc({ x: 0, z: 0 }, { x: 4, z: 0 }, 0, PAPER.BIN_TOP, o);
    expect(o.y).toBeCloseTo(PAPER.HAND, 6);
    paperArc({ x: 0, z: 0 }, { x: 4, z: 0 }, 0.5, PAPER.BIN_TOP, o);
    expect(o.y).toBeGreaterThan(PAPER.HAND);
    paperArc({ x: 0, z: 0 }, { x: 4, z: 0 }, 1, PAPER.BIN_TOP, o);
    expect(o.y).toBeCloseTo(PAPER.BIN_TOP, 6);
    expect(o.x).toBeCloseTo(4, 6);
    expect(paperFlight({ x: 0, z: 0 }, { x: 6, z: 0 })).toBeGreaterThan(paperFlight({ x: 0, z: 0 }, { x: 2, z: 0 }));
  });

  it("o dia vira à meia-noite de Brasília", () => {
    const utc = Date.UTC(2026, 10, 16, 2, 59); // 23:59 de 15/11 em Brasília
    expect(paperDay(utc)).toBe("2026-11-15");
    expect(paperDay(utc + 2 * 60_000)).toBe("2026-11-16");
  });
});
