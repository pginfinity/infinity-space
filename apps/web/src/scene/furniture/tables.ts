import { C, T, ellipse, lit, mix, type ModelFn } from "./core.ts";
import { book, bottle, mug, roundTop, tinyPlant } from "./kit.ts";

/** Mesas. */

/** Viva-voz de reunião: disco escuro com anel de luz azul. */
function speakerPuck(b: Parameters<ModelFn>[0]["b"], x: number, y: number, z: number): void {
  b.puck(C.graphite, 0.1, 0.03, x, y, z, { bevel: 0.012, seg: 18 });
  b.cyl(lit(C.signal), 0.075, 0.006, x, y + 0.031, z, { seg: 18 });
  b.cyl(C.ink, 0.055, 0.008, x, y + 0.033, z, { seg: 16 });
}

/** Bloco de notas com caneta. */
function notepad(b: Parameters<ModelFn>[0]["b"], x: number, y: number, z: number, ry: number, pen: string = C.navy): void {
  b.at(x, y, z, { ry }, () => {
    b.box(C.offwhite, 0.16, 0.012, 0.22, 0, 0.006, 0, { r: 0.004 });
    b.box(C.signal, 0.16, 0.014, 0.03, 0, 0.007, -0.1, { r: 0.004 });
    b.cyl(pen, 0.009, 0.15, 0.11, 0.01, 0, { rx: Math.PI / 2, seg: 6 });
  });
}

export const meetingTable: ModelFn = ({ b, color }) => {
  const W = 1.3;
  const D = 3.2;
  const H = 0.75;
  b.plate(color ?? C.cream, W, D, 0.05, 0, H - 0.05, 0, { r: 0.14 });
  b.plate(C.woodLight, W - 0.06, D - 0.06, 0.04, 0, H - 0.085, 0, { r: 0.12 });
  for (const s of [-1, 1]) {
    b.box(C.navy, 0.8, H - 0.12, 0.09, 0, (H - 0.12) / 2 + 0.03, s * 1.1, { r: 0.035 });
    b.box(C.navy, 0.96, 0.05, 0.22, 0, 0.025, s * 1.1, { r: 0.022 });
  }
  b.box(C.navy, 0.12, 0.08, 2.2, 0, H - 0.12, 0, { r: 0.03 });
  // caixa de tomadas no centro
  b.box(C.graphite, 0.18, 0.03, 0.42, 0, H + 0.012, 0, { r: 0.012 });
  for (const z of [-0.12, 0, 0.12]) b.box(lit(z === 0 ? C.orange : C.signal), 0.06, 0.008, 0.05, 0, H + 0.028, z, { r: 0 });
  speakerPuck(b, 0, H, 0.85);
  notepad(b, -0.38, H, -0.9, 0.15);
  notepad(b, 0.4, H, 0.3, -0.2, C.orange);
  b.cyl(C.offwhite, 0.035, 0.1, -0.35, H + 0.05, 0.75, { seg: 12 });
};

export const roundTable: ModelFn = ({ b, color }) => {
  const H = 0.75;
  roundTop(b, color ?? C.cream, 0.7, 0.05, 0, H, 0);
  b.puck(C.woodLight, 0.64, 0.04, 0, H - 0.085, 0, { bevel: 0.015, seg: 30 });
  b.cyl(C.navy, 0.08, H - 0.1, 0, (H - 0.1) / 2 + 0.03, 0, { rt: 0.07, seg: 16 });
  b.lathe(C.navy, [[0, 0], [0.38, 0], [0.38, 0.02], [0.3, 0.06], [0.1, 0.08], [0, 0.08]], 0, 0, 0, { seg: 24 });
  speakerPuck(b, 0, H, 0);
  notepad(b, -0.3, H, 0.32, 0.6);
  mug(b, 0.34, H, 0.22, C.offwhite, -0.8);
};

export const ovalTable: ModelFn = ({ b, color }) => {
  const W = 1.6;
  const D = 3.6;
  const H = 0.76;
  const wood = color ?? C.woodDark;
  b.slab(wood, ellipse(W - 0.03, D - 0.03), 0.07, 0, H - 0.07, 0, { bevel: 0.015, curve: 48 });
  // filete de madeira clara (o "brilho" do verniz)
  b.slab(mix(wood, C.woodLight, 0.55), ellipse(W - 0.22, D - 0.22), 0.004, 0, H, 0, { curve: 48 });
  b.slab(wood, ellipse(W - 0.3, D - 0.3), 0.006, 0, H, 0, { curve: 48 });
  b.slab(mix(wood, C.woodLight, 0.25), ellipse(0.5, 1.6), 0.008, 0, H, 0, { curve: 32 });
  for (const s of [-1, 1]) {
    b.box(mix(wood, C.ink, 0.25), 0.46, H - 0.1, 0.8, 0, (H - 0.1) / 2 + 0.03, s * 0.95, { r: 0.07 });
    b.box(C.gold, 0.48, 0.03, 0.82, 0, 0.04, s * 0.95, { r: 0.012 });
  }
  speakerPuck(b, 0, H + 0.008, 1.1);
  speakerPuck(b, 0, H + 0.008, -1.1);
  tinyPlant(b, 0, H + 0.008, 0, C.offwhite, 1.5);
  notepad(b, 0.5, H, 0.5, -0.4);
  notepad(b, -0.5, H, -0.6, 0.3, C.gold);
};

