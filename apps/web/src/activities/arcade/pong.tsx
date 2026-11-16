import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PONG, PONG_DEF, PONG_KIND, pongCopy, pongHeight, type DuelState, type Lens, type MapObject, type PongSim } from "@infinity/world";
import { toon } from "../../scene/materials.ts";
import { actState } from "../registry.ts";
import { duelNet, type DuelGameClient } from "./rt/net.ts";
import type { DrawArgs, DuelView } from "./rt/DuelPanel.tsx";
import { circle, hexA, line, shade } from "./hockey.tsx";
import { T } from "./strings.ts";

/** Pingue-pongue: painel (vista de cima) e bola e raquetes na mesa do mundo. */

export const PONG_COLORS = ["#EE5C29", "#00B7FF"] as const;

export const pongGame: DuelGameClient<PongSim> = {
  def: PONG_DEF,
  npoints: 3,
  points(s, out) {
    out[0] = s.ball.x;
    out[1] = s.ball.z;
    out[2] = s.pads[0].x;
    out[3] = s.pads[0].z;
    out[4] = s.pads[1].x;
    out[5] = s.pads[1].z;
  },
};

const scratch = PONG_DEF.create(0);

/** Altura visual da bola nos pontos desenhados (a posição interpolada com o estado da jogada). */
function heightAt(sim: PongSim | null, x: number, z: number): number {
  if (!sim) return 0.16;
  pongCopy(sim, scratch);
  scratch.ball.x = x;
  scratch.ball.z = z;
  return pongHeight(scratch);
}

function rect(d: DrawArgs<PongSim>, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
  const [ax, ay] = d.px(x0, z0);
  const [bx, by] = d.px(x1, z1);
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
}

