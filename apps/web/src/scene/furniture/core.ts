import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { MapObject } from "@infinity/world";
import { glow, toon, PALETTE } from "../materials.ts";

/**
 * Núcleo dos móveis procedurais.
 *
 * Cada modelo é montado por um Builder com primitivas arredondadas. As peças são pintadas com
 * cor por vértice e fundidas por "balde" de material: um balde opaco (toon), um que brilha (glow)
 * e, se houver, baldes translúcidos. Assim um molde inteiro vira 1 a 3 geometrias, e cada uma
 * vira um único InstancedMesh com todas as cópias do mundo.
 *
 * Os materiais por vértice são clones de toon()/glow() (mesma rampa de 4 tons, mesmo visual),
 * criados uma vez e compartilhados: não descartar.
 */

export const C = PALETTE;

/** Mistura duas cores (tons derivados da paleta, sem inventar cor nova). */
export function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Tons derivados usados em vários móveis. */
export const T = {
  navySoft: mix(PALETTE.navy, PALETTE.sky, 0.28),
  navyMid: mix(PALETTE.navy, PALETTE.sky, 0.14),
  navyLift: mix(PALETTE.navy, PALETTE.slate, 0.22),
  blueTable: mix(PALETTE.navy, PALETTE.signal, 0.42),
  screen: mix(PALETTE.navyDeep, PALETTE.signal, 0.16),
  screenHi: mix(PALETTE.navyDeep, PALETTE.signal, 0.42),
  creamDark: mix(PALETTE.cream, PALETTE.woodLight, 0.35),
  steel: mix(PALETTE.metal, PALETTE.offwhite, 0.35),
  steelDark: mix(PALETTE.metal, PALETTE.graphite, 0.4),
  warm: "#FFE2B0",
  leafDark: mix(PALETTE.leaf, PALETTE.navy, 0.3),
  felt: mix(PALETTE.navy, PALETTE.signal, 0.12),
};

// ---------------------------------------------------------------- pintura

/** Cor opaca (string) ou pintura especial. */
export type Paint = string | { k: "g" | "t"; c: string; o: number };
/** Brilha sem sombreamento (telas, LEDs, neon). */
export const lit = (c: string): Paint => ({ k: "g", c, o: 1 });
/** Toon translúcido (vidro, galão, holograma sólido). */
export const clear = (c: string, o: number): Paint => ({ k: "t", c, o });
/** Brilho translúcido (holograma, feixes de luz). */
export const litClear = (c: string, o: number): Paint => ({ k: "g", c, o });

function bucketOf(p: Paint): string {
  return typeof p === "string" ? "t1" : `${p.k}${p.o}`;
}
function hexOf(p: Paint): string {
  return typeof p === "string" ? p : p.c;
}

const vcMats = new Map<string, THREE.Material>();
/** Material compartilhado de um balde ("t1" opaco, "g1" brilho, "t0.5"/"g0.3" translúcidos). */
export function bucketMaterial(key: string): THREE.Material {
  let m = vcMats.get(key);
  if (!m) {
    const kind = key[0];
    const op = Number(key.slice(1));
    m = (kind === "g" ? glow("#FFFFFF", op) : toon("#FFFFFF", { opacity: op })).clone();
    m.vertexColors = true;
    m.name = `mobilia:${key}`;
    vcMats.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- matrizes

export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Translação + rotação (ordem: roll, depois inclinação, depois yaw) + escala. */
export function trs(x: number, y: number, z: number, r: Rot = {}, sx = 1, sy = sx, sz = sx, out = new THREE.Matrix4()): THREE.Matrix4 {
  _e.set(r.rx ?? 0, r.ry ?? 0, r.rz ?? 0, "YXZ");
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Gerador pseudoaleatório determinístico (mesmo molde = mesmo arranjo). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length] as T;
}

// ---------------------------------------------------------------- formas 2D

/** Retângulo arredondado centrado, no plano XY. */
export function roundRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.max(0.0001, Math.min(r, w / 2 - 0.0001, h / 2 - 0.0001));
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Elipse centrada no plano XY. */
export function ellipse(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
  return s;
}

/** Forma a partir de pontos [x, y]. */
export function poly(pts: readonly (readonly [number, number])[]): THREE.Shape {
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

/**
 * Setor de anel visto de cima, para slab(): centro de curvatura em (cx, cz) do plano XZ,
 * ângulo 0 aponta para -Z (atrás do centro), positivo para +X.
 */
export function arcShape(r0: number, r1: number, a0: number, a1: number, cx = 0, cz = 0, n = 24): THREE.Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r1 * Math.sin(a), -(cz - r1 * Math.cos(a))]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r0 * Math.sin(a), -(cz - r0 * Math.cos(a))]);
  }
  return poly(pts);
}

/** Perfil de disco com bordas arredondadas, para lathe (base em y = 0). */
export function puckProfile(r: number, h: number, bevel: number, steps = 3): [number, number][] {
  const b = Math.min(bevel, h / 2 - 0.0001, r - 0.0001);
  const pts: [number, number][] = [[0, 0]];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push([r - b + Math.cos(a) * b, b + Math.sin(a) * b]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push([r - b + Math.cos(a) * b, h - b + Math.sin(a) * b]);
  }
  pts.push([0, h]);
  return pts;
}

