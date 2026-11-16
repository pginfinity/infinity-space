import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HOCKEY, HOCKEY_DEF, HOCKEY_KIND, type DuelState, type HockeySim, type Lens, type MapObject } from "@infinity/world";
import { toon } from "../../scene/materials.ts";
import { actState } from "../registry.ts";
import { duelNet, type DuelGameClient } from "./rt/net.ts";
import type { DrawArgs, DuelView } from "./rt/DuelPanel.tsx";
import { T } from "./strings.ts";

/** Hockey de mesa: como o jogo aparece no painel (vista de cima) e na mesa do mundo. */

export const HOCKEY_COLORS = ["#EE5C29", "#00B7FF"] as const;

export const hockeyGame: DuelGameClient<HockeySim> = {
  def: HOCKEY_DEF,
  npoints: 3,
  points(s, out) {
    out[0] = s.puck.x;
    out[1] = s.puck.z;
    out[2] = s.mallets[0].x;
    out[3] = s.mallets[0].z;
    out[4] = s.mallets[1].x;
    out[5] = s.mallets[1].z;
  },
};

const RAIL = 0.07;

// rastro do disco no painel (um painel aberto por vez)
const trail = new Float64Array(16);
let trailN = 0;
let trailAt = 0;

let holes: CanvasPattern | null = null;
function holePattern(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  if (holes) return holes;
  const c = document.createElement("canvas");
  const s = Math.round(9 * dpr);
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(10, 37, 71, 0.10)";
  g.beginPath();
  g.arc(s / 2, s / 2, Math.max(0.8, 0.9 * dpr), 0, Math.PI * 2);
  g.fill();
  holes = ctx.createPattern(c, "repeat");
  return holes;
}

function rect(d: DrawArgs<HockeySim>, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
  const [ax, ay] = d.px(x0, z0);
  const [bx, by] = d.px(x1, z1);
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
}