/**
 * Mesa de conferência para 20 pessoas (Sala Eclipse), desenhada no tamanho real (1,8 × 7,6 m) para
 * os detalhes não esticarem: 9 lugares de cada lado e um em cada ponta. No centro do tampo, o eclipse
 * marchetado (disco escuro com a coroa na cor da sala); por baixo da borda, um filete de luz.
 */
export const conferenceTable: ModelFn = ({ b, color, accent }) => {
  const W = 1.8;
  const D = 7.6;
  const H = 0.76;
  const acc = accent ?? C.signal;
  const top = color ?? C.cream;
  // tampo e o "sanduíche" de madeira por baixo
  b.plate(top, W, D, 0.055, 0, H - 0.055, 0, { r: 0.78 });
  b.plate(C.woodLight, W - 0.07, D - 0.07, 0.04, 0, H - 0.09, 0, { r: 0.74 });
  // faixa central escura (vidro) com o eclipse no meio
  b.plate(C.navy, 0.42, D - 1.9, 0.006, 0, H, 0, { r: 0.18 });
  b.slab(mix(acc, C.offwhite, 0.35), ellipse(0.98, 0.98), 0.006, 0, H + 0.004, 0, { curve: 48 });
  b.slab(acc, ellipse(0.9, 0.9), 0.006, 0, H + 0.008, 0, { curve: 48 });
  b.slab(T.navySoft, ellipse(0.78, 0.78), 0.006, 0, H + 0.012, 0, { curve: 48 });
  b.slab(C.ink, ellipse(0.7, 0.7), 0.006, 0, H + 0.016, 0, { curve: 40 });
  // filete de luz sob as bordas longas
  for (const s of [-1, 1]) b.box(lit(acc), 0.012, 0.012, D - 1.9, s * (W / 2 - 0.09), H - 0.115, 0, { r: 0 });
  // três pés (pedestais) com sapata
  for (const z of [-2.6, 0, 2.6]) {
    b.box(C.navy, 0.86, H - 0.13, 0.11, 0, (H - 0.13) / 2 + 0.03, z, { r: 0.04 });
    b.box(C.navy, 1.04, 0.05, 0.26, 0, 0.025, z, { r: 0.022 });
  }
  b.box(C.navy, 0.12, 0.08, D - 2.4, 0, H - 0.13, 0, { r: 0.03 });
  // caixas de tomada e viva-vozes ao longo da faixa
  for (const z of [-2.2, 2.2]) {
    b.box(C.graphite, 0.18, 0.03, 0.4, 0, H + 0.016, z, { r: 0.012 });
    for (const dz of [-0.11, 0, 0.11]) b.box(lit(dz === 0 ? C.orange : C.signal), 0.06, 0.008, 0.05, 0, H + 0.033, z + dz, { r: 0 });
  }
  for (const z of [-3.1, -1.15, 1.15, 3.1]) speakerPuck(b, 0, H + 0.006, z);
  // lugares: blocos, canecas e garrafinhas em alguns (não em todos, para parecer usado)
  const seats = [-3.2, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, 3.2];
  seats.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const k = (i * 7 + (s > 0 ? 3 : 0)) % 5;
      const x = s * 0.56;
      if (k === 0 || k === 3) notepad(b, x, H, z, s * 0.15 + (k === 3 ? 0.3 : -0.2), k === 3 ? C.orange : C.navy);
      if (k === 1) mug(b, x + s * 0.1, H, z + 0.12, i % 2 ? C.offwhite : C.orange, s);
      if (k === 2) bottle(b, x + s * 0.12, H, z - 0.1);
    }
  });
  tinyPlant(b, 0, H + 0.006, -1.6, C.offwhite, 1.2);
  tinyPlant(b, 0, H + 0.006, 1.6, C.offwhite, 1.2);
};

