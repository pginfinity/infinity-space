import { C, T, lit, mix, poly, type ModelFn } from "./core.ts";
import { bottle, deskLamp, keyboard, laptop, monitor, mouse, mug, papers, pencilCup, tinyPlant, trophy, book } from "./kit.ts";

/** Mesas de trabalho. Frente (+Z) = lado de quem senta. */

export const desk: ModelFn = ({ b, color, accent, variant }) => {
  const W = 1.4;
  const D = 0.7;
  const H = 0.75;
  const top = color ?? (variant === 1 ? C.woodLight : C.cream);
  const frame = variant === 2 ? C.wood : C.navy;
  b.plate(top, W, D, 0.06, 0, H - 0.06, 0, { r: 0.06 });
  if (variant === 1) {
    // pernas de tubo + gaveteiro
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.graphite, 0.026, H - 0.06, sx * (W / 2 - 0.08), (H - 0.06) / 2, sz * (D / 2 - 0.08), { seg: 10 });
    b.box(T.navySoft, 0.4, 0.58, 0.56, W / 2 - 0.3, 0.32, -0.02, { r: 0.03 });
    for (let i = 0; i < 3; i++) {
      b.box(mix(T.navySoft, C.offwhite, 0.12), 0.36, 0.16, 0.02, W / 2 - 0.3, 0.13 + i * 0.185, 0.265, { r: 0.012 });
      b.box(C.offwhite, 0.12, 0.025, 0.025, W / 2 - 0.3, 0.17 + i * 0.185, 0.28, { r: 0.01 });
    }
  } else {
    // pernas de painel arredondadas + painel de fundo
    for (const sx of [-1, 1]) b.box(frame, 0.07, H - 0.06, D - 0.12, sx * (W / 2 - 0.1), (H - 0.06) / 2, 0, { r: 0.03 });
    b.box(mix(frame, C.slate, 0.15), W - 0.26, 0.34, 0.03, 0, H - 0.28, -D / 2 + 0.1, { r: 0.012 });
  }
  monitor(b, 0, H, -0.18);
  keyboard(b, -0.05, H, 0.13);
  mouse(b, 0.32, H, 0.14);
  if (variant === 2) {
    tinyPlant(b, -0.52, H, -0.17, C.offwhite);
    book(b, 0.5, H, -0.12, C.signal, { ry: 0.2 });
    book(b, 0.5, H + 0.035, -0.12, C.cream, { ry: 0.05, h: 0.03 });
  } else {
    mug(b, -0.5, H, 0.08, accent ?? C.orange, 0.6);
    papers(b, 0.5, H, -0.12, 2, 3);
  }
  // post-it no canto do monitor
  b.box(C.gold, 0.07, 0.07, 0.008, 0.26, H + 0.52, -0.155, { rz: 0.15, r: 0 });
};

export const deskDual: ModelFn = ({ b, color, accent }) => {
  const W = 1.6;
  const D = 0.75;
  const H = 0.75;
  b.plate(color ?? C.woodLight, W, D, 0.06, 0, H - 0.06, 0, { r: 0.05 });
  for (const sx of [-1, 1]) {
    b.box(C.graphite, 0.08, H - 0.1, 0.08, sx * (W / 2 - 0.14), (H - 0.1) / 2 + 0.03, 0, { r: 0.02 });
    b.box(C.graphite, 0.1, 0.05, D - 0.1, sx * (W / 2 - 0.14), 0.025, 0, { r: 0.022 });
  }
  b.box(C.graphite, W - 0.32, 0.07, 0.06, 0, H - 0.1, -0.1, { r: 0.02 });
  // dois monitores levemente voltados para dentro
  monitor(b, -0.31, H, -0.2, { ry: 0.22, w: 0.6 });
  monitor(b, 0.31, H, -0.2, { ry: -0.22, w: 0.6 });
  keyboard(b, -0.02, H, 0.15, { mech: true, w: 0.46 });
  mouse(b, 0.36, H, 0.16, C.navy);
  deskLamp(b, -0.68, H, -0.22, { ry: 0.6 });
  tinyPlant(b, 0.66, H, -0.2, accent ?? C.offwhite);
  mug(b, 0.62, H, 0.1, C.offwhite, -0.4);
};

