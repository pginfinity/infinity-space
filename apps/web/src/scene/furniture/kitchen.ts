import { C, T, clear, lit, mix, type ModelFn } from "./core.ts";
import { keyboard, monitor, mug, tinyPlant } from "./kit.ts";

/** Copa e recepção. */

export const counter: ModelFn = ({ b, color, accent }) => {
  const W = 3.0;
  const D = 0.75;
  const H = 1.05;
  const body = color ?? C.navy;
  const light = accent ?? C.signal;
  // painel alto da frente (lado das visitas) com faixa de luz
  b.box(body, W, H - 0.05, 0.2, 0, (H - 0.05) / 2, D / 2 - 0.1, { r: 0.04 });
  b.plate(C.offwhite, W + 0.06, 0.3, 0.05, 0, H - 0.05, D / 2 - 0.12, { r: 0.04 });
  b.box(lit(light), W - 0.1, 0.035, 0.012, 0, 0.18, D / 2 + 0.002, { r: 0 });
  b.box(lit(mix(light, C.navyDeep, 0.3)), W - 0.1, 0.015, 0.012, 0, 0.24, D / 2 + 0.002, { r: 0 });
  b.box(mix(body, C.ink, 0.35), W - 0.04, 0.06, 0.18, 0, 0.03, D / 2 - 0.1, { r: 0.02 });
  // bancada baixa de trabalho atrás
  b.box(T.navyLift, W - 0.1, 0.7, 0.42, 0, 0.35, -0.12, { r: 0.03 });
  b.plate(C.woodLight, W - 0.06, 0.5, 0.04, 0, 0.7, -0.1, { r: 0.03 });
  for (const s of [-1, 1]) b.box(body, 0.06, H - 0.06, D, s * (W / 2 - 0.03), (H - 0.06) / 2, 0, { r: 0.03 });
  monitor(b, -0.5, 0.74, -0.18, { ry: Math.PI, w: 0.5, h: 0.3 });
  keyboard(b, -0.5, 0.74, -0.04, { ry: Math.PI, w: 0.4 });
  tinyPlant(b, 0.9, H, D / 2 - 0.12, C.offwhite, 1.1);
  // campainha de balcão
  b.cyl(C.graphite, 0.05, 0.015, 0.35, H + 0.008, D / 2 - 0.12, { seg: 14 });
  b.sph(C.gold, 0.04, 0.35, H + 0.016, D / 2 - 0.12, { sy: 0.8, seg: 12 });
  b.cyl(C.gold, 0.008, 0.02, 0.35, H + 0.06, D / 2 - 0.12, { seg: 6 });
  mug(b, 0.1, 0.74, -0.15, C.orange);
};

