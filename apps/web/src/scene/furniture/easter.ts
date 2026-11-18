import * as THREE from "three";
import { Builder, C, T, clear, lit, litClear, mix, rng, roundRect, type ModelFn } from "./core.ts";
import { at } from "./kit.ts";

/**
 * Móveis do pacote easter: homenagens discretas a filmes e séries, todas com arte original
 * (objetos genéricos: um rack, um livro, pílulas, tijolos, uma caneta, um barril, uma tigela, patinhos).
 * Nada de personagens, logos, símbolos ou fontes das obras. O que muda ao vivo (o "9¾" da placa,
 * o brilho da lente, o vapor do lámen) é desenhado pela cena do pacote nas posições exportadas aqui.
 */

// ---- 2001: rack com a lente vermelha ------------------------------------------------------------

/** Centro da lente no referencial do rack (frente = +Z). */
export const LENS = { y: 1.56, z: 0.502, r: 0.105 };

export const lensRack: ModelFn = ({ b }) => {
  const W = 0.7;
  const D = 0.9;
  const H = 2.0;
  // mesma carcaça dos outros racks do Dev Lab, para passar despercebido de longe
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.graphite, 0.03, 0.05, sx * 0.28, 0.025, sz * 0.36, { seg: 8 });
  b.box(C.ink, W, H - 0.05, D, 0, (H - 0.05) / 2 + 0.05, 0, { r: 0.03 });
  b.box(C.graphite, W - 0.04, 0.03, D - 0.1, 0, H + 0.005, 0, { r: 0.01 });
  for (let i = 0; i < 4; i++) b.box(C.ink, W - 0.2, 0.012, 0.03, 0, H + 0.02, -0.3 + i * 0.2, { r: 0 });
  for (const s of [-1, 1]) b.box(C.graphite, 0.012, H - 0.15, D - 0.12, s * (W / 2 + 0.002), H / 2 + 0.04, 0, { r: 0 });
  const z = D / 2;
  // unidades de servidor só embaixo; em cima, o painel da lente
  const uh = 0.16;
  const leds: THREE.Matrix4[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.18 + i * 0.18;
    b.box(i % 3 === 1 ? T.navyMid : C.graphite, W - 0.1, uh, 0.03, 0, y, z - 0.005, { r: 0.01 });
    b.box(C.ink, W - 0.36, 0.025, 0.01, -0.04, y + 0.03, z + 0.012, { r: 0 });
    b.box(C.ink, W - 0.36, 0.025, 0.01, -0.04, y - 0.03, z + 0.012, { r: 0 });
    for (const s of [-1, 1]) b.box(T.steelDark, 0.025, uh - 0.04, 0.03, s * (W / 2 - 0.075), y, z + 0.015, { r: 0.008 });
    for (let k = 0; k < 2; k++) leds.push(at(W / 2 - 0.14 - k * 0.05, y + 0.035, z + 0.016));
  }
  // painel de alumínio escovado com moldura escura
  const py = LENS.y - 0.03;
  b.box(C.ink, W - 0.08, 0.64, 0.02, 0, py, z + 0.005, { r: 0.012 });
  b.box(T.steel, W - 0.13, 0.6, 0.02, 0, py, z + 0.016, { r: 0.01 });
  for (let i = 0; i < 9; i++) b.box(mix(T.steel, C.offwhite, i % 2 ? 0.18 : 0.05), W - 0.15, 0.004, 0.004, 0, py - 0.27 + i * 0.0675, z + 0.027, { r: 0 });
  // a lente: aro preto, vidro escuro, brilho vermelho e um ponto quente no centro
  b.cyl(C.ink, LENS.r + 0.018, 0.03, 0, LENS.y, z + 0.03, { rx: Math.PI / 2, seg: 28 });
  b.cyl(T.steelDark, LENS.r + 0.006, 0.012, 0, LENS.y, z + 0.046, { rx: Math.PI / 2, seg: 28 });
  b.cyl(lit(mix(C.red, C.ink, 0.62)), LENS.r - 0.004, 0.01, 0, LENS.y, z + 0.05, { rx: Math.PI / 2, seg: 28 });
  b.anim(
    (s) => {
      s.sph(lit(C.red), 0.058, 0, 0, 0, { sz: 0.45, seg: 18 });
      s.sph(lit("#FFB08A"), 0.016, 0, 0, 0.022, { sz: 0.6, seg: 10 });
    },
    {
      copies: [at(0, LENS.y, z + 0.054)],
      // respira devagar, como quem está ouvindo
      tint: (t, seed, _k, out) => {
        const v = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.3 + seed * 6));
        out.setRGB(v, v, v);
      },
    },
  );
  // brilho translúcido em volta (lê como "aceso" também no 2D)
  b.cyl(litClear(C.red, 0.18), LENS.r * 1.5, 0.002, 0, LENS.y, z + 0.06, { rx: Math.PI / 2, seg: 28 });
  // grade de alto-falante embaixo da lente e uma plaquinha sem texto
  for (let i = 0; i < 5; i++) b.box(C.ink, 0.22, 0.008, 0.006, 0, LENS.y - 0.2 - i * 0.022, z + 0.028, { r: 0 });
  b.box(C.ink, 0.2, 0.04, 0.006, 0, LENS.y + 0.2, z + 0.028, { r: 0.004 });
  b.box(T.steelDark, 0.16, 0.012, 0.004, 0, LENS.y + 0.2, z + 0.032, { r: 0 });
  // filete de luz no topo, como nos outros racks
  b.box(lit(C.signal), W - 0.06, 0.02, 0.012, 0, H - 0.04, z + 0.004, { r: 0 });
  b.anim((s) => s.box(lit("#FFFFFF"), 0.036, 0.03, 0.012, 0, 0, 0, { r: 0 }), {
    copies: leds,
    tint: (t, seed, k, out) => {
      const on = Math.sin(t * (2 + (k % 3)) + k * 1.9 + seed * 20) > -0.2;
      out.set(k % 2 ? C.signal : C.green);
      if (!on) out.multiplyScalar(0.15);
    },
  });
};

