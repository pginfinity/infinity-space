import * as THREE from "three";
import { Builder, C, T, ellipse, lit, mix, pick, poly, rng, type ModelFn } from "./core.ts";
import { bookRow, tinyPlant, trophy } from "./kit.ts";

/** Plantas, estante, luminária, tapete, gongo e púlpito. */

const terracotta = mix(C.orange, C.woodDark, 0.45);

/** Folha em forma de gota (plano XY, comprimento em +Y, base na origem). */
function leafShape(len: number, wid: number, notches = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  if (notches === 0) {
    s.bezierCurveTo(wid * 0.7, len * 0.15, wid * 0.6, len * 0.75, 0, len);
    s.bezierCurveTo(-wid * 0.6, len * 0.75, -wid * 0.7, len * 0.15, 0, 0);
    return s;
  }
  // costela-de-adão: coração largo e arredondado, com recortes estreitos e fundos nas laterais
  const width = (t: number) => Math.sin(Math.PI * Math.pow(t, 0.75)) * wid * 0.5 + Math.max(0, 0.18 - t) * wid * 1.2;
  const cuts = Array.from({ length: notches }, (_, k) => 0.28 + (k * 0.5) / Math.max(1, notches - 1));
  const side = (dir: number) => {
    const pts: [number, number][] = [];
    const n = 30;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const cut = cuts.find((c) => t >= c - 0.02 && t < c + 0.045);
      if (cut !== undefined) {
        // um "V" estreito que vai até 30% da largura, uma vez por recorte
        if (t - 1 / n < cut - 0.02) {
          pts.push([dir * width(cut - 0.02), len * (cut - 0.02)]);
          pts.push([dir * width(cut) * 0.3, len * (cut + 0.03)]);
          pts.push([dir * width(cut + 0.045), len * (cut + 0.045)]);
        }
        continue;
      }
      pts.push([dir * width(t), len * t]);
    }
    return pts;
  };
  for (const [x, y] of side(1)) s.lineTo(x, y);
  s.lineTo(0, len);
  for (const [x, y] of side(-1).reverse()) s.lineTo(x, y);
  s.lineTo(0, 0);
  return s;
}

function pot(b: Builder, col: string, r: number, h: number, soil = true): void {
  b.lathe(
    col,
    [
      [0, 0],
      [r * 0.75, 0],
      [r * 0.95, h * 0.9],
      [r, h * 0.92],
      [r, h],
      [r * 0.86, h],
      [r * 0.84, h * 0.94],
      [0, h * 0.94],
    ],
    0,
    0,
    0,
    { seg: 22 },
  );
  if (soil) b.cyl(C.woodDark, r * 0.84, 0.01, 0, h * 0.93, 0, { seg: 18 });
}

export const plant: ModelFn = ({ b, color, accent, variant }) => {
  const potC = color ?? C.cream;
  if (variant === 2) {
    // espada-de-são-jorge
    pot(b, potC, 0.2, 0.34);
    b.torus(accent ?? C.navy, 0.2, 0.012, 0, 0.26, 0, { rx: Math.PI / 2, seg: 24, tseg: 5 });
    const r = rng(3);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const h = 0.55 + r() * 0.4;
      const tilt = 0.08 + r() * 0.18;
      b.at(Math.cos(a) * 0.07, 0.3, Math.sin(a) * 0.07, { ry: -a + Math.PI / 2, rx: tilt }, () => {
        b.cyl(i % 2 ? C.leaf : T.leafDark, 0.055, h, 0, h / 2, 0, { rt: 0.004, seg: 6 });
      });
    }
    return;
  }
  pot(b, potC, 0.22, 0.42);
  b.torus(accent ?? mix(potC, C.woodDark, 0.25), 0.225, 0.012, 0, 0.34, 0, { rx: Math.PI / 2, seg: 24, tseg: 5 });
  if (variant === 1) {
    // ficus de folhas grandes num tronco
    b.cyl(C.woodDark, 0.025, 0.7, 0, 0.75, 0, { rt: 0.018, seg: 8 });
    const r = rng(9);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const y = 0.62 + (i / 14) * 0.6;
      const len = 0.24 + r() * 0.06;
      b.at(0, y, 0, { ry: a, rx: 0.55 + r() * 0.35 }, () => {
        b.front(i % 3 ? C.leaf : C.leafLight, leafShape(len, len * 0.65), 0.014, 0, 0, 0);
      });
    }
    return;
  }
  // arbusto arredondado
  const r = rng(4);
  b.sph(T.leafDark, 0.27, 0, 0.72, 0, { sy: 0.85, seg: 16 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.sph(i % 2 ? C.leaf : C.leafLight, 0.17 + r() * 0.04, Math.cos(a) * 0.17, 0.72 + r() * 0.22, Math.sin(a) * 0.17, { seg: 14 });
  }
  b.sph(C.leafLight, 0.18, 0.02, 1.08, 0.0, { seg: 14 });
  b.sph(C.leaf, 0.14, -0.1, 0.98, 0.1, { seg: 12 });
};