function drawPong(ctx: CanvasRenderingContext2D, d: DrawArgs<PongSim>): void {
  const { px, scale: k, pts, dpr } = d;
  const W = PONG.W;
  const L = PONG.L;
  // piso em volta da mesa
  ctx.fillStyle = "#0B1C36";
  ctx.beginPath();
  ctx.roundRect(0, 0, d.w, d.h, 12 * dpr);
  ctx.fill();
  // faixas onde cada raquete anda
  for (const seat of [0, 1] as const) {
    const s = seat === 0 ? 1 : -1;
    const [x, y, w, h] = rect(d, -W / 2 - PONG.PAD_SIDE, s * (L / 2 + PONG.PAD_NEAR), W / 2 + PONG.PAD_SIDE, s * (L / 2 + PONG.PAD_FAR));
    ctx.fillStyle = hexA(PONG_COLORS[seat], 0.07);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8 * dpr);
    ctx.fill();
  }
  // mesa
  const [tx, ty, tw, th] = rect(d, -W / 2, -L / 2, W / 2, L / 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(tx + 4 * dpr, ty + 6 * dpr, tw, th);
  ctx.fillStyle = "#1D5FA6";
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = "#F2F0EF";
  ctx.lineWidth = Math.max(1.5, 0.02 * k);
  ctx.strokeRect(tx + ctx.lineWidth / 2, ty + ctx.lineWidth / 2, tw - ctx.lineWidth, th - ctx.lineWidth);
  ctx.lineWidth = Math.max(1, 0.008 * k);
  line(ctx, px(0, -L / 2), px(0, L / 2));
  // placar d'água
  ctx.save();
  ctx.font = `800 ${Math.round(0.5 * k)}px Geist, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(242, 240, 239, 0.08)";
  for (const seat of [0, 1] as const) {
    const [x, y] = px(W * 0.22 * (seat === 0 ? 1 : -1) * (d.seat === 1 ? -1 : 1), (seat === 0 ? 1 : -1) * L * 0.25);
    ctx.fillText(String(d.state.score[seat]), x, y);
  }
  ctx.restore();
  // rede
  const [nx, ny, nw, nh] = rect(d, -W / 2 - 0.06, -0.012, W / 2 + 0.06, 0.012);
  ctx.fillStyle = "rgba(0, 17, 42, 0.45)";
  ctx.fillRect(nx, ny + 4 * dpr, nw, nh);
  ctx.fillStyle = "#E9EEF3";
  ctx.fillRect(nx, ny, nw, nh);
  ctx.fillStyle = "#2A2F3A";
  for (const s of [-1, 1]) {
    const [x, y] = px(s * (W / 2 + 0.06), 0);
    ctx.fillRect(x - 3 * dpr, y - 3 * dpr, 6 * dpr, 6 * dpr);
  }
  // alvo do meu controle
  if (d.target && d.seat >= 0) {
    const [ax, ay, aw, ah] = rect(d, d.target.x - PONG.PAD_HW, d.target.z - 0.025, d.target.x + PONG.PAD_HW, d.target.z + 0.025);
    ctx.strokeStyle = hexA(PONG_COLORS[d.seat]!, 0.45);
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(ax, ay, aw, ah);
    ctx.setLineDash([]);
  }
  // raquetes
  for (const seat of [0, 1] as const) {
    const x = pts[2 + seat * 2]!;
    const z = pts[3 + seat * 2]!;
    const away = seat === 0 ? 1 : -1;
    const [hx, hy, hw, hh] = rect(d, x - 0.02, z, x + 0.02, z + away * 0.11);
    ctx.fillStyle = "#A8774E";
    ctx.beginPath();
    ctx.roundRect(hx, hy, hw, hh, 2 * dpr);
    ctx.fill();
    const [rx, ry, rw, rh] = rect(d, x - PONG.PAD_HW, z - 0.028, x + PONG.PAD_HW, z + 0.028);
    ctx.fillStyle = "rgba(0, 17, 42, 0.35)";
    ctx.beginPath();
    ctx.roundRect(rx + 2 * dpr, ry + 3 * dpr, rw, rh, rh / 2);
    ctx.fill();
    ctx.fillStyle = shade(PONG_COLORS[seat], -0.25);
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, rh / 2);
    ctx.fill();
    ctx.fillStyle = PONG_COLORS[seat];
    ctx.beginPath();
    ctx.roundRect(rx + 2 * dpr, ry + 2 * dpr, rw - 4 * dpr, rh - 4 * dpr, rh / 2);
    ctx.fill();
  }
  // bola: sombra na mesa e a bola "levantada" pela altura
  const bx = pts[0]!;
  const bz = pts[1]!;
  const h = heightAt(d.sim, bx, bz);
  const [sx, sy] = px(bx, bz);
  const r = PONG.BALL_R * k * 1.7;
  ctx.fillStyle = `rgba(0, 17, 42, ${Math.max(0.12, 0.4 - h)})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy, r * (1 + h * 1.5), r * (0.8 + h), 0, 0, Math.PI * 2);
  ctx.fill();
  const lift = h * k * 0.55;
  ctx.fillStyle = "#FFFFFF";
  circle(ctx, [sx, sy - lift], r * (1 + h * 0.9), true);
  ctx.fillStyle = "#F2B134";
  circle(ctx, [sx - r * 0.25, sy - lift - r * 0.25], r * 0.35, true);
  // dica do saque para quem saca
  const sim = d.sim;
  if (sim && sim.mode === 0 && sim.server === d.seat && d.state.phase === "playing") {
    const [x, y] = px(pts[2 + d.seat * 2]!, pts[3 + d.seat * 2]!);
    ctx.font = `600 ${Math.round(12 * dpr)}px Geist, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(242, 240, 239, ${0.65 + 0.35 * Math.sin(d.now / 220)})`;
    ctx.fillText(T.duel.serveHint, Math.min(d.w - 90 * dpr, Math.max(90 * dpr, x)), y - 28 * dpr);
  }
}

export const pongView: DuelView<PongSim> = {
  kind: PONG_KIND,
  title: T.duel.pong,
  seatNames: T.duel.seatPong as [string, string],
  colors: PONG_COLORS,
  game: pongGame,
  hw: PONG.W / 2 + PONG.PAD_SIDE + 0.06,
  hl: PONG.L / 2 + PONG.PAD_FAR + 0.14,
  hint: T.duel.hintPong,
  action: true,
  // quem saca neste ponto (vem do estado da mesa, que muda a cada ponto)
  status(st, _sim, seat) {
    return st.serve === seat ? T.duel.yourServe : T.duel.serveOf(st.names[st.serve] ?? st.players[st.serve] ?? "");
  },
  draw: drawPong,
};

