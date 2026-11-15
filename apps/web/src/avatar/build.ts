import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AvatarLook } from "@infinity/world";
import { toon } from "../scene/materials.ts";
import { faceTexture, shade, type Expression } from "./face.ts";

/**
 * Avatar chibi montado por partes, com articulações para animação procedural.
 * Frente para +Z local, pés em y = 0. Altura total ~1,4 m (cabeça grande, corpo pequeno).
 * O lado direito do avatar fica em -X (ele olha para +Z).
 */

export const HIP_Y = 0.43;
const HEAD_R = 0.25;
const HEAD_SCALE = new THREE.Vector3(1.04, 0.96, 0.98);

export interface AvatarRig {
  root: THREE.Group;
  /** Sobe e desce o corpo inteiro (pulo, sentar). */
  body: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  face: THREE.Mesh;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  look: AvatarLook;
  setExpression(e: Expression): void;
}

// ---------------------------------------------------------------- geometrias em cache

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
/** Funde geometrias (já transformadas) em uma, para economizar draw calls. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = ni(p);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    return g;
  });
  return mergeGeometries(clean, false) ?? new THREE.BufferGeometry();
}

const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12);
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s?: [number, number, number]) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...(s ?? [1, 1, 1])));
  return g.applyMatrix4(m);
};

/** Calota de cabelo cobrindo topo e nuca (inclinada para trás, deixando a testa livre). */
function cap(r: number, thetaLen: number, tilt: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, thetaLen);
  g.scale(HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z);
  g.rotateX(-tilt);
  return g;
}

/** Pontos espalhados na superfície da cabeça, fora da área do rosto (para cachos). */
function curls(count: number, radius: number, size: number, lift: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 1.25;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    const p = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (p.z > 0.45 && p.y < 0.45) continue; // rosto livre
    out.push(at(sphere(size, 10, 8), p.x * radius, p.y * radius + lift, p.z * radius));
  }
  return out;
}

const HAIR: Array<() => THREE.BufferGeometry | null> = [
  // 0 Raspado
  () => cap(0.256, Math.PI * 0.5, 0.28),
  // 1 Curto
  () => merge([cap(0.27, Math.PI * 0.53, 0.35), at(sphere(1, 16, 10), 0.02, 0.17, 0.14, -0.3, 0, -0.15, [0.2, 0.075, 0.1])]),
  // 2 Topete
  () => merge([cap(0.268, Math.PI * 0.52, 0.38), at(sphere(1, 18, 12), 0, 0.235, 0.1, -0.5, 0, 0, [0.19, 0.11, 0.16])]),
  // 3 Cacheado
  () => merge([cap(0.262, Math.PI * 0.55, 0.3), ...curls(46, 0.272, 0.07, 0.01)]),
  // 4 Black power
  () => merge([cap(0.27, Math.PI * 0.6, 0.25), ...curls(60, 0.33, 0.105, 0.05)]),
  // 5 Longo
  () => merge([cap(0.272, Math.PI * 0.56, 0.32), at(rbox(0.47, 0.44, 0.15, 0.06), 0, -0.13, -0.12), at(capsule(0.06, 0.22), 0.225, -0.11, 0.03), at(capsule(0.06, 0.22), -0.225, -0.11, 0.03)]),
  // 6 Rabo de cavalo
  () => merge([cap(0.268, Math.PI * 0.53, 0.33), at(sphere(0.06, 12, 10), 0, 0.06, -0.27), at(capsule(0.07, 0.26), 0, -0.1, -0.33, 0.45, 0, 0)]),
  // 7 Coque
  () => merge([cap(0.268, Math.PI * 0.52, 0.33), at(sphere(0.105, 16, 12), 0, 0.27, -0.12)]),
  // 8 Chanel
  () => merge([cap(0.272, Math.PI * 0.55, 0.25), at(new THREE.CylinderGeometry(0.28, 0.295, 0.2, 28, 1, false, 0.8, Math.PI * 2 - 1.6), 0, -0.06, -0.005)]),
  // 9 Moicano
  () => {
    const parts = [cap(0.255, Math.PI * 0.48, 0.25)];
    for (let i = 0; i < 6; i++) {
      const a = 0.25 + i * 0.32; // da testa para a nuca
      const p = new THREE.Vector3(0, Math.cos(a) * 0.27, Math.sin(a) * 0.27 * -1 + 0.08);
      parts.push(at(new THREE.ConeGeometry(0.05, 0.15, 10), p.x, p.y, p.z, -a + 0.1, 0, 0));
    }
    return merge(parts);
  },
  // 10 Tranças
  () => merge([cap(0.27, Math.PI * 0.55, 0.32), at(capsule(0.045, 0.34), 0.15, -0.24, -0.16, 0.15, 0, 0), at(capsule(0.045, 0.34), -0.15, -0.24, -0.16, 0.15, 0, 0)]),
  // 11 Careca
  () => null,
];

