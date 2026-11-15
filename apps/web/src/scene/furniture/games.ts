import * as THREE from "three";
import { Builder, C, T, clear, lit, mix, poly, roundRect, type ModelFn } from "./core.ts";
import { at, ball } from "./kit.ts";

/** Mesas de jogos, fliperama e jukebox. */

const _next = new THREE.Color();

export const airhockey: ModelFn = ({ b, color, accent }) => {
  const W = 1.1;
  const D = 2.0;
  const H = 0.8;
  const railA = color ?? C.signal;
  const railB = accent ?? C.orange;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.graphite, 0.12, 0.6, 0.12, sx * 0.4, 0.3, sz * 0.8, { r: 0.03 });
  b.box(C.graphite, 0.9, 0.05, 1.6, 0, 0.18, 0, { r: 0.02 });
  b.box(T.navyMid, W - 0.04, 0.2, D - 0.04, 0, 0.66, 0, { r: 0.04 });
  b.box(C.offwhite, W - 0.12, 0.02, D - 0.12, 0, H - 0.03, 0, { r: 0.006 });
  // bordas coloridas (laterais) e cabeceiras com gol
  for (const s of [-1, 1]) b.box(railA, 0.07, 0.07, D, s * (W / 2 - 0.035), H - 0.035, 0, { r: 0.025 });
  for (const s of [-1, 1])
    for (const sx of [-1, 1]) {
      b.box(railB, 0.36, 0.07, 0.07, sx * 0.34, H - 0.035, s * (D / 2 - 0.035), { r: 0.025 });
    }
  for (const s of [-1, 1]) b.box(C.ink, 0.3, 0.04, 0.05, 0, H - 0.05, s * (D / 2 - 0.04), { r: 0.01 });
  // linhas do campo
  const y = H - 0.018;
  b.box(C.red, W - 0.14, 0.004, 0.025, 0, y, 0, { r: 0 });
  b.torus(C.red, 0.16, 0.012, 0, y, 0, { rx: Math.PI / 2, seg: 32, tseg: 4 });
  for (const s of [-1, 1]) {
    b.torus(C.signal, 0.2, 0.012, 0, y, s * (D / 2 - 0.06), { rx: Math.PI / 2, rz: s > 0 ? 0 : Math.PI, arc: Math.PI, seg: 24, tseg: 4 });
    b.box(C.signal, W - 0.14, 0.004, 0.02, 0, y, s * 0.5, { r: 0 });
  }
  // rebatedores e disco
  const mallet = (x: number, z: number, c: string) => {
    b.cyl(c, 0.055, 0.03, x, y + 0.015, z, { seg: 16 });
    b.cyl(c, 0.025, 0.05, x, y + 0.055, z, { seg: 10 });
    b.sph(mix(c, C.offwhite, 0.3), 0.03, x, y + 0.085, z, { seg: 10 });
  };
  mallet(0.15, 0.62, railB);
  mallet(-0.2, -0.55, railA);
  b.cyl(C.ink, 0.04, 0.012, 0.06, y + 0.006, 0.18, { seg: 14 });
  // placar
  b.box(C.ink, 0.06, 0.14, 0.34, W / 2 + 0.02, 0.62, 0, { r: 0.02 });
  b.box(lit(railB), 0.006, 0.06, 0.09, W / 2 + 0.052, 0.63, -0.07, { r: 0 });
  b.box(lit(railA), 0.006, 0.06, 0.09, W / 2 + 0.052, 0.63, 0.07, { r: 0 });
};

