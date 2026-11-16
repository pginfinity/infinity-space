import * as THREE from "three";
import { C, T, lit, litClear, mix, poly, trs, type ModelFn } from "./core.ts";
import { at } from "./kit.ts";

/**
 * Móveis do pacote "grupo" (jogos de grupo).
 *
 * Cavalete do Stop: quadro-negro de café em "A", com moldura de madeira, bandeja de giz e uma
 * plaquinha redonda de roleta no topo. A face do quadro fica lisa: o jogo desenha por cima
 * (ver activities/grupo/stop) o letreiro de giz, a letra sorteada e o tempo, nas duas lentes.
 */

/** Medidas do quadro da frente, no espaço do modelo (usadas pela cena do Stop para alinhar a textura). */
export const STOP_BOARD = {
  /** Altura da dobradiça (topo do "A"). */
  hinge: 1.5,
  /** Afastamento dos pés em relação ao centro, no chão. */
  foot: 0.29,
  /** Largura e altura do quadro-negro (sem a moldura). */
  w: 0.8,
  h: 1.1,
  /** Distância da dobradiça até o centro do quadro, ao longo do painel. */
  center: 0.7,
  /** Quanto a face do quadro fica à frente do plano do painel. */
  face: 0.027,
};

/** Inclinação do painel (rotação em X): negativa abre a frente para +Z. */
export const STOP_BOARD_TILT = -Math.atan2(STOP_BOARD.foot, STOP_BOARD.hinge);

/** Matriz local (espaço do modelo) do centro da face do quadro, olhando para a frente. */
export function stopBoardFaceMatrix(out = new THREE.Matrix4()): THREE.Matrix4 {
  const hinge = trs(0, STOP_BOARD.hinge, 0, { rx: STOP_BOARD_TILT });
  return out.multiplyMatrices(hinge, new THREE.Matrix4().makeTranslation(0, -STOP_BOARD.center, STOP_BOARD.face + 0.004));
}

const SLATE = "#22302C";

export const stopBoard: ModelFn = ({ b, accent }) => {
  const S = STOP_BOARD;
  const wood = C.wood;
  const woodHi = mix(C.wood, C.woodLight, 0.45);
  const len = Math.hypot(S.hinge, S.foot) + 0.02;
  const fw = S.w + 0.12;

  // Painel da frente (com o quadro) e painel de trás (madeira lisa), presos na dobradiça.
  for (const side of [1, -1]) {
    b.push(0, S.hinge, 0, { rx: side * STOP_BOARD_TILT });
    // montantes laterais (viram os pés)
    for (const sx of [-1, 1]) b.box(wood, 0.06, len, 0.045, sx * (fw / 2 - 0.03), -len / 2, 0, { r: 0.012 });
    if (side === 1) {
      // travessas da moldura e o quadro-negro
      b.box(woodHi, fw, 0.06, 0.045, 0, -S.center + S.h / 2 + 0.03, 0, { r: 0.012 });
      b.box(woodHi, fw, 0.06, 0.045, 0, -S.center - S.h / 2 - 0.03, 0, { r: 0.012 });
      b.box(SLATE, S.w, S.h, 0.03, 0, -S.center, 0.006, { r: 0.004 });
      // bandeja do giz com dois gizes e um apagador
      const ty = -S.center - S.h / 2 - 0.075;
      b.box(woodHi, fw - 0.04, 0.025, 0.09, 0, ty, 0.05, { r: 0.008 });
      b.box(wood, fw - 0.04, 0.035, 0.012, 0, ty + 0.02, 0.092, { r: 0.004 });
      b.cyl(C.offwhite, 0.011, 0.09, -0.16, ty + 0.025, 0.05, { rz: Math.PI / 2, seg: 6 });
      b.cyl(C.pink, 0.011, 0.07, -0.04, ty + 0.025, 0.06, { rz: Math.PI / 2 + 0.2, seg: 6 });
      b.box(C.woodDark, 0.12, 0.035, 0.05, 0.18, ty + 0.03, 0.05, { r: 0.01 });
      b.box(C.slate, 0.12, 0.012, 0.05, 0.18, ty + 0.012, 0.05, { r: 0.004 });
    } else {
      b.box(mix(wood, C.woodDark, 0.25), fw - 0.06, S.h + 0.1, 0.02, 0, -S.center, 0, { r: 0.006 });
    }
    // ponteiras de borracha nos pés
    for (const sx of [-1, 1]) b.box(C.ink, 0.07, 0.04, 0.055, sx * (fw / 2 - 0.03), -len + 0.02, 0, { r: 0.012 });
    b.pop();
  }

  // Corrente de segurança entre os painéis e a dobradiça de metal.
  for (const sx of [-1, 1]) b.rod(C.metal, 0.006, sx * (fw / 2 - 0.07), 0.55, S.foot * 0.62, sx * (fw / 2 - 0.07), 0.55, -S.foot * 0.62, { seg: 5 });
  b.cyl(C.metal, 0.02, fw - 0.02, 0, S.hinge, 0, { rz: Math.PI / 2, seg: 8 });

  // Roleta de letras no topo: aro de madeira, gomos alternados e um ponteiro em cima.
  const top = S.hinge + 0.03;
  b.box(C.woodDark, 0.05, 0.08, 0.05, 0, top + 0.03, 0, { r: 0.01 });
  const wedge = [C.cream, accent ?? C.orange, C.offwhite, mix(C.cream, C.woodLight, 0.6)];
  b.at(0, top + 0.21, 0, {}, () => {
    b.cyl(C.woodDark, 0.16, 0.04, 0, 0, 0, { rx: Math.PI / 2, seg: 24 });
    for (let i = 0; i < 8; i++) b.cyl(wedge[i % wedge.length]!, 0.138, 0.046, 0, 0, 0, { rx: Math.PI / 2, ts: (i / 8) * Math.PI * 2, tl: Math.PI / 4, seg: 4 });
    // marquinhas brancas entre os gomos
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(C.woodDark, 0.008, 0.13, 0.006, Math.sin(a) * 0.069, Math.cos(a) * 0.069, 0.025, { rz: -a, r: 0 });
    }
    b.cyl(C.woodDark, 0.026, 0.056, 0, 0, 0.004, { rx: Math.PI / 2, seg: 12 });
    // ponteiro (triângulo) apontando para o gomo de cima
    b.front(C.graphite, poly([[-0.03, 0.05], [0.03, 0.05], [0, -0.012]]), 0.02, 0, 0.16, 0.03);
  });
};

