import { C, T, lit, mix, type ModelFn } from "./core.ts";
import { book, deskLamp, mug } from "./kit.ts";

/**
 * Móvel do pacote "foco": a mesa de foco do corredorzinho Foco. Frente (+Z) = lado de quem senta;
 * o fundo encosta na parede. Quatro lugares (um por baia de feltro) e, no centro, o suporte do relógio
 * do Pomodoro: o anel de progresso que flutua em cima dele é desenhado pela atividade (FOCO_CLOCK).
 */

/** Onde fica o relógio, no referencial da mesa: centro do anel (x, y, z) e raio (o anel vira para a câmera). */
export const FOCO_CLOCK = { x: 0, y: 1.5, z: -0.12, r: 0.3 } as const;

const W = 3.6;
const D = 0.7;
const H = 0.75;
/** Centro de cada lugar ao longo da mesa. */
const SEATS = [-1.275, -0.425, 0.425, 1.275];

export const focusTable: ModelFn = ({ b }) => {
  const felt = T.felt;
  // tampo de madeira clara com borda navy
  b.plate(C.navy, W, D, 0.03, 0, H - 0.07, 0, { r: 0.05 });
  b.plate(C.woodLight, W - 0.02, D - 0.02, 0.045, 0, H - 0.045, 0, { r: 0.05 });
  // pés de painel e travessa
  for (const sx of [-1, 1]) b.box(C.navy, 0.07, H - 0.08, D - 0.14, sx * (W / 2 - 0.1), (H - 0.08) / 2, 0, { r: 0.03 });
  b.box(mix(C.navy, C.slate, 0.15), W - 0.3, 0.3, 0.03, 0, H - 0.26, -D / 2 + 0.1, { r: 0.012 });

  // painel acústico de feltro no fundo, dividido em baias (uma por lugar)
  const panelH = 0.42;
  b.box(felt, W - 0.06, panelH, 0.05, 0, H + panelH / 2, -D / 2 + 0.04, { r: 0.02 });
  b.box(C.woodLight, W - 0.04, 0.025, 0.07, 0, H + panelH + 0.012, -D / 2 + 0.04, { r: 0.01 });
  for (const x of [-0.85, 0.85]) {
    // divisórias baixas entre as baias (o meio fica livre para o relógio)
    b.box(felt, 0.035, 0.26, 0.3, x, H + 0.13, -D / 2 + 0.2, { r: 0.012 });
    deskLamp(b, x, H, -D / 2 + 0.16, { color: C.graphite, ry: x < 0 ? 0.5 : -0.5 });
  }

  // suporte do relógio: base com filete de luz e haste (o anel, que gira para quem olha, vem da atividade)
  const { x: cx, y: cy, z: cz, r } = FOCO_CLOCK;
  const top = cy - r - 0.05;
  b.puck(C.graphite, 0.11, 0.035, cx, H, cz, { bevel: 0.012, seg: 22 });
  b.cyl(lit(C.signal), 0.085, 0.006, cx, H + 0.036, cz, { seg: 22 });
  b.cyl(T.steelDark, 0.014, top - H, cx, H + (top - H) / 2, cz, { seg: 8 });
  b.sph(T.steelDark, 0.026, cx, top, cz, { seg: 10 });

  // um caderno e uma caneta em cada lugar; uma caneca e livros aqui e ali
  SEATS.forEach((x, i) => {
    b.box(i % 2 ? C.offwhite : C.cream, 0.2, 0.012, 0.27, x + 0.05, H + 0.006, 0.12, { r: 0.004, ry: i % 2 ? 0.12 : -0.08 });
    b.cyl(i === 2 ? C.orange : C.navy, 0.008, 0.15, x + 0.2, H + 0.01, 0.12, { rx: Math.PI / 2, seg: 6 });
  });
  mug(b, SEATS[0]! - 0.28, H, -0.05, C.offwhite, 0.4);
  mug(b, SEATS[3]! + 0.3, H, 0.0, C.signal, -0.6);
  book(b, SEATS[1]! - 0.25, H, -0.18, C.signal, { ry: 0.25 });
  book(b, SEATS[2]! + 0.25, H, -0.2, C.cream, { ry: -0.15 });
};