export const plantTall: ModelFn = ({ b, color, variant }) => {
  const potC = color ?? C.graphite;
  pot(b, potC, 0.25, 0.55);
  b.box(C.woodLight, 0.4, 0.06, 0.4, 0, 0.03, 0, { r: 0.02 });
  if (variant === 1) {
    // palmeira (areca): folhas compridas em arco
    const r = rng(21);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4;
      const h0 = 0.55 + r() * 0.5;
      b.cyl(C.leaf, 0.014, h0, Math.cos(a) * 0.04, 0.52 + h0 / 2, Math.sin(a) * 0.04, { seg: 6 });
      b.push(Math.cos(a) * 0.04, 0.52 + h0, Math.sin(a) * 0.04, { ry: -a + Math.PI / 2, rx: 0.25 });
      for (let k = 0; k < 4; k++) {
        b.front(k % 2 ? C.leafLight : C.leaf, frond(0.32, 0.2), 0.012, 0, 0, 0);
        b.push(0, 0.3, 0, { rx: 0.32 });
      }
      for (let k = 0; k < 4; k++) b.pop();
      b.pop();
    }
    return;
  }
  // costela-de-adão
  const r = rng(13);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996;
    const h = 0.7 + (i / 9) * 0.85 + r() * 0.1;
    const out = 0.12 + r() * 0.1;
    const bx = Math.cos(a) * out;
    const bz = Math.sin(a) * out;
    b.rod(C.leaf, 0.014, 0, 0.5, 0, bx, h, bz, { seg: 6 });
    const len = 0.4 + r() * 0.1;
    b.at(bx, h, bz, { ry: -a + Math.PI / 2, rx: 1.15 + r() * 0.3 }, () => {
      b.front(i % 2 ? C.leaf : T.leafDark, leafShape(len, len * 0.95, 3), 0.016, 0, 0, 0);
    });
  }
};

/** Folha de palmeira: pena com recortes em zigue-zague. */
function frond(len: number, wid: number): THREE.Shape {
  const pts: [number, number][] = [[0, 0]];
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    pts.push([wid * 0.5 * Math.sin(Math.PI * t), len * (t - 0.06)]);
    pts.push([wid * 0.12, len * t]);
  }
  pts.push([0, len]);
  for (let i = n; i >= 1; i--) {
    const t = i / (n + 1);
    pts.push([-wid * 0.12, len * t]);
    pts.push([-wid * 0.5 * Math.sin(Math.PI * t), len * (t - 0.06)]);
  }
  return poly(pts);
}

export const plantSmall: ModelFn = ({ b, color, variant }) => {
  const potC = color ?? (variant === 1 ? terracotta : C.offwhite);
  pot(b, potC, 0.12, 0.18);
  if (variant === 1) {
    // cacto com flor
    b.cyl(C.green, 0.055, 0.18, 0, 0.26, 0, { seg: 12 });
    b.sph(C.green, 0.055, 0, 0.35, 0, { seg: 12 });
    b.cyl(C.green, 0.03, 0.08, 0.075, 0.27, 0, { seg: 10 });
    b.sph(C.green, 0.03, 0.075, 0.31, 0, { seg: 8 });
    b.cyl(C.green, 0.03, 0.06, 0.04, 0.24, 0, { rz: Math.PI / 2, seg: 8 });
    b.sph(C.pink, 0.028, 0, 0.41, 0, { sy: 0.7, seg: 10 });
    return;
  }
  if (variant === 2) {
    // jiboia caindo pelas bordas
    b.sph(C.leaf, 0.1, 0, 0.21, 0, { sy: 0.6, seg: 12 });
    const r = rng(8);
    for (let v = 0; v < 4; v++) {
      const a = (v / 4) * Math.PI * 2 + 0.4;
      for (let k = 0; k < 4; k++) {
        const out = 0.1 + k * 0.03;
        b.sph(k % 2 ? C.leafLight : C.leaf, 0.035, Math.cos(a) * out, 0.2 - k * 0.045, Math.sin(a) * out, { sx: 1.2, sy: 0.6, seg: 8, ry: r() * 3 });
      }
    }
    b.sph(C.leafLight, 0.06, 0.03, 0.27, 0.02, { sy: 0.7, seg: 10 });
    return;
  }
  // suculenta em roseta
  for (let ring = 0; ring < 3; ring++) {
    const n = [9, 7, 4][ring] as number;
    const tilt = [1.15, 0.75, 0.35][ring] as number;
    const len = [0.1, 0.085, 0.06][ring] as number;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      b.at(0, 0.18, 0, { ry: -a + Math.PI / 2, rx: tilt }, () => {
        b.sph(ring === 2 ? C.leafLight : ring === 1 ? mix(C.leafLight, C.sky, 0.25) : C.leaf, len * 0.5, 0, len * 0.5, 0, { sx: 0.7, sz: 0.35, seg: 8 });
      });
    }
  }
};

