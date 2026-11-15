import * as THREE from "three";
import { Builder, C, T, lit, mix, puckProfile, rng, pick, type Paint } from "./core.ts";

/**
 * Peças pequenas reaproveitadas pelos móveis (monitor, teclado, caneca, plantinha...).
 * Todas recebem a posição da base (y = superfície onde apoiam) e olham para +Z.
 */

/** Monitor com pé, moldura escura e tela acesa com "linhas de código". */
export function monitor(b: Builder, x: number, y: number, z: number, o: { w?: number; h?: number; ry?: number; frame?: string } = {}): void {
  const w = o.w ?? 0.58;
  const h = o.h ?? 0.36;
  const frame = o.frame ?? C.graphite;
  b.at(x, y, z, { ry: o.ry ?? 0 }, () => {
    b.box(frame, 0.22, 0.025, 0.16, 0, 0.0125, 0, { r: 0.01 });
    b.box(frame, 0.05, 0.2, 0.035, 0, 0.12, -0.02, { r: 0.012 });
    const cy = 0.2 + h / 2;
    b.box(frame, w, h, 0.04, 0, cy, 0, { r: 0.016 });
    b.box(lit(T.screen), w - 0.05, h - 0.05, 0.01, 0, cy, 0.018, { r: 0 });
    // linhas de código: só blocos grandes, legíveis em pixel art
    const lines: [number, number, string][] = [
      [-0.12, 0.26, C.signal],
      [-0.06, 0.38, C.sky],
      [-0.1, 0.22, T.screenHi],
      [-0.08, 0.3, C.orange],
    ];
    lines.forEach(([dx, lw, col], i) => {
      const ly = cy + h / 2 - 0.07 - i * ((h - 0.12) / 4);
      b.box(lit(col), lw * (w / 0.58) * 0.8, 0.03, 0.006, dx * (w / 0.58) + (lw * (w / 0.58) * 0.8) / 2 - 0.05, ly, 0.025, { r: 0 });
    });
  });
}

/** Teclado: base + fileiras de teclas em relevo. mech = teclado mecânico colorido. */
export function keyboard(b: Builder, x: number, y: number, z: number, o: { w?: number; mech?: boolean; ry?: number } = {}): void {
  const w = o.w ?? 0.44;
  const base = o.mech ? C.navy : C.offwhite;
  const keys = o.mech ? C.offwhite : mix(C.offwhite, C.slate, 0.35);
  b.at(x, y, z, { ry: o.ry ?? 0 }, () => {
    b.box(base, w, 0.03, 0.15, 0, 0.015, 0, { r: 0.012 });
    for (let i = 0; i < 3; i++) b.box(keys, w - 0.05, 0.016, 0.03, 0, 0.034, -0.045 + i * 0.045, { r: 0.006 });
    if (o.mech) {
      b.box(C.orange, 0.04, 0.02, 0.03, -w / 2 + 0.045, 0.036, -0.045, { r: 0.006 });
      b.box(C.sky, 0.14, 0.02, 0.03, 0.02, 0.036, 0.045, { r: 0.006 });
    }
  });
}

/** Mouse pequeno sobre um mousepad. */
export function mouse(b: Builder, x: number, y: number, z: number, pad: string = C.graphite): void {
  b.box(pad, 0.2, 0.008, 0.17, x, y + 0.004, z, { r: 0.003 });
  b.sph(C.offwhite, 0.035, x, y + 0.012, z, { sx: 0.8, sy: 0.55, sz: 1.2, seg: 10 });
}

/** Caneca com alça e café. */
export function mug(b: Builder, x: number, y: number, z: number, color: string = C.orange, ry = 0): void {
  b.at(x, y, z, { ry }, () => {
    b.cyl(color, 0.045, 0.1, 0, 0.05, 0, { seg: 14 });
    b.cyl(C.woodDark, 0.037, 0.01, 0, 0.098, 0, { seg: 12 });
    b.torus(color, 0.03, 0.011, 0.048, 0.05, 0, { seg: 10, tseg: 6 });
  });
}

/** Notebook aberto (tampa inclinada para trás). */
export function laptop(b: Builder, x: number, y: number, z: number, o: { ry?: number; color?: string; w?: number } = {}): void {
  const w = o.w ?? 0.36;
  const col = o.color ?? T.steel;
  b.at(x, y, z, { ry: o.ry ?? 0 }, () => {
    b.box(col, w, 0.022, 0.25, 0, 0.011, 0, { r: 0.01 });
    b.box(mix(col, C.graphite, 0.45), w - 0.05, 0.006, 0.11, 0, 0.024, -0.03, { r: 0 });
    b.push(0, 0.02, -0.12, { rx: -0.32 });
    b.box(col, w, 0.24, 0.018, 0, 0.12, 0, { r: 0.01 });
    b.box(lit(T.screen), w - 0.04, 0.2, 0.006, 0, 0.125, 0.011, { r: 0 });
    b.box(lit(C.signal), w * 0.4, 0.03, 0.004, -w * 0.12, 0.17, 0.015, { r: 0 });
    b.box(lit(C.sky), w * 0.55, 0.03, 0.004, -w * 0.05, 0.11, 0.015, { r: 0 });
    b.pop();
  });
}