export const pool: ModelFn = ({ b, color }) => {
  const W = 1.45;
  const D = 2.6;
  const H = 0.82;
  const felt = color ?? T.felt;
  const wood = C.wood;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.lathe(C.woodDark, [[0, 0], [0.09, 0], [0.09, 0.05], [0.06, 0.1], [0.08, 0.3], [0.06, 0.55], [0.08, 0.62], [0, 0.62]], sx * (W / 2 - 0.14), 0, sz * (D / 2 - 0.16), { seg: 14 });
    }
  b.box(C.woodDark, W - 0.06, 0.2, D - 0.06, 0, 0.64, 0, { r: 0.04 });
  b.box(felt, W - 0.2, 0.04, D - 0.2, 0, H - 0.04, 0, { r: 0.006 });
  // bordas de madeira e tabelas
  for (const s of [-1, 1]) {
    b.box(wood, 0.12, 0.07, D, s * (W / 2 - 0.06), H - 0.035, 0, { r: 0.03 });
    b.box(wood, W, 0.07, 0.12, 0, H - 0.035, s * (D / 2 - 0.06), { r: 0.03 });
    b.box(mix(felt, C.ink, 0.25), 0.035, 0.035, D - 0.3, s * (W / 2 - 0.12), H - 0.025, 0, { r: 0.012 });
    b.box(mix(felt, C.ink, 0.25), W - 0.3, 0.035, 0.035, 0, H - 0.025, s * (D / 2 - 0.12), { r: 0.012 });
  }
  // caçapas
  const pockets: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ];
  for (const [sx, sz] of pockets) {
    const x = sx * (W / 2 - 0.1);
    const z = sz * (D / 2 - 0.1);
    b.cyl(C.gold, 0.07, 0.074, x, H - 0.035, z, { seg: 14 });
    b.cyl(C.ink, 0.055, 0.02, x, H + 0.0, z, { seg: 14 });
  }
  // marcações (diamantes)
  for (const s of [-1, 1]) for (const k of [-2, -1, 1, 2]) b.box(C.offwhite, 0.03, 0.006, 0.03, s * (W / 2 - 0.06), H + 0.001, k * 0.3, { r: 0, ry: Math.PI / 4 });
  // bolas em triângulo + branca + taco
  const cols = [C.gold, C.signal, C.red, C.navy, C.orange, C.green, C.woodDark, C.ink, C.gold, C.sky, C.pink, T.navySoft, C.orange, C.leaf, C.wood];
  const r = 0.028;
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) {
      const x = (i - row / 2) * r * 2.05;
      const z = -0.55 - row * r * 1.78;
      ball(b, cols[k++ % cols.length] as string, r, x, H - 0.02, z);
    }
  ball(b, C.offwhite, r, 0.08, H - 0.02, 0.62);
  b.rod(C.woodLight, 0.011, -0.42, H + 0.012, 0.9, 0.2, H + 0.012, -0.2, { rt: 0.008, seg: 8 });
  b.rod(C.woodDark, 0.014, -0.5, H + 0.014, 1.04, -0.42, H + 0.012, 0.9, { seg: 8 });
  b.box(C.signal, 0.03, 0.025, 0.03, 0.62, H + 0.012, -1.05, { r: 0.006 });
};