// ---- Interestelar: o livro torto ----------------------------------------------------------------

/** Medidas do livro (lateral = espessura, frente = lombada). */
export const BOOK = { w: 0.05, h: 0.28, d: 0.2, pull: 0.06, tip: 0.26, lean: -0.1 };

/** O livro em pé, reto, com a base no centro de (0, 0, 0) e a lombada para +Z. */
function bookBody(b: Builder): void {
  const { w, h, d } = BOOK;
  const cover = mix(C.red, C.woodDark, 0.48);
  b.box(cover, 0.006, h, d, -w / 2 + 0.003, h / 2, 0, { r: 0.002 });
  b.box(cover, 0.006, h, d, w / 2 - 0.003, h / 2, 0, { r: 0.002 });
  b.box(cover, w, h, 0.01, 0, h / 2, d / 2 - 0.004, { r: 0.004 });
  b.box(mix(C.cream, C.offwhite, 0.3), w - 0.012, h - 0.012, d - 0.014, 0, h / 2, -0.004, { r: 0.002 });
  // lombada: dois filetes dourados e uma etiqueta sem título
  for (const y of [0.035, h - 0.035]) b.box(C.gold, w + 0.002, 0.01, 0.004, 0, y, d / 2 + 0.002, { r: 0 });
  b.box(mix(C.cream, C.gold, 0.25), w - 0.016, 0.05, 0.003, 0, h * 0.62, d / 2 + 0.002, { r: 0 });
}

/**
 * Pose torta do livro (corpo em pé → referencial do objeto): a mesma conta do modelo abaixo.
 * A cena do pacote usa para derrubar o livro e devolvê-lo ao lugar.
 */
export function bookRestMatrix(out = new THREE.Matrix4()): THREE.Matrix4 {
  const { d, pull, tip, lean } = BOOK;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tip, 0, lean, "YXZ"));
  out.compose(new THREE.Vector3(0, 0, d / 2 + pull), q, new THREE.Vector3(1, 1, 1));
  return out.multiply(new THREE.Matrix4().makeTranslation(0, 0, -d / 2));
}

export const crookedBook: ModelFn = ({ b }) => {
  // puxado para fora e tombado para a frente, apoiado na quina da frente (a origem é o lugar dele na fileira)
  const { d, pull, tip, lean } = BOOK;
  b.push(0, 0, d / 2 + pull, { rx: tip, rz: lean });
  b.push(0, 0, -d / 2);
  bookBody(b);
  b.pop();
  b.pop();
};

