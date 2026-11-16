import * as THREE from "three";
import { Builder, C, T, lit, mix, type ModelFn } from "./core.ts";
import { at } from "./kit.ts";

/**
 * Móveis do pacote "vivo": telescópio, quadro de giz da copa e estação de rega.
 * O texto que muda (contador do dia, plantas felizes) é desenhado à parte, pela atividade,
 * num plano encaixado nas faces descritas em CHALK_FACE e SIGN_FACE.
 */

const brass = mix(C.gold, C.woodDark, 0.18);
const slateBoard = "#1E2B2A";

/**
 * Faces onde a atividade desenha texto, no referencial do objeto: a prancha sai de (0, 0, z),
 * inclina `tilt` em torno do eixo lateral e a face fica a `y` de altura ao longo dela (e `off` à frente).
 */
export interface Face {
  w: number;
  h: number;
  z: number;
  tilt: number;
  y: number;
  off: number;
}
/** Frente do cavalete de giz. */
export const CHALK_FACE: Face = { w: 0.56, h: 0.8, z: 0.28, tilt: -0.23, y: 0.72, off: 0.013 };
/** Plaquinha da estação de rega. */
export const SIGN_FACE: Face = { w: 0.42, h: 0.2, z: -0.08, tilt: -0.05, y: 0.98, off: 0.008 };

export const telescope: ModelFn = ({ b }) => {
  // tripé de madeira com bandeja de acessórios
  const top = 1.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    b.rod(C.wood, 0.022, Math.sin(a) * 0.34, 0, Math.cos(a) * 0.34, Math.sin(a) * 0.05, top, Math.cos(a) * 0.05, { rt: 0.016, seg: 8 });
    b.sph(C.woodDark, 0.026, Math.sin(a) * 0.34, 0.02, Math.cos(a) * 0.34, { seg: 8 });
  }
  b.cyl(mix(C.wood, C.woodDark, 0.4), 0.17, 0.02, 0, 0.42, 0, { seg: 3, ry: Math.PI / 6 });
  b.cyl(C.navy, 0.07, 0.08, 0, top + 0.03, 0, { seg: 14 });
  b.sph(brass, 0.05, 0, top + 0.09, 0, { seg: 12 });
  // tubo inclinado para a janela (+Z), azul-marinho com anéis de latão
  b.push(0, top + 0.13, 0, { rx: -0.42 });
  b.cyl(C.navy, 0.065, 0.95, 0, 0, 0.12, { rx: Math.PI / 2, rt: 0.075, seg: 18 });
  b.cyl(brass, 0.082, 0.05, 0, 0, 0.58, { rx: Math.PI / 2, seg: 18 });
  b.cyl(brass, 0.072, 0.03, 0, 0, -0.1, { rx: Math.PI / 2, seg: 16 });
  b.cyl(brass, 0.074, 0.03, 0, 0, 0.24, { rx: Math.PI / 2, seg: 16 });
  b.cyl(lit(mix(C.sky, C.navyDeep, 0.35)), 0.068, 0.006, 0, 0, 0.6, { rx: Math.PI / 2, seg: 16 });
  // ocular e buscador
  b.cyl(C.ink, 0.03, 0.12, 0, 0, -0.4, { rx: Math.PI / 2, rt: 0.022, seg: 10 });
  b.cyl(brass, 0.034, 0.03, 0, 0, -0.33, { rx: Math.PI / 2, seg: 10 });
  b.cyl(C.offwhite, 0.022, 0.3, 0, 0.1, 0.08, { rx: Math.PI / 2, seg: 10 });
  b.box(brass, 0.02, 0.05, 0.02, 0, 0.065, 0.0, { r: 0.004 });
  b.box(brass, 0.02, 0.05, 0.02, 0, 0.065, 0.16, { r: 0.004 });
  b.pop();
  // plaquinha de latão no tripé
  b.box(brass, 0.12, 0.05, 0.01, 0, 0.62, 0.11, { r: 0.004, rx: -0.15 });
};

export const chalkboard: ModelFn = ({ b }) => {
  // cavalete A: duas pranchas apoiadas uma na outra, com a frente virada para +Z
  const wood = C.wood;
  const H = 1.22;
  const lean = -CHALK_FACE.tilt;
  for (const side of [1, -1]) {
    b.push(0, 0, side * CHALK_FACE.z, { rx: side * -lean });
    for (const sx of [-1, 1]) b.box(wood, 0.05, H, 0.04, sx * 0.31, H / 2, 0, { r: 0.012 });
    b.box(wood, 0.66, 0.06, 0.045, 0, H - 0.05, 0, { r: 0.014 });
    b.box(wood, 0.66, 0.05, 0.045, 0, 0.27, 0, { r: 0.012 });
    b.box(slateBoard, CHALK_FACE.w + 0.02, CHALK_FACE.h + 0.02, 0.02, 0, CHALK_FACE.y, 0, { r: 0.004 });
    b.pop();
  }
  // bandejinha com giz na frente
  b.push(0, 0, CHALK_FACE.z, { rx: -lean });
  b.box(wood, 0.6, 0.025, 0.07, 0, 0.3, 0.04, { r: 0.008 });
  b.cyl(C.offwhite, 0.009, 0.07, -0.12, 0.322, 0.05, { rz: Math.PI / 2, seg: 6 });
  b.cyl(C.pink, 0.009, 0.05, -0.02, 0.322, 0.055, { rz: Math.PI / 2 + 0.3, seg: 6 });
  b.cyl(C.sky, 0.009, 0.06, 0.1, 0.322, 0.045, { rz: Math.PI / 2 - 0.2, seg: 6 });
  b.pop();
  // pezinhos e corrente
  for (const side of [1, -1]) for (const sx of [-1, 1]) b.box(C.woodDark, 0.06, 0.03, 0.06, sx * 0.31, 0.015, side * CHALK_FACE.z, { r: 0.01 });
};