export const pingpong: ModelFn = ({ b, color, accent }) => {
  const W = 1.5;
  const D = 2.7;
  const H = 0.76;
  const top = color ?? T.blueTable;
  // estrutura dobrável com rodinhas
  for (const s of [-1, 1]) {
    const z = s * 0.85;
    for (const sx of [-1, 1]) b.box(C.graphite, 0.05, H - 0.1, 0.05, sx * 0.6, (H - 0.1) / 2 + 0.05, z, { r: 0.015 });
    b.box(C.graphite, 1.25, 0.05, 0.05, 0, 0.28, z, { r: 0.015 });
    for (const sx of [-1, 1]) b.sph(C.ink, 0.04, sx * 0.6, 0.04, z, { seg: 10 });
  }
  b.box(C.graphite, 0.3, 0.1, 1.8, 0, H - 0.1, 0, { r: 0.03 });
  b.box(top, W, 0.04, D, 0, H - 0.02, 0, { r: 0.012 });
  // linhas brancas
  const y = H + 0.001;
  for (const s of [-1, 1]) {
    b.box(C.offwhite, 0.025, 0.004, D, s * (W / 2 - 0.0125), y, 0, { r: 0 });
    b.box(C.offwhite, W, 0.004, 0.025, 0, y, s * (D / 2 - 0.0125), { r: 0 });
  }
  b.box(C.offwhite, 0.012, 0.004, D, 0, y, 0, { r: 0 });
  // rede
  for (const s of [-1, 1]) b.box(C.graphite, 0.03, 0.17, 0.04, s * (W / 2 + 0.03), H + 0.065, 0, { r: 0.01 });
  b.box(clear(C.offwhite, 0.55), W + 0.04, 0.14, 0.008, 0, H + 0.075, 0, { r: 0 });
  b.box(C.offwhite, W + 0.04, 0.025, 0.014, 0, H + 0.145, 0, { r: 0.005 });
  // raquetes e bolinha
  const paddle = (x: number, z: number, ry: number, c: string) => {
    b.at(x, y, z, { ry }, () => {
      b.cyl(c, 0.075, 0.012, 0, 0.008, 0, { seg: 18 });
      b.box(C.woodLight, 0.032, 0.022, 0.1, 0, 0.012, 0.11, { r: 0.01 });
    });
  };
  paddle(0.35, 0.8, 0.5, C.red);
  paddle(-0.4, -0.7, -2.4, C.ink);
  ball(b, accent ?? C.orange, 0.02, 0.1, y, 0.35);
};

export const chessTable: ModelFn = ({ b, color }) => {
  const H = 0.74;
  const wood = color ?? C.woodDark;
  b.plate(wood, 0.8, 0.8, 0.05, 0, H - 0.05, 0, { r: 0.05 });
  b.cyl(wood, 0.06, H - 0.1, 0, (H - 0.1) / 2 + 0.04, 0, { seg: 12 });
  for (let i = 0; i < 4; i++) b.box(wood, 0.08, 0.05, 0.3, Math.sin((i * Math.PI) / 2) * 0.15, 0.025, Math.cos((i * Math.PI) / 2) * 0.15, { ry: (i * Math.PI) / 2, r: 0.02 });
  // tabuleiro 8x8
  const sq = 0.078;
  const y = H + 0.003;
  b.box(mix(wood, C.ink, 0.3), sq * 8 + 0.03, 0.006, sq * 8 + 0.03, 0, H + 0.001, 0, { r: 0 });
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) b.box((i + j) % 2 ? C.wood : C.cream, sq, 0.006, sq, (i - 3.5) * sq, y, (j - 3.5) * sq, { r: 0 });
  const yb = H + 0.006;
  const piece = (file: number, rank: number, kind: string, white: boolean) => {
    const c = white ? C.offwhite : C.navy;
    const x = (file - 3.5) * sq;
    const z = (3.5 - rank) * sq;
    const base: [number, number][] = [
      [0, 0],
      [0.026, 0],
      [0.026, 0.012],
      [0.016, 0.022],
    ];
    if (kind === "p") {
      b.lathe(c, [...base, [0.011, 0.04], [0, 0.04]], x, yb, z, { seg: 10 });
      b.sph(c, 0.016, x, yb + 0.048, z, { seg: 10 });
    } else if (kind === "r") {
      b.lathe(c, [...base, [0.016, 0.05], [0.021, 0.052], [0.021, 0.068], [0, 0.068]], x, yb, z, { seg: 10 });
    } else if (kind === "n") {
      b.lathe(c, [...base, [0.015, 0.03], [0, 0.03]], x, yb, z, { seg: 10 });
      b.box(c, 0.022, 0.05, 0.034, x, yb + 0.05, z + (white ? -0.004 : 0.004), { rx: white ? 0.35 : -0.35, r: 0.008 });
    } else if (kind === "b") {
      b.lathe(c, [...base, [0.011, 0.05], [0.016, 0.062], [0.006, 0.08], [0, 0.082]], x, yb, z, { seg: 10 });
    } else {
      const tall = kind === "k" ? 0.09 : 0.082;
      b.lathe(c, [...base, [0.012, tall - 0.025], [0.02, tall - 0.012], [0.017, tall], [0, tall]], x, yb, z, { seg: 12 });
      if (kind === "k") b.box(c, 0.012, 0.03, 0.012, x, yb + tall + 0.012, z, { r: 0.003 });
      else b.sph(c, 0.011, x, yb + tall + 0.006, z, { seg: 8 });
    }
  };
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  back.forEach((k, f) => {
    if (!(f === 6)) piece(f, 0, k, true);
    if (!(f === 1)) piece(f, 7, k, false);
  });
  for (let f = 0; f < 8; f++) {
    piece(f, f === 4 ? 3 : 1, "p", true);
    piece(f, f === 4 ? 4 : 6, "p", false);
  }
  piece(5, 2, "n", true);
  piece(2, 5, "n", false);
};

