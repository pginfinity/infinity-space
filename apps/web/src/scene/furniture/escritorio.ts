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

/** Medidas do mural de fotos da copa (a textura com as fotos reais cobre a área de feltro, ver PHOTOWALL_FELT). */
export const PHOTOWALL_W = 1.7;
export const PHOTOWALL_H = 1.1;
/** Área de feltro no espaço do modelo: centro (x, y, z da face) e tamanho. */
export const PHOTOWALL_FELT = { x: 0, y: 0.55, z: 0.02, w: 1.6, h: 1.0 };
/** Cor do feltro (a textura começa desta cor, para não mudar quando ela chega). */
export const PHOTOWALL_FELT_COLOR = "#1B2B45";

/** Mural de fotos da copa: moldura de madeira clara, feltro azul-marinho e um ganchinho de cada lado. */
export const photoWall: ModelFn = ({ b }) => {
  const W = PHOTOWALL_W;
  const H = PHOTOWALL_H;
  const frame = C.woodLight;
  // fundo e moldura
  b.box(mix(frame, C.woodDark, 0.45), W, H, 0.03, 0, H / 2, -0.02, { r: 0.012 });
  b.box(frame, W, 0.05, 0.05, 0, H - 0.025, 0, { r: 0.016 });
  b.box(frame, W, 0.05, 0.05, 0, 0.025, 0, { r: 0.016 });
  b.box(frame, 0.05, H, 0.05, -W / 2 + 0.025, H / 2, 0, { r: 0.016 });
  b.box(frame, 0.05, H, 0.05, W / 2 - 0.025, H / 2, 0, { r: 0.016 });
  // feltro (fica atrás da textura das fotos)
  const f = PHOTOWALL_FELT;
  b.box(PHOTOWALL_FELT_COLOR, f.w, f.h, 0.02, f.x, f.y, f.z - 0.012, { r: 0 });
  // ganchos de latão onde os varais se prendem, nas laterais
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) b.sph(C.gold, 0.012, side * (W / 2 - 0.07), H - 0.159 - i * 0.3, 0.035, { seg: 8 });
};