/** Regador pequeno (igual ao da mão), apoiado numa superfície. */
function can(b: Builder, x: number, y: number, z: number, ry: number, body: string): void {
  b.at(x, y, z, { ry }, () => {
    b.lathe(body, [[0, 0], [0.09, 0], [0.1, 0.03], [0.1, 0.15], [0.078, 0.18], [0, 0.18]], 0, 0, 0, { seg: 16, sz: 0.8 });
    b.lathe(C.navy, [[0.101, 0], [0.101, 0.02]], 0, 0.03, 0, { seg: 16, sz: 0.8 });
    b.torus(C.navy, 0.08, 0.013, 0, 0.18, -0.01, { arc: Math.PI, seg: 12, tseg: 6 });
    b.rod(body, 0.014, 0, 0.04, 0.07, 0, 0.2, 0.27, { rt: 0.01, seg: 8 });
    b.cyl(C.navy, 0.022, 0.025, 0, 0.21, 0.28, { rx: 0.9, rt: 0.032, seg: 10 });
  });
}

/** Vasinho de muda. */
function seedling(b: Builder, x: number, y: number, z: number, s = 1): void {
  b.lathe(mix(C.orange, C.woodDark, 0.45), [[0, 0], [0.045 * s, 0], [0.06 * s, 0.09 * s], [0, 0.085 * s]], x, y, z, { seg: 12 });
  b.cyl(C.woodDark, 0.052 * s, 0.006, x, y + 0.083 * s, z, { seg: 10 });
  b.sph(C.leafLight, 0.03 * s, x - 0.02 * s, y + 0.12 * s, z, { sx: 1.3, sy: 0.5, seg: 8, rz: 0.5 });
  b.sph(C.leaf, 0.03 * s, x + 0.02 * s, y + 0.125 * s, z, { sx: 1.3, sy: 0.5, seg: 8, rz: -0.5 });
}

export const wateringStation: ModelFn = ({ b }) => {
  // banquinho de jardinagem em madeira clara
  const W = 0.88;
  const D = 0.42;
  const H = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.wood, 0.05, H, 0.05, sx * (W / 2 - 0.04), H / 2, sz * (D / 2 - 0.04), { r: 0.012 });
  b.plate(C.woodLight, W, D, 0.04, 0, H - 0.04, 0, { r: 0.02 });
  b.plate(mix(C.woodLight, C.wood, 0.3), W - 0.08, D - 0.06, 0.03, 0, 0.16, 0, { r: 0.01 });
  // na prateleira de baixo: saco de terra e pazinha
  b.box(mix(C.woodDark, C.leaf, 0.2), 0.3, 0.16, 0.2, -0.18, 0.27, 0.0, { r: 0.05 });
  b.box(C.offwhite, 0.16, 0.06, 0.005, -0.18, 0.29, 0.101, { r: 0 });
  b.rod(C.graphite, 0.01, 0.14, 0.2, 0.05, 0.3, 0.24, -0.05, { seg: 6 });
  b.box(T.steel, 0.07, 0.01, 0.1, 0.12, 0.195, 0.07, { r: 0.004, ry: 0.4 });
  // em cima: dois regadores e mudas
  can(b, -0.2, H, 0.02, 0.5, C.sky);
  can(b, 0.12, H, -0.04, -0.3, mix(C.sky, C.navy, 0.3));
  seedling(b, 0.33, H, 0.1, 1);
  seedling(b, 0.34, H, -0.08, 0.85);
  // plaquinha de madeira atrás (o número de plantas felizes é desenhado por cima)
  b.box(C.woodDark, 0.03, 0.4, 0.03, 0, H + 0.2, SIGN_FACE.z - 0.1, { r: 0.008 });
  b.at(0, 0, SIGN_FACE.z, { rx: SIGN_FACE.tilt }, () => {
    b.box(C.wood, SIGN_FACE.w + 0.04, SIGN_FACE.h + 0.04, 0.025, 0, SIGN_FACE.y, -0.01, { r: 0.012 });
    b.box(lit(mix(C.cream, C.woodLight, 0.2)), SIGN_FACE.w, SIGN_FACE.h, 0.004, 0, SIGN_FACE.y, 0.004, { r: 0 });
  });
};

/** Matriz local de uma face (para a atividade encaixar o texto). */
export function faceMatrix(face: Face, out = new THREE.Matrix4()): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(0, 0, face.z);
  m.multiply(new THREE.Matrix4().makeRotationX(face.tilt));
  m.multiply(new THREE.Matrix4().makeTranslation(0, face.y, face.off));
  return out.copy(m);
}

void at;
