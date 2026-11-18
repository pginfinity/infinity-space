import { C, mix, trs, type Builder, type ModelFn } from "./core.ts";
import type { TopPlane } from "./arcade.ts";

/**
 * Mesas de jogo do café: damas (para dois), dominó e truco (para quatro). Como nas mesas do Arcade,
 * a partida não faz parte do molde: a cena do pacote arcade (`activities/arcade/tables.tsx`) põe um
 * plano com a textura ao vivo no tampo, na posição exportada aqui (`cafeTopPlane`).
 */

const H = 0.74;

/** Tampo de cada mesa com a partida ao vivo: lado do quadrado e altura do plano. */
export const CAFE_TOP = {
  "checkers-table": { size: 0.66, y: H + 0.0035 },
  "domino-table": { size: 0.8, y: H + 0.003 },
  "cards-table": { size: 0.8, y: H + 0.007 },
} as const;

export function cafeTopPlane(type: string): TopPlane | null {
  const top = CAFE_TOP[type as keyof typeof CAFE_TOP];
  return top ? { w: top.size, h: top.size, m: trs(0, top.y, 0, { rx: -Math.PI / 2 }) } : null;
}

/** Quatro pés com travessas baixas (mesa de madeira de boteco). */
function legs(b: Builder, wood: string, half: number, thick: number): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(wood, thick, H - 0.05, thick, sx * half, (H - 0.05) / 2, sz * half, { r: 0.012 });
  for (const s of [-1, 1]) {
    b.box(wood, half * 2, 0.035, 0.025, 0, 0.17, s * half, { r: 0.008 });
    b.box(wood, 0.025, 0.035, half * 2, s * half, 0.17, 0, { r: 0.008 });
  }
}

export const checkersTable: ModelFn = ({ b, color }) => {
  const wood = color ?? C.wood;
  legs(b, C.woodDark, 0.33, 0.05);
  b.plate(wood, 0.8, 0.8, 0.05, 0, H - 0.05, 0, { r: 0.04 });
  // moldura escura do tabuleiro (o tabuleiro e as peças vêm no plano ao vivo)
  b.box(mix(C.woodDark, C.ink, 0.25), 0.68, 0.006, 0.68, 0, H + 0.001, 0, { r: 0 });
  // pilhas de peças guardadas nos cantos
  for (const [x, z, c] of [
    [0.365, 0.365, C.offwhite],
    [-0.365, -0.365, C.graphite],
  ] as const) {
    for (let i = 0; i < 3; i++) b.cyl(c, 0.022, 0.011, x, H + 0.006 + i * 0.012, z, { seg: 14 });
  }
};

export const dominoTable: ModelFn = ({ b, color }) => {
  const wood = color ?? C.woodDark;
  legs(b, mix(C.woodDark, C.ink, 0.3), 0.38, 0.055);
  b.plate(wood, 0.9, 0.9, 0.05, 0, H - 0.05, 0, { r: 0.03 });
  // borda levemente alta em volta do tampo (as pedras não escorregam)
  const rim = mix(C.woodDark, C.ink, 0.35);
  for (const s of [-1, 1]) {
    b.box(rim, 0.9, 0.018, 0.05, 0, H + 0.009, s * 0.425, { r: 0.006 });
    b.box(rim, 0.05, 0.018, 0.8, s * 0.425, H + 0.009, 0, { r: 0.006 });
  }
};

export const cardsTable: ModelFn = ({ b, color }) => {
  const wood = color ?? C.wood;
  legs(b, C.woodDark, 0.38, 0.05);
  b.plate(wood, 0.9, 0.9, 0.05, 0, H - 0.05, 0, { r: 0.03 });
  // feltro verde por baixo do plano ao vivo e almofada de couro em volta
  b.box(mix(C.leaf, C.navy, 0.4), 0.8, 0.006, 0.8, 0, H + 0.003, 0, { r: 0 });
  for (const s of [-1, 1]) {
    b.box(C.leather, 0.9, 0.03, 0.05, 0, H + 0.015, s * 0.425, { r: 0.012 });
    b.box(C.leather, 0.05, 0.03, 0.8, s * 0.425, H + 0.015, 0, { r: 0.012 });
  }
};
