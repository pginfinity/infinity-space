import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOCKEY, HOCKEY_DEF, PONG_DEF, RT_COUNTDOWN_MS, RT_FRAME_PAUSED, RT_POINT_PAUSE_MS, type DuelState, type HockeySim, type MapObject, type PongSim, type RtFrame } from "@infinity/world";
import { DUEL_AWAY_S, DuelActivity } from "./duel.ts";
import { FakeHost } from "./fakehost.ts";

const table = (type: MapObject["type"], gameId: string): MapObject => ({ id: `obj-${gameId}`, type, pos: { x: 0, z: 0 }, rot: 0, size: { w: 1, d: 2, h: 0.8 }, blocks: true, gameId });

let host: FakeHost;
let now: number;
let hockey: DuelActivity<HockeySim>;

/** Anda o relógio falso em passos de 1/60 s, como o timer do servidor. */
function run(act: DuelActivity<unknown>, ms: number): void {
  for (let t = 0; t < ms; t += 1000 / 60) {
    now += 1000 / 60;
    act.advance();
  }
}

const snap = (a: DuelActivity<unknown>) => a.snapshot() as DuelState;

beforeEach(() => {
  host = new FakeHost();
  now = 0;
  hockey = new DuelActivity(host, HOCKEY_DEF, table("airhockey", "hockey-1"), { now: () => now, timer: false });
  host.add("ana", "Ana", hockey.standPoint(0));
  host.add("bruno", "Bruno", hockey.standPoint(1));
  host.add("carla", "Carla", { x: 30, z: 0 });
});

afterEach(() => hockey.dispose());

function startMatch(): void {
  hockey.handle("ana", "sit", { seat: 0 });
  hockey.handle("bruno", "sit", { seat: 1 });
  run(hockey as DuelActivity<unknown>, RT_COUNTDOWN_MS + 50);
}