export const kitchenCounter: ModelFn = ({ b, color, accent }) => {
  const W = 3.0;
  const D = 0.65;
  const H = 0.92;
  const door = color ?? C.offwhite;
  b.box(C.ink, W - 0.04, 0.1, D - 0.08, 0, 0.05, -0.03, { r: 0.01 });
  b.box(mix(door, C.slate, 0.25), W, H - 0.15, D - 0.04, 0, 0.1 + (H - 0.15) / 2, -0.02, { r: 0.015 });
  const n = 5;
  const dw = W / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + dw * (i + 0.5);
    if (i === 1) {
      for (let k = 0; k < 3; k++) {
        b.box(door, dw - 0.03, 0.22, 0.03, x, 0.22 + k * 0.24, D / 2 - 0.03, { r: 0.012 });
        b.box(T.steel, 0.2, 0.025, 0.03, x, 0.29 + k * 0.24, D / 2 - 0.005, { r: 0.01 });
      }
      continue;
    }
    b.box(door, dw - 0.03, H - 0.2, 0.03, x, 0.1 + (H - 0.18) / 2, D / 2 - 0.03, { r: 0.012 });
    b.box(T.steel, 0.025, 0.2, 0.03, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), H - 0.24, D / 2 - 0.005, { r: 0.01 });
  }
  b.plate(C.woodLight, W + 0.04, D + 0.02, 0.05, 0, H - 0.05, 0, { r: 0.03 });
  // pia e torneira
  const sx = 0.62;
  b.box(T.steel, 0.62, 0.012, 0.42, sx, H + 0.002, 0.0, { r: 0.006 });
  b.box(T.steelDark, 0.52, 0.01, 0.32, sx, H + 0.008, 0.01, { r: 0.004 });
  b.cyl(T.steel, 0.022, 0.26, sx, H + 0.13, -0.24, { seg: 10 });
  b.torus(T.steel, 0.08, 0.018, sx, H + 0.26, -0.16, { arc: Math.PI, ry: Math.PI / 2, seg: 12, tseg: 6 });
  b.box(T.steel, 0.03, 0.03, 0.08, sx + 0.07, H + 0.1, -0.24, { r: 0.01 });
  // tábua de corte, fruteira, chaleira, utensílios
  b.box(C.wood, 0.4, 0.03, 0.26, -0.3, H + 0.015, 0.04, { r: 0.012, ry: 0.15 });
  b.sph(C.green, 0.04, -0.36, H + 0.07, 0.04, { seg: 10 });
  b.box(C.offwhite, 0.08, 0.04, 0.03, -0.2, H + 0.05, 0.08, { r: 0.01, ry: 0.4 });
  b.lathe(C.offwhite, [[0, 0], [0.08, 0], [0.16, 0.07], [0.15, 0.075], [0, 0.02]], -1.0, H, 0.02, { seg: 18 });
  [
    [-1.04, 0.0, accent ?? C.orange],
    [-0.96, 0.05, C.orange],
    [-0.99, -0.04, C.red],
    [-0.94, -0.03, C.gold],
  ].forEach(([x, z, c]) => b.sph(c as string, 0.045, x as number, H + 0.07, z as number, { seg: 10 }));
  b.lathe(C.navy, [[0, 0], [0.09, 0], [0.1, 0.12], [0.08, 0.18], [0.03, 0.2], [0, 0.2]], 0.1, H, -0.12, { seg: 16 });
  b.box(C.graphite, 0.05, 0.03, 0.06, 0.2, H + 0.14, -0.12, { r: 0.01 });
  b.cyl(C.ink, 0.02, 0.04, 0.1, H + 0.22, -0.12, { seg: 8 });
  b.cyl(C.woodDark, 0.05, 0.16, -1.3, H + 0.08, -0.15, { seg: 12 });
  for (let i = 0; i < 3; i++) b.cyl(C.woodLight, 0.01, 0.2, -1.3 + (i - 1) * 0.02, H + 0.22, -0.15 + (i % 2) * 0.02, { rz: (i - 1) * 0.2, seg: 6 });
  b.sph(C.woodLight, 0.025, -1.32, H + 0.33, -0.15, { sy: 0.5, seg: 8 });
};

export const coffeeMachine: ModelFn = ({ b, color, accent }) => {
  const H = 1.2;
  const cab = color ?? C.navy;
  // móvel
  b.box(cab, 0.6, 0.8, 0.5, 0, 0.4, 0, { r: 0.025 });
  for (const s of [-1, 1]) {
    b.box(mix(cab, C.offwhite, 0.08), 0.28, 0.68, 0.02, s * 0.145, 0.4, 0.25, { r: 0.012 });
    b.box(T.steel, 0.025, 0.14, 0.025, s * 0.03, 0.55, 0.265, { r: 0.01 });
  }
  b.plate(C.woodLight, 0.62, 0.52, 0.04, 0, 0.8, 0, { r: 0.03 });
  // espresso
  const y = 0.84;
  b.box(T.steel, 0.5, 0.3, 0.38, 0, y + 0.18, -0.04, { r: 0.04 });
  b.box(C.graphite, 0.5, 0.06, 0.38, 0, y + 0.03, -0.04, { r: 0.02 });
  b.box(C.graphite, 0.4, 0.03, 0.14, 0, y + 0.075, 0.18, { r: 0.012 });
  b.box(C.graphite, 0.5, 0.025, 0.36, 0, y + 0.345, -0.04, { r: 0.01 });
  b.cyl(C.offwhite, 0.035, 0.05, -0.1, y + 0.385, -0.05, { rt: 0.045, seg: 10 });
  b.cyl(C.offwhite, 0.035, 0.05, 0.0, y + 0.385, -0.05, { rt: 0.045, seg: 10 });
  b.cyl(C.offwhite, 0.035, 0.05, 0.1, y + 0.385, -0.05, { rt: 0.045, seg: 10 });
  // grupo, porta-filtro, bico de vapor, manômetro, display
  b.cyl(T.steelDark, 0.045, 0.06, -0.06, y + 0.2, 0.16, { seg: 12 });
  b.cyl(C.ink, 0.04, 0.03, -0.06, y + 0.16, 0.17, { seg: 12 });
  b.box(C.ink, 0.03, 0.03, 0.16, -0.06, y + 0.16, 0.28, { r: 0.012 });
  b.rod(T.steel, 0.01, 0.17, y + 0.22, 0.15, 0.2, y + 0.1, 0.2, { seg: 6 });
  b.cyl(C.offwhite, 0.045, 0.012, 0.13, y + 0.26, 0.15, { rx: Math.PI / 2, seg: 14 });
  b.box(C.red, 0.006, 0.03, 0.004, 0.14, y + 0.27, 0.158, { r: 0, rz: -0.6 });
  b.box(lit(C.signal), 0.12, 0.04, 0.006, -0.06, y + 0.29, 0.15, { r: 0 });
  // xícara na bandeja
  mug(b, -0.06, y + 0.09, 0.19, accent ?? C.orange, 0.9);
};

