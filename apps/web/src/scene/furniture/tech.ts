import * as THREE from "three";
import { Builder, C, T, clear, lit, litClear, mix, poly, puckProfile, type ModelFn } from "./core.ts";
import { at } from "./kit.ts";

/** Tecnologia e estúdio. */

const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();

export const serverRack: ModelFn = ({ b, accent }) => {
  const W = 0.7;
  const D = 0.9;
  const H = 2.0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.graphite, 0.03, 0.05, sx * 0.28, 0.025, sz * 0.36, { seg: 8 });
  b.box(C.ink, W, H - 0.05, D, 0, (H - 0.05) / 2 + 0.05, 0, { r: 0.03 });
  b.box(C.graphite, W - 0.04, 0.03, D - 0.1, 0, H + 0.005, 0, { r: 0.01 });
  for (let i = 0; i < 4; i++) b.box(C.ink, W - 0.2, 0.012, 0.03, 0, H + 0.02, -0.3 + i * 0.2, { r: 0 });
  // portas laterais um tom acima, com filete de luz
  for (const s of [-1, 1]) b.box(C.graphite, 0.012, H - 0.15, D - 0.12, s * (W / 2 + 0.002), H / 2 + 0.04, 0, { r: 0 });
  b.box(lit(accent ?? C.signal), W - 0.06, 0.02, 0.012, 0, H - 0.04, D / 2 + 0.004, { r: 0 });
  // unidades de servidor
  const z = D / 2;
  const units = 9;
  const uh = 0.17;
  const y0 = 0.2;
  const leds: THREE.Matrix4[] = [];
  for (let i = 0; i < units; i++) {
    const y = y0 + i * (uh + 0.02);
    const face = i % 4 === 1 ? T.navyMid : C.graphite;
    b.box(face, W - 0.1, uh, 0.03, 0, y, z - 0.005, { r: 0.01 });
    b.box(C.ink, W - 0.36, 0.025, 0.01, -0.04, y + 0.03, z + 0.012, { r: 0 });
    b.box(C.ink, W - 0.36, 0.025, 0.01, -0.04, y - 0.03, z + 0.012, { r: 0 });
    for (const s of [-1, 1]) b.box(T.steelDark, 0.025, uh - 0.04, 0.03, s * (W / 2 - 0.075), y, z + 0.015, { r: 0.008 });
    for (let k = 0; k < 3; k++) leds.push(at(W / 2 - 0.14 - k * 0.05, y + 0.035, z + 0.016));
  }
  // cabos coloridos saindo do patch panel
  const yp = y0 + 6 * (uh + 0.02);
  [C.signal, C.orange, C.green, C.sky].forEach((c, i) => b.torus(c, 0.05, 0.012, -0.18 + i * 0.07, yp - 0.04, z + 0.02, { arc: Math.PI, rz: Math.PI, rx: -0.4, seg: 10, tseg: 5 }));
  // LEDs piscando (verde e azul)
  b.anim((s) => s.box(lit("#FFFFFF"), 0.036, 0.03, 0.012, 0, 0, 0, { r: 0 }), {
    copies: leds,
    tint: (t, seed, k, out) => {
      const blue = k % 3 === 1;
      const ph = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453;
      const f = 1.5 + (ph - Math.floor(ph)) * 5;
      const on = Math.sin(t * f + k * 1.7 + seed * 20) > (k % 3 === 2 ? 0.6 : -0.3);
      out.set(blue ? C.signal : C.green);
      if (!on) out.multiplyScalar(0.15);
    },
  });
};

