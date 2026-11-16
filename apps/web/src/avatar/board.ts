import * as THREE from "three";
import { Builder, C, lit, mix, type Mold } from "../scene/furniture/core.ts";

/**
 * Prancha flutuante: aparece sob os pés quando a pessoa corre (Shift), nas duas lentes.
 * Deque azul-marinho com faixa clara, luz azul por baixo e dois propulsores atrás.
 * Geometria e materiais compartilhados por todos os avatares (não descartar).
 * Frente para +Z (a direção em que o avatar olha), base em y = 0.
 */

let parts: Mold["parts"] | null = null;
let glowGeo: THREE.BufferGeometry | null = null;
let glowMat: THREE.MeshBasicMaterial | null = null;

function build(): Mold["parts"] {
  const b = new Builder();
  const deck = C.navy;
  // deque arredondado com as pontas levantadas
  b.plate(deck, 0.36, 0.86, 0.035, 0, 0.06, 0, { r: 0.16 });
  b.box(mix(deck, C.signal, 0.25), 0.3, 0.022, 0.12, 0, 0.075, 0.42, { r: 0.01, rx: -0.35 });
  b.box(mix(deck, C.signal, 0.25), 0.3, 0.022, 0.12, 0, 0.075, -0.42, { r: 0.01, rx: 0.35 });
  // lixa clara com a faixa do meio
  b.plate(mix(C.navy, C.slate, 0.35), 0.3, 0.72, 0.006, 0, 0.096, 0, { r: 0.13 });
  b.box(lit(C.sky), 0.04, 0.004, 0.62, 0, 0.1, 0, { r: 0 });
  // luz por baixo e propulsores
  b.plate(lit(C.signal), 0.24, 0.6, 0.006, 0, 0.052, 0, { r: 0.1 });
  for (const s of [-1, 1]) {
    b.cyl(C.graphite, 0.032, 0.09, s * 0.09, 0.055, -0.4, { rx: Math.PI / 2, seg: 10 });
    b.cyl(lit(mix(C.sky, C.offwhite, 0.4)), 0.022, 0.012, s * 0.09, 0.055, -0.448, { rx: Math.PI / 2, seg: 10 });
  }
  return b.finish().parts;
}

/** Uma prancha nova para um avatar (começa escondida). */
export function hoverboard(): THREE.Group {
  parts ??= build();
  glowGeo ??= new THREE.RingGeometry(0.08, 0.42, 32);
  glowMat ??= new THREE.MeshBasicMaterial({ color: C.signal, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.name = "prancha";
  for (const p of parts) g.add(new THREE.Mesh(p.geometry, p.material));
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.name = "brilho";
  glow.rotation.x = -Math.PI / 2;
  glow.scale.set(0.75, 1.2, 1);
  g.add(glow);
  g.visible = false;
  return g;
}
