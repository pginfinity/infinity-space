import { describe, expect, it } from "vitest";
import { awayChoice, awayDecision } from "./away.ts";

const MIN = 60_000;

describe("ausente automático", () => {
  it("desligado nunca muda nada", () => {
    expect(awayDecision({ status: "available", auto: false, idleMs: 99 * MIN, limitMs: 0 })).toBeNull();
  });

  it("fica ausente depois do tempo escolhido, só a partir de Disponível", () => {
    expect(awayDecision({ status: "available", auto: false, idleMs: 4 * MIN, limitMs: 5 * MIN })).toBeNull();
    expect(awayDecision({ status: "available", auto: false, idleMs: 5 * MIN, limitMs: 5 * MIN })).toBe("away");
    // Foco e Ouvindo são escolhas da pessoa: o automático não passa por cima.
    expect(awayDecision({ status: "focus", auto: false, idleMs: 60 * MIN, limitMs: 5 * MIN })).toBeNull();
    expect(awayDecision({ status: "listening", auto: false, idleMs: 60 * MIN, limitMs: 5 * MIN })).toBeNull();
    // Ausente posto na mão continua ausente.
    expect(awayDecision({ status: "away", auto: false, idleMs: 0, limitMs: 5 * MIN })).toBeNull();
  });

  it("volta para Disponível ao mexer, se foi o automático que mudou", () => {
    expect(awayDecision({ status: "away", auto: true, idleMs: 6 * MIN, limitMs: 5 * MIN })).toBeNull();
    expect(awayDecision({ status: "away", auto: true, idleMs: 200, limitMs: 5 * MIN })).toBe("back");
  });

  it("desligar o automático desfaz o ausente que ele pôs", () => {
    expect(awayDecision({ status: "away", auto: true, idleMs: 60 * MIN, limitMs: 0 })).toBe("back");
  });

  it("se a pessoa mudou o status na mão, esquece o automático", () => {
    expect(awayDecision({ status: "focus", auto: true, idleMs: 0, limitMs: 5 * MIN })).toBe("forget");
  });

  it("aceita só as opções do painel", () => {
    expect(awayChoice(10)).toBe(10);
    expect(awayChoice(7)).toBe(0);
    expect(awayChoice("5")).toBe(0);
    expect(awayChoice(undefined)).toBe(0);
  });
});