// ---------------------------------------------------------------- builder

export interface AnimSpec {
  meshes: { geometry: THREE.BufferGeometry; material: THREE.Material; bucket: string }[];
  /** Posição local (espaço do modelo) de cada cópia da peça animada. */
  copies: THREE.Matrix4[];
  /** Movimento: matriz aplicada depois da cópia (girar, balançar). */
  pose?: (t: number, seed: number, copy: number, out: THREE.Matrix4) => void;
  /** Cor por cópia (multiplica a cor da peça): LEDs, luzes que mudam de cor. */
  tint?: (t: number, seed: number, copy: number, out: THREE.Color) => void;
}

export interface Mold {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; bucket: string }[];
  anims: AnimSpec[];
  /** Tela separada (TV, ranking), no espaço do modelo. */
  screen: { w: number; h: number; m: THREE.Matrix4; kind: "tv" | "leaderboard" } | null;
  /** Placa de texto neon, no espaço do modelo. */
  neon: { w: number; h: number; m: THREE.Matrix4 } | null;
}

const ATTRS_KEEP = new Set(["position", "normal"]);
const _color = new THREE.Color();

export class Builder {
  private readonly buckets = new Map<string, THREE.BufferGeometry[]>();
  private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  readonly anims: AnimSpec[] = [];
  screen: Mold["screen"] = null;
  neon: Mold["neon"] = null;