// ---- Matrix: pires com a pílula -------------------------------------------------------------------

export const pillDish: ModelFn = ({ b, variant }) => {
  const pill = variant === 1 ? mix(C.signal, C.navy, 0.15) : mix(C.red, C.orange, 0.08);
  // pires de vidro levemente tingido pela pílula
  b.lathe(clear(mix(pill, C.offwhite, 0.65), 0.5), [[0, 0], [0.04, 0], [0.058, 0.012], [0.062, 0.02], [0.056, 0.02], [0.05, 0.012], [0, 0.008]], 0, 0, 0, { seg: 24 });
  b.cyl(litClear(pill, 0.2), 0.05, 0.002, 0, 0.009, 0, { seg: 20 });
  // a pílula: cápsula deitada, com um brilho
  const geo = new THREE.CapsuleGeometry(0.013, 0.034, 4, 10);
  b.add(pill, geo, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.022, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, Math.PI / 2)), new THREE.Vector3(1, 1, 1)));
  b.sph(lit(mix(pill, C.offwhite, 0.7)), 0.004, -0.008, 0.033, -0.004, { seg: 6 });
};

// ---- Harry Potter: pilastra de tijolos com a placa da plataforma ---------------------------------

/** Placa no referencial da pilastra (centro, largura e altura); o "9¾" vai num plano logo à frente. */
export const PLATFORM_SIGN = { y: 1.9, z: 0.081, w: 0.56, h: 0.27 };

export const brickPillar: ModelFn = ({ b }) => {
  const W = 0.9;
  const H = 2.7;
  const D = 0.14;
  const mortar = mix(C.cream, C.slate, 0.3);
  const stone = mix(C.slate, C.cream, 0.45);
  // corpo (argamassa), rodapé e capitel de pedra
  b.box(mortar, W - 0.03, H - 0.2, D - 0.03, 0, H / 2, -0.01, { r: 0.004 });
  b.box(stone, W + 0.03, 0.12, D + 0.02, 0, 0.06, 0, { r: 0.012 });
  b.box(stone, W + 0.03, 0.08, D + 0.02, 0, H - 0.04, 0, { r: 0.012 });
  b.box(mix(stone, C.ink, 0.15), W + 0.05, 0.02, D + 0.04, 0, H - 0.09, 0, { r: 0.006 });
  // tijolos em amarração: fileiras alternadas com meio tijolo nas pontas
  const r = rng(97);
  const tones = [mix(C.red, C.woodDark, 0.38), mix(C.red, C.woodDark, 0.5), mix(C.orange, C.woodDark, 0.45), mix(C.red, C.wood, 0.35)];
  const row = 0.12;
  const bh = 0.1;
  const pitch = 0.3;
  const bw = 0.28;
  const y0 = 0.12;
  const rows = Math.floor((H - 0.22) / row);
  for (let j = 0; j < rows; j++) {
    const y = y0 + row * j + row / 2;
    const off = j % 2 ? pitch / 2 : 0;
    for (let x = -W / 2 + off; x < W / 2 - 0.02; x += pitch) {
      const xa = Math.max(-W / 2 + 0.01, x + 0.01);
      const xb = Math.min(W / 2 - 0.01, x + 0.01 + bw);
      if (xb - xa < 0.05) continue;
      b.box(tones[Math.floor(r() * tones.length) % tones.length]!, xb - xa, bh, 0.03, (xa + xb) / 2, y, D / 2 - 0.015, { r: 0.006 });
    }
    // laterais (aparecem no 3D, de lado)
    for (const s of [-1, 1]) b.box(tones[Math.floor(r() * tones.length) % tones.length]!, 0.03, bh, D - 0.04, s * (W / 2 - 0.012), y, -0.005, { r: 0.006 });
  }
  // placa esmaltada (o texto é desenhado à parte) com moldura clara e dois parafusos
  const { y, z, w, h } = PLATFORM_SIGN;
  b.box(C.offwhite, w + 0.03, h + 0.03, 0.012, 0, y, z - 0.01, { r: 0.012 });
  b.box(C.navy, w, h, 0.012, 0, y, z - 0.004, { r: 0.01 });
  for (const s of [-1, 1]) b.sph(T.steel, 0.008, s * (w / 2 - 0.018), y + h / 2 - 0.018, z + 0.003, { seg: 6 });
  // suportes da placa presos aos tijolos
  for (const s of [-1, 1]) b.box(T.steelDark, 0.02, 0.06, 0.03, s * (w / 2 - 0.03), y + h / 2 + 0.03, z - 0.02, { r: 0.004 });
};