export const bookshelf: ModelFn = ({ b, color, variant }) => {
  const W = 2.0;
  const D = 0.4;
  const H = 2.0;
  const frame = color ?? (variant === 1 ? C.offwhite : C.woodLight);
  const back = variant === 1 ? T.navySoft : C.navy;
  const books = [C.navy, C.signal, C.cream, C.sky, C.slate, C.green, C.gold, C.offwhite, C.woodDark, T.navySoft, C.orange];
  const t = 0.04;
  b.box(back, W - 0.04, H - 0.06, 0.02, 0, H / 2, -D / 2 + 0.02, { r: 0 });
  for (const s of [-1, 1]) b.box(frame, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.012 });
  b.box(frame, W, t, D, 0, H - t / 2, 0, { r: 0.012 });
  b.box(mix(frame, C.ink, 0.3), W - 0.04, 0.08, D - 0.04, 0, 0.04, 0, { r: 0.01 });
  const r = rng(31 + variant * 7);
  if (variant === 1) {
    // nichos 4x4 com cestos, livros e objetos
    const cols = 4;
    const rows = 4;
    const cw = (W - t) / cols;
    const rh = (H - 0.08 - t) / rows;
    for (let i = 1; i < cols; i++) b.box(frame, t * 0.75, H - 0.1, D - 0.02, -W / 2 + t / 2 + cw * i, H / 2 + 0.02, 0, { r: 0.008 });
    for (let j = 1; j < rows; j++) b.box(frame, W - 0.06, t * 0.75, D - 0.02, 0, 0.08 + rh * j, 0, { r: 0.008 });
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const cx = -W / 2 + t / 2 + cw * (i + 0.5);
        const y = 0.08 + rh * j + t * 0.4;
        const k = (i * 7 + j * 3) % 5;
        if (k === 0) b.box(C.woodLight, cw - 0.08, rh * 0.62, D - 0.1, cx, y + rh * 0.31, 0.02, { r: 0.03 });
        else if (k === 1) tinyPlant(b, cx, y, 0, C.offwhite, 1.1);
        else if (k === 2) {
          b.sph(C.sky, 0.09, cx, y + 0.14, 0, { seg: 14 });
          b.cyl(C.woodDark, 0.05, 0.04, cx, y + 0.02, 0, { seg: 10 });
          b.torus(C.gold, 0.1, 0.008, cx, y + 0.14, 0, { ry: 0.4, rz: 0.4, seg: 20, tseg: 4 });
        } else bookRow(b, cx - cw / 2 + 0.05, y, 0.02, cw - 0.1, rh * 0.75, 40 + i * 5 + j, books);
      }
    return;
  }
  // centro dividido e 5 prateleiras
  b.box(frame, t * 0.8, H - 0.1, D - 0.02, 0, H / 2 + 0.02, 0, { r: 0.008 });
  const rows = 5;
  const rh = (H - 0.08 - t) / rows;
  for (let j = 1; j < rows; j++) b.box(frame, W - 0.06, t * 0.8, D - 0.02, 0, 0.08 + rh * j, 0, { r: 0.008 });
  const bay = (W - t * 3) / 2;
  for (let j = 0; j < rows; j++)
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -W / 2 + t + 0.02 : t / 2 + 0.03;
      const y = 0.08 + rh * j + t * 0.4;
      const roll = r();
      if (roll < 0.22) {
        // livros deitados + objeto
        for (let k = 0; k < 3; k++) b.box(pick(r, books), 0.26, 0.05, 0.22, x0 + 0.17, y + 0.025 + k * 0.05, 0.02, { r: 0.008, ry: (r() - 0.5) * 0.2 });
        if (r() < 0.5) tinyPlant(b, x0 + bay - 0.2, y, 0, C.cream, 1.2);
        else trophy(b, x0 + bay - 0.2, y, 0, 1.3);
        bookRow(b, x0 + 0.38, y, 0.02, bay - 0.7, rh * 0.75, j * 10 + side + 50, books);
      } else if (roll < 0.36) {
        b.lathe(pick(r, [C.offwhite, C.sky, C.cream]), [[0, 0], [0.06, 0], [0.09, 0.08], [0.05, 0.2], [0.06, 0.24], [0, 0.23]], x0 + 0.15, y, 0, { seg: 14 });
        b.box(C.woodDark, 0.18, 0.22, 0.03, x0 + 0.38, y + 0.11, -0.02, { r: 0.008, rx: -0.15 });
        b.box(C.sky, 0.13, 0.16, 0.01, x0 + 0.38, y + 0.115, -0.003, { r: 0, rx: -0.15 });
        bookRow(b, x0 + 0.52, y, 0.02, bay - 0.56, rh * 0.75, j * 10 + side + 70, books);
      } else bookRow(b, x0, y, 0.02, bay - 0.02, rh * 0.78, j * 10 + side + 90, books);
    }
};

