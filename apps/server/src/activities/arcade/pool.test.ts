import { beforeEach, describe, expect, it } from "vitest";
import type { MapObject, PoolState } from "@infinity/world";
import { PoolActivity } from "./pool.ts";
import { FakeHost } from "./fakehost.ts";

const table: MapObject = { id: "obj-sinuca", type: "pool", pos: { x: 0, z: 0 }, rot: 0, size: { w: 1.45, d: 2.6, h: 0.82 }, blocks: true, gameId: "sinuca-1" };

let host: FakeHost;
let now: number;
let pool: PoolActivity;
const st = () => pool.snapshot() as PoolState;

beforeEach(() => {
  host = new FakeHost();
  now = 1_000_000;
  pool = new PoolActivity(host, table, { now: () => now });
  host.add("ana", "Ana", pool.standPoint(0));
  host.add("bruno", "Bruno", pool.standPoint(1));
  host.add("carla", "Carla", { x: 20, z: 0 });
  pool.handle("ana", "sit", { seat: 0 });
  pool.handle("bruno", "sit", { seat: 1 });
});

describe("sinuca no servidor", () => {
  it("começa com os dois sentados, com o triângulo arrumado e a vez de quem sai", () => {
    expect(st().phase).toBe("playing");
    expect(st().turn).toBe(0);
    expect(st().players).toEqual(["Ana", "Bruno"]);
    expect(st().balls.filter(Boolean)).toHaveLength(16);
  });

  it("só quem está na vez taca, e só depois que a tacada anterior parou", () => {
    pool.handle("bruno", "shoot", { dir: { x: 0, z: -1 }, power: 0.8 });
    expect(st().shot).toBe(0);
    pool.handle("ana", "shoot", { dir: { x: 0.004, z: -2 }, power: 0.9 });
    expect(st().shot).toBe(1);
    expect(st().last?.dir.z).toBeCloseTo(-1, 3); // normalizado
    const turn = st().turn;
    pool.handle(st().seats[turn]!, "shoot", { dir: { x: 1, z: 0 }, power: 0.3 });
    expect(st().shot).toBe(1); // ainda rolando
    now += st().last!.time * 1000 + 300;
    pool.handle(st().seats[turn]!, "shoot", { dir: { x: 1, z: 0 }, power: 0.3 });
    expect(st().shot).toBe(2);
  });

  it("ignora pedido torto e quem está longe da mesa", () => {
    pool.handle("ana", "shoot", { dir: { x: 0, z: 0 }, power: 1 });
    pool.handle("ana", "shoot", { dir: { x: "a", z: 1 }, power: 1 });
    expect(st().shot).toBe(0);
    host.pos.set("ana", { x: 9, z: 9 });
    pool.handle("ana", "shoot", { dir: { x: 0, z: -1 }, power: 1 });
    expect(st().shot).toBe(0);
  });

  it("levantar no meio é abandono; revanche começa outra e alterna quem sai", () => {
    pool.handle("ana", "stand", undefined);
    expect(st().phase).toBe("finished");
    expect(st().winner).toBe(1);
    expect(st().reason).toBe("left");
    pool.handle("ana", "sit", { seat: 0 });
    expect(st().phase).toBe("playing");
    expect(st().turn).toBe(1);
    const before = host.changes;
    pool.handle("bruno", "resign", undefined);
    expect(st().winner).toBe(0);
    expect(host.changes).toBeGreaterThan(before);
    pool.handle("ana", "rematch", { on: true });
    pool.handle("bruno", "rematch", { on: true });
    expect(st().phase).toBe("playing");
    expect(st().round).toBe(3);
  });
});