// ---- O Lobo de Wall Street: a caneta no suporte -------------------------------------------------

export const fancyPen: ModelFn = ({ b }) => {
  const marble = mix(C.ink, C.slate, 0.22);
  b.box(marble, 0.15, 0.024, 0.09, 0, 0.012, 0, { r: 0.008 });
  b.box(mix(marble, C.offwhite, 0.18), 0.12, 0.002, 0.004, 0.005, 0.0245, 0.02, { r: 0, ry: 0.4 });
  b.box(C.gold, 0.152, 0.004, 0.092, 0, 0.026, 0, { r: 0.002 });
  b.box(marble, 0.15, 0.006, 0.09, 0, 0.031, 0, { r: 0.003 });
  // encaixe dourado e a caneta inclinada
  b.cyl(C.gold, 0.012, 0.03, -0.04, 0.048, 0, { rz: 0.6, seg: 12 });
  b.push(-0.04, 0.05, 0, { rz: -0.95 });
  b.cyl(C.ink, 0.0085, 0.15, 0, 0.075, 0, { rt: 0.0075, seg: 12 });
  b.cyl(C.gold, 0.0092, 0.012, 0, 0.1, 0, { seg: 12 });
  b.cyl(C.gold, 0.0078, 0.006, 0, 0.15, 0, { seg: 12 });
  b.box(C.gold, 0.003, 0.05, 0.004, 0.009, 0.12, 0, { r: 0.001 });
  b.cyl(C.gold, 0.004, 0.018, 0, -0.004, 0, { rt: 0.0075, seg: 10 });
  b.pop();
  // cartão de visita sem nome ao lado
  b.box(C.offwhite, 0.055, 0.002, 0.032, 0.045, 0.035, 0.015, { r: 0, ry: -0.25 });
};

// ---- Chaves: o barril ---------------------------------------------------------------------------

export const barrel: ModelFn = ({ b }) => {
  const H = 0.86;
  const wood = mix(C.wood, C.woodDark, 0.15);
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push([0.265 + Math.sin(t * Math.PI) * 0.045, t * H]);
  }
  // aduelas facetadas (poucos segmentos) e o miolo escuro lá em cima
  b.lathe(wood, [[0, 0], ...prof, [0.25, H], [0, H - 0.04]], 0, 0, 0, { seg: 14 });
  b.cyl(mix(C.woodDark, C.ink, 0.5), 0.245, 0.01, 0, H - 0.03, 0, { seg: 14 });
  // aros de metal
  for (const y of [0.09, 0.3, 0.56, 0.77]) {
    const t = y / H;
    const rr = 0.265 + Math.sin(t * Math.PI) * 0.045 + 0.006;
    b.torus(T.steelDark, rr, 0.011, 0, y, 0, { rx: Math.PI / 2, seg: 28, tseg: 5 });
  }
  // tampa solta, meio torta
  b.push(0.03, H + 0.012, -0.02, { rx: 0.06, rz: -0.05 });
  b.cyl(mix(C.woodLight, C.wood, 0.4), 0.26, 0.024, 0, 0, 0, { seg: 20 });
  b.box(mix(C.wood, C.woodDark, 0.4), 0.42, 0.012, 0.04, 0, 0.016, 0, { r: 0.004, ry: 0.3 });
  b.pop();
};

// ---- Naruto: a tigela de lámen ------------------------------------------------------------------

/** Altura do caldo (para o vapor sair do lugar certo). */
export const RAMEN_TOP = 0.088;