function drawHockey(ctx: CanvasRenderingContext2D, d: DrawArgs<HockeySim>): void {
  const { px, scale: k, pts, dpr } = d;
  const W = HOCKEY.W;
  const L = HOCKEY.L;
  // bordas da mesa
  const [ox, oy, ow, oh] = rect(d, -W / 2 - RAIL, -L / 2 - RAIL, W / 2 + RAIL, L / 2 + RAIL);
  ctx.fillStyle = "#0A2547";
  ctx.beginPath();
  ctx.roundRect(ox, oy, ow, oh, RAIL * k * 0.9);
  ctx.fill();
  // cabeceiras na cor de quem defende aquele gol
  for (const seat of [0, 1] as const) {
    const s = seat === 0 ? 1 : -1;
    const [x, y, w, h] = rect(d, -W / 2 - RAIL * 0.5, s * (L / 2), W / 2 + RAIL * 0.5, s * (L / 2 + RAIL * 0.62));
    ctx.fillStyle = HOCKEY_COLORS[seat];
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3 * dpr);
    ctx.fill();
  }
  // campo
  const [fx, fy, fw, fh] = rect(d, -W / 2, -L / 2, W / 2, L / 2);
  ctx.fillStyle = "#EEF2F6";
  ctx.beginPath();
  ctx.roundRect(fx, fy, fw, fh, 0.05 * k);
  ctx.fill();
  const pat = holePattern(ctx, dpr);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fill();
  }
  // placar marcado d'água em cada metade (o seu do seu lado)
  ctx.save();
  ctx.font = `800 ${Math.round(0.42 * k)}px Geist, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(10, 37, 71, 0.07)";
  for (const seat of [0, 1] as const) {
    const [x, y] = px(0, (seat === 0 ? 1 : -1) * L * 0.27);
    ctx.fillText(String(d.state.score[seat]), x, y);
  }
  ctx.restore();
  // linhas
  ctx.lineWidth = Math.max(1, 0.012 * k);
  ctx.strokeStyle = "rgba(229, 72, 77, 0.75)";
  line(ctx, px(-W / 2, 0), px(W / 2, 0));
  circle(ctx, px(0, 0), 0.15 * k, false);
  ctx.strokeStyle = "rgba(43, 127, 217, 0.6)";
  for (const s of [-1, 1]) {
    line(ctx, px(-W / 2, s * 0.5), px(W / 2, s * 0.5));
    const [cx, cy] = px(0, s * (L / 2));
    ctx.beginPath();
    ctx.arc(cx, cy, 0.2 * k, 0, Math.PI * 2);
    ctx.save();
    ctx.clip(new Path2D(roundRectPath(fx, fy, fw, fh)));
    ctx.stroke();
    ctx.restore();
  }
  // gols
  ctx.fillStyle = "#020B18";
  for (const s of [-1, 1]) {
    const [x, y, w, h] = rect(d, -HOCKEY.GOAL / 2, s * (L / 2 - 0.004), HOCKEY.GOAL / 2, s * (L / 2 + RAIL * 0.8));
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2 * dpr);
    ctx.fill();
  }
  // alvo do meu controle
  if (d.target && d.seat >= 0) {
    const [tx, ty] = px(d.target.x, d.target.z);
    ctx.strokeStyle = hexA(HOCKEY_COLORS[d.seat]!, 0.5);
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    circle(ctx, [tx, ty], HOCKEY.MALLET_R * k, false);
    ctx.setLineDash([]);
  }
  // rastro e disco
  const [px0, pz0] = [pts[0]!, pts[1]!];
  if (d.now - trailAt > 16) {
    trailAt = d.now;
    trail.copyWithin(2, 0, 14);
    trail[0] = px0;
    trail[1] = pz0;
    trailN = Math.min(8, trailN + 1);
  }
  for (let i = trailN - 1; i >= 1; i--) {
    const [x, y] = px(trail[i * 2]!, trail[i * 2 + 1]!);
    const dx = trail[i * 2]! - px0;
    const dz = trail[i * 2 + 1]! - pz0;
    if (dx * dx + dz * dz < 0.0004 * i) continue;
    ctx.fillStyle = `rgba(20, 22, 28, ${0.16 - i * 0.018})`;
    circle(ctx, [x, y], HOCKEY.PUCK_R * k * (1 - i * 0.06), true);
  }
  const [pX, pY] = px(px0, pz0);
  ctx.fillStyle = "rgba(0, 17, 42, 0.18)";
  circle(ctx, [pX + 1.5 * dpr, pY + 2 * dpr], HOCKEY.PUCK_R * k, true);
  ctx.fillStyle = "#1B1F27";
  circle(ctx, [pX, pY], HOCKEY.PUCK_R * k, true);
  ctx.strokeStyle = "#4C5566";
  ctx.lineWidth = Math.max(1, 0.006 * k);
  circle(ctx, [pX, pY], HOCKEY.PUCK_R * k * 0.62, false);
  // rebatedores
  for (const seat of [0, 1] as const) {
    const [x, y] = px(pts[2 + seat * 2]!, pts[3 + seat * 2]!);
    const r = HOCKEY.MALLET_R * k;
    const c = HOCKEY_COLORS[seat];
    ctx.fillStyle = "rgba(0, 17, 42, 0.22)";
    circle(ctx, [x + 2 * dpr, y + 3 * dpr], r, true);
    ctx.fillStyle = shade(c, -0.28);
    circle(ctx, [x, y], r, true);
    ctx.fillStyle = c;
    circle(ctx, [x, y], r * 0.84, true);
    ctx.fillStyle = shade(c, -0.18);
    circle(ctx, [x, y], r * 0.46, true);
    ctx.fillStyle = shade(c, 0.35);
    circle(ctx, [x - r * 0.12, y - r * 0.14], r * 0.3, true);
  }
}

export function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]): void {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function circle(ctx: CanvasRenderingContext2D, [x, y]: [number, number], r: number, fill: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
}

function roundRectPath(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}Z`;
}