export const holoTable: ModelFn = ({ b, accent }) => {
  const glowC = accent ?? C.signal;
  b.puck(C.graphite, 0.62, 0.08, 0, 0, 0, { bevel: 0.03, seg: 32 });
  b.lathe(C.navy, [[0, 0], [0.34, 0], [0.3, 0.3], [0.32, 0.6], [0.5, 0.72], [0, 0.72]], 0, 0.06, 0, { seg: 28 });
  b.lathe(C.graphite, puckProfile(0.9, 0.14, 0.05), 0, 0.78, 0, { seg: 40 });
  b.torus(T.navyMid, 0.86, 0.035, 0, 0.92, 0, { rx: Math.PI / 2, seg: 48, tseg: 8 });
  b.cyl(lit(glowC), 0.8, 0.008, 0, 0.922, 0, { seg: 40 });
  b.cyl(C.ink, 0.74, 0.012, 0, 0.926, 0, { seg: 40 });
  b.cyl(lit(T.screenHi), 0.46, 0.008, 0, 0.932, 0, { seg: 32 });
  b.cyl(lit(T.screen), 0.38, 0.008, 0, 0.936, 0, { seg: 32 });
  b.cyl(lit(glowC), 0.1, 0.012, 0, 0.94, 0, { seg: 16 });
  // botões de controle na borda
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + i * 0.16;
    b.box(lit(i === 1 ? C.orange : glowC), 0.06, 0.012, 0.03, Math.sin(a) * 0.62, 0.936, Math.cos(a) * 0.62, { ry: a, r: 0 });
  }
  // feixe de luz
  b.cyl(litClear(glowC, 0.12), 0.42, 0.9, 0, 1.4, 0, { rt: 0.5, open: true, seg: 28 });
  // holograma girando: globo de anéis + núcleo translúcido + satélites
  b.anim(
    (s) => {
      const hc = litClear(glowC, 0.55);
      for (let i = 0; i < 3; i++) s.torus(hc, 0.32, 0.01, 0, 0, 0, { ry: (i * Math.PI) / 3, seg: 36, tseg: 4 });
      s.torus(hc, 0.32, 0.012, 0, 0, 0, { rx: Math.PI / 2, seg: 36, tseg: 4 });
      s.torus(hc, 0.24, 0.01, 0, 0.18, 0, { rx: Math.PI / 2, seg: 30, tseg: 4 });
      s.torus(hc, 0.24, 0.01, 0, -0.18, 0, { rx: Math.PI / 2, seg: 30, tseg: 4 });
      s.sph(litClear(C.sky, 0.22), 0.28, 0, 0, 0, { seg: 18 });
      s.box(litClear(C.offwhite, 0.7), 0.08, 0.06, 0.04, 0.12, 0.08, 0.2, { r: 0.01 });
      s.box(litClear(C.orange, 0.8), 0.06, 0.05, 0.03, -0.18, -0.06, 0.16, { r: 0.01 });
      s.sph(litClear(C.offwhite, 0.8), 0.03, 0.44, 0.06, 0, { seg: 8 });
      s.torus(litClear(glowC, 0.35), 0.44, 0.006, 0, 0, 0, { rx: Math.PI / 2 - 0.3, seg: 40, tseg: 3 });
    },
    {
      copies: [at(0, 1.42, 0)],
      pose: (t, seed, _k, out) => {
        out.makeRotationY(t * 0.6 + seed * 6);
        out.setPosition(0, Math.sin(t * 1.3 + seed * 3) * 0.03, 0);
      },
    },
  );
};