export const lampFloor: ModelFn = ({ b, color }) => {
  const shade = lit(mix(color ?? C.cream, T.warm, 0.35));
  b.puck(C.graphite, 0.17, 0.04, 0, 0, 0, { bevel: 0.015, seg: 20 });
  b.cyl(T.steel, 0.024, 1.34, 0, 0.71, 0, { seg: 8 });
  b.cyl(C.graphite, 0.03, 0.05, 0, 0.9, 0, { seg: 10 });
  // cúpula oca (dá para ver a luz por dentro, de cima)
  b.lathe(
    shade,
    [
      [0.215, 1.32],
      [0.17, 1.66],
      [0.162, 1.66],
      [0.205, 1.32],
    ].map(([r, y]) => [r as number, (y as number) - 1.32] as [number, number]),
    0,
    1.32,
    0,
    { seg: 26 },
  );
  b.box(C.graphite, 0.3, 0.012, 0.012, 0, 1.6, 0, { r: 0 });
  b.cyl(lit(mix(T.warm, C.gold, 0.55)), 0.19, 0.006, 0, 1.4, 0, { seg: 22 });
  b.sph(lit("#FFF6E0"), 0.06, 0, 1.47, 0, { seg: 10 });
  b.torus(mix(color ?? C.cream, C.woodDark, 0.25), 0.21, 0.012, 0, 1.325, 0, { rx: Math.PI / 2, seg: 26, tseg: 4 });
  b.torus(mix(color ?? C.cream, C.woodDark, 0.25), 0.166, 0.01, 0, 1.655, 0, { rx: Math.PI / 2, seg: 26, tseg: 4 });
};