/** Vasinho de mesa com folhas redondas. */
export function tinyPlant(b: Builder, x: number, y: number, z: number, pot: string = C.offwhite, s = 1): void {
  b.at(x, y, z, {}, () => {
    b.lathe(pot, [[0, 0], [0.055 * s, 0], [0.07 * s, 0.11 * s], [0.06 * s, 0.11 * s], [0, 0.1 * s]], 0, 0, 0, { seg: 12 });
    b.sph(C.leaf, 0.07 * s, 0, 0.15 * s, 0, { sy: 0.85 });
    b.sph(C.leafLight, 0.05 * s, 0.04 * s, 0.2 * s, 0.02 * s, { sy: 0.85 });
    b.sph(C.leafLight, 0.045 * s, -0.045 * s, 0.19 * s, -0.01 * s, { sy: 0.85 });
  });
}

/** Luminária de mesa articulada, com a luz quente voltada para baixo. */
export function deskLamp(b: Builder, x: number, y: number, z: number, o: { ry?: number; color?: string } = {}): void {
  const col = o.color ?? C.graphite;
  b.at(x, y, z, { ry: o.ry ?? 0 }, () => {
    b.puck(col, 0.08, 0.025, 0, 0, 0, { seg: 14 });
    b.cyl(col, 0.014, 0.34, 0, 0.18, 0.04, { rx: 0.25, seg: 8 });
    b.cyl(col, 0.014, 0.26, 0, 0.36, 0.17, { rx: 1.25, seg: 8 });
    b.sph(C.orange, 0.024, 0, 0.33, 0.085, { seg: 10 });
    b.cyl(col, 0.05, 0.1, 0, 0.37, 0.3, { rt: 0.025, rx: 0.5, seg: 12 });
    b.cyl(lit(T.warm), 0.045, 0.01, 0, 0.33, 0.33, { rx: 0.5, seg: 12 });
  });
}

/** Porta-lápis com lápis coloridos. */
export function pencilCup(b: Builder, x: number, y: number, z: number, cup: string = C.navy): void {
  b.cyl(cup, 0.04, 0.1, x, y + 0.05, z, { seg: 12 });
  const cols = [C.orange, C.signal, C.gold];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2;
    b.cyl(c, 0.011, 0.16, x + Math.cos(a) * 0.016, y + 0.11, z + Math.sin(a) * 0.016, { rx: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.15, seg: 6 });
  });
}

/** Troféu dourado pequeno. */
export function trophy(b: Builder, x: number, y: number, z: number, s = 1): void {
  b.box(C.woodDark, 0.08 * s, 0.04 * s, 0.08 * s, x, y + 0.02 * s, z, { r: 0.006 });
  b.cyl(C.gold, 0.012 * s, 0.06 * s, x, y + 0.07 * s, z, { seg: 8 });
  b.lathe(C.gold, [[0, 0], [0.02 * s, 0], [0.05 * s, 0.05 * s], [0.055 * s, 0.09 * s], [0.045 * s, 0.09 * s], [0, 0.03 * s]], x, y + 0.095 * s, z, { seg: 14 });
  b.torus(C.gold, 0.025 * s, 0.008 * s, x - 0.052 * s, y + 0.155 * s, z, { arc: Math.PI, rz: Math.PI / 2, seg: 8, tseg: 5 });
  b.torus(C.gold, 0.025 * s, 0.008 * s, x + 0.052 * s, y + 0.155 * s, z, { arc: Math.PI, rz: -Math.PI / 2, seg: 8, tseg: 5 });
}

/** Pilha de papéis levemente bagunçada. */
export function papers(b: Builder, x: number, y: number, z: number, n = 3, seed = 1): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    b.box(i % 3 === 2 ? C.cream : C.offwhite, 0.21, 0.006, 0.29, x + (r() - 0.5) * 0.04, y + 0.003 + i * 0.007, z + (r() - 0.5) * 0.04, { ry: (r() - 0.5) * 0.5, r: 0 });
  }
}