export const ramenBowl: ModelFn = ({ b }) => {
  // tigela clara com faixa azul-marinho e o pé
  b.lathe(C.offwhite, [[0, 0], [0.04, 0], [0.042, 0.012], [0.07, 0.03], [0.098, 0.075], [0.106, 0.1], [0.1, 0.101], [0.092, 0.078], [0.06, 0.04], [0, 0.036]], 0, 0, 0, { seg: 28 });
  b.lathe(C.navy, [[0.074, 0.034], [0.09, 0.056], [0.0905, 0.06], [0.0745, 0.038]], 0, 0, 0, { seg: 28 });
  // caldo
  b.cyl(mix(C.gold, C.cream, 0.45), 0.093, 0.004, 0, RAMEN_TOP - 0.002, 0, { seg: 28 });
  // macarrão: laços claros boiando
  const r = rng(11);
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.04;
    b.torus(mix(C.cream, C.gold, 0.35), 0.016 + r() * 0.01, 0.0035, Math.cos(a) * d - 0.015, RAMEN_TOP + 0.001, Math.sin(a) * d, { rx: Math.PI / 2, rz: r() * 3, arc: Math.PI * (1 + r()), seg: 10, tseg: 4 });
  }
  // meio ovo
  b.sph(C.offwhite, 0.024, 0.04, RAMEN_TOP, 0.03, { sy: 0.45, seg: 12 });
  b.sph(mix(C.orange, C.gold, 0.55), 0.012, 0.04, RAMEN_TOP + 0.009, 0.03, { sy: 0.4, seg: 10 });
  // alga em pé na borda de trás
  b.box(mix(C.leaf, C.ink, 0.75), 0.06, 0.07, 0.003, -0.02, RAMEN_TOP + 0.025, -0.075, { r: 0, rx: -0.3 });
  // cebolinha
  for (let i = 0; i < 9; i++) b.cyl(C.leafLight, 0.004, 0.004, -0.05 + r() * 0.06, RAMEN_TOP + 0.002, -0.03 + r() * 0.06, { seg: 6 });
  // narutomaki: fatia branca de borda ondulada com a espiral rosa
  const nx = -0.035;
  const nz = 0.035;
  b.cyl(C.offwhite, 0.022, 0.005, nx, RAMEN_TOP + 0.002, nz, { seg: 14 });
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const a = t * Math.PI * 4.2;
    const rr = 0.002 + t * 0.016;
    pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
  }
  const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0022, 4, false);
  b.add(C.pink, spiral, new THREE.Matrix4().makeTranslation(nx, RAMEN_TOP + 0.0055, nz));
  // hashis apoiados na borda
  for (const s of [-1, 1]) b.cyl(mix(C.woodLight, C.wood, 0.2), 0.0035, 0.24, 0.04 + s * 0.012, 0.106, -0.02, { rz: Math.PI / 2, ry: 0.35, rt: 0.0022, seg: 6 });
};

// ---- Família Soprano: os patinhos ----------------------------------------------------------------

function duck(b: Builder, x: number, z: number, s: number, ry: number): void {
  const yellow = mix(C.gold, C.offwhite, 0.18);
  b.at(x, 0.022, z, { ry }, () => {
    b.sph(yellow, 0.04 * s, 0, 0.03 * s, 0, { sx: 1.25, sy: 0.82, sz: 0.95, seg: 12 });
    b.cyl(yellow, 0.012 * s, 0.03 * s, -0.045 * s, 0.045 * s, 0, { rz: 0.9, rt: 0.002, seg: 6 });
    b.sph(yellow, 0.025 * s, 0.03 * s, 0.07 * s, 0, { seg: 10 });
    b.box(C.orange, 0.024 * s, 0.008 * s, 0.022 * s, 0.058 * s, 0.066 * s, 0, { r: 0.003 * s });
    for (const k of [-1, 1]) b.sph(C.ink, 0.004 * s, 0.045 * s, 0.078 * s, k * 0.016 * s, { seg: 5 });
  });
}

export const duckFamily: ModelFn = ({ b }) => {
  // bandeja rasa com água: a "piscina" dos patinhos
  b.slab(C.offwhite, roundRect(0.3, 0.2, 0.05), 0.024, 0, 0, 0, { bevel: 0.004 });
  b.slab(clear(mix(C.sky, C.signal, 0.3), 0.75), roundRect(0.27, 0.17, 0.04), 0.002, 0, 0.022, 0);
  // a mãe na frente e três filhotes em fila, nadando para +X
  duck(b, 0.08, 0.01, 1, 0.1);
  duck(b, 0.0, -0.035, 0.55, 0.25);
  duck(b, -0.055, 0.02, 0.55, -0.15);
  duck(b, -0.105, -0.03, 0.5, 0.35);
};