export const standingDesk: ModelFn = ({ b, color }) => {
  const W = 1.4;
  const D = 0.7;
  const H = 1.05;
  b.plate(color ?? C.woodLight, W, D, 0.05, 0, H - 0.05, 0, { r: 0.05 });
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.16);
    b.box(C.metal, 0.06, 0.62, 0.06, x, 0.33, 0, { r: 0.012 });
    b.box(T.steel, 0.05, 0.4, 0.05, x, 0.8, 0, { r: 0.012 });
    b.box(C.metal, 0.08, 0.05, D - 0.06, x, 0.025, 0, { r: 0.02 });
  }
  b.box(C.metal, W - 0.4, 0.05, 0.05, 0, H - 0.09, 0, { r: 0.015 });
  laptop(b, 0, H, -0.04, { ry: 0 });
  bottle(b, -0.52, H, -0.15, C.signal);
  // painel de altura com LED
  b.box(C.graphite, 0.14, 0.03, 0.06, W / 2 - 0.16, H - 0.065, D / 2 - 0.01, { r: 0.01 });
  b.box(lit(C.signal), 0.03, 0.012, 0.012, W / 2 - 0.19, H - 0.06, D / 2 + 0.02, { r: 0 });
  mug(b, 0.42, H, -0.1, C.orange, -0.5);
};

export const execDesk: ModelFn = ({ b, color }) => {
  const W = 1.9;
  const D = 0.9;
  const H = 0.76;
  const wood = color ?? C.woodDark;
  const wood2 = mix(wood, C.wood, 0.35);
  b.plate(wood, W, D, 0.07, 0, H - 0.07, 0, { r: 0.05 });
  // couro sobre o tampo
  b.plate(C.leather, 0.9, 0.48, 0.008, 0, H, 0.08, { r: 0.04, bevel: 0.003 });
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.27);
    b.box(wood, 0.48, H - 0.07, D - 0.1, x, (H - 0.07) / 2, -0.02, { r: 0.025 });
    for (let i = 0; i < 3; i++) {
      b.box(wood2, 0.42, 0.18, 0.02, x, 0.13 + i * 0.205, D / 2 - 0.06, { r: 0.012 });
      b.box(C.gold, 0.13, 0.025, 0.025, x, 0.17 + i * 0.205, D / 2 - 0.045, { r: 0.01 });
    }
  }
  // painel frontal (lado das visitas) com filete dourado
  b.box(wood2, W - 0.1, 0.52, 0.04, 0, 0.42, -D / 2 + 0.08, { r: 0.015 });
  b.box(C.gold, W - 0.2, 0.025, 0.012, 0, 0.5, -D / 2 + 0.056, { r: 0 });
  laptop(b, 0.02, H + 0.008, 0.02, { color: C.graphite });
  pencilCup(b, -0.62, H, -0.2);
  trophy(b, 0.66, H, -0.22, 1.3);
  book(b, -0.6, H, 0.16, C.navy, { ry: -0.3 });
  b.cyl(C.offwhite, 0.035, 0.09, 0.55, H + 0.045, 0.14, { seg: 12 });
  b.cyl(C.woodDark, 0.03, 0.01, 0.55, H + 0.088, 0.14, { seg: 12 });
};

export const curvedDesk: ModelFn = ({ b, color, accent }) => {
  const H = 0.76;
  const zc = 1.15;
  const Ro = 1.7;
  const Ri = 1.0;
  const th = 0.87;
  const sector = (r0: number, r1: number, a0 = -th, a1 = th, n = 28) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([r1 * Math.sin(a), -(zc - r1 * Math.cos(a))]);
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([r0 * Math.sin(a), -(zc - r0 * Math.cos(a))]);
    }
    return poly(pts);
  };
  const top = color ?? T.navyMid;
  b.slab(top, sector(Ri, Ro), 0.06, 0, H - 0.06, 0, { bevel: 0.014 });
  // faixa de luz azul na borda interna do tampo
  b.slab(lit(accent ?? C.signal), sector(Ri + 0.05, Ri + 0.08, -th + 0.04, th - 0.04), 0.008, 0, H + 0.001, 0);
  b.slab(lit(accent ?? C.signal), sector(Ri - 0.012, Ri + 0.01, -th + 0.02, th - 0.02), 0.02, 0, H - 0.1, 0);
  // painel curvo de base e pés
  b.slab(C.navy, sector(Ro - 0.14, Ro - 0.08), H - 0.1, 0, 0, 0, { bevel: 0.01 });
  for (const s of [-1, 1]) {
    const a = s * (th - 0.06);
    const rm = (Ri + Ro) / 2;
    b.box(C.navy, 0.08, H - 0.06, Ro - Ri - 0.12, rm * Math.sin(a), (H - 0.06) / 2, zc - rm * Math.cos(a), { ry: -a, r: 0.025 });
  }
  // três telas em arco
  const rm = Ro - 0.24;
  for (const a of [-0.44, 0, 0.44]) {
    monitor(b, rm * Math.sin(a), H, zc - rm * Math.cos(a), { ry: -a, w: 0.7, h: 0.42 });
  }
  const rk = Ri + 0.2;
  keyboard(b, 0, H, zc - rk, { w: 0.44 });
  mouse(b, 0.33, H, zc - rk - 0.01);
  // painel de controle com botões
  b.at(rk * Math.sin(-0.5), H, zc - rk * Math.cos(-0.5), { ry: 0.5 }, () => {
    b.box(C.graphite, 0.32, 0.04, 0.18, 0, 0.02, 0, { r: 0.012, rx: -0.12 });
    [C.signal, C.green, C.orange].forEach((col, i) => b.cyl(lit(col), 0.022, 0.02, -0.09 + i * 0.09, 0.05, 0, { seg: 10 }));
  });
  mug(b, rk * Math.sin(0.55), H, zc - rk * Math.cos(0.55), C.offwhite);
};

