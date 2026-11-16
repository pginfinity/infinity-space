import { describe, expect, it } from "vitest";
import { RT_EV, RT_STEP, duelWinner, rtSeatYaw, rtTableToWorld } from "./realtime.ts";
import { HOCKEY, hockeyClamp, hockeyCreate, hockeyDecode, hockeyEncode, hockeyStep, type HockeySim } from "./hockey.ts";
import { PONG, pongCreate, pongDecode, pongEncode, pongHeight, pongServer, pongStep, type PongSim } from "./pong.ts";

const run = <S>(s: S, step: (s: S, t: any[], dt: number) => number, targets: any[], seconds: number): number => {
  let ev = 0;
  for (let i = 0; i < Math.round(seconds / RT_STEP); i++) ev |= step(s, targets, RT_STEP);
  return ev;
};

describe("hockey de mesa", () => {
  it("cada rebatedor fica no próprio campo e anda com velocidade limitada", () => {
    expect(hockeyClamp(0, 0, -0.5).z).toBeGreaterThan(0);
    expect(hockeyClamp(1, 0, 0.5).z).toBeLessThan(0);
    expect(Math.abs(hockeyClamp(0, 9, 0.5).x)).toBeLessThan(HOCKEY.W / 2);
    const s = hockeyCreate();
    const start = s.mallets[0].x;
    hockeyStep(s, [{ x: 0.4, z: s.mallets[0].z }, null], RT_STEP);
    expect(s.mallets[0].x - start).toBeCloseTo(HOCKEY.MAX_MALLET * RT_STEP, 6);
  });

  it("o disco quica nas laterais e nunca sai da mesa", () => {
    const s = hockeyCreate();
    s.puck.x = 0;
    s.puck.z = 0;
    s.puck.vx = 3.5;
    s.puck.vz = 1.1;
    let ev = 0;
    for (let i = 0; i < 600; i++) {
      ev |= hockeyStep(s, [null, null], RT_STEP);
      if (ev & (RT_EV.point0 | RT_EV.point1)) break;
      expect(Math.abs(s.puck.x)).toBeLessThanOrEqual(HOCKEY.W / 2);
    }
    expect(ev & RT_EV.wall).toBeTruthy();
  });

  it("o rebatedor em movimento lança o disco para o outro lado", () => {
    const s = hockeyCreate();
    s.puck.x = 0;
    s.puck.z = 0.4;
    s.mallets[0].x = 0;
    s.mallets[0].z = 0.6;
    const ev = run(s, hockeyStep, [{ x: 0, z: 0.2 }, null], 0.1);
    expect(ev & RT_EV.hit0).toBeTruthy();
    expect(s.puck.vz).toBeLessThan(-2);
    expect(Math.hypot(s.puck.vx, s.puck.vz)).toBeLessThanOrEqual(HOCKEY.MAX_PUCK + 1e-9);
  });

  it("gol só pela boca do gol; fora dela o disco volta", () => {
    const goal = hockeyCreate();
    goal.puck.x = 0.02;
    goal.puck.z = -0.6;
    goal.puck.vz = -3;
    goal.mallets[1].x = 0.4; // goleiro fora do caminho
    expect(run(goal, hockeyStep, [null, null], 1) & RT_EV.point0).toBeTruthy();

    const post = hockeyCreate();
    post.puck.x = 0.3;
    post.puck.z = 0.6;
    post.puck.vz = 3;
    post.mallets[0].x = -0.4;
    const ev = run(post, hockeyStep, [null, null], 0.4);
    expect(ev & (RT_EV.point0 | RT_EV.point1)).toBe(0);
    expect(post.puck.vz).toBeLessThan(0);
  });

  it("mesmos pedidos dão a mesma partida (servidor e navegador concordam)", () => {
    const a = hockeyCreate(1);
    const b = hockeyCreate(1);
    const path = (i: number) => [{ x: Math.sin(i / 20) * 0.4, z: 0.3 + (i % 50) / 200 }, { x: Math.cos(i / 17) * 0.4, z: -0.5 }];
    for (let i = 0; i < 900; i++) {
      hockeyStep(a, path(i), RT_STEP);
      hockeyStep(b, path(i), RT_STEP);
    }
    expect(hockeyEncode(a)).toEqual(hockeyEncode(b));
  });

  it("o quadro leva o estado com precisão de milímetro", () => {
    const s = hockeyCreate();
    s.puck.x = 0.12345;
    s.puck.vz = -2.3456;
    const back: HockeySim = hockeyCreate();
    expect(hockeyDecode([9, ...hockeyEncode(s)], 1, back)).toBe(true);
    expect(back.puck.x).toBeCloseTo(0.123, 3);
    expect(back.puck.vz).toBeCloseTo(-2.346, 3);
    expect(hockeyDecode([1, 2], 0, back)).toBe(false);
  });
});