export const connect4Table: ModelFn = ({ b, color, accent }) => {
  const H = 0.74;
  b.plate(color ?? C.woodLight, 0.9, 0.7, 0.05, 0, H - 0.05, 0, { r: 0.06 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.navy, 0.06, H - 0.05, 0.06, sx * 0.36, (H - 0.05) / 2, sz * 0.26, { r: 0.02 });
  // grade vertical azul
  const blue = mix(C.signal, C.navy, 0.35);
  const cols = 7;
  const rows = 6;
  const sp = 0.074;
  const gw = cols * sp + 0.05;
  const gh = rows * sp + 0.05;
  const y0 = H + 0.06;
  for (const s of [-1, 1]) {
    b.box(blue, 0.04, gh + 0.06, 0.05, s * (gw / 2 + 0.02), y0 + gh / 2 - 0.02, 0, { r: 0.015 });
    b.box(blue, 0.06, 0.03, 0.22, s * (gw / 2 + 0.02), H + 0.015, 0, { r: 0.012 });
  }
  b.box(blue, gw, gh, 0.036, 0, y0 + gh / 2, 0, { r: 0.012 });
  const chipA = accent ?? C.orange;
  const board = [
    "       ",
    "       ",
    "   A   ",
    "  BAB  ",
    " ABBA  ",
    "BAABAB ",
  ];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ch = board[r]?.[c] ?? " ";
      const x = (c - (cols - 1) / 2) * sp;
      const y = y0 + gh - 0.025 - (r + 0.5) * sp;
      if (ch === " ") b.cyl(C.navyDeep, 0.026, 0.04, x, y, 0, { rx: Math.PI / 2, seg: 12 });
      else b.cyl(ch === "A" ? chipA : C.offwhite, 0.029, 0.042, x, y, 0, { rx: Math.PI / 2, seg: 12 });
    }
  // fichas soltas na mesa
  for (let i = 0; i < 3; i++) b.cyl(chipA, 0.03, 0.012, 0.3, H + 0.006 + i * 0.013, 0.2, { seg: 12 });
  for (let i = 0; i < 2; i++) b.cyl(C.offwhite, 0.03, 0.012, -0.3, H + 0.006 + i * 0.013, 0.22, { seg: 12 });
};