export const robotArm: ModelFn = ({ b, color, accent }) => {
  const white = color ?? C.offwhite;
  const joint = accent ?? C.orange;
  const dark = C.graphite;
  b.puck(dark, 0.38, 0.08, 0, 0, 0, { bevel: 0.03, seg: 28 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.cyl(T.steel, 0.025, 0.03, Math.cos(a) * 0.3, 0.09, Math.sin(a) * 0.3, { seg: 8 });
  }
  b.puck(C.navy, 0.28, 0.12, 0, 0.07, 0, { bevel: 0.03, seg: 24 });
  // cadeia articulada: base giratória, braço, antebraço, punho
  const SH = 0.38;
  const L1 = 0.52;
  const L2 = 0.42;
  const ang = (t: number, seed: number) => ({
    a1: 0.7 * Math.sin(t * 0.45 + seed * 6),
    a2: 0.25 + 0.25 * Math.sin(t * 0.6 + seed * 3),
    a3: 0.85 + 0.35 * Math.sin(t * 0.8 + seed * 5 + 1),
    a4: 0.4 * Math.sin(t * 1.1 + seed),
  });
  b.anim(
    (s) => {
      s.cyl(white, 0.2, 0.18, 0, 0.28, 0, { seg: 22 });
      s.cyl(dark, 0.21, 0.03, 0, 0.2, 0, { seg: 22 });
      s.box(white, 0.26, 0.12, 0.2, 0, SH - 0.02, 0, { r: 0.05 });
    },
    { pose: (t, seed, _k, out) => out.makeRotationY(ang(t, seed).a1) },
  );
  b.anim(
    (s) => {
      s.cyl(joint, 0.09, 0.3, 0, 0, 0, { rz: Math.PI / 2, seg: 18 });
      s.box(white, 0.16, L1, 0.17, 0, L1 / 2, 0, { r: 0.06 });
      s.box(dark, 0.17, 0.05, 0.18, 0, L1 * 0.55, 0, { r: 0.02 });
    },
    {
      pose: (t, seed, _k, out) => {
        const a = ang(t, seed);
        out.makeRotationY(a.a1).multiply(_a.makeTranslation(0, SH, 0)).multiply(_b.makeRotationX(a.a2));
      },
    },
  );
  b.anim(
    (s) => {
      s.cyl(joint, 0.075, 0.24, 0, 0, 0, { rz: Math.PI / 2, seg: 16 });
      s.box(white, 0.13, L2, 0.14, 0, L2 / 2, 0, { r: 0.05 });
    },
    {
      pose: (t, seed, _k, out) => {
        const a = ang(t, seed);
        out
          .makeRotationY(a.a1)
          .multiply(_a.makeTranslation(0, SH, 0))
          .multiply(_b.makeRotationX(a.a2))
          .multiply(_a.makeTranslation(0, L1, 0))
          .multiply(_b.makeRotationX(a.a3));
      },
    },
  );
  b.anim(
    (s) => {
      s.cyl(joint, 0.06, 0.18, 0, 0, 0, { rz: Math.PI / 2, seg: 14 });
      s.cyl(dark, 0.05, 0.08, 0, 0.07, 0, { seg: 12 });
      s.box(dark, 0.16, 0.04, 0.06, 0, 0.12, 0, { r: 0.015 });
      for (const sx of [-1, 1]) s.box(T.steel, 0.03, 0.1, 0.05, sx * 0.06, 0.18, 0, { r: 0.012 });
    },
    {
      pose: (t, seed, _k, out) => {
        const a = ang(t, seed);
        out
          .makeRotationY(a.a1)
          .multiply(_a.makeTranslation(0, SH, 0))
          .multiply(_b.makeRotationX(a.a2))
          .multiply(_a.makeTranslation(0, L1, 0))
          .multiply(_b.makeRotationX(a.a3))
          .multiply(_a.makeTranslation(0, L2, 0))
          .multiply(_b.makeRotationX(a.a4));
      },
    },
  );
};

export const bigButton: ModelFn = ({ b, color }) => {
  const red = color ?? C.red;
  b.lathe(C.navy, [[0, 0], [0.27, 0], [0.27, 0.05], [0.17, 0.12], [0.15, 0.6], [0.2, 0.84], [0, 0.84]], 0, 0, 0, { seg: 24 });
  b.puck(C.graphite, 0.27, 0.07, 0, 0.82, 0, { bevel: 0.025, seg: 28 });
  // anel listrado de atenção
  for (let i = 0; i < 12; i++) {
    b.cyl(i % 2 ? C.ink : C.gold, 0.25, 0.02, 0, 0.9, 0, { ts: (i / 12) * Math.PI * 2, tl: (Math.PI * 2) / 12, seg: 3 });
  }
  b.cyl(T.steel, 0.16, 0.045, 0, 0.93, 0, { seg: 22 });
  b.sph(red, 0.14, 0, 0.95, 0, { sy: 0.55, seg: 20 });
  b.sph(mix(red, C.offwhite, 0.45), 0.05, -0.04, 1.0, 0.04, { sy: 0.4, seg: 10 });
  // plaquinha na frente
  b.box(C.offwhite, 0.22, 0.1, 0.02, 0, 0.6, 0.155, { r: 0.008, rx: -0.12 });
  b.box(red, 0.16, 0.03, 0.01, 0, 0.61, 0.166, { r: 0, rx: -0.12 });
  // tampa de segurança aberta
  b.box(clear(C.sky, 0.35), 0.3, 0.02, 0.3, 0, 1.02, -0.27, { rx: -1.25, r: 0.01 });
  // anel de luz pulsando em volta do botão
  b.anim((s) => s.torus(lit("#FFFFFF"), 0.165, 0.014, 0, 0, 0, { rx: Math.PI / 2, seg: 28, tseg: 5 }), {
    copies: [at(0, 0.955, 0)],
    tint: (t, seed, _k, out) => {
      out.set(red).multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3 + seed * 6)));
    },
  });
};

