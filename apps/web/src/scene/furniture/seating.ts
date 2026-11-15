import { C, T, arcShape, mix, type ModelFn } from "./core.ts";
import { cushion, fiveStar } from "./kit.ts";

/** Assentos. Quem senta olha para +Z; o encosto fica em -Z. */

export const officeChair: ModelFn = ({ b, color, accent }) => {
  const fab = color ?? T.navySoft;
  const shell = C.graphite;
  fiveStar(b, { r: 0.28, post: 0.3 });
  b.box(shell, 0.46, 0.04, 0.44, 0, 0.41, 0.01, { r: 0.015 });
  cushion(b, fab, 0.52, 0.1, 0.5, 0, 0.46, 0.02);
  // encosto alto, levemente reclinado, com casca escura atrás
  b.box(shell, 0.07, 0.3, 0.05, 0, 0.47, -0.25, { r: 0.02, rx: -0.15 });
  b.push(0, 0.56, -0.24, { rx: -0.13 });
  b.box(shell, 0.46, 0.46, 0.05, 0, 0.22, -0.035, { r: 0.022 });
  cushion(b, fab, 0.46, 0.46, 0.08, 0, 0.23, 0.01);
  b.box(accent ?? mix(fab, C.offwhite, 0.25), 0.4, 0.06, 0.02, 0, 0.1, 0.05, { r: 0.008 });
  b.pop();
  // braços
  for (const s of [-1, 1]) {
    b.box(shell, 0.04, 0.18, 0.04, s * 0.27, 0.53, 0.0, { r: 0.012 });
    b.box(C.ink, 0.07, 0.04, 0.26, s * 0.27, 0.635, 0.02, { r: 0.018 });
  }
};

export const execChair: ModelFn = ({ b, color }) => {
  const lea = color ?? C.leather;
  const lea2 = mix(lea, C.offwhite, 0.12);
  fiveStar(b, { r: 0.32, color: T.steel, post: 0.28 });
  b.box(T.steelDark, 0.5, 0.04, 0.48, 0, 0.39, 0.02, { r: 0.015 });
  cushion(b, lea, 0.6, 0.14, 0.58, 0, 0.46, 0.03);
  cushion(b, lea2, 0.44, 0.06, 0.44, 0, 0.54, 0.05);
  b.push(0, 0.52, -0.25, { rx: -0.16 });
  b.box(mix(lea, C.ink, 0.35), 0.58, 0.64, 0.1, 0, 0.32, -0.04, { r: 0.05 });
  for (let i = 0; i < 3; i++) cushion(b, i === 1 ? lea2 : lea, 0.5, 0.2, 0.13, 0, 0.12 + i * 0.19, 0.04);
  for (const s of [-1, 1]) cushion(b, lea, 0.1, 0.6, 0.16, s * 0.27, 0.32, 0.03);
  b.pop();
  for (const s of [-1, 1]) {
    b.box(T.steel, 0.035, 0.2, 0.035, s * 0.31, 0.52, 0.06, { r: 0.012 });
    cushion(b, lea, 0.1, 0.07, 0.36, s * 0.31, 0.64, 0.03);
  }
};

export const chair: ModelFn = ({ b, color, variant }) => {
  if (variant === 1) {
    // cadeira de madeira estofada
    const wood = C.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(wood, 0.02, 0.44, sx * 0.19, 0.22, sz * 0.18, { rt: 0.026, seg: 10 });
    b.box(wood, 0.44, 0.05, 0.42, 0, 0.42, 0, { r: 0.015 });
    cushion(b, color ?? T.navySoft, 0.42, 0.07, 0.4, 0, 0.47, 0.01);
    for (const s of [-1, 1]) b.box(wood, 0.04, 0.44, 0.04, s * 0.19, 0.63, -0.19, { r: 0.012, rx: -0.08 });
    b.box(wood, 0.44, 0.08, 0.04, 0, 0.82, -0.215, { r: 0.018, rx: -0.08 });
    cushion(b, color ?? T.navySoft, 0.36, 0.22, 0.05, 0, 0.66, -0.195, { rx: -0.08 });
    return;
  }
  // cadeira concha com pés de madeira
  const shell = color ?? C.offwhite;
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [sx, sz] of legs) b.rod(C.woodLight, 0.02, sx * 0.13, 0.42, sz * 0.12, sx * 0.2, 0, sz * 0.2, { rt: 0.026, seg: 8 });
  b.box(C.woodLight, 0.3, 0.03, 0.03, 0, 0.42, 0, { r: 0.01 });
  b.box(shell, 0.46, 0.06, 0.44, 0, 0.45, 0.01, { r: 0.028 });
  // encosto curvo (setor de anel com espessura), inclinado para trás
  b.push(0, 0.5, -0.2, { rx: -0.14 });
  b.slab(shell, arcShape(0.27, 0.31, -0.8, 0.8, 0, 0.29), 0.26, 0, 0.06, 0, { bevel: 0.012 });
  b.pop();
  b.box(mix(shell, C.slate, 0.3), 0.14, 0.14, 0.04, 0, 0.53, -0.2, { r: 0.015, rx: -0.14 });
};

