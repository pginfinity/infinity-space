import { describe, expect, it } from "vitest";
import { Cometa, RINGS, SECTORS, advance, remap } from "./cometa.ts";
import { Faxina } from "./faxina.ts";
import { COLS, Estilhaco, makeLevel } from "./estilhaco.ts";
import { NO_INPUT, type CabInput } from "./types.ts";

const input = (p: Partial<CabInput>): CabInput => ({ ...NO_INPUT, ...p });

describe("Cauda de Cometa", () => {
  it("órbitas de dentro têm menos casas, e subir de órbita mantém o ângulo", () => {
    expect(SECTORS[0]!).toBeLessThan(SECTORS[RINGS - 1]!);
    // a casa no topo (ângulo ~0) continua no topo uma órbita acima
    expect(remap(0, 0, 1)).toBe(0);
    const half = Math.floor(SECTORS[2]! / 2);
    expect(Math.abs(remap(half, 2, 5) / SECTORS[5]! - (half + 0.5) / SECTORS[2]!)).toBeLessThan(1 / SECTORS[5]!);
    expect(advance({ r: 0, s: 3 }, 3)).toBe(null); // para dentro do planeta
    expect(advance({ r: RINGS - 1, s: 3 }, 1)).toBe(null); // fora da última órbita
    expect(advance({ r: 2, s: SECTORS[2]! - 1 }, 0)).toEqual({ r: 2, s: 0 }); // dá a volta
  });

  it("come poeira, cresce, pontua; bater na própria cauda acaba a partida", () => {
    const g = new Cometa(1);
    const len = g.body.length;
    const ahead = advance(g.body[0]!, g.dir)!;
    g.dust = ahead;
    g.move();
    expect(g.score).toBe(10);
    g.dust = null;
    g.move();
    expect(g.body.length).toBe(len + 1);
    // três vezes à direita (para dentro, anti-horário, para fora) volta em cima da cauda
    for (let k = 0; k < 3 && !g.over; k++) {
      g.step(input({ rightPressed: true }));
      g.move();
    }
    expect(g.over).toBe(true);
    expect(g.sounds).toContain("cab-death");
  });
});

describe("Faxina Orbital", () => {
  it("o tiro racha a sucata grande, pontua e acertos seguidos multiplicam", () => {
    const g = new Faxina(2);
    g.debris = [{ x: g.ship.x, y: 120, vx: 0, vy: 0, size: 2, shape: 0, spin: 0, phase: 0 }];
    for (let i = 0; i < 40 && g.debris.length < 2; i++) g.step(input({ fire: true }));
    expect(g.score).toBeGreaterThanOrEqual(10);
    expect(g.debris.filter((d) => d.size === 1).length).toBe(2);
    expect(g.chain).toBeGreaterThan(0);
    g.chain = 10;
    expect(g.mult).toBe(3);
  });

  it("bater na sucata tira vida; sem vidas, fim de jogo", () => {
    const g = new Faxina(3);
    g.ship.inv = 0;
    for (let k = 0; k < 3; k++) {
      g.ship.inv = 0;
      g.debris = [{ x: g.ship.x, y: g.ship.y, vx: 0, vy: 0, size: 1, shape: 0, spin: 0, phase: 0 }];
      g.step(NO_INPUT);
    }
    expect(g.lives).toBe(0);
    expect(g.over).toBe(true);
  });
});

describe("Estilhaço", () => {
  it("as fases são simétricas e sempre têm placas para quebrar", () => {
    for (let level = 1; level <= 12; level++) {
      const grid = makeLevel(level, 42);
      for (let i = 0; i < grid.length; i++) expect(grid[i]).toBe(grid[Math.floor(i / COLS) * COLS + (COLS - 1 - (i % COLS))]);
      expect(grid.filter((b) => b !== 0 && b !== 3).length).toBeGreaterThanOrEqual(12);
    }
  });

  it("o cristal lançado quebra placas e pontua; perder todos tira vida", () => {
    const g = new Estilhaco(5);
    const total = g.grid.filter((b) => b !== 0).length;
    g.step(input({ firePressed: true }));
    for (let i = 0; i < 60 * 6 && g.score === 0; i++) g.step(input({ mouseX: g.balls[0]?.x ?? 112 }));
    expect(g.score).toBeGreaterThan(0);
    expect(g.grid.filter((b) => b !== 0).length).toBeLessThan(total);
    // rebatedor longe do cristal: o cristal cai
    const lives = g.lives;
    for (let i = 0; i < 60 * 20 && g.lives === lives; i++) g.step(input({ mouseX: (g.balls[0]?.x ?? 0) > 112 ? 10 : 214 }));
    expect(g.lives).toBe(lives - 1);
  });

  it("limpar a fase dá bônus e passa para a próxima", () => {
    const g = new Estilhaco(9);
    g.grid = g.grid.map(() => 0);
    g.step(NO_INPUT);
    expect(g.level).toBe(2);
    expect(g.score).toBe(500);
  });
});