/** Tripé de três pernas abertas (topo em yTop). */
function tripod(b: Builder, yTop: number, spread: number, col: string): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    b.rod(col, 0.022, 0, yTop, 0, Math.sin(a) * spread, 0.01, Math.cos(a) * spread, { rt: 0.026, seg: 8 });
    b.sph(C.ink, 0.025, Math.sin(a) * spread, 0.02, Math.cos(a) * spread, { seg: 8 });
  }
  b.cyl(col, 0.045, 0.08, 0, yTop, 0, { seg: 12 });
}

export const ringLight: ModelFn = ({ b }) => {
  tripod(b, 0.55, 0.28, C.graphite);
  b.cyl(T.steel, 0.026, 0.9, 0, 0.98, 0, { seg: 10 });
  b.cyl(C.graphite, 0.03, 0.1, 0, 1.08, 0, { seg: 10 });
  const cy = 1.52;
  // suporte em U
  b.rod(C.graphite, 0.02, 0, 1.36, 0, -0.29, cy, -0.02, { seg: 8 });
  b.rod(C.graphite, 0.02, 0, 1.36, 0, 0.29, cy, -0.02, { seg: 8 });
  b.torus(C.graphite, 0.27, 0.04, 0, cy, -0.02, { seg: 40, tseg: 10 });
  b.torus(lit(T.warm), 0.27, 0.028, 0, cy, 0.012, { seg: 40, tseg: 8 });
  b.torus(lit("#FFFFFF"), 0.27, 0.016, 0, cy, 0.03, { seg: 40, tseg: 6 });
  // celular no centro
  b.rod(C.graphite, 0.012, 0, cy - 0.27, 0, 0, cy - 0.08, 0.02, { seg: 6 });
  b.box(C.ink, 0.085, 0.16, 0.014, 0, cy, 0.03, { r: 0.012 });
  b.box(lit(T.screenHi), 0.07, 0.14, 0.004, 0, cy, 0.039, { r: 0 });
};

