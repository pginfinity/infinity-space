import * as THREE from "three";
import { glow, toon, PALETTE as C } from "../../scene/materials.ts";
import { SPARKLE } from "../../brand/sparkle.ts";

/**
 * Foguete do deploy e o berço dele, do lado de fora da estação. Modelo procedural original:
 * corpo off-white de ogiva, faixa navy com a estrela branca oficial, janela azul acesa,
 * três aletas e bico de motor. Materiais toon da casa (mesma rampa dos móveis).
 */

export interface RocketModel {
  group: THREE.Group;
  /** Chama do motor (escale em y para "acelerar"). */
  flame: THREE.Group;
  dispose(): void;
}

const SCALE = 1;

function starShape(size: number): THREE.Shape {
  const shape = new THREE.Shape();
  const [sx, sy] = SPARKLE.start;
  shape.moveTo(sx * size, -sy * size);
  for (const [c1x, c1y, c2x, c2y, x, y] of SPARKLE.curves) shape.bezierCurveTo(c1x * size, -c1y * size, c2x * size, -c2y * size, x * size, -y * size);
  return shape;
}

/** Foguete com a base em y = 0 e o bico para +Y (altura ~2,1 m). */
export function buildRocket(): RocketModel {
  const group = new THREE.Group();
  group.name = "foguete";
  const geos: THREE.BufferGeometry[] = [];
  const own: THREE.Material[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = group) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  const white = toon(C.offwhite);
  const navy = toon(C.navy);
  const dark = toon(C.graphite);

  // Corpo (ogiva) por revolução.
  const body: [number, number][] = [
    [0.0, 0.12],
    [0.22, 0.12],
    [0.27, 0.3],
    [0.29, 0.6],
    [0.29, 1.15],
    [0.26, 1.45],
    [0.19, 1.72],
    [0.1, 1.9],
    [0.0, 1.98],
  ];
  add(new THREE.LatheGeometry(body.map(([r, h]) => new THREE.Vector2(r, h)), 20), white);
  // Ponta laranja do bico.
  add(new THREE.ConeGeometry(0.075, 0.16, 14), toon(C.orange), 0, 1.94, 0);
  // Faixa navy com a estrela (frente = +Z).
  add(new THREE.CylinderGeometry(0.296, 0.296, 0.26, 20, 1, true), navy, 0, 0.78, 0);
  const star = add(new THREE.ShapeGeometry(starShape(0.2), 10), glow(C.offwhite), 0, 0.78, 0.3);
  star.geometry.center();
  // Janela acesa (azul de sinal) com aro.
  const ring = add(new THREE.TorusGeometry(0.1, 0.022, 8, 20), toon(C.signal), 0, 1.25, 0.268);
  ring.rotation.x = -0.12;
  const pane = add(new THREE.CircleGeometry(0.085, 18), glow("#8FDcff"), 0, 1.25, 0.276);
  pane.rotation.x = -0.12;
  // Aletas (três), perfil lateral extrudado.
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.3, -0.12);
  fin.lineTo(0.3, 0.06);
  fin.lineTo(0, 0.5);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: false });
  finGeo.translate(0, 0, -0.02);
  geos.push(finGeo);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const m = new THREE.Mesh(finGeo, i === 0 ? navy : navy);
    m.position.set(0.24, 0.18, 0);
    pivot.add(m);
    group.add(pivot);
  }
  // Bico do motor.
  add(new THREE.CylinderGeometry(0.15, 0.2, 0.16, 16), dark, 0, 0.05, 0);

  // Chama: dois cones acesos, apontando para baixo.
  const flame = new THREE.Group();
  flame.name = "chama";
  flame.position.y = -0.02;
  const outer = glow("#FF8A3D").clone();
  const inner = glow("#FFE7A3").clone();
  own.push(outer, inner);
  const o = add(new THREE.ConeGeometry(0.17, 0.9, 14, 1, true), outer, 0, -0.45, 0, flame);
  o.rotation.x = Math.PI;
  const n = add(new THREE.ConeGeometry(0.09, 0.55, 12), inner, 0, -0.27, 0, flame);
  n.rotation.x = Math.PI;
  group.add(flame);

  group.scale.setScalar(SCALE);
  return {
    group,
    flame,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of own) m.dispose();
    },
  };
}