describe("pingue-pongue", () => {
  it("a bola espera na raquete de quem saca e sai no saque", () => {
    const s = pongCreate(0);
    run(s, pongStep, [{ x: 0.3, z: PONG.L / 2 + 0.3 }, null], 0.3);
    expect(s.mode).toBe(0);
    expect(s.ball.x).toBeCloseTo(s.pads[0].x, 6);
    const ev = pongStep(s, [{ x: 0.3, z: PONG.L / 2 + 0.3, a: 1 }, null], RT_STEP);
    expect(ev & RT_EV.hit0).toBeTruthy();
    expect(s.mode).toBe(1);
    expect(s.ball.vz).toBeLessThan(0);
  });

  it("raquete no caminho devolve a bola mais rápida; sem raquete, ponto de quem rebateu", () => {
    const s = pongCreate(0);
    pongStep(s, [{ x: 0, z: 2, a: 1 }, null], RT_STEP);
    const speed0 = Math.hypot(s.ball.vx, s.ball.vz);
    let ev = 0;
    // o lugar 1 acompanha a bola
    for (let i = 0; i < 400 && !(ev & RT_EV.hit1); i++) ev |= pongStep(s, [null, { x: s.ball.x, z: -PONG.L / 2 - 0.2 }], RT_STEP);
    expect(ev & RT_EV.hit1).toBeTruthy();
    expect(ev & RT_EV.bounce).toBeTruthy();
    expect(s.ball.vz).toBeGreaterThan(0);
    expect(Math.hypot(s.ball.vx, s.ball.vz)).toBeGreaterThan(speed0);

    // agora o lugar 0 foge da bola
    ev = run(s, pongStep, [{ x: -0.8, z: PONG.L / 2 + 0.3 }, null], 3);
    expect(ev & RT_EV.point1).toBeTruthy();
    expect(s.mode).toBe(2);
  });

  it("bola que sai pela lateral é ponto de quem recebe", () => {
    const s = pongCreate(0);
    s.mode = 1;
    s.last = 0;
    s.ball.x = 0.5;
    s.ball.z = 0;
    s.ball.vx = 1.5;
    s.ball.vz = -2;
    s.hitZ = 1;
    const ev = run(s, pongStep, [null, null], 1.2);
    expect(ev & RT_EV.out).toBeTruthy();
    expect(ev & RT_EV.point1).toBeTruthy();
  });

  it("saque troca a cada 2 pontos e, no 10 a 10, a cada ponto", () => {
    expect(pongServer([0, 0], 0)).toBe(0);
    expect(pongServer([1, 0], 0)).toBe(0);
    expect(pongServer([1, 1], 0)).toBe(1);
    expect(pongServer([3, 1], 1)).toBe(1);
    expect(pongServer([10, 10], 0)).toBe(0);
    expect(pongServer([11, 10], 0)).toBe(1);
    expect(pongServer([11, 11], 0)).toBe(0);
  });

  it("vence quem fizer 11 com 2 de vantagem; no hockey, 7", () => {
    expect(duelWinner([11, 9], 11, 2)).toBe(0);
    expect(duelWinner([11, 10], 11, 2)).toBe(null);
    expect(duelWinner([10, 12], 11, 2)).toBe(1);
    expect(duelWinner([7, 6], 7)).toBe(0);
    expect(duelWinner([6, 6], 7)).toBe(null);
  });

  it("altura visual: alta no meio da travessia, quique perto da cabeceira", () => {
    const s: PongSim = pongCreate(0);
    s.mode = 1;
    s.last = 0;
    s.hitZ = 1.4;
    s.ball.z = 1.4 - (1.4 + PONG.L / 2) * 0.34;
    const mid = pongHeight(s);
    s.ball.z = 1.4 - (1.4 + PONG.L / 2) * PONG.BOUNCE_AT;
    expect(mid).toBeGreaterThan(0.2);
    expect(pongHeight(s)).toBeLessThan(0.03);
    const back = pongCreate();
    expect(pongDecode(pongEncode(s), 0, back)).toBe(true);
    expect(back.last).toBe(0);
    expect(back.mode).toBe(1);
  });
});

describe("mesa no mundo", () => {
  it("converte coordenadas da mesa para o mundo como o modelo 3D", () => {
    // mesa virada para o norte (rot 0): o z da mesa aponta para o norte do mundo
    const t = { pos: { x: 10, z: 5 }, rot: 0 };
    const p = rtTableToWorld(t, 0, 1);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.z).toBeCloseTo(4, 6);
    // quem está no lado +z olha para o sul (para a mesa)
    expect(Math.abs(rtSeatYaw(t, 0, 1))).toBeCloseTo(Math.PI, 6);
  });
});