// ---------------------------------------------------------------- montagem

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  parent.add(me);
  return me;
}

function joint(parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const faceMats = new Map<THREE.Texture, THREE.MeshToonMaterial>();
function faceMaterial(tex: THREE.Texture): THREE.MeshToonMaterial {
  let m = faceMats.get(tex);
  if (!m) {
    m = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: true });
    faceMats.set(tex, m);
  }
  return m;
}

/** Monta um avatar a partir do visual. Geometrias e materiais são compartilhados (não descartar). */
export function buildAvatar(look: AvatarLook): AvatarRig {
  const skin = toon(look.skin);
  const top = toon(look.topColor);
  const top2 = toon(look.topColor2);
  const bottom = toon(look.bottomColor);
  const shoes = toon(look.shoesColor);
  const hairMat = toon(look.hairColor, { side: THREE.DoubleSide });
  const acc = toon(look.accColor);
  const dress = look.top === 5;
  const skirt = look.bottom === 2;
  const shorts = look.bottom === 1;
  const shortSleeve = look.top === 0 || look.top === 4 || look.top === 6 || look.top === 5;
  const sleeveless = look.top === 6;

  const root = new THREE.Group();
  root.name = "avatar";
  const body = joint(root, 0, 0);
  const hips = joint(body, 0, HIP_Y);
  const spine = joint(hips, 0, 0.02);

  // Quadril e pernas.
  mesh(geo("pelvis", () => rbox(0.31, 0.13, 0.22, 0.06)), dress ? top : bottom, hips, 0, 0, 0);
  const legMat = dress || skirt ? skin : bottom;
  const shinMat = dress || skirt || shorts ? skin : bottom;
  const legs = [-1, 1].map((side) => {
    const hip = joint(hips, side * 0.085, -0.02);
    mesh(geo(shorts ? "thigh-short" : "thigh", () => capsule(shorts ? 0.074 : 0.068, 0.1)), legMat, hip, 0, -0.085);
    const knee = joint(hip, 0, -0.17);
    mesh(geo("shin", () => capsule(0.06, 0.1)), shinMat, knee, 0, -0.08);
    if (look.bottom === 3) mesh(geo("cuff", () => new THREE.CylinderGeometry(0.066, 0.066, 0.035, 12)), toon(shade(look.bottomColor, -0.25)), knee, 0, -0.155);
    if (look.shoes === 1) mesh(geo("boot", () => rbox(0.14, 0.15, 0.2, 0.04)), shoes, knee, 0, -0.18, 0.025);
    else {
      mesh(geo(look.shoes === 2 ? "shoe-formal" : "shoe", () => rbox(0.13, look.shoes === 2 ? 0.065 : 0.08, 0.21, 0.035)), shoes, knee, 0, -0.2, 0.03);
      if (look.shoes === 0) mesh(geo("sole", () => rbox(0.135, 0.025, 0.215, 0.01)), toon("#F2F0EF"), knee, 0, -0.235, 0.03);
    }
    return { hip, knee };
  });
  if (dress || skirt) mesh(geo(dress ? "dress" : "skirt", () => new THREE.CylinderGeometry(0.165, dress ? 0.27 : 0.25, dress ? 0.26 : 0.2, 22)), dress ? top : bottom, hips, 0, dress ? -0.1 : -0.06);

  // Tronco.
  const torsoMat = look.top === 3 || look.top === 7 ? top2 : top;
  mesh(geo("torso", () => rbox(0.34, 0.37, 0.23, 0.085)), torsoMat, spine, 0, 0.19);
  if (look.top === 3 || look.top === 7) {
    // Blazer/jaqueta aberta por cima da camisa.
    for (const side of [-1, 1]) {
      const panel = mesh(geo("panel", () => rbox(0.15, 0.36, 0.235, 0.06)), top, spine, side * 0.1, 0.19, 0.003);
      panel.rotation.y = side * 0.08;
    }
    if (look.top === 3) {
      for (const side of [-1, 1]) {
        const lapel = mesh(geo("lapel", () => rbox(0.05, 0.17, 0.02, 0.008)), top, spine, side * 0.055, 0.28, 0.12);
        lapel.rotation.z = side * -0.45;
      }
    } else {
      mesh(geo("zip", () => rbox(0.012, 0.33, 0.01, 0.004)), toon("#C9CED6"), spine, 0, 0.19, 0.118);
    }
  }
  if (look.top === 2) {
    mesh(geo("pocket", () => rbox(0.2, 0.08, 0.03, 0.012)), top2, spine, 0, 0.09, 0.115);
    const hood = mesh(geo("hood", () => new THREE.TorusGeometry(0.12, 0.05, 10, 20, Math.PI)), top, spine, 0, 0.37, -0.07);
    hood.rotation.x = -1.2;
    for (const side of [-1, 1]) mesh(geo("string", () => capsule(0.008, 0.07)), top2, spine, side * 0.04, 0.3, 0.12);
  }
  if (look.top === 4) for (const side of [-1, 1]) {
    const collar = mesh(geo("collar", () => rbox(0.08, 0.035, 0.05, 0.01)), top2, spine, side * 0.055, 0.375, 0.095);
    collar.rotation.z = side * -0.35;
  }
  mesh(geo("neck", () => new THREE.CylinderGeometry(0.065, 0.07, 0.08, 14)), skin, spine, 0, 0.4);

  // Braços (pivô no ombro; o direito fica em -X).
  const arms = [1, -1].map((side) => {
    const shoulder = joint(spine, side * 0.205, 0.33);
    const upperMat = sleeveless ? skin : top;
    mesh(geo(shortSleeve && !sleeveless ? "sleeve-short" : "upper-arm", () => capsule(shortSleeve && !sleeveless ? 0.058 : 0.052, 0.085)), upperMat, shoulder, 0, -0.075);
    const elbow = joint(shoulder, 0, -0.15);
    mesh(geo("forearm", () => capsule(0.048, 0.075)), shortSleeve ? skin : top, elbow, 0, -0.065);
    if (look.top === 1) mesh(geo("cuff-arm", () => new THREE.CylinderGeometry(0.052, 0.052, 0.03, 12)), top2, elbow, 0, -0.12);
    mesh(geo("hand", () => sphere(0.058, 16, 12)), skin, elbow, 0, -0.15);
    return { shoulder, elbow };
  });

  // Cabeça.
  const head = joint(spine, 0, 0.66);
  const headMesh = mesh(geo("head", () => sphere(HEAD_R, 32, 24)), skin, head);
  headMesh.scale.copy(HEAD_SCALE);
  for (const side of [-1, 1]) mesh(geo("ear", () => at(sphere(0.05, 12, 10), 0, 0, 0, 0, 0, 0, [0.6, 1, 0.8])), skin, head, side * 0.255, -0.01, 0);
  const faceGeo = geo("face", () => {
    const g = new THREE.SphereGeometry(HEAD_R + 0.003, 28, 18, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.78, 1.45);
    g.scale(HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z);
    return g;
  });
  const face = mesh(faceGeo, faceMaterial(faceTexture(look, "neutral")), head);
  face.renderOrder = 1;
  const hairGeo = HAIR[look.hair]?.();
  if (hairGeo) mesh(geo(`hair-${look.hair}`, () => hairGeo), hairMat, head);

  // Acessórios.
  for (const a of look.acc) addAccessory(a, { head, spine, elbowL: arms[0]!.elbow, mat: acc });

  const rig: AvatarRig = {
    root,
    body,
    hips,
    spine,
    head,
    face,
    shoulderL: arms[0]!.shoulder,
    shoulderR: arms[1]!.shoulder,
    elbowL: arms[0]!.elbow,
    elbowR: arms[1]!.elbow,
    hipL: legs[1]!.hip,
    hipR: legs[0]!.hip,
    kneeL: legs[1]!.knee,
    kneeR: legs[0]!.knee,
    look,
    setExpression(e) {
      const m = faceMaterial(faceTexture(look, e));
      if (face.material !== m) face.material = m;
    },
  };
  return rig;
}