export const cameraTripod: ModelFn = ({ b }) => {
  tripod(b, 1.12, 0.3, C.graphite);
  b.cyl(T.steel, 0.028, 0.2, 0, 1.24, 0, { seg: 10 });
  b.box(C.graphite, 0.14, 0.08, 0.14, 0, 1.36, 0, { r: 0.025 });
  b.rod(C.graphite, 0.014, 0.04, 1.36, -0.05, 0.1, 1.24, -0.4, { seg: 8 });
  b.cyl(C.orange, 0.022, 0.1, 0.1, 1.23, -0.44, { rx: 1.25, seg: 8 });
  // câmera
  const cy = 1.5;
  b.box(C.ink, 0.17, 0.2, 0.34, 0, cy, 0.0, { r: 0.035 });
  b.box(C.graphite, 0.12, 0.05, 0.22, 0, cy + 0.12, -0.02, { r: 0.02 });
  b.box(C.graphite, 0.15, 0.16, 0.08, 0, cy, -0.2, { r: 0.025 });
  b.cyl(C.graphite, 0.075, 0.2, 0, cy - 0.01, 0.25, { rx: Math.PI / 2, seg: 18 });
  b.cyl(C.ink, 0.085, 0.06, 0, cy - 0.01, 0.37, { rx: Math.PI / 2, rt: 0.095, seg: 18 });
  b.cyl(lit(T.screenHi), 0.06, 0.006, 0, cy - 0.01, 0.395, { rx: Math.PI / 2, seg: 16 });
  b.cyl(lit(C.sky), 0.02, 0.008, 0.02, cy + 0.01, 0.398, { rx: Math.PI / 2, seg: 8 });
  // tela lateral aberta e luz de gravação
  b.box(C.graphite, 0.012, 0.1, 0.15, -0.115, cy + 0.02, 0.04, { ry: 0.5, r: 0.008 });
  b.box(lit(T.screenHi), 0.004, 0.08, 0.12, -0.124, cy + 0.02, 0.045, { ry: 0.5, r: 0 });
  b.sph(lit(C.red), 0.018, 0.05, cy + 0.08, 0.17, { seg: 8 });
};

export const backdrop: ModelFn = ({ b, color }) => {
  const W = 2.6;
  const H = 2.4;
  const paper = color ?? C.orange;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.05);
    b.cyl(T.steel, 0.028, H - 0.05, x, (H - 0.05) / 2 + 0.05, -0.06, { seg: 10 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + (s > 0 ? 0 : Math.PI);
      b.rod(T.steel, 0.02, x, 0.4, -0.06, x + Math.sin(a) * 0.14, 0.01, -0.06 + Math.cos(a) * 0.14, { seg: 6 });
    }
    b.box(C.graphite, 0.14, 0.08, 0.1, x, 0.04, -0.06, { r: 0.03 });
    b.cyl(C.graphite, 0.04, 0.08, x, H - 0.1, -0.06, { seg: 10 });
  }
  b.cyl(T.steel, 0.024, W - 0.1, 0, H - 0.1, -0.06, { rz: Math.PI / 2, seg: 10 });
  b.cyl(paper, 0.07, W - 0.2, 0, H - 0.18, -0.06, { rz: Math.PI / 2, seg: 18 });
  b.cyl(mix(paper, C.offwhite, 0.6), 0.03, W - 0.16, 0, H - 0.18, -0.06, { rz: Math.PI / 2, seg: 10 });
  // papel caindo e curvando para o chão (perfil em Z, Y)
  const t = 0.012;
  const pts: [number, number][] = [];
  const R = 0.24;
  const zTop = -0.1;
  pts.push([zTop, H - 0.2]);
  pts.push([zTop, R]);
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push([zTop + R - Math.cos(a) * R, R - Math.sin(a) * R]);
  }
  pts.push([0.15, 0]);
  const outer = pts.map(([z, y]) => [z, y + 0.003] as [number, number]);
  const inner = pts
    .map(([z, y], i) => {
      // desloca para dentro da curva
      const a = i < 2 ? 0 : Math.min(1, (i - 1) / 10) * (Math.PI / 2);
      return [z + Math.cos(a) * t, y + Math.sin(a) * t + 0.003] as [number, number];
    })
    .reverse();
  b.side(paper, poly([...outer, ...inner]), W - 0.24, 0, 0, 0);
};