describe("mesa de tempo real", () => {
  it("só senta quem está perto do próprio lado, e a contagem começa com os dois", () => {
    hockey.handle("carla", "sit", { seat: 0 });
    expect(snap(hockey).seats).toEqual([null, null]);
    hockey.handle("ana", "sit", { seat: 1 }); // lado errado: longe do ponto do lugar 1
    expect(snap(hockey).seats).toEqual([null, null]);
    hockey.handle("ana", "sit", { seat: 0 });
    expect(snap(hockey).phase).toBe("waiting");
    hockey.handle("bruno", "sit", { seat: 1 });
    expect(snap(hockey).phase).toBe("countdown");
    expect(snap(hockey).names).toEqual(["Ana", "Bruno"]);
    run(hockey as DuelActivity<unknown>, RT_COUNTDOWN_MS + 50);
    expect(snap(hockey).phase).toBe("playing");
  });

  it("manda quadros para quem joga e para quem assiste perto, não para quem está longe", () => {
    startMatch();
    host.pos.set("carla", { x: 2, z: 1 });
    run(hockey as DuelActivity<unknown>, 1000);
    const frames = host.events.filter((e) => e.ev === "f");
    expect(frames.length).toBeGreaterThan(25);
    expect(frames.at(-1)!.to!.sort()).toEqual(["ana", "bruno", "carla"]);
    host.pos.set("carla", { x: 30, z: 0 });
    run(hockey as DuelActivity<unknown>, 700);
    expect(host.events.filter((e) => e.ev === "f").at(-1)!.to!.sort()).toEqual(["ana", "bruno"]);
  });

  it("o rebatedor segue os pedidos no passo marcado, sem sair do próprio campo", () => {
    startMatch();
    const last = host.of<RtFrame>("f").at(-1)!;
    hockey.handle("ana", "aim", { t: last[0]! + 2, x: 300, z: -400 });
    run(hockey as DuelActivity<unknown>, 500);
    const m = hockey.simState().mallets[0];
    expect(m.x).toBeCloseTo(0.3, 2);
    expect(m.z).toBeGreaterThan(0);
    // quem não está sentado não mexe em nada
    hockey.handle("carla", "aim", { t: 0, x: 0, z: -500 });
    expect(hockey.simState().mallets[1].z).toBeLessThan(0);
  });

  it("gol marca ponto, pausa a jogada e repõe o disco para quem sofreu", () => {
    startMatch();
    const s = hockey.simState();
    s.puck.x = 0;
    s.puck.z = -0.7;
    s.puck.vz = -3;
    s.mallets[1].x = 0.4;
    hockey.handle("bruno", "aim", { t: 0, x: 400, z: -800 });
    run(hockey as DuelActivity<unknown>, 400);
    expect(snap(hockey).score).toEqual([1, 0]);
    expect(host.of<{ scorer: number }>("point").at(-1)!.scorer).toBe(0);
    expect(host.of<RtFrame>("f").at(-1)![1]! & RT_FRAME_PAUSED).toBeTruthy();
    run(hockey as DuelActivity<unknown>, RT_POINT_PAUSE_MS + 100);
    // disco parado no campo do lugar 1 (quem sofreu o gol repõe)
    expect(s.puck.z).toBeCloseTo(-HOCKEY.L * 0.25, 2);
    expect(snap(hockey).serve).toBe(1);
  });

  it("vence quem fizer 7; revanche troca os lados", () => {
    startMatch();
    for (let i = 0; i < 7; i++) {
      const s = hockey.simState();
      s.puck.x = 0;
      s.puck.z = 0.7;
      s.puck.vz = 3.5;
      s.mallets[0].x = -0.4;
      hockey.handle("ana", "aim", { t: 0, x: -400, z: 800 });
      run(hockey as DuelActivity<unknown>, 400 + RT_POINT_PAUSE_MS);
    }
    const st = snap(hockey);
    expect(st.phase).toBe("finished");
    expect(st.winner).toBe(1);
    expect(st.score).toEqual([0, 7]);
    expect(host.emotes).toContainEqual(["bruno", "cheer"]);
    hockey.handle("ana", "rematch", { on: true });
    expect(snap(hockey).phase).toBe("finished");
    hockey.handle("bruno", "rematch", { on: true });
    expect(snap(hockey).seats).toEqual(["bruno", "ana"]);
    expect(snap(hockey).phase).toBe("countdown");
  });

  it("levantar no meio da partida é abandono; ir embora da mesa também", () => {
    startMatch();
    hockey.handle("ana", "stand");
    expect(snap(hockey).winner).toBe(1);
    expect(snap(hockey).reason).toBe("left");
    // sentar de novo com o outro lugar ocupado já começa outra partida
    hockey.handle("ana", "sit", { seat: 0 });
    run(hockey as DuelActivity<unknown>, RT_COUNTDOWN_MS + 50);
    expect(snap(hockey).phase).toBe("playing");
    expect(snap(hockey).round).toBe(2);
    // Bruno sai andando no meio da partida
    host.pos.set("bruno", { x: 20, z: 20 });
    for (let i = 0; i < 15 * (DUEL_AWAY_S + 1); i++) hockey.tick(1 / 15);
    expect(snap(hockey).phase).toBe("finished");
    expect(snap(hockey).winner).toBe(0);
    expect(snap(hockey).seats).toEqual(["ana", null]);
  });

  it("não deixa sentar em duas mesas de tempo real com partida rolando", () => {
    startMatch();
    const pong = new DuelActivity(host, PONG_DEF, table("pingpong", "pong-1"), { now: () => now, timer: false });
    host.pos.set("ana", pong.standPoint(0));
    pong.handle("ana", "sit", { seat: 0 });
    expect((pong.snapshot() as DuelState).seats[0]).toBe(null);
    hockey.dispose();
    pong.dispose();
  });

  it("pingue-pongue: quem demora a sacar tem o saque feito pelo servidor", () => {
    const pong = new DuelActivity<PongSim>(host, PONG_DEF, table("pingpong", "pong-2"), { now: () => now, timer: false });
    host.pos.set("ana", pong.standPoint(0));
    host.pos.set("bruno", pong.standPoint(1));
    pong.handle("ana", "sit", { seat: 0 });
    pong.handle("bruno", "sit", { seat: 1 });
    run(pong as DuelActivity<unknown>, RT_COUNTDOWN_MS + 200);
    expect(pong.simState().mode).toBe(0);
    run(pong as DuelActivity<unknown>, 6500);
    expect(pong.simState().mode).not.toBe(0);
    pong.dispose();
  });

  it("responde o ping só para quem pediu, com o passo do servidor", () => {
    startMatch();
    hockey.handle("ana", "ping", { c: 123 });
    const e = host.events.filter((x) => x.ev === "pong").at(-1)!;
    expect(e.to).toEqual(["ana"]);
    expect((e.data as { c: number; k: number }).k).toBeGreaterThan(300);
  });
});