export interface DockModel {
  group: THREE.Group;
  /** Braços da torre que seguram o foguete (giram para abrir). */
  arms: THREE.Object3D[];
  /** Luzes do berço (piscam na contagem). */
  lights: THREE.MeshBasicMaterial;
  dispose(): void;
}

/**
 * Berço do foguete: plataforma hexagonal flutuando do lado de fora do casco, presa por uma
 * treliça, com uma torre de serviço de dois braços. Topo da plataforma em y = topY.
 * `toHull`: distância (m) da plataforma até o casco, no sentido +Z local.
 */
export function buildDock(topY: number, toHull: number): DockModel {
  const group = new THREE.Group();
  group.name = "berco-foguete";
  const geos: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const steel = toon(C.metal);
  const graphite = toon(C.graphite);
  const navy = toon(C.navy);
  const lights = glow(C.signal).clone();

  // Plataforma.
  const pad = new THREE.CylinderGeometry(0.95, 0.8, 0.2, 6);
  geos.push(pad);
  const padMesh = new THREE.Mesh(pad, navy);
  padMesh.position.y = topY - 0.1;
  group.add(padMesh);
  const deck = new THREE.CylinderGeometry(0.88, 0.88, 0.02, 6);
  geos.push(deck);
  const deckMesh = new THREE.Mesh(deck, graphite);
  deckMesh.position.y = topY + 0.005;
  group.add(deckMesh);
  // Marca de pouso (anel) e luzes nas quinas.
  const ringG = new THREE.TorusGeometry(0.45, 0.025, 6, 24);
  geos.push(ringG);
  const ring = new THREE.Mesh(ringG, toon(C.gold));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = topY + 0.02;
  group.add(ring);
  const bulbG = new THREE.SphereGeometry(0.05, 8, 6);
  geos.push(bulbG);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(bulbG, lights);
    b.position.set(Math.cos(a) * 0.9, topY - 0.02, Math.sin(a) * 0.9);
    group.add(b);
  }
  // Treliça até o casco: duas vigas e diagonais.
  const len = Math.max(0.2, toHull - 0.7);
  const z0 = 0.7 + len / 2;
  for (const x of [-0.32, 0.32]) {
    box(0.07, 0.07, len, steel, x, topY - 0.08, z0);
    box(0.07, 0.07, len, steel, x, topY - 0.42, z0);
  }
  const steps = Math.max(2, Math.round(len / 0.45));
  for (let i = 0; i <= steps; i++) {
    const z = 0.7 + (i / steps) * len;
    box(0.64, 0.05, 0.05, steel, 0, topY - 0.08, z);
    box(0.05, 0.36, 0.05, steel, -0.32, topY - 0.25, z);
    box(0.05, 0.36, 0.05, steel, 0.32, topY - 0.25, z);
  }
  // Torre de serviço ao lado (−X), com dois braços.
  box(0.16, 2.3, 0.16, graphite, -0.78, topY + 1.15, 0);
  box(0.26, 0.08, 0.26, toon(C.orange), -0.78, topY + 2.32, 0);
  const arms: THREE.Object3D[] = [];
  for (const y of [0.85, 1.55]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.78, topY + y, 0);
    box(0.5, 0.06, 0.08, steel, 0.25, 0, 0, pivot);
    box(0.06, 0.14, 0.2, graphite, 0.5, 0, 0, pivot);
    group.add(pivot);
    arms.push(pivot);
  }
  return {
    group,
    arms,
    lights,
    dispose() {
      for (const g of geos) g.dispose();
      lights.dispose();
    },
  };
}
