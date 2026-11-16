import { beforeEach, describe, expect, it } from "vitest";
import type { CabState, MapObject } from "@infinity/world";
import { CabinetsActivity } from "./cabinets.ts";
import { FakeHost } from "./fakehost.ts";

const machine = (id: string, variant: number, x: number): MapObject => ({
  id,
  type: "arcade",
  pos: { x, z: 0 },
  rot: 0,
  size: { w: 0.8, d: 0.8, h: 1.8 },
  blocks: true,
  variant,
  interact: { point: { x, z: 1 }, yaw: 0, radius: 1.8, action: "play" },
});

let host: FakeHost;
let now: number;
let cab: CabinetsActivity;
const token = (id: string) => (host.events.filter((e) => e.ev === "run" && e.to?.includes(id)).at(-1)!.data as { token: string }).token;
const result = () => host.events.filter((e) => e.ev === "result").at(-1)!.data as { score: number; rank: number | null; record: boolean; rejected?: boolean };

beforeEach(() => {
  host = new FakeHost();
  host.objs = [machine("m0", 0, 0), machine("m1", 1, 5)];
  now = 1_000_000;
  cab = new CabinetsActivity(host, { now: () => now });
  host.add("ana", "Ana", { x: 0, z: 1 });
  host.add("bruno", "Bruno", { x: 0, z: 1.5 });
  host.add("carla", "Carla", { x: 20, z: 0 });
});

describe("fliperamas no servidor", () => {
  it("começa a partida só perto da máquina e marca a máquina ocupada", () => {
    cab.handle("carla", "start", { machine: "m0" });
    expect(host.of("run")).toHaveLength(0);
    cab.handle("ana", "start", { machine: "m0" });
    expect((cab.snapshot() as CabState).busy).toEqual({ m0: "Ana" });
    cab.handle("bruno", "start", { machine: "m0" });
    expect(host.events.at(-1)!.ev).toBe("busy");
  });

  it("aceita pontuação plausível, guarda no ranking e avisa recorde", () => {
    cab.handle("ana", "start", { machine: "m0" });
    now += 60_000;
    cab.handle("ana", "score", { token: token("ana"), score: 4200 });
    expect(result()).toMatchObject({ score: 4200, rank: 1, record: true });
    const st = cab.snapshot() as CabState;
    expect(st.boards.faxina[0]).toMatchObject({ name: "Ana", score: 4200 });
    expect(st.busy).toEqual({});
    expect(host.of<{ name: string }>("record").at(-1)!.name).toBe("Ana");
    expect(host.saved.get("arcade/recordes")).toBeTruthy();
  });

  it("recusa token errado, partida repetida e pontuação impossível", () => {
    host.pos.set("ana", { x: 5, z: 1 });
    cab.handle("ana", "start", { machine: "m1" });
    const t = token("ana");
    now += 10_000;
    cab.handle("ana", "score", { token: "falso", score: 100 });
    expect(host.of("result")).toHaveLength(0);
    cab.handle("ana", "score", { token: t, score: 999_999 });
    expect(result().rejected).toBe(true);
    cab.handle("ana", "score", { token: t, score: 100 });
    expect(host.of("result")).toHaveLength(1);
    expect((cab.snapshot() as CabState).boards.cometa).toHaveLength(0);
  });

  it("larga a partida de quem sai de perto ou sai da sala", () => {
    cab.handle("ana", "start", { machine: "m0" });
    host.pos.set("ana", { x: 30, z: 30 });
    for (let i = 0; i < 15 * 7; i++) cab.tick(1 / 15);
    expect((cab.snapshot() as CabState).busy).toEqual({});
    host.pos.set("ana", { x: 0, z: 1 });
    cab.handle("ana", "start", { machine: "m0" });
    cab.leave("ana");
    expect((cab.snapshot() as CabState).busy).toEqual({});
  });

  it("o ranking volta do disco quando o servidor reinicia", () => {
    cab.handle("ana", "start", { machine: "m0" });
    now += 30_000;
    cab.handle("ana", "score", { token: token("ana"), score: 1500 });
    const again = new CabinetsActivity(host, { now: () => now });
    expect((again.snapshot() as CabState).boards.faxina[0]!.score).toBe(1500);
  });
});