export const highTable: ModelFn = ({ b, color }) => {
  const W = 1.8;
  const D = 0.7;
  const H = 1.05;
  b.plate(color ?? C.wood, W, D, 0.06, 0, H - 0.06, 0, { r: 0.08 });
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.22);
    b.box(C.graphite, 0.07, H - 0.1, 0.07, x, (H - 0.1) / 2 + 0.03, 0, { r: 0.018 });
    b.box(C.graphite, 0.09, 0.05, D - 0.1, x, 0.025, 0, { r: 0.02 });
    b.box(C.graphite, 0.08, 0.05, D - 0.2, x, H - 0.085, 0, { r: 0.018 });
  }
  b.cyl(T.steel, 0.022, W - 0.44, 0, 0.27, 0.12, { rz: Math.PI / 2, seg: 10 });
  tinyPlant(b, -0.55, H, 0, C.offwhite, 0.9);
  bottle(b, 0.3, H, -0.08, C.sky);
  b.cyl(C.offwhite, 0.035, 0.1, 0.45, H + 0.05, 0.1, { seg: 12 });
  b.cyl(C.offwhite, 0.035, 0.1, 0.15, H + 0.05, 0.14, { seg: 12 });
};

export const coffeeTable: ModelFn = ({ b, color, accent, variant }) => {
  const W = 1.2;
  const D = 0.7;
  const H = 0.42;
  const top = color ?? C.woodLight;
  if (variant === 1) {
    // tampo oval sobre base sólida
    b.slab(top, ellipse(W - 0.02, D - 0.02), 0.05, 0, H - 0.05, 0, { bevel: 0.015, curve: 32 });
    b.slab(C.navy, ellipse(W * 0.6, D * 0.55), H - 0.05, 0, 0, 0, { bevel: 0.02, curve: 28 });
  } else {
    b.plate(top, W, D, 0.05, 0, H - 0.05, 0, { r: 0.16 });
    b.plate(mix(top, C.wood, 0.3), W - 0.12, D - 0.12, 0.03, 0, 0.1, 0, { r: 0.12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(C.wood, 0.03, H - 0.05, sx * (W / 2 - 0.1), (H - 0.05) / 2, sz * (D / 2 - 0.1), { rt: 0.04, seg: 10 });
    book(b, -0.2, 0.13, 0.02, C.navy, { w: 0.24, d: 0.3, ry: 0.1 });
    book(b, -0.2, 0.165, 0.02, C.cream, { w: 0.22, d: 0.28, ry: -0.1, h: 0.025 });
  }
  book(b, -0.28, H, 0.05, C.signal, { w: 0.22, d: 0.3, h: 0.015, ry: 0.35 });
  book(b, -0.24, H + 0.015, 0.02, C.offwhite, { w: 0.21, d: 0.28, h: 0.015, ry: 0.1 });
  mug(b, 0.12, H, 0.1, accent ?? C.orange, 0.4);
  tinyPlant(b, 0.36, H, -0.1, C.offwhite, 0.9);
};

export const bistroTable: ModelFn = ({ b, color, accent }) => {
  const H = 0.75;
  roundTop(b, color ?? C.offwhite, 0.375, 0.04, 0, H, 0);
  b.torus(T.steel, 0.372, 0.014, 0, H - 0.02, 0, { rx: Math.PI / 2, seg: 32, tseg: 6 });
  b.cyl(T.steel, 0.03, H - 0.05, 0, (H - 0.05) / 2, 0, { seg: 10 });
  b.lathe(C.graphite, [[0, 0], [0.25, 0], [0.25, 0.02], [0.08, 0.06], [0, 0.07]], 0, 0, 0, { seg: 22 });
  // vasinho com flor + xícara
  b.lathe(C.sky, [[0, 0], [0.035, 0], [0.04, 0.05], [0.025, 0.11], [0.02, 0.12], [0, 0.12]], 0.06, H, -0.06, { seg: 12 });
  b.cyl(C.leaf, 0.006, 0.12, 0.06, H + 0.17, -0.06, { seg: 5 });
  b.sph(accent ?? C.orange, 0.035, 0.06, H + 0.24, -0.06, { seg: 10 });
  b.sph(C.leafLight, 0.025, 0.085, H + 0.15, -0.05, { sy: 0.5, seg: 8 });
  b.cyl(C.offwhite, 0.06, 0.008, -0.12, H + 0.004, 0.1, { seg: 14 });
  b.cyl(C.offwhite, 0.035, 0.06, -0.12, H + 0.035, 0.1, { seg: 12 });
  b.cyl(C.woodDark, 0.03, 0.006, -0.12, H + 0.064, 0.1, { seg: 12 });
};
