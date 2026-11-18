import { describe, expect, it } from "vitest";
import {
  KONAMI,
  clockParts,
  hashSeed,
  isGigawattMinute,
  lightningFlash,
  morse,
  normalizePhrase,
  oneIn,
  pickIndex,
  prettyMorse,
  seededRandom,
  sequenceDetector,
  spellOf,
} from "./rules.ts";

describe("código Konami", () => {
  it("fecha com a sequência exata e zera depois", () => {
    const d = sequenceDetector();
    const hits = KONAMI.map((k) => d.push(k));
    expect(hits.slice(0, -1).every((h) => !h)).toBe(true);
    expect(hits.at(-1)).toBe(true);
    // logo depois, um "A" sozinho não repete o prêmio
    expect(d.push("KeyA")).toBe(false);
  });

  it("tolera tecla a mais no começo (↑ ↑ ↑ …) e modificadores no meio", () => {
    const d = sequenceDetector();
    d.push("ArrowUp");
    let ok = false;
    for (const k of KONAMI) {
      d.push("ShiftLeft");
      ok = d.push(k);
    }
    expect(ok).toBe(true);
  });

  it("não fecha com a ordem trocada nem com outra tecla no meio", () => {
    const d = sequenceDetector();
    const wrong = [...KONAMI.slice(0, 9), "KeyB"];
    expect(wrong.some((k) => d.push(k))).toBe(false);
    const d2 = sequenceDetector();
    const broken = [...KONAMI.slice(0, 5), "KeyW", ...KONAMI.slice(5)];
    expect(broken.some((k) => d2.push(k))).toBe(false);
  });
});

describe("frases do mapa", () => {
  it("normaliza acento, caixa, pontuação e espaços", () => {
    expect(normalizePhrase("  Juro   SOLENEMENTE não fazer nada de bom!! ")).toBe("juro solenemente nao fazer nada de bom");
  });

  it("reconhece só a mensagem inteira", () => {
    expect(spellOf("Juro solenemente não fazer nada de bom.")).toBe("open");
    expect(spellOf("juro solenemente nao fazer nada de bom")).toBe("open");
    expect(spellOf("Malfeito, feito!")).toBe("close");
    expect(spellOf("eu juro solenemente não fazer nada de bom")).toBeNull();
    expect(spellOf("bom dia")).toBeNull();
  });
});

describe("sorteios com semente", () => {
  it("a mesma semente dá a mesma sequência; outra semente, outra", () => {
    const a = seededRandom(hashSeed("ana", 1));
    const b = seededRandom(hashSeed("ana", 1));
    const c = seededRandom(hashSeed("ana", 2));
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it("1 em n acerta perto de 1/n", () => {
    const r = seededRandom(42);
    let hits = 0;
    for (let i = 0; i < 12000; i++) if (oneIn(r, 12)) hits++;
    expect(hits).toBeGreaterThan(800);
    expect(hits).toBeLessThan(1200);
    expect(oneIn(r, 1)).toBe(true);
  });

  it("escolhe sem repetir o anterior e cobre todas as opções", () => {
    const r = seededRandom(7);
    const seen = new Set<number>();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const k = pickIndex(r, 6, last);
      expect(k).not.toBe(last);
      expect(k >= 0 && k < 6).toBe(true);
      seen.add(k);
      last = k;
    }
    expect(seen.size).toBe(6);
    expect(pickIndex(r, 1, 0)).toBe(0);
  });
});

describe("1,21 gigawatts", () => {
  it("só às 22:04", () => {
    expect(isGigawattMinute(22, 4)).toBe(true);
    expect(isGigawattMinute(22, 5)).toBe(false);
    expect(isGigawattMinute(10, 4)).toBe(false);
  });

  it("lê a hora no fuso do relógio das TVs", () => {
    // 2026-11-18 01:04:30 UTC = 22:04:30 em São Paulo (UTC-3)
    const ms = Date.UTC(2026, 10, 18, 1, 4, 30);
    expect(clockParts(ms, "America/Sao_Paulo")).toEqual({ hour: 22, minute: 4, second: 30 });
  });

  it("o relâmpago pisca no começo e a cada 15 s, e apaga no resto", () => {
    expect(lightningFlash(0.05)).toBe(1);
    expect(lightningFlash(15.05)).toBe(1);
    expect(lightningFlash(5)).toBe(0);
    expect(lightningFlash(0.5)).toBeGreaterThan(0);
    expect(lightningFlash(0.5)).toBeLessThan(0.9);
  });
});

describe("Morse", () => {
  it("STAY", () => {
    expect(morse("Stay")).toBe("... - .- -.--");
    expect(prettyMorse(morse("STAY"))).toBe("… — .- -.--");
  });
});