/** Livro deitado ou revista. */
export function book(b: Builder, x: number, y: number, z: number, color: string, o: { w?: number; d?: number; h?: number; ry?: number } = {}): void {
  const w = o.w ?? 0.2;
  const d = o.d ?? 0.26;
  const h = o.h ?? 0.035;
  b.at(x, y, z, { ry: o.ry ?? 0 }, () => {
    b.box(color, w, h, d, 0, h / 2, 0, { r: 0.006 });
    b.box(C.offwhite, w - 0.012, h * 0.7, 0.012, 0, h / 2, d / 2 - 0.004, { r: 0 });
  });
}

/** Garrafa d'água. */
export function bottle(b: Builder, x: number, y: number, z: number, color: string = C.signal): void {
  b.lathe(color, [[0, 0], [0.035, 0], [0.037, 0.02], [0.037, 0.17], [0.025, 0.2], [0.018, 0.22], [0, 0.22]], x, y, z, { seg: 12 });
  b.cyl(C.offwhite, 0.02, 0.03, x, y + 0.235, z, { seg: 10 });
}

/** Post-it de parede (plano XY, olhando para +Z). */
export function postit(b: Builder, x: number, y: number, z: number, color: string, rz = 0, s = 1): void {
  b.box(color, 0.15 * s, 0.15 * s, 0.01, x, y, z + 0.005, { rz, r: 0 });
}

/** Base de cinco pernas com rodinhas (cadeiras de escritório). */
export function fiveStar(b: Builder, o: { r?: number; color?: string; wheel?: string; post?: number } = {}): void {
  const r = o.r ?? 0.28;
  const col = o.color ?? C.graphite;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
    const cx = Math.sin(a) * r * 0.5;
    const cz = Math.cos(a) * r * 0.5;
    b.box(col, 0.055, 0.04, r, cx, 0.085, cz, { ry: a, r: 0.016 });
    b.sph(o.wheel ?? C.ink, 0.035, Math.sin(a) * r * 0.95, 0.035, Math.cos(a) * r * 0.95, { seg: 10 });
  }
  b.cyl(col, 0.06, 0.06, 0, 0.09, 0, { seg: 14 });
  b.cyl(T.steel, 0.025, o.post ?? 0.28, 0, 0.09 + (o.post ?? 0.28) / 2, 0, { seg: 10 });
}

/** Perna redonda afunilada (madeira). */
export function leg(b: Builder, p: Paint, x: number, z: number, h: number, o: { r?: number; rt?: number; splay?: number; ax?: number; az?: number } = {}): void {
  const r = o.r ?? 0.025;
  b.cyl(p, r * 0.75, h, x, h / 2, z, { rt: o.rt ?? r, rx: o.az ?? 0, rz: o.ax ?? 0, seg: 10 });
}

/** Conjunto de livros em pé numa prateleira (largura total w). Devolve onde parou. */
export function bookRow(b: Builder, x0: number, y: number, z: number, w: number, maxH: number, seed: number, palette: readonly string[]): void {
  const r = rng(seed);
  let x = x0;
  const end = x0 + w;
  while (x < end - 0.05) {
    const bw = 0.04 + r() * 0.04;
    if (x + bw > end) break;
    const bh = maxH * (0.68 + r() * 0.32);
    const col = pick(r, palette);
    const lean = r() < 0.12 && x + bw + 0.06 < end;
    if (lean) {
      b.box(col, bw, bh, 0.22, x + bh * 0.18 + bw / 2, y + bh / 2 - 0.01, z, { rz: -0.35, r: 0.006 });
      x += bh * 0.4 + bw;
      continue;
    }
    b.box(col, bw, bh, 0.22, x + bw / 2, y + bh / 2, z, { r: 0.006 });
    if (r() < 0.45) b.box(mix(col, C.offwhite, 0.6), bw + 0.002, 0.025, 0.222, x + bw / 2, y + bh * 0.78, z, { r: 0 });
    x += bw + 0.004;
    if (r() < 0.1) x += 0.05;
  }
}

/** Almofada fofa (cubo bem arredondado). */
export function cushion(b: Builder, p: Paint, w: number, h: number, d: number, x: number, y: number, z: number, rot: { rx?: number; ry?: number; rz?: number } = {}): void {
  b.box(p, w, h, d, x, y, z, { ...rot, r: Math.min(w, h, d) * 0.42 });
}

/** Tampo redondo de borda arredondada. y = altura do topo. */
export function roundTop(b: Builder, p: Paint, r: number, thick: number, x: number, yTop: number, z: number): void {
  b.lathe(p, puckProfile(r, thick, Math.min(0.025, thick * 0.45)), x, yTop - thick, z, { seg: Math.max(20, Math.round(r * 40)) });
}

/** Bola (sinuca, pingue-pongue...). */
export function ball(b: Builder, p: Paint, r: number, x: number, y: number, z: number): void {
  b.sph(p, r, x, y + r, z, { seg: 10 });
}

/** Uma matriz de cópia para animações. */
export function at(x: number, y: number, z: number, ry = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
}