export const fridge: ModelFn = ({ b, color }) => {
  const W = 0.75;
  const H = 1.9;
  const steel = color ?? T.steel;
  const door = mix(steel, C.offwhite, 0.25);
  b.box(steel, W, H - 0.04, 0.62, 0, (H - 0.04) / 2 + 0.04, -0.04, { r: 0.04 });
  b.box(C.graphite, W - 0.06, 0.06, 0.6, 0, 0.04, -0.02, { r: 0.015 });
  for (const s of [-1, 1]) {
    b.box(door, W / 2 - 0.012, H - 0.12, 0.06, s * (W / 4 + 0.003), H / 2 + 0.04, 0.29, { r: 0.03 });
    b.box(C.graphite, 0.03, 0.62, 0.04, s * 0.04, 1.15, 0.34, { r: 0.012 });
  }
  // dispenser de água/gelo
  b.box(C.graphite, 0.18, 0.28, 0.02, -0.19, 1.15, 0.325, { r: 0.02 });
  b.box(lit(C.signal), 0.08, 0.035, 0.006, -0.19, 1.24, 0.337, { r: 0 });
  b.box(C.ink, 0.12, 0.1, 0.012, -0.19, 1.08, 0.333, { r: 0.01 });
  // ímãs, foto e bilhete na porta direita
  b.box(C.offwhite, 0.12, 0.15, 0.008, 0.2, 1.42, 0.325, { r: 0, rz: 0.08 });
  b.box(C.sky, 0.1, 0.09, 0.006, 0.2, 1.435, 0.33, { r: 0, rz: 0.08 });
  b.box(C.gold, 0.12, 0.12, 0.008, 0.17, 1.2, 0.325, { r: 0, rz: -0.1 });
  b.cyl(C.orange, 0.025, 0.014, 0.25, 1.28, 0.33, { rx: Math.PI / 2, seg: 10 });
  b.cyl(C.green, 0.022, 0.014, 0.14, 1.52, 0.33, { rx: Math.PI / 2, seg: 10 });
  b.box(C.red, 0.05, 0.04, 0.014, 0.27, 1.0, 0.33, { r: 0.008 });
};

export const waterCooler: ModelFn = ({ b }) => {
  b.box(C.offwhite, 0.34, 0.96, 0.34, 0, 0.48, 0, { r: 0.04 });
  b.box(C.slate, 0.3, 0.22, 0.02, 0, 0.15, 0.165, { r: 0.012 });
  b.box(C.graphite, 0.24, 0.26, 0.05, 0, 0.62, 0.15, { r: 0.02 });
  b.box(C.ink, 0.2, 0.025, 0.08, 0, 0.5, 0.16, { r: 0.008 });
  b.box(C.signal, 0.04, 0.05, 0.05, -0.05, 0.71, 0.17, { r: 0.012 });
  b.box(C.red, 0.04, 0.05, 0.05, 0.05, 0.71, 0.17, { r: 0.012 });
  b.cyl(C.graphite, 0.09, 0.05, 0, 0.985, 0, { seg: 16 });
  // galão azul translúcido, de boca para baixo
  b.lathe(C.sky, [[0, 0], [0.13, 0.02], [0.13, 0.2], [0.1, 0.24], [0, 0.24]], 0, 1.03, 0, { seg: 18 });
  b.lathe(
    clear(C.signal, 0.5),
    [
      [0, 0],
      [0.04, 0],
      [0.045, 0.06],
      [0.14, 0.1],
      [0.15, 0.16],
      [0.15, 0.25],
      [0.14, 0.29],
      [0.1, 0.31],
      [0, 0.31],
    ],
    0,
    1.0,
    0,
    { seg: 20 },
  );
  b.torus(clear(C.signal, 0.5), 0.15, 0.008, 0, 1.2, 0, { rx: Math.PI / 2, seg: 24, tseg: 4 });
  // copos de papel na lateral
  b.cyl(clear(C.offwhite, 0.55), 0.04, 0.3, 0.2, 0.62, 0.0, { seg: 12 });
  b.cyl(C.offwhite, 0.035, 0.26, 0.2, 0.62, 0.0, { seg: 12 });
  b.cyl(C.graphite, 0.045, 0.02, 0.2, 0.47, 0, { seg: 12 });
};