export const arcade: ModelFn = ({ b, color, accent, variant }) => {
  const body = color ?? ([C.navy, C.graphite, mix(C.navy, C.signal, 0.25)][variant % 3] as string);
  const art = [
    [C.orange, C.gold, C.signal],
    [C.signal, C.sky, C.pink],
    [C.pink, C.gold, C.green],
  ][variant % 3] as string[];
  const marquee = accent ?? (art[1] as string);
  const profile = poly([
    [-0.4, 0],
    [0.36, 0],
    [0.36, 0.82],
    [0.42, 0.9],
    [0.42, 0.98],
    [0.26, 1.02],
    [0.16, 1.5],
    [0.32, 1.56],
    [0.32, 1.8],
    [-0.4, 1.8],
  ]);
  for (const s of [-1, 1]) {
    b.side(body, profile, 0.05, s * 0.375, 0, 0, { bevel: 0.01 });
    // arte lateral em faixas diagonais
    art.forEach((c, i) => b.box(c, 0.008, 0.07, 0.62, s * 0.403, 0.42 + i * 0.12, -0.04, { rx: -0.32, r: 0 }));
    b.box(art[0] as string, 0.008, 0.12, 0.12, s * 0.403, 1.36, -0.16, { rx: Math.PI / 4, r: 0.02 });
    b.box(art[2] as string, 0.008, 0.07, 0.07, s * 0.403, 1.2, -0.02, { rx: Math.PI / 4, r: 0.012 });
  }
  b.box(C.ink, 0.7, 1.78, 0.72, 0, 0.9, -0.04, { r: 0.02 });
  // porta de fichas
  b.box(C.graphite, 0.7, 0.78, 0.02, 0, 0.42, 0.35, { r: 0.01 });
  b.box(T.steelDark, 0.26, 0.3, 0.02, 0, 0.45, 0.365, { r: 0.015 });
  for (const s of [-1, 1]) b.box(lit(C.orange), 0.03, 0.06, 0.008, s * 0.06, 0.5, 0.378, { r: 0 });
  // painel de controle
  b.push(0, 0.95, 0.32, { rx: 0.35 });
  b.box(C.ink, 0.72, 0.05, 0.24, 0, 0, 0, { r: 0.015 });
  b.box(art[0] as string, 0.72, 0.006, 0.2, 0, 0.026, 0, { r: 0 });
  b.cyl(C.ink, 0.012, 0.08, -0.18, 0.06, 0.0, { seg: 6 });
  b.sph(C.red, 0.032, -0.18, 0.1, 0.0, { seg: 10 });
  [C.signal, C.gold, C.green, C.orange].forEach((c, i) => b.cyl(c, 0.022, 0.02, 0.02 + (i % 2) * 0.07 + Math.floor(i / 2) * 0.1, 0.035, (i % 2) * 0.05 - 0.02, { seg: 10 }));
  b.pop();
  // tela inclinada com jogo
  b.push(0, 1.26, 0.2, { rx: -0.2 });
  b.box(C.graphite, 0.64, 0.5, 0.03, 0, 0, -0.02, { r: 0.02 });
  b.box(lit(C.navyDeep), 0.56, 0.42, 0.008, 0, 0, 0.0, { r: 0 });
  b.box(lit(C.signal), 0.08, 0.03, 0.006, 0, -0.17, 0.006, { r: 0 });
  b.box(lit(C.offwhite), 0.12, 0.02, 0.006, -0.18, 0.18, 0.006, { r: 0 });
  b.box(lit(C.orange), 0.06, 0.02, 0.006, 0.2, 0.18, 0.006, { r: 0 });
  const invaders: THREE.Matrix4[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) invaders.push(at(-0.16 + c * 0.08, 0.1 - r * 0.07, 0.007));
  b.anim(
    (s) => {
      s.box(lit("#FFFFFF"), 0.04, 0.03, 0.004, 0, 0, 0, { r: 0 });
      s.box(lit("#FFFFFF"), 0.012, 0.012, 0.004, -0.018, -0.02, 0, { r: 0 });
      s.box(lit("#FFFFFF"), 0.012, 0.012, 0.004, 0.018, -0.02, 0, { r: 0 });
    },
    {
      copies: invaders,
      pose: (t, seed, _k, out) => out.makeTranslation(Math.sin(t * 1.5 + seed * 6) * 0.04, -((Math.floor(t * 0.5 + seed * 4) % 3) * 0.01), 0),
      tint: (_t, _seed, k, out) => {
        out.set(k < 5 ? C.pink : k < 10 ? C.green : C.gold);
      },
    },
  );
  b.pop();
  // letreiro iluminado
  b.box(C.ink, 0.72, 0.24, 0.1, 0, 1.68, 0.27, { r: 0.02 });
  b.box(lit(marquee), 0.64, 0.17, 0.01, 0, 1.68, 0.322, { r: 0 });
  b.box(lit(C.offwhite), 0.36, 0.05, 0.006, 0, 1.69, 0.328, { r: 0 });
};