function addAccessory(id: number, p: { head: THREE.Group; spine: THREE.Group; elbowL: THREE.Group; mat: THREE.Material }): void {
  const { head, spine, mat } = p;
  const dark = toon("#15171C");
  switch (id) {
    case 0:
    case 2: {
      // Óculos redondos (2 = escuros).
      for (const side of [-1, 1]) {
        mesh(geo("glass-ring", () => new THREE.TorusGeometry(0.05, 0.009, 8, 24)), mat, head, side * 0.085, 0.015, 0.243);
        if (id === 2) mesh(geo("glass-lens", () => new THREE.CircleGeometry(0.048, 20)), dark, head, side * 0.085, 0.015, 0.242);
        const arm = mesh(geo("glass-arm", () => rbox(0.012, 0.012, 0.2, 0.004)), mat, head, side * 0.17, 0.02, 0.15);
        arm.rotation.y = side * 0.35;
      }
      mesh(geo("glass-bridge", () => rbox(0.05, 0.01, 0.01, 0.004)), mat, head, 0, 0.02, 0.247);
      break;
    }
    case 1: {
      for (const side of [-1, 1]) {
        const ring = mesh(geo("glass-square", () => new THREE.TorusGeometry(0.058, 0.01, 6, 4)), mat, head, side * 0.088, 0.015, 0.243);
        ring.rotation.z = Math.PI / 4;
        const arm = mesh(geo("glass-arm", () => rbox(0.012, 0.012, 0.2, 0.004)), mat, head, side * 0.17, 0.02, 0.15);
        arm.rotation.y = side * 0.35;
      }
      mesh(geo("glass-bridge", () => rbox(0.05, 0.01, 0.01, 0.004)), mat, head, 0, 0.02, 0.247);
      break;
    }
    case 3: {
      const band = mesh(geo("phone-band", () => new THREE.TorusGeometry(0.275, 0.02, 8, 28, Math.PI)), mat, head, 0, 0.0, -0.01);
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const cup = mesh(geo("phone-cup", () => new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18)), mat, head, side * 0.27, -0.02, 0);
        cup.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 4: {
      mesh(geo("cap-dome", () => cap(0.282, Math.PI * 0.42, 0.18)), mat, head);
      const brim = mesh(geo("cap-brim", () => at(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 20, 1, false, -Math.PI / 2, Math.PI), 0, 0, 0, 0, 0, 0, [1, 1, 1.1])), mat, head, 0, 0.14, 0.17);
      brim.rotation.x = 0.12;
      break;
    }
    case 5: {
      mesh(geo("beanie", () => cap(0.285, Math.PI * 0.5, 0.15)), mat, head);
      mesh(geo("beanie-fold", () => new THREE.TorusGeometry(0.262, 0.03, 8, 28)), mat, head, 0, 0.06, -0.015).rotation.x = Math.PI / 2 - 0.15;
      mesh(geo("pompom", () => sphere(0.055, 12, 10)), toon("#F2F0EF"), head, 0, 0.3, -0.04);
      break;
    }
    case 6:
      for (const side of [-1, 1]) mesh(geo("earring", () => sphere(0.02, 10, 8)), toon("#E8B44A", { emissive: 0.15 }), head, side * 0.26, -0.065, 0.01);
      break;
    case 7:
      mesh(geo("watch", () => new THREE.CylinderGeometry(0.054, 0.054, 0.035, 14)), dark, p.elbowL, 0, -0.105);
      break;
    case 8: {
      // Crachá da Infinity.
      const lanyard = mesh(geo("lanyard", () => new THREE.TorusGeometry(0.12, 0.008, 6, 24, Math.PI)), toon("#0A2547"), spine, 0, 0.38, 0.06);
      lanyard.rotation.x = Math.PI / 2 + 0.9;
      lanyard.rotation.z = Math.PI;
      mesh(geo("badge", () => rbox(0.085, 0.11, 0.012, 0.01)), toon("#F2F0EF"), spine, 0.0, 0.2, 0.122);
      mesh(geo("badge-stripe", () => rbox(0.085, 0.022, 0.014, 0.004)), toon("#00B7FF", { emissive: 0.3 }), spine, 0.0, 0.24, 0.123);
      break;
    }
    case 9: {
      mesh(geo("backpack", () => rbox(0.26, 0.3, 0.12, 0.05)), mat, spine, 0, 0.2, -0.17);
      mesh(geo("backpack-pocket", () => rbox(0.18, 0.12, 0.04, 0.02)), toon(shade((mat as THREE.MeshToonMaterial).color.getStyle(), -0.2)), spine, 0, 0.12, -0.24);
      break;
    }
  }
}