/** Clareia (t > 0) ou escurece (t < 0) uma cor #rrggbb. */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const hockeyView: DuelView<HockeySim> = {
  kind: HOCKEY_KIND,
  title: T.duel.hockey,
  seatNames: T.duel.seatHockey as [string, string],
  colors: HOCKEY_COLORS,
  game: hockeyGame,
  hw: HOCKEY.W / 2 + RAIL + 0.01,
  hl: HOCKEY.L / 2 + RAIL + 0.01,
  hint: T.duel.hintHockey,
  goal: true,
  draw: drawHockey,
};

// ---------------------------------------------------------------- mesa no mundo

const SURFACE = 0.782;

/** Disco e rebatedores andando de verdade sobre cada mesa de hockey, nas duas lentes. */
export function HockeyTables({ lens, tables }: { lens: Lens; tables: MapObject[] }) {
  return (
    <>
      {tables.map((t) => (
        <HockeyTable key={t.id} table={t} lens={lens} />
      ))}
    </>
  );
}

function HockeyTable({ table, lens }: { table: MapObject; lens: Lens }) {
  const id = table.gameId!;
  const built = useMemo(() => {
    const root = new THREE.Group();
    root.name = `arcade:hockey:${id}`;
    const geos: THREE.BufferGeometry[] = [];
    const g = <G extends THREE.BufferGeometry>(x: G) => (geos.push(x), x);
    const puck = new THREE.Mesh(g(new THREE.CylinderGeometry(HOCKEY.PUCK_R, HOCKEY.PUCK_R, 0.012, 18)), toon("#1B1F27"));
    puck.position.y = 0.006;
    const puckG = new THREE.Group();
    puckG.add(puck);
    const mallets = HOCKEY_COLORS.map((c) => {
      const m = new THREE.Group();
      const base = new THREE.Mesh(g(new THREE.CylinderGeometry(HOCKEY.MALLET_R, HOCKEY.MALLET_R, 0.026, 20)), toon(c));
      base.position.y = 0.013;
      const neck = new THREE.Mesh(g(new THREE.CylinderGeometry(0.022, 0.026, 0.045, 12)), toon(c));
      neck.position.y = 0.048;
      const knob = new THREE.Mesh(g(new THREE.SphereGeometry(0.027, 12, 8)), toon("#F2F0EF"));
      knob.position.y = 0.078;
      m.add(base, neck, knob);
      return m;
    });
    root.add(puckG, ...mallets);
    return { root, puck: puckG, mallets, geos };
  }, [id]);
  useEffect(() => () => built.geos.forEach((x) => x.dispose()), [built]);

  const pts = useMemo(() => new Float64Array(6), []);
  const idle = useMemo(() => [hockeyGame.def.create(0), hockeyGame.def.create(1)], []);
  const rot = useMemo(() => {
    const t = Math.PI - table.rot;
    return { c: Math.cos(t), s: Math.sin(t) };
  }, [table.rot]);

  useFrame(() => {
    const st = actState<DuelState>(id);
    const net = duelNet(id, hockeyGame);
    const now = performance.now();
    const fresh = (net.latest()?.at ?? -1e9) > now - 1500;
    // a mesa do mundo mostra a partida interpolada (igual para todos; quem joga olha o painel)
    const live = !!st && st.phase !== "waiting" && fresh && net.sample(now, pts);
    if (!live) hockeyGame.points(idle[st?.serve ?? 0]!, pts);
    // 2D: peças um pouco maiores para ler no pixel art
    const big = lens === "2d" ? 1.5 : 1.25;
    const place = (o: THREE.Object3D, x: number, z: number) => {
      o.position.set(table.pos.x + x * rot.c + z * rot.s, SURFACE, table.pos.z - x * rot.s + z * rot.c);
      o.scale.setScalar(big);
    };
    place(built.puck, pts[0]!, pts[1]!);
    place(built.mallets[0]!, pts[2]!, pts[3]!);
    place(built.mallets[1]!, pts[4]!, pts[5]!);
  });

  return <primitive object={built.root} />;
}