export const workshopTable: ModelFn = ({ b, color, accent }) => {
  const W = 2.4;
  const D = 1.2;
  const H = 0.9;
  const top = color ?? C.woodLight;
  b.plate(top, W, D, 0.07, 0, H - 0.07, 0, { r: 0.04 });
  b.box(mix(top, C.wood, 0.5), W - 0.12, 0.08, D - 0.12, 0, H - 0.11, 0, { r: 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.wood, 0.1, H - 0.1, 0.1, sx * (W / 2 - 0.12), (H - 0.1) / 2, sz * (D / 2 - 0.12), { r: 0.025 });
  // prateleira de baixo com rolos de papel e caixas
  b.plate(mix(top, C.wood, 0.25), W - 0.2, D - 0.2, 0.04, 0, 0.16, 0, { r: 0.02 });
  for (let i = 0; i < 3; i++) b.cyl(i === 1 ? C.cream : C.offwhite, 0.05, 0.9, -0.5, 0.25, -0.28 + i * 0.11, { rz: Math.PI / 2, seg: 12 });
  b.box(C.navy, 0.42, 0.26, 0.36, 0.55, 0.33, 0.1, { r: 0.03 });
  b.box(accent ?? C.orange, 0.3, 0.16, 0.22, 0.6, 0.54, 0.12, { r: 0.03 });
  // tampo: tapete de corte, papéis, mesa digitalizadora, protótipos
  b.plate(mix(C.leaf, C.graphite, 0.35), 0.9, 0.6, 0.01, -0.5, H, 0.1, { r: 0.03, bevel: 0.003 });
  papers(b, -0.62, H + 0.01, 0.05, 3, 7);
  b.box(C.offwhite, 0.3, 0.006, 0.22, -0.3, H + 0.013, 0.18, { ry: 0.3, r: 0 });
  b.box(C.signal, 0.16, 0.004, 0.03, -0.3, H + 0.018, 0.16, { ry: 0.3, r: 0 });
  b.box(C.orange, 0.03, 0.004, 0.1, -0.24, H + 0.018, 0.2, { ry: 0.3, r: 0 });
  // tablet de desenho + caneta
  b.box(C.graphite, 0.44, 0.02, 0.3, 0.38, H + 0.01, 0.22, { ry: -0.1, r: 0.015 });
  b.box(lit(T.screen), 0.36, 0.006, 0.22, 0.38, H + 0.021, 0.22, { ry: -0.1, r: 0 });
  b.box(lit(C.sky), 0.18, 0.004, 0.03, 0.36, H + 0.025, 0.2, { ry: -0.1, r: 0 });
  b.cyl(C.offwhite, 0.012, 0.18, 0.66, H + 0.014, 0.24, { rz: Math.PI / 2, ry: 0.4, seg: 8 });
  // protótipos
  b.box(accent ?? C.orange, 0.12, 0.12, 0.12, 0.1, H + 0.06, -0.32, { ry: 0.4, r: 0.02 });
  b.cyl(C.signal, 0.06, 0.16, 0.3, H + 0.08, -0.36, { seg: 14 });
  b.sph(C.offwhite, 0.07, 0.48, H + 0.07, -0.3);
  b.box(C.navy, 0.1, 0.18, 0.02, -0.1, H + 0.09, -0.36, { r: 0.015, rx: -0.15 });
  deskLamp(b, -1.0, H, -0.38, { ry: 0.4, color: C.navy });
  mug(b, 0.95, H, -0.3, C.offwhite);
  trophy(b, 0.75, H, -0.4, 0.8);
};