export const jukebox: ModelFn = ({ b, color }) => {
  const wood = color ?? C.woodDark;
  const W = 0.9;
  const D = 0.56;
  b.box(mix(wood, C.ink, 0.3), W - 0.04, 0.06, D - 0.04, 0, 0.03, 0, { r: 0.02 });
  b.box(wood, W, 0.86, D, 0, 0.49, 0, { r: 0.04 });
  // arco superior
  const arch = new THREE.Shape();
  arch.moveTo(-W / 2, 0);
  arch.lineTo(W / 2, 0);
  arch.lineTo(W / 2, 0.25);
  arch.absarc(0, 0.25, W / 2, 0, Math.PI, false);
  arch.lineTo(-W / 2, 0);
  b.front(wood, arch, D - 0.06, 0, 0.9, -0.02, { bevel: 0.02, curve: 24 });
  // painel frontal laranja brilhante com grade
  b.box(lit(C.orange), 0.62, 0.46, 0.01, 0, 0.48, D / 2 + 0.002, { r: 0 });
  for (let i = 0; i < 7; i++) b.box(C.ink, 0.03, 0.46, 0.02, -0.27 + i * 0.09, 0.48, D / 2 + 0.008, { r: 0.006 });
  b.box(T.steel, 0.7, 0.03, 0.03, 0, 0.73, D / 2 + 0.005, { r: 0.01 });
  b.box(T.steel, 0.7, 0.03, 0.03, 0, 0.23, D / 2 + 0.005, { r: 0.01 });
  // painel de seleção e janela do disco
  b.box(C.offwhite, 0.6, 0.12, 0.04, 0, 0.84, D / 2 - 0.0, { rx: -0.4, r: 0.012 });
  for (let i = 0; i < 6; i++) b.box(i === 2 ? C.orange : C.slate, 0.05, 0.03, 0.02, -0.19 + i * 0.076, 0.83, D / 2 + 0.03, { rx: -0.4, r: 0.006 });
  const glass = roundRect(0.56, 0.36, 0.1);
  b.front(clear(C.navyDeep, 0.75), glass, 0.01, 0, 1.17, D / 2 - 0.04);
  b.anim(
    (s) => {
      s.cyl(C.ink, 0.13, 0.012, 0, 0, 0, { rx: Math.PI / 2, seg: 22 });
      s.cyl(C.red, 0.04, 0.014, 0, 0, 0, { rx: Math.PI / 2, seg: 12 });
      s.box(C.offwhite, 0.02, 0.012, 0.016, 0.09, 0, 0, { r: 0 });
    },
    { copies: [at(0, 1.15, D / 2 - 0.08)], pose: (t, _seed, _k, out) => out.makeRotationZ(-t * 3.5) },
  );
  b.box(T.steel, 0.02, 0.2, 0.02, 0.22, 1.18, D / 2 - 0.06, { rz: 0.4, r: 0.006 });
  // arco de luz que muda de cor
  b.anim(
    (s: Builder) => {
      s.torus(lit("#FFFFFF"), W / 2 - 0.04, 0.035, 0, 0.25, 0, { arc: Math.PI, seg: 30, tseg: 8 });
      for (const sx of [-1, 1]) s.box(lit("#FFFFFF"), 0.06, 0.95, 0.06, sx * (W / 2 - 0.04), -0.22, 0, { r: 0.025 });
    },
    {
      copies: [at(0, 0.9, D / 2 - 0.02)],
      tint: (t, seed, _k, out) => {
        const palette = [C.orange, C.gold, T.warm, C.gold];
        const f = (t * 0.5 + seed * 4) % palette.length;
        const i = Math.floor(f);
        out.set(palette[i] as string).lerp(_next.set(palette[(i + 1) % palette.length] as string), f - i);
      },
    },
  );
  b.torus(T.steel, W / 2 + 0.005, 0.016, 0, 1.15, D / 2 - 0.05, { arc: Math.PI, seg: 30, tseg: 5 });
};