export const rug: ModelFn = ({ b, color, accent, variant }) => {
  const W = 3.0;
  const D = 2.0;
  const base = color ?? T.navySoft;
  const acc = accent ?? C.sky;
  const third = mix(base, C.offwhite, 0.55);
  b.plate(base, W, D, 0.012, 0, 0, 0, { r: 0.08, bevel: 0.004 });
  const y1 = 0.012;
  const th = 0.004;
  if (variant === 1) {
    // listras + franjas
    [-0.6, -0.2, 0.2, 0.6].forEach((z, i) => b.box(i % 2 ? acc : third, W - 0.2, th, i % 2 ? 0.16 : 0.08, 0, y1 + th / 2, z, { r: 0 }));
    for (const s of [-1, 1]) for (let i = 0; i < 18; i++) b.box(C.offwhite, 0.03, 0.006, 0.09, s * (W / 2 + 0.03), 0.004, -D / 2 + 0.14 + i * ((D - 0.28) / 17), { r: 0, ry: Math.PI / 2 });
    return;
  }
  if (variant === 2) {
    // círculos concêntricos
    b.slab(acc, ellipse(1.7, 1.7), th, 0, y1, 0, { curve: 40 });
    b.slab(base, ellipse(1.3, 1.3), th, 0, y1 + th, 0, { curve: 40 });
    b.slab(third, ellipse(0.8, 0.8), th, 0, y1 + th * 2, 0, { curve: 32 });
    b.slab(acc, ellipse(0.3, 0.3), th, 0, y1 + th * 3, 0, { curve: 24 });
    return;
  }
  // moldura + losango central
  b.plate(acc, W - 0.12, D - 0.12, th, 0, y1, 0, { r: 0.06, bevel: 0 });
  b.plate(base, W - 0.3, D - 0.3, th, 0, y1 + th, 0, { r: 0.05, bevel: 0 });
  b.slab(third, poly([[0, 0.6], [0.9, 0], [0, -0.6], [-0.9, 0]]), th, 0, y1 + th * 2, 0);
  b.slab(acc, poly([[0, 0.34], [0.5, 0], [0, -0.34], [-0.5, 0]]), th, 0, y1 + th * 3, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(third, 0.07, th, sx * 1.15, y1 + th * 2.5, sz * 0.62, { seg: 14 });
};

export const gong: ModelFn = ({ b, accent }) => {
  const wood = C.woodDark;
  for (const s of [-1, 1]) {
    const x = s * 0.44;
    b.box(wood, 0.08, 0.06, 0.48, x, 0.03, 0, { r: 0.02 });
    b.box(wood, 0.08, 1.66, 0.08, x, 0.86, 0, { r: 0.02 });
    b.sph(C.gold, 0.045, x, 1.75, 0, { seg: 12 });
  }
  b.box(wood, 1.0, 0.09, 0.1, 0, 1.66, 0, { r: 0.025 });
  for (const s of [-1, 1]) b.box(wood, 0.12, 0.05, 0.1, s * 0.52, 1.7, 0, { r: 0.02, rz: s * 0.4 });
  b.box(wood, 0.84, 0.06, 0.06, 0, 0.24, 0, { r: 0.02 });
  // gongo dourado com cordas
  const cy = 1.0;
  b.rod(C.red, 0.016, -0.18, 1.62, 0, -0.12, cy + 0.33, 0, { seg: 6 });
  b.rod(C.red, 0.016, 0.18, 1.62, 0, 0.12, cy + 0.33, 0, { seg: 6 });
  b.lathe(
    C.gold,
    [
      [0, 0.03],
      [0.08, 0.035],
      [0.1, 0.02],
      [0.3, 0.012],
      [0.35, 0.03],
      [0.36, 0.0],
      [0.34, -0.015],
      [0, -0.01],
    ],
    0,
    cy,
    0,
    { rx: Math.PI / 2, seg: 32 },
  );
  b.sph(mix(C.gold, C.offwhite, 0.35), 0.075, 0, cy, 0.03, { sz: 0.45, seg: 14 });
  b.torus(mix(C.gold, C.woodDark, 0.3), 0.22, 0.01, 0, cy, 0.02, { seg: 32, tseg: 4 });
  // baqueta encostada
  b.rod(C.woodLight, 0.014, 0.36, 0.06, 0.18, 0.4, 0.62, 0.08, { seg: 6 });
  b.sph(accent ?? C.orange, 0.06, 0.4, 0.66, 0.075, { seg: 12 });
};

export const lectern: ModelFn = ({ b, color, accent }) => {
  const body = color ?? C.navy;
  b.box(C.graphite, 0.7, 0.05, 0.5, 0, 0.025, 0, { r: 0.02 });
  b.side(
    body,
    poly([
      [-0.17, 0.05],
      [0.17, 0.05],
      [0.22, 1.04],
      [0.24, 1.1],
      [-0.23, 1.0],
      [-0.2, 0.97],
    ]),
    0.6,
    0,
    0,
    0,
    { bevel: 0.012 },
  );
  // painel frontal de madeira com filete de luz
  const slope = Math.atan2(0.05, 0.99);
  b.box(C.woodLight, 0.5, 0.7, 0.02, 0, 0.5, 0.215, { rx: slope, r: 0.012 });
  b.box(lit(accent ?? C.signal), 0.6, 0.025, 0.012, 0, 0.92, 0.234, { rx: slope, r: 0 });
  // tampo inclinado de leitura com papéis
  const tilt = Math.atan2(0.1, 0.47);
  b.box(C.woodLight, 0.66, 0.035, 0.5, 0, 1.06, 0.0, { rx: tilt, r: 0.012 });
  b.box(C.offwhite, 0.2, 0.006, 0.28, -0.08, 1.083, -0.02, { rx: tilt, ry: 0.1, r: 0 });
  b.box(C.cream, 0.2, 0.006, 0.28, -0.06, 1.088, -0.02, { rx: tilt, ry: -0.05, r: 0 });
  // microfone em pescoço de ganso
  b.cyl(C.graphite, 0.03, 0.03, 0.2, 1.11, 0.16, { seg: 10 });
  b.rod(C.graphite, 0.016, 0.2, 1.12, 0.16, 0.18, 1.3, 0.1, { seg: 6 });
  b.rod(C.graphite, 0.016, 0.18, 1.3, 0.1, 0.12, 1.38, -0.02, { seg: 6 });
  b.sph(C.ink, 0.035, 0.11, 1.39, -0.05, { sz: 1.4, seg: 10 });
  b.sph(lit(C.red), 0.012, 0.16, 1.32, 0.09, { seg: 6 });
};
