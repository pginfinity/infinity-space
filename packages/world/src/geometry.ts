/**
 * Geometria 2D do plano do chão. Unidade: metro.
 * x cresce para o leste, z cresce para o sul (norte = -z). A lente 3D usa y como altura.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export const v = (x: number, z: number): Vec2 => ({ x, z });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const len = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Suavização clássica 0..1 entre dois limites. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Direção (yaw) em radianos: 0 = norte (-z), cresce no sentido horário visto de cima. */
export function yawOf(d: Vec2): number {
  return Math.atan2(d.x, -d.z);
}

/** Vetor unitário de um yaw (inverso de yawOf). */
export function dirOfYaw(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Diferença angular mínima, em -PI..PI. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distância de um ponto ao segmento AB. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  if (l2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/** Os segmentos PQ e AB se cruzam (excluindo toques exatos nas pontas). */
export function segmentsIntersect(p: Vec2, q: Vec2, a: Vec2, b: Vec2): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(a, b, q);
  const d3 = cross(p, q, a);
  const d4 = cross(p, q, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/** Ponto dentro do polígono (regra par-ímpar). */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Área (absoluta) de um polígono simples. */
export function polygonArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j]!.x + poly[i]!.x) * (poly[j]!.z - poly[i]!.z);
  }
  return Math.abs(s / 2);
}

export function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / poly.length, z: z / poly.length };
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function boundsOf(points: Iterable<Vec2>): Bounds {
  const b: Bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const p of points) {
    if (p.x < b.minX) b.minX = p.x;
    if (p.z < b.minZ) b.minZ = p.z;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.z > b.maxZ) b.maxZ = p.z;
  }
  return b;
}

/** Os quatro cantos de um retângulo centrado em `c`, girado por `yaw`, com largura `w` (eixo lateral) e profundidade `d` (eixo frontal). */
export function rectCorners(c: Vec2, w: number, d: number, yaw: number): Vec2[] {
  const f = dirOfYaw(yaw); // frente
  const r = { x: -f.z, z: f.x }; // direita
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: c.x - r.x * hw - f.x * hd, z: c.z - r.z * hw - f.z * hd },
    { x: c.x + r.x * hw - f.x * hd, z: c.z + r.z * hw - f.z * hd },
    { x: c.x + r.x * hw + f.x * hd, z: c.z + r.z * hw + f.z * hd },
    { x: c.x - r.x * hw + f.x * hd, z: c.z - r.z * hw + f.z * hd },
  ];
}
