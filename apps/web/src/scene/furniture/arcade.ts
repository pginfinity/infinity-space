import * as THREE from "three";
import { C, T, lit, mix, trs, type ModelFn } from "./core.ts";

/**
 * Móveis do pacote arcade: mesa do jogo da velha, placar de recordes dos fliperamas e lixeira
 * da bolinha de papel. As partes que mudam ao vivo (tabuleiro, ranking, telas) não fazem parte
 * do molde instanciado: a cena do pacote (`activities/arcade`) desenha um plano por objeto
 * nas posições exportadas aqui, para modelo e plano nunca se desalinharem.
 */

/** Cor de destaque do Arcade (mesma da sala no mapa). */
export const ARCADE_ACCENT = "#9B8CFF";

/** Tampo do jogo da velha: lado do quadrado com o tabuleiro ao vivo e altura do plano. */
export const TTT_TOP = { size: 0.62, y: 0.743 };

export const tictactoeTable: ModelFn = ({ b, color }) => {
  const H = 0.74;
  const body = color ?? C.navy;
  // base quadrada e coluna central: lembra um pedestal de jogo, diferente da mesa de xadrez
  b.box(mix(body, C.ink, 0.35), 0.5, 0.05, 0.5, 0, 0.025, 0, { r: 0.02 });
  b.box(body, 0.22, H - 0.12, 0.22, 0, (H - 0.12) / 2 + 0.05, 0, { r: 0.03 });
  b.box(mix(body, C.ink, 0.2), 0.36, 0.04, 0.36, 0, H - 0.09, 0, { r: 0.015 });
  // tampo: moldura clara e acrílico escuro (o plano com a partida fica por cima)
  b.plate(C.offwhite, 0.8, 0.8, 0.045, 0, H - 0.05, 0, { r: 0.05 });
  b.box(T.navyMid, 0.66, 0.006, 0.66, 0, H - 0.002, 0, { r: 0 });
  // filete aceso em volta do tabuleiro
  for (const s of [-1, 1]) {
    b.box(lit(C.signal), 0.68, 0.004, 0.012, 0, H - 0.0035, s * 0.336, { r: 0 });
    b.box(lit(C.signal), 0.012, 0.004, 0.68, s * 0.336, H - 0.0035, 0, { r: 0 });
  }
};

/** Tela do placar de recordes, no espaço do modelo (centro, largura e altura). */
export const BOARD_SCREEN = { w: 2.04, h: 0.98, y: 0.6, z: 0.047 };

export const arcadeBoard: ModelFn = ({ b, accent }) => {
  const W = 2.2;
  const H = 1.2;
  const neon = accent ?? ARCADE_ACCENT;
  b.box(C.ink, W, H, 0.07, 0, H / 2, -0.01, { r: 0.03 });
  b.box(mix(C.ink, neon, 0.18), W - 0.05, H - 0.05, 0.02, 0, H / 2, 0.03, { r: 0.012 });
  // tela apagada por baixo do plano do ranking (aparece se a cena ainda não montou)
  b.box(lit(C.navyDeep), BOARD_SCREEN.w, BOARD_SCREEN.h, 0.006, 0, BOARD_SCREEN.y, 0.041, { r: 0 });
  // filetes neon em volta
  b.box(lit(neon), W - 0.08, 0.016, 0.01, 0, H - 0.03, 0.044, { r: 0 });
  b.box(lit(neon), W - 0.08, 0.016, 0.01, 0, 0.03, 0.044, { r: 0 });
  for (const s of [-1, 1]) b.box(lit(neon), 0.016, H - 0.08, 0.01, s * (W / 2 - 0.03), H / 2, 0.044, { r: 0 });
  // botões de fliperama decorativos no canto
  [C.orange, C.signal, C.gold].forEach((c, i) => b.cyl(c, 0.028, 0.03, W / 2 - 0.1 - i * 0.075, -0.035, 0.03, { rx: Math.PI / 2, seg: 12 }));
  b.box(C.ink, 0.28, 0.08, 0.06, W / 2 - 0.175, -0.035, 0.0, { r: 0.02 });
};

export const trashBin: ModelFn = ({ b, color }) => {
  const body = color ?? T.steelDark;
  // cesto aberto: parede fina (perfil de fora sobe, perfil de dentro desce)
  b.lathe(
    body,
    [
      [0, 0.01],
      [0.13, 0],
      [0.165, 0.46],
      [0.175, 0.47],
      [0.175, 0.49],
      [0.155, 0.49],
      [0.145, 0.46],
      [0.115, 0.03],
      [0, 0.03],
    ],
    0,
    0,
    0,
    { seg: 18 },
  );
  b.torus(T.steel, 0.17, 0.012, 0, 0.49, 0, { rx: Math.PI / 2, seg: 22, tseg: 5 });
  // papel amassado lá dentro: esferas facetadas parecem bolinhas de papel
  const paper = C.offwhite;
  b.sph(paper, 0.055, -0.04, 0.38, 0.02, { seg: 5 });
  b.sph(mix(paper, C.cream, 0.6), 0.05, 0.05, 0.4, -0.03, { seg: 5 });
  b.sph(paper, 0.045, 0.01, 0.43, 0.06, { seg: 5 });
  // faixa colorida para achar a lixeira de longe
  b.cyl(mix(C.signal, C.navy, 0.2), 0.152, 0.05, 0, 0.24, 0, { rt: 0.158, seg: 18, open: true });
};

/**
 * Plano do tabuleiro ao vivo de cada mesa de jogo, no espaço do modelo.
 * `crop` recorta a textura (u0, v0, u1, v1); `both` = vertical, com um plano em cada face.
 */
export interface TopPlane {
  w: number;
  h: number;
  m: THREE.Matrix4;
  crop?: [number, number, number, number];
  both?: boolean;
}

export function liveTopPlane(type: string): TopPlane | null {
  if (type === "chess-table") {
    // tabuleiro 8 × 0,078 m = 480 px da textura de 512 px
    const s = (0.078 * 8 * 512) / 480;
    return { w: s, h: s, m: trs(0, 0.7475, 0, { rx: -Math.PI / 2 }) };
  }
  if (type === "tictactoe-table") return { w: TTT_TOP.size, h: TTT_TOP.size, m: trs(0, TTT_TOP.y, 0, { rx: -Math.PI / 2 }) };
  if (type === "connect4-table") {
    // grade em pé: 7 colunas de 0,074 m = 484 px; recorte da moldura desenhada na textura
    const k = (0.074 * 7) / 484;
    const x0 = 8;
    const x1 = 504;
    const cell = 484 / 7;
    const y0 = (512 - cell * 6) / 2 - 6;
    const y1 = 512 - y0;
    return {
      w: (x1 - x0) * k,
      h: (y1 - y0) * k,
      m: trs(0, 0.825 + 0.222, 0.0205),
      crop: [x0 / 512, 1 - y1 / 512, x1 / 512, 1 - y0 / 512],
      both: true,
    };
  }
  return null;
}