  private top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1] as THREE.Matrix4;
  }

  /** Abre um sistema de coordenadas local (tudo até pop() fica relativo a ele). */
  push(x = 0, y = 0, z = 0, r: Rot = {}, s = 1): this {
    this.stack.push(this.top().clone().multiply(trs(x, y, z, r, s)));
    return this;
  }
  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Atalho: executa fn dentro de um sistema local. */
  at(x: number, y: number, z: number, r: Rot, fn: () => void): this {
    this.push(x, y, z, r);
    fn();
    return this.pop();
  }
  /** Matriz atual combinada com uma local (para telas e animações). */
  here(local?: THREE.Matrix4): THREE.Matrix4 {
    return local ? this.top().clone().multiply(local) : this.top().clone();
  }

  /** Adiciona uma geometria qualquer (já criada) com a pintura e a matriz local. */
  add(p: Paint, geo: THREE.BufferGeometry, local?: THREE.Matrix4): this {
    for (const name of Object.keys(geo.attributes)) if (!ATTRS_KEEP.has(name)) geo.deleteAttribute(name);
    let g = geo;
    if (!g.index) {
      g = mergeVertices(geo, 1e-5);
      geo.dispose();
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(local ? this.top().clone().multiply(local) : this.top());
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    _color.set(hexOf(p));
    for (let i = 0; i < n; i++) col.set([_color.r, _color.g, _color.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.morphAttributes = {};
    g.clearGroups();
    const key = bucketOf(p);
    const list = this.buckets.get(key) ?? [];
    list.push(g);
    this.buckets.set(key, list);
    return this;
  }

  /** Caixa centrada em (x, y, z). r = raio da borda (0 = canto vivo). */
  box(p: Paint, w: number, h: number, d: number, x: number, y: number, z: number, o: Rot & { r?: number } = {}): this {
    const min = Math.min(w, h, d);
    const r = Math.min(o.r ?? Math.min(0.03, min * 0.22), min / 2 - 0.0005);
    const geo = r >= 0.004 ? new RoundedBoxGeometry(w, h, d, r >= 0.02 ? 2 : 1, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Cilindro centrado em (x, y, z), eixo Y. r = raio de baixo, rt = raio de cima. */
  cyl(p: Paint, r: number, h: number, x: number, y: number, z: number, o: Rot & { rt?: number; seg?: number; open?: boolean; ts?: number; tl?: number } = {}): this {
    const seg = o.seg ?? segs(Math.max(r, o.rt ?? 0));
    const geo = new THREE.CylinderGeometry(o.rt ?? r, r, h, seg, 1, o.open ?? false, o.ts ?? 0, o.tl ?? Math.PI * 2);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Haste cilíndrica ligando dois pontos (pernas, tripés, braços). */
  rod(p: Paint, r: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, o: { rt?: number; seg?: number } = {}): this {
    const a = new THREE.Vector3(x1, y1, z1);
    const d = new THREE.Vector3(x2, y2, z2).sub(a);
    const len = d.length();
    const geo = new THREE.CylinderGeometry(o.rt ?? r, r, len, o.seg ?? segs(r), 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(p, geo, m);
  }

  /** Esfera centrada em (x, y, z); sx/sy/sz achatam. */
  sph(p: Paint, r: number, x: number, y: number, z: number, o: Rot & { sx?: number; sy?: number; sz?: number; seg?: number } = {}): this {
    const seg = o.seg ?? Math.max(8, Math.min(20, Math.round(8 + r * 40)));
    const geo = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
    return this.add(p, geo, trs(x, y, z, o, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  }

  /** Toro centrado em (x, y, z), anel no plano XY (gire com rx = PI/2 para deitar). */
  torus(p: Paint, R: number, tube: number, x: number, y: number, z: number, o: Rot & { arc?: number; seg?: number; tseg?: number } = {}): this {
    const geo = new THREE.TorusGeometry(R, tube, o.tseg ?? 8, o.seg ?? Math.max(12, Math.min(40, Math.round(R * 70))), o.arc ?? Math.PI * 2);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Sólido de revolução: pontos [raio, altura]; (x, y, z) é a base do perfil. */
  lathe(p: Paint, pts: readonly (readonly [number, number])[], x: number, y: number, z: number, o: Rot & { seg?: number; sx?: number; sz?: number; sy?: number } = {}): this {
    const maxR = pts.reduce((m, [r]) => Math.max(m, r), 0);
    const geo = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), o.seg ?? segs(maxR));
    return this.add(p, geo, trs(x, y, z, o, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  }

  /** Disco grosso de borda arredondada (tampos redondos). Base em y. */
  puck(p: Paint, r: number, h: number, x: number, y: number, z: number, o: Rot & { bevel?: number; seg?: number; sx?: number; sz?: number } = {}): this {
    return this.lathe(p, puckProfile(r, h, o.bevel ?? Math.min(0.02, h * 0.4)), x, y, z, o);
  }

  /** Placa horizontal extrudada de uma forma no plano XZ (forma em XY com y = -z). Base em y. */
  slab(p: Paint, shape: THREE.Shape, h: number, x: number, y: number, z: number, o: Rot & { bevel?: number; curve?: number } = {}): this {
    const geo = extrude(shape, h, o.bevel ?? 0, o.curve);
    geo.rotateX(-Math.PI / 2);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Placa retangular arredondada vista de cima (tampos com cantos redondos). Base em y. */
  plate(p: Paint, w: number, d: number, h: number, x: number, y: number, z: number, o: Rot & { r?: number; bevel?: number } = {}): this {
    const bevel = o.bevel ?? Math.min(0.012, h * 0.3);
    return this.slab(p, roundRect(w - bevel * 2, d - bevel * 2, (o.r ?? 0.06) - bevel), h, x, y, z, { ...o, bevel });
  }

  /** Perfil lateral (forma no plano ZY: x da forma = z, y = altura) extrudado ao longo de X, centrado em x. */
  side(p: Paint, shape: THREE.Shape, width: number, x: number, y: number, z: number, o: Rot & { bevel?: number; curve?: number } = {}): this {
    const geo = extrude(shape, width, o.bevel ?? 0, o.curve);
    geo.rotateY(-Math.PI / 2);
    geo.translate(width / 2, 0, 0);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Forma frontal (plano XY) extrudada ao longo de Z, centrada em z. */
  front(p: Paint, shape: THREE.Shape, depth: number, x: number, y: number, z: number, o: Rot & { bevel?: number; curve?: number } = {}): this {
    const geo = extrude(shape, depth, o.bevel ?? 0, o.curve);
    geo.translate(0, 0, -depth / 2);
    return this.add(p, geo, trs(x, y, z, o));
  }

  /** Peça animada: monta num builder próprio e vira um InstancedMesh à parte. */
  anim(build: (b: Builder) => void, opts: { copies?: THREE.Matrix4[]; pose?: AnimSpec["pose"]; tint?: AnimSpec["tint"] }): this {
    const sub = new Builder();
    build(sub);
    const copies = (opts.copies ?? [new THREE.Matrix4()]).map((m) => this.top().clone().multiply(m));
    this.anims.push({ meshes: sub.parts(), copies, pose: opts.pose, tint: opts.tint });
    return this;
  }

  /** Funde cada balde numa geometria só. */
  parts(): Mold["parts"] {
    const out: Mold["parts"] = [];
    for (const [bucket, list] of this.buckets) {
      const merged = list.length === 1 ? (list[0] as THREE.BufferGeometry) : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      out.push({ geometry: merged, material: bucketMaterial(bucket), bucket });
    }
    this.buckets.clear();
    return out;
  }

  finish(): Mold {
    return { parts: this.parts(), anims: this.anims, screen: this.screen, neon: this.neon };
  }
}

function segs(r: number): number {
  return Math.max(8, Math.min(32, Math.round(8 + r * 50)));
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, curve = 10): THREE.BufferGeometry {
  if (bevel > 0) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: curve,
    });
    geo.translate(0, 0, bevel);
    return geo;
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curve });
}

// ---------------------------------------------------------------- contexto dos modelos

export interface ModelCtx {
  b: Builder;
  /** Primeiro objeto do molde (campos por instância, como texto, não valem para os outros). */
  o: MapObject;
  color: string | undefined;
  accent: string | undefined;
  variant: number;
  /** A tela da TV vai como malha separada (tem screenId). */
  separateScreen: boolean;
}

export type ModelFn = (c: ModelCtx) => void;