export const stool: ModelFn = ({ b, color }) => {
  const legs = 4;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + Math.PI / 4;
    b.rod(C.graphite, 0.018, Math.cos(a) * 0.11, 0.66, Math.sin(a) * 0.11, Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19, { rt: 0.02, seg: 8 });
  }
  b.torus(T.steel, 0.15, 0.016, 0, 0.26, 0, { rx: Math.PI / 2, seg: 24, tseg: 6 });
  b.puck(C.woodLight, 0.2, 0.05, 0, 0.64, 0, { bevel: 0.015 });
  b.puck(color ?? T.navySoft, 0.19, 0.07, 0, 0.68, 0, { bevel: 0.03 });
};

export const bench: ModelFn = ({ b, color, variant }) => {
  const W = 1.6;
  if (variant === 1) {
    for (const s of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.graphite, 0.02, 0.32, s * 0.7, 0.16, sz * 0.16, { seg: 8 });
    b.box(C.woodLight, W, 0.06, 0.45, 0, 0.33, 0, { r: 0.02 });
    cushion(b, color ?? T.navySoft, W - 0.06, 0.1, 0.42, 0, 0.4, 0);
    return;
  }
  const slat = C.woodLight;
  for (const z of [-0.15, 0, 0.15]) b.box(slat, W, 0.05, 0.12, 0, 0.425, z, { r: 0.015 });
  for (const s of [-1, 1]) {
    b.box(C.woodDark, 0.08, 0.4, 0.4, s * 0.62, 0.2, 0, { r: 0.025 });
  }
  b.box(C.woodDark, 1.2, 0.05, 0.06, 0, 0.12, 0, { r: 0.015 });
};

export const sofa: ModelFn = ({ b, color, accent, variant }) => {
  const W = 2.2;
  const fab = color ?? T.navySoft;
  const base = mix(fab, C.navyDeep, 0.3);
  const n = 3;
  const cw = (W - 0.4) / n;
  if (variant === 1) {
    // sofá de pés de madeira, linhas retas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod(C.wood, 0.025, sx * (W / 2 - 0.12), 0.14, sz * 0.32, sx * (W / 2 - 0.08), 0, sz * 0.36, { rt: 0.03, seg: 8 });
    b.box(base, W, 0.16, 0.86, 0, 0.21, 0, { r: 0.04 });
    for (let i = 0; i < n; i++) cushion(b, fab, cw - 0.01, 0.15, 0.62, -W / 2 + 0.2 + cw * (i + 0.5), 0.36, 0.08);
    b.box(base, W, 0.42, 0.14, 0, 0.5, -0.36, { r: 0.05 });
    for (let i = 0; i < n; i++) cushion(b, fab, cw - 0.01, 0.34, 0.16, -W / 2 + 0.2 + cw * (i + 0.5), 0.6, -0.24, { rx: -0.1 });
    for (const s of [-1, 1]) b.box(base, 0.18, 0.4, 0.86, s * (W / 2 - 0.09), 0.42, 0, { r: 0.06 });
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.woodDark, 0.03, 0.06, sx * (W / 2 - 0.12), 0.03, sz * 0.34, { seg: 8 });
    b.box(base, W - 0.1, 0.24, 0.84, 0, 0.18, 0, { r: 0.05 });
    for (let i = 0; i < n; i++) cushion(b, fab, cw - 0.012, 0.16, 0.62, -W / 2 + 0.2 + cw * (i + 0.5), 0.36, 0.08);
    b.box(base, W - 0.1, 0.46, 0.18, 0, 0.5, -0.34, { r: 0.07 });
    for (let i = 0; i < n; i++) cushion(b, fab, cw - 0.02, 0.38, 0.2, -W / 2 + 0.2 + cw * (i + 0.5), 0.6, -0.24, { rx: -0.14 });
    // braços arredondados (rolo em cima)
    for (const s of [-1, 1]) {
      b.box(fab, 0.2, 0.42, 0.86, s * (W / 2 - 0.1), 0.33, 0, { r: 0.08 });
      b.cyl(fab, 0.12, 0.86, s * (W / 2 - 0.1), 0.52, 0, { rx: Math.PI / 2, seg: 16 });
    }
  }
  // almofadas soltas
  cushion(b, accent ?? C.orange, 0.36, 0.34, 0.12, -W / 2 + 0.38, 0.6, -0.12, { rx: -0.3, rz: 0.2, ry: 0.3 });
  cushion(b, C.cream, 0.34, 0.32, 0.12, W / 2 - 0.38, 0.6, -0.12, { rx: -0.3, rz: -0.15, ry: -0.3 });
};