// ---------------------------------------------------------------- mesa no mundo

const TOP = 0.762;

export function PongTables({ lens, tables }: { lens: Lens; tables: MapObject[] }) {
  return (
    <>
      {tables.map((t) => (
        <PongTable key={t.id} table={t} lens={lens} />
      ))}
    </>
  );
}

function PongTable({ table, lens }: { table: MapObject; lens: Lens }) {
  const id = table.gameId!;
  const built = useMemo(() => {
    const root = new THREE.Group();
    root.name = `arcade:pingue:${id}`;
    const geos: THREE.BufferGeometry[] = [];
    const g = <G extends THREE.BufferGeometry>(x: G) => (geos.push(x), x);
    const ball = new THREE.Mesh(g(new THREE.SphereGeometry(0.022, 12, 8)), toon("#FFFFFF"));
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x00112a, transparent: true, opacity: 0.35, depthWrite: false });
    const shadow = new THREE.Mesh(g(new THREE.CircleGeometry(0.024, 14)), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    const pads = PONG_COLORS.map((c) => {
      const p = new THREE.Group();
      const blade = new THREE.Mesh(g(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 18)), toon(c));
      blade.rotation.x = Math.PI / 2;
      const handle = new THREE.Mesh(g(new THREE.BoxGeometry(0.032, 0.11, 0.024)), toon("#A8774E"));
      handle.position.y = -0.1;
      p.add(blade, handle);
      return p;
    });
    root.add(ball, shadow, ...pads);
    return { root, ball, shadow, shadowMat, pads, geos };
  }, [id]);
  useEffect(
    () => () => {
      built.geos.forEach((x) => x.dispose());
      built.shadowMat.dispose();
    },
    [built],
  );

  const pts = useMemo(() => new Float64Array(6), []);
  const idle = useMemo(() => [pongGame.def.create(0), pongGame.def.create(1)], []);
  const rot = useMemo(() => {
    const t = Math.PI - table.rot;
    return { c: Math.cos(t), s: Math.sin(t), yaw: t };
  }, [table.rot]);

  useFrame(() => {
    const st = actState<DuelState>(id);
    const net = duelNet(id, pongGame);
    const now = performance.now();
    const last = net.latest();
    const fresh = (last?.at ?? -1e9) > now - 1500;
    const live = !!st && st.phase !== "waiting" && fresh && net.sample(now, pts);
    const sim = live ? (last?.sim ?? null) : idle[st?.serve ?? 0]!;
    if (!live) pongGame.points(idle[st?.serve ?? 0]!, pts);
    const big = lens === "2d" ? 1.6 : 1.2;
    const wx = (x: number, z: number) => table.pos.x + x * rot.c + z * rot.s;
    const wz = (x: number, z: number) => table.pos.z - x * rot.s + z * rot.c;
    const h = heightAt(sim, pts[0]!, pts[1]!);
    built.ball.position.set(wx(pts[0]!, pts[1]!), TOP + h, wz(pts[0]!, pts[1]!));
    built.ball.scale.setScalar(big);
    const onTable = Math.abs(pts[0]!) <= PONG.W / 2 && Math.abs(pts[1]!) <= PONG.L / 2;
    built.shadow.visible = onTable;
    built.shadow.position.set(built.ball.position.x, TOP + 0.002, built.ball.position.z);
    built.shadow.scale.setScalar(big * (1 + h * 1.5));
    built.shadowMat.opacity = Math.max(0.12, 0.38 - h);
    for (const seat of [0, 1] as const) {
      const p = built.pads[seat]!;
      const x = pts[2 + seat * 2]!;
      const z = pts[3 + seat * 2]!;
      p.position.set(wx(x, z), 0.95, wz(x, z));
      // a face da raquete olha para a mesa
      p.rotation.set(0, rot.yaw + (seat === 0 ? 0 : Math.PI), 0);
      p.scale.setScalar(big);
    }
  });

  return <primitive object={built.root} />;
}
