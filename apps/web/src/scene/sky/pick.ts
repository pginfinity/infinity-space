import * as THREE from "three";
import { create } from "zustand";
import { apply, EARTH_ANGULAR_RADIUS, type PlanetKey, type Vec3 } from "../astro/astro.ts";
import { getSky } from "../astro/live.ts";
import { skyNow } from "../astro/clock.ts";
import { satellitesAt } from "../astro/satellites.ts";
import { SKY_VP } from "./camera.ts";
import { namedStars } from "./constellations.ts";
import { recentMeteors } from "./meteorLayer.ts";

/**
 * Clique no céu: o que está debaixo do ponteiro (Sol, Lua, planeta, estrela com nome, satélite, meteoro
 * que acabou de passar ou a Terra). Projeta cada candidato com a matriz do céu do último quadro desenhado,
 * então vale igual nas duas lentes. Quem chama decide antes se o clique foi na estação (aí é andar).
 */

export type SkyTarget =
  | { kind: "sol" }
  | { kind: "lua" }
  | { kind: "terra" }
  | { kind: "planeta"; key: PlanetKey }
  | { kind: "estrela"; key: string }
  | { kind: "satelite" }
  | { kind: "meteoro" };

export interface SkyPick {
  target: SkyTarget;
  dir: Vec3;
  /** Quando foi o clique (o cartão reabre com o mesmo alvo). */
  at: number;
}

/** Último clique no céu: o cartão do espaço escuta. */
export const useSkyPick = create<{ pick: SkyPick | null }>(() => ({ pick: null }));

/** Pedido de "olhar para lá" para a câmera 3D (ela lê e limpa no quadro seguinte). */
export const skyFocus: { dir: Vec3 | null } = { dir: null };

/** Altura (y da direção) da borda da Terra vista da estação: abaixo disso, a Terra tapa. */
export const LIMB_Y = -Math.cos((EARTH_ANGULAR_RADIUS * Math.PI) / 180);

/** Raio de acerto em px CSS (o meteoro é generoso: ele já está apagando quando a pessoa clica). */
const RADIUS = { sol: 44, lua: 36, planeta: 20, estrela: 18, satelite: 20, meteoro: 70 } as const;

const v = new THREE.Vector4();
const inv = new THREE.Matrix4();
const sats: Array<{ dir: Vec3; mag: number }> = [];

/** Direção → px CSS no canvas (null atrás da câmera). */
function toScreen(d: readonly number[], w: number, h: number): [number, number] | null {
  v.set(d[0]!, d[1]!, d[2]!, 1).applyMatrix4(SKY_VP.value);
  if (v.w <= 1e-6) return null;
  return [((v.x / v.w) * 0.5 + 0.5) * w, (0.5 - (v.y / v.w) * 0.5) * h];
}

/** px CSS → direção no céu. */
export function skyRay(x: number, y: number, w: number, h: number): Vec3 {
  inv.copy(SKY_VP.value).invert();
  v.set((x / w) * 2 - 1, 1 - (y / h) * 2, 0.5, 1).applyMatrix4(inv);
  const l = Math.hypot(v.x, v.y, v.z) * Math.sign(v.w || 1) || 1;
  return [v.x / l, v.y / l, v.z / l];
}

/** Cada alvo clicável agora, com o raio de acerto e o peso (menor = preferido). Abaixo da borda da Terra não conta. */
function eachTarget(now: number, cb: (target: SkyTarget, dir: Vec3, radius: number, weight: number) => void): void {
  const s = getSky();
  const each = (target: SkyTarget, dir: Vec3, radius: number, weight = 1) => dir[1] >= LIMB_Y && cb(target, dir, radius, weight);
  // Meteoro com peso menor: quem clica num risco que acabou de passar quer fazer um pedido.
  for (const m of recentMeteors.values()) if (now - m.at < 2500) each({ kind: "meteoro" }, [m.dir.x, m.dir.y, m.dir.z], RADIUS.meteoro, 0.5);
  each({ kind: "sol" }, s.sun.dir, RADIUS.sol);
  each({ kind: "lua" }, s.moon.dir, RADIUS.lua);
  for (const p of s.planets) each({ kind: "planeta", key: p.key }, p.dir, RADIUS.planeta);
  for (const st of namedStars) each({ kind: "estrela", key: st.key }, apply(s.eqjToScene, st.eqj), RADIUS.estrela);
  const n = satellitesAt(now, sats);
  for (let i = 0; i < n; i++) each({ kind: "satelite" }, sats[i]!.dir, RADIUS.satelite);
}

/** O que há no ponto (x, y) em px CSS de um canvas w×h; null = nada do céu (nem a Terra). */
export function pickSky(x: number, y: number, w: number, h: number): SkyPick | null {
  let best = null as SkyPick | null;
  let score = 1;
  const at = Date.now();
  eachTarget(skyNow(), (target, dir, radius, weight) => {
    const p = toScreen(dir, w, h);
    if (!p) return;
    const k = (Math.hypot(p[0] - x, p[1] - y) / radius) * weight;
    if (k < score) {
      score = k;
      best = { target, dir: [dir[0], dir[1], dir[2]], at };
    }
  });
  if (best) return best;
  const d = skyRay(x, y, w, h);
  return d[1] < LIMB_Y ? { target: { kind: "terra" }, dir: d, at } : null;
}

// Só em desenvolvimento (testes): onde está cada alvo clicável na tela agora.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __infinityPick?: unknown }).__infinityPick = (w: number, h: number) => {
    const out: Array<{ target: SkyTarget; x: number; y: number }> = [];
    eachTarget(skyNow(), (target, dir) => {
      const p = toScreen(dir, w, h);
      if (p && p[0] > 0 && p[0] < w && p[1] > 0 && p[1] < h) out.push({ target, x: p[0], y: p[1] });
    });
    return out;
  };
}

/** Algo da estação desenhado de verdade (nem escondido, nem material invisível). */
function shown(o: THREE.Object3D | null): boolean {
  const m = (o as THREE.Mesh | null)?.material;
  if (m && !Array.isArray(m) && !m.visible) return false;
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * Clique que não caiu em chão andável (as duas lentes chamam): se nada da estação está na frente do ponteiro,
 * vale para o céu. `raycaster` já apontado pela câmera da lente; x/y/w/h em px CSS do canvas.
 */
export function clickSky(raycaster: THREE.Raycaster, scene: THREE.Object3D, x: number, y: number, w: number, h: number): boolean {
  raycaster.params.Points = { threshold: 0.02 };
  raycaster.params.Line = { threshold: 0.02 };
  for (const i of raycaster.intersectObject(scene, true)) if (shown(i.object)) return false;
  return skyClick(x, y, w, h);
}

/** Clique no céu: abre o cartão (e pede para a câmera olhar). Devolve se havia algo ali. */
export function skyClick(x: number, y: number, w: number, h: number): boolean {
  const pick = pickSky(x, y, w, h);
  if (!pick) return false;
  useSkyPick.setState({ pick });
  if (pick.target.kind !== "terra" && pick.target.kind !== "meteoro") skyFocus.dir = pick.dir;
  return true;
}
