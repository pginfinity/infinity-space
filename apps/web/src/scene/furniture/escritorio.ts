import { C, lit, mix, type ModelFn } from "./core.ts";
import { pencilCup } from "./kit.ts";

/**
 * Móveis do pacote "escritorio". Base em y = 0, fundo em z = -d/2 encostado na parede, frente para +Z.
 */

/** Medidas do mural (a textura com os recados reais cobre a área de cortiça, ver NOTICE_CORK). */
export const NOTICE_W = 2.0;
export const NOTICE_H = 1.25;
/** Área de cortiça no espaço do modelo: centro (x, y, z da face) e tamanho. */
export const NOTICE_CORK = { x: 0, y: 0.585, z: 0.026, w: 1.86, h: 1.03 };

/** Mural de recados: moldura de madeira, cortiça, faixa navy no topo e uma canaleta com canetas. */
export const noticeBoard: ModelFn = ({ b }) => {
  const W = NOTICE_W;
  const H = NOTICE_H;
  const frame = C.wood;
  const cork = "#C79A68";
  // fundo e moldura
  b.box(mix(frame, C.woodDark, 0.4), W, H, 0.03, 0, H / 2, -0.025, { r: 0.012 });
  b.box(frame, W, 0.06, 0.06, 0, H - 0.03, 0, { r: 0.02 });
  b.box(frame, W, 0.06, 0.06, 0, 0.03, 0, { r: 0.02 });
  b.box(frame, 0.06, H, 0.06, -W / 2 + 0.03, H / 2, 0, { r: 0.02 });
  b.box(frame, 0.06, H, 0.06, W / 2 - 0.03, H / 2, 0, { r: 0.02 });
  // cortiça (fica atrás da textura dos recados)
  const k = NOTICE_CORK;
  b.box(cork, k.w, k.h, 0.02, k.x, k.y, k.z - 0.012, { r: 0 });
  // faixa do título com "letras" acesas e um ponto de destaque
  b.box(C.navy, W - 0.14, 0.1, 0.02, 0, H - 0.1, 0.03, { r: 0.008 });
  for (let i = 0; i < 6; i++) b.box(lit(C.offwhite), 0.07, 0.03, 0.006, -0.24 + i * 0.096, H - 0.1, 0.042, { r: 0 });
  b.sph(lit(C.signal), 0.018, -0.42, H - 0.1, 0.044, { seg: 8 });
  // canaleta com canetas e um bloquinho de post-its
  b.box(frame, W * 0.7, 0.03, 0.09, 0, 0.0, 0.05, { r: 0.01 });
  b.box(mix(frame, C.woodDark, 0.3), W * 0.7, 0.04, 0.012, 0, 0.025, 0.093, { r: 0.004 });
  pencilCup(b, 0.55, 0.015, 0.05, C.navy);
  b.box("#F6D86B", 0.1, 0.03, 0.1, -0.5, 0.03, 0.05, { r: 0.004 });
  b.box("#8FD3F4", 0.1, 0.02, 0.1, -0.36, 0.025, 0.05, { r: 0.004, ry: 0.3 });
};