/**
 * Terminal de missões (Impostor na Estação): pedestal com tampo inclinado de comando, mini mapa
 * da estação aceso e a estação em holograma girando por cima. Fica no Átrio, perto do lounge.
 */
export const missionConsole: ModelFn = ({ b, accent }) => {
  const glowC = accent ?? C.signal;
  b.box(C.graphite, 0.86, 0.07, 0.66, 0, 0.035, 0, { r: 0.025 });
  b.box(C.navy, 0.62, 0.86, 0.46, 0, 0.5, -0.02, { r: 0.04 });
  // faixas de luz na frente do pedestal
  b.box(lit(glowC), 0.5, 0.022, 0.01, 0, 0.78, 0.212, { r: 0 });
  b.box(lit(mix(glowC, C.navy, 0.45)), 0.5, 0.014, 0.01, 0, 0.2, 0.212, { r: 0 });
  // tampo inclinado com a tela do mapa
  const tilt = -0.42;
  b.at(0, 0.98, 0.04, { rx: tilt }, () => {
    b.box(C.graphite, 0.8, 0.05, 0.5, 0, 0, 0, { r: 0.02 });
    b.box(lit(T.screen), 0.62, 0.012, 0.36, 0, 0.03, 0.01, { r: 0 });
    const room = lit(mix(T.screen, glowC, 0.45));
    const rooms: [number, number, number, number][] = [
      [-0.21, -0.11, 0.14, 0.08],
      [-0.04, -0.11, 0.14, 0.08],
      [0.13, -0.11, 0.14, 0.08],
      [-0.21, 0.02, 0.14, 0.1],
      [0.13, 0.02, 0.14, 0.1],
      [-0.12, 0.13, 0.2, 0.06],
      [0.12, 0.13, 0.2, 0.06],
    ];
    for (const [x, z, w, d] of rooms) b.box(room, w, 0.006, d, x, 0.038, z, { r: 0 });
    b.cyl(lit(glowC), 0.04, 0.008, -0.04, 0.04, 0.02, { seg: 14 });
    // alerta laranja (a "reunião de emergência") e dois botões
    b.cyl(C.ink, 0.045, 0.02, 0.33, 0.03, 0.12, { seg: 14 });
    b.cyl(lit(C.orange), 0.034, 0.03, 0.33, 0.04, 0.12, { seg: 14 });
    b.box(lit(C.sky), 0.05, 0.016, 0.03, 0.33, 0.035, -0.02, { r: 0.004 });
    b.box(lit(C.offwhite), 0.05, 0.016, 0.03, 0.33, 0.035, -0.08, { r: 0.004 });
  });
  // emissor e feixe do holograma
  b.cyl(C.graphite, 0.09, 0.08, 0, 1.12, -0.16, { seg: 16 });
  b.cyl(lit(glowC), 0.06, 0.01, 0, 1.165, -0.16, { seg: 16 });
  b.cyl(litClear(glowC, 0.1), 0.06, 0.42, 0, 1.38, -0.16, { rt: 0.26, open: true, seg: 20 });
  b.anim(
    (s) => {
      const hc = litClear(glowC, 0.5);
      // a estação em miniatura: um deck retangular com salas e o átrio no meio
      s.box(hc, 0.44, 0.012, 0.26, 0, 0, 0, { r: 0 });
      for (const x of [-0.15, 0, 0.15]) s.box(litClear(C.sky, 0.45), 0.12, 0.05, 0.08, x, 0.03, -0.08, { r: 0 });
      for (const x of [-0.15, 0.15]) s.box(litClear(C.sky, 0.45), 0.12, 0.05, 0.08, x, 0.03, 0.08, { r: 0 });
      s.cyl(litClear(C.orange, 0.85), 0.03, 0.08, 0, 0.05, 0.08, { seg: 10 });
      s.torus(litClear(glowC, 0.35), 0.3, 0.005, 0, 0, 0, { rx: Math.PI / 2, seg: 36, tseg: 3 });
    },
    {
      copies: [at(0, 1.62, -0.16)],
      pose: (t, seed, _k, out) => {
        out.makeRotationY(t * 0.5 + seed * 6);
        out.setPosition(0, Math.sin(t * 1.4 + seed * 3) * 0.025, 0);
      },
    },
  );
};
