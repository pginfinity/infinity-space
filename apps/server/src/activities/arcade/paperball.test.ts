import { beforeEach, describe, expect, it } from "vitest";
import { PAPER, type MapObject, type PaperState, type PaperThrow } from "@infinity/world";
import { PaperBallActivity } from "./paperball.ts";
import { FakeHost } from "./fakehost.ts";

const bin = (id: string, x: number, z: number): MapObject => ({ id, type: "trash-bin", pos: { x, z }, rot: 0, size: { w: 0.36, d: 0.36, h: 0.5 }, blocks: true });
/** Força que leva a bolinha a `d` metros. */
const powerFor = (d: number) => (d - PAPER.MIN) / (PAPER.MAX - PAPER.MIN);

let host: FakeHost;
let now: number;
let act: PaperBallActivity;
const last = () => host.of<PaperThrow>("throw").at(-1)!;

beforeEach(() => {
  host = new FakeHost();
  host.objs = [bin("b1", 4, 0)];
  now = Date.UTC(2026, 10, 15, 15);
  act = new PaperBallActivity(host, { now: () => now });
  host.add("ana", "Ana", { x: 0, z: 0 });
  host.add("bruno", "Bruno", { x: 1, z: 1 });
  host.add("carla", "Carla", { x: 40, z: 0 });
});

function throwAt(id: string, d: number, dir = { x: 1, z: 0 }) {
  now += 1000;
  act.handle(id, "throw", { dir, power: powerFor(d) });
}

describe("bolinha de papel no servidor", () => {
  it("acertos seguidos viram sequência e recorde do dia; errar zera", () => {
    throwAt("ana", 4);
    expect(last()).toMatchObject({ result: "hit", streak: 1, record: true, name: "Ana" });
    throwAt("ana", 4);
    expect(last().streak).toBe(2);
    expect((act.snapshot() as PaperState).record).toEqual({ name: "Ana", streak: 2 });
    throwAt("ana", 6);
    expect(last()).toMatchObject({ result: "miss", streak: 0, record: false });
    expect(host.emotes).toContainEqual(["ana", "point"]);
    // o evento vai para quem está por perto
    expect(host.events.filter((e) => e.ev === "throw").at(-1)!.to!.sort()).toEqual(["ana", "bruno"]);
  });

  it("quem não está perto de lixeira não arremessa; pedido torto é ignorado; respeita o intervalo", () => {
    act.handle("carla", "throw", { dir: { x: 1, z: 0 }, power: 0.5 });
    act.handle("ana", "throw", { dir: { x: 0, z: 0 }, power: 0.5 });
    act.handle("ana", "throw", { dir: { x: "1", z: 0 }, power: 0.5 });
    expect(host.of("throw")).toHaveLength(0);
    throwAt("ana", 4);
    act.handle("ana", "throw", { dir: { x: 1, z: 0 }, power: powerFor(4) });
    expect(host.of("throw")).toHaveLength(1);
  });

  it("de perto da lixeira não conta para a sequência", () => {
    host.pos.set("ana", { x: 2.5, z: 0 });
    throwAt("ana", 1.5);
    expect(last()).toMatchObject({ result: "close", streak: 0, record: false });
  });

  it("o recorde zera quando o dia vira (horário de Brasília) e sobrevive ao servidor reiniciar", () => {
    throwAt("ana", 4);
    const again = new PaperBallActivity(host, { now: () => now });
    expect((again.snapshot() as PaperState).record?.name).toBe("Ana");
    now += 24 * 3600_000;
    again.tick();
    expect((again.snapshot() as PaperState).record).toBe(null);
  });

  it("bolinha na mão só perto da lixeira, e some ao se afastar", () => {
    act.handle("carla", "hold", { on: true });
    expect(host.held.get("carla")).toBeUndefined();
    act.handle("ana", "hold", { on: true });
    expect(host.held.get("ana")).toBe("paper");
    host.pos.set("ana", { x: 30, z: 0 });
    act.tick();
    expect(host.held.get("ana")).toBe(null);
  });
});