export const armchair: ModelFn = ({ b, color, accent, variant }) => {
  const fab = color ?? T.navySoft;
  const base = mix(fab, C.navyDeep, 0.3);
  if (variant === 1) {
    // poltrona de lounge com estrutura de madeira
    const wood = C.woodLight;
    for (const s of [-1, 1]) {
      b.rod(wood, 0.03, s * 0.42, 0, 0.36, s * 0.42, 0.56, 0.3, { seg: 8 });
      b.rod(wood, 0.03, s * 0.42, 0, -0.36, s * 0.42, 0.56, -0.28, { seg: 8 });
      b.box(wood, 0.08, 0.05, 0.78, s * 0.42, 0.58, 0.01, { r: 0.022 });
      b.box(wood, 0.05, 0.05, 0.72, s * 0.42, 0.2, 0, { r: 0.018 });
    }
    b.box(wood, 0.8, 0.05, 0.06, 0, 0.26, 0.3, { r: 0.018 });
    cushion(b, fab, 0.76, 0.18, 0.7, 0, 0.34, 0.06);
    cushion(b, fab, 0.74, 0.52, 0.18, 0, 0.62, -0.3, { rx: -0.22 });
    cushion(b, accent ?? C.gold, 0.32, 0.28, 0.1, 0.12, 0.6, -0.14, { rx: -0.3, rz: -0.2 });
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.woodDark, 0.03, 0.06, sx * 0.36, 0.03, sz * 0.33, { seg: 8 });
  b.box(base, 0.85, 0.24, 0.84, 0, 0.18, 0, { r: 0.05 });
  cushion(b, fab, 0.56, 0.16, 0.62, 0, 0.36, 0.08);
  b.box(base, 0.85, 0.5, 0.18, 0, 0.52, -0.34, { r: 0.07 });
  cushion(b, fab, 0.54, 0.38, 0.2, 0, 0.62, -0.24, { rx: -0.14 });
  for (const s of [-1, 1]) {
    b.box(fab, 0.2, 0.42, 0.86, s * 0.375, 0.33, 0, { r: 0.08 });
    b.cyl(fab, 0.11, 0.86, s * 0.375, 0.52, 0, { rx: Math.PI / 2, seg: 16 });
  }
  cushion(b, accent ?? C.orange, 0.32, 0.3, 0.12, 0.06, 0.6, -0.12, { rx: -0.3, rz: 0.15 });
};

export const beanbag: ModelFn = ({ b, color, accent }) => {
  const fab = color ?? C.sky;
  const seam = mix(fab, C.navy, 0.3);
  // corpo em gota, caído para trás
  b.lathe(
    fab,
    [
      [0, 0],
      [0.34, 0.0],
      [0.43, 0.06],
      [0.45, 0.16],
      [0.42, 0.26],
      [0.34, 0.36],
      [0.23, 0.44],
      [0.12, 0.5],
      [0, 0.52],
    ],
    0,
    0,
    -0.04,
    { rx: -0.22, sx: 1, sz: 0.95, seg: 22 },
  );
  // aba da frente, amassada pelo assento
  b.sph(fab, 0.34, 0, 0.15, 0.16, { sx: 1.15, sy: 0.48, sz: 0.85, seg: 18 });
  b.sph(mix(fab, C.offwhite, 0.12), 0.24, 0, 0.27, 0.06, { sx: 1.2, sy: 0.4, sz: 1, seg: 16 });
  b.torus(seam, 0.44, 0.018, 0, 0.16, -0.06, { rx: Math.PI / 2 - 0.22, seg: 28, tseg: 5 });
  b.box(accent ?? C.orange, 0.08, 0.05, 0.02, 0.26, 0.2, 0.32, { r: 0.008, ry: 0.5 });
};

export const pouf: ModelFn = ({ b, color, accent }) => {
  const fab = color ?? C.cream;
  const pipe = mix(fab, C.navy, 0.25);
  b.puck(fab, 0.27, 0.42, 0, 0, 0, { bevel: 0.1, seg: 22 });
  b.torus(pipe, 0.255, 0.016, 0, 0.36, 0, { rx: Math.PI / 2, seg: 28, tseg: 5 });
  b.torus(pipe, 0.255, 0.016, 0, 0.06, 0, { rx: Math.PI / 2, seg: 28, tseg: 5 });
  b.sph(accent ?? C.navy, 0.035, 0, 0.415, 0, { sy: 0.6, seg: 10 });
  b.torus(pipe, 0.12, 0.012, 0, 0.405, 0, { rx: Math.PI / 2, seg: 20, tseg: 5 });
};

export const stageSeat: ModelFn = ({ b, color }) => {
  const fab = color ?? T.navySoft;
  for (const s of [-1, 1]) {
    b.box(C.graphite, 0.06, 0.62, 0.5, s * 0.28, 0.31, -0.03, { r: 0.025 });
    b.box(C.woodLight, 0.09, 0.04, 0.46, s * 0.28, 0.64, -0.01, { r: 0.016 });
  }
  cushion(b, fab, 0.48, 0.11, 0.44, 0, 0.44, 0.02);
  b.box(C.graphite, 0.46, 0.05, 0.4, 0, 0.37, 0.02, { r: 0.015 });
  b.push(0, 0.5, -0.22, { rx: -0.16 });
  b.box(C.graphite, 0.5, 0.5, 0.05, 0, 0.21, -0.04, { r: 0.022 });
  cushion(b, fab, 0.46, 0.46, 0.1, 0, 0.21, 0.02);
  b.box(C.gold, 0.08, 0.05, 0.01, 0, 0.36, -0.068, { r: 0, ry: Math.PI });
  b.pop();
};
