import { describe, expect, it } from "vitest";
import { POOL, POOL_HEAD, poolEmpty, poolLeft, poolPockets, poolRack, poolRules, poolSimulate, type PoolBalls, type PoolState } from "./pool.ts";

const unit = (x: number, z: number) => {
  const l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
};
/** Mesa só com as bolas pedidas. */
const only = (pos: Record<number, [number, number]>): PoolBalls => Array.from({ length: 16 }, (_, i) => pos[i] ?? null);

describe("sinuca: física", () => {
  it("o triângulo tem 15 bolas sem sobrepor, dentro da mesa", () => {
    const b = poolRack();
    expect(b.filter(Boolean)).toHaveLength(16);
    for (let i = 1; i < 16; i++)
      for (let j = i + 1; j < 16; j++) {
        const [a, c] = [b[i]!, b[j]!];
        expect(Math.hypot(a[0] - c[0], a[1] - c[1])).toBeGreaterThanOrEqual(POOL.R * 2);
      }
    for (const p of b) expect(Math.abs(p![1])).toBeLessThan(POOL.HL);
  });

  it("a saída espalha as bolas, tudo para e o resultado se repete igual", () => {
    const start = poolRack();
    const dir = unit(0.003, -1);
    const a = poolSimulate(start, dir, 0.9);
    const b = poolSimulate(start, dir, 0.9);
    expect(a).toEqual(b);
    expect(a.first).toBe(1);
    expect(a.time).toBeGreaterThan(1);
    for (const p of a.balls) if (p) {
      expect(Math.abs(p[0])).toBeLessThanOrEqual(POOL.HW);
      expect(Math.abs(p[1])).toBeLessThanOrEqual(POOL.HL);
    }
  });

  it("bola empurrada para o canto cai na caçapa; branca direto na caçapa também", () => {
    const corner = poolPockets()[0]!;
    const ball: [number, number] = [corner.x + 0.25, corner.z + 0.25];
    const cue: [number, number] = [corner.x + 0.6, corner.z + 0.6];
    const r = poolSimulate(only({ 0: cue, 5: ball }), unit(-1, -1), 0.6);
    expect(r.first).toBe(5);
    expect(r.pocketed).toContain(5);
    const s = poolSimulate(only({ 0: [0, 0] }), unit(POOL.HW + 0.012, POOL.HL + 0.012), 1);
    expect(s.pocketed).toEqual([0]);
  });

  it("a animação recebe quadros a 60 por segundo até parar", () => {
    let n = 0;
    const r = poolSimulate(poolRack(), unit(0, -1), 0.5, () => n++);
    expect(n).toBeGreaterThan(r.time * 50);
  });
});

describe("sinuca: regras", () => {
  const playing = (balls: PoolBalls, extra: Partial<PoolState> = {}): PoolState => ({ ...poolEmpty(), phase: "playing", balls, shot: 3, last: { by: 1, dir: { x: 0, z: 1 }, power: 1, before: balls, pocketed: [], foul: null, keep: false, time: 1 }, ...extra });

  it("mesa aberta: encaçapar uma lisa dá as lisas e continua a vez", () => {
    const s = playing(only({ 0: [0, 0.4], 3: [0, 0], 12: [0.3, -0.5], 8: [-0.3, -0.5] }));
    const shot = { first: 3, pocketed: [3], balls: only({ 0: [0, 0.1], 12: [0.3, -0.5], 8: [-0.3, -0.5] }), time: 2 };
    const n = poolRules(s, 0, { x: 0, z: -1 }, 0.5, shot);
    expect(n.groups).toEqual(["lisas", "listradas"]);
    expect(n.turn).toBe(0);
    expect(n.last?.keep).toBe(true);
  });

  it("branca na caçapa é falta: volta para a cabeceira e passa a vez", () => {
    const s = playing(only({ 0: [0, 0.4], 3: [0, 0], 8: [0.2, -0.5] }), { groups: ["lisas", "listradas"] });
    const n = poolRules(s, 0, { x: 0, z: -1 }, 1, { first: 3, pocketed: [0], balls: only({ 3: [0, -0.2], 8: [0.2, -0.5] }), time: 2 });
    expect(n.last?.foul).toBe("scratch");
    expect(n.turn).toBe(1);
    expect(n.balls[0]![1]).toBeCloseTo(POOL_HEAD.z, 1);
  });

  it("tocar primeiro na bola do outro grupo é falta", () => {
    const s = playing(only({ 0: [0, 0.4], 3: [0, 0], 12: [0.3, 0], 8: [0.2, -0.5] }), { groups: ["lisas", "listradas"] });
    const n = poolRules(s, 0, { x: 0, z: -1 }, 1, { first: 12, pocketed: [3], balls: only({ 0: [0, 0.2], 12: [0.3, 0], 8: [0.2, -0.5] }), time: 2 });
    expect(n.last?.foul).toBe("wrong");
    expect(n.turn).toBe(1);
  });

  it("a 8 antes da hora perde; com o grupo limpo, vence", () => {
    const early = playing(only({ 0: [0, 0.4], 3: [0, 0], 8: [0.2, -0.5] }), { groups: ["lisas", "listradas"] });
    const lost = poolRules(early, 0, { x: 0, z: -1 }, 1, { first: 8, pocketed: [8], balls: only({ 0: [0, 0.1], 3: [0, 0] }), time: 2 });
    expect(lost.phase).toBe("finished");
    expect(lost.winner).toBe(1);
    expect(lost.reason).toBe("eightEarly");
    const clean = playing(only({ 0: [0, 0.4], 12: [0.3, 0], 8: [0.2, -0.5] }), { groups: ["lisas", "listradas"] });
    expect(poolLeft(clean.balls, "lisas")).toBe(0);
    const won = poolRules(clean, 0, { x: 0, z: -1 }, 1, { first: 8, pocketed: [8], balls: only({ 0: [0, 0.1], 12: [0.3, 0] }), time: 2 });
    expect(won.winner).toBe(0);
    expect(won.reason).toBe("eight");
  });

  it("a 8 na saída volta para o lugar e o jogo segue", () => {
    const s = { ...poolEmpty(), phase: "playing" as const };
    const after = poolRack();
    after[8] = null;
    const n = poolRules(s, 0, { x: 0, z: -1 }, 1, { first: 1, pocketed: [8], balls: after, time: 3 });
    expect(n.phase).toBe("playing");
    expect(n.balls[8]).not.toBe(null);
  });
});
