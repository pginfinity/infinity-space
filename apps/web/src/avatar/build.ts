import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { AvatarLook } from "@infinity/world";
import { lit } from "../scene/materials.ts";
import { GHOST_MATERIAL } from "./effects.ts";
import { faceTexture, type Expression } from "./face.ts";

/**
 * Avatar montado com as peças do Kenney Mini Characters 2.0 (CC0), recortadas e recombinadas em
 * public/avatar/kit.glb por scripts/avatar-kit.mjs. Todas as peças saem do mesmo esqueleto: cabelo,
 * boné e óculos ficam presos ao osso da cabeça e alinhados em qualquer combinação.
 * Cada avatar vira uma malha só (cores do visual gravadas nos vértices) mais o decalque do rosto.
 * Frente para +Z local, pés em y = 0. O lado direito do avatar fica em -X.
 */

export const KIT_URL = "/avatar/kit.glb";
/** Do modelo do pacote (0,66 de altura) para metros: o avatar fica com ~1,45 m, como o antigo. */
export const BODY_SCALE = 2.2;
/** Cabeça um pouco menor que a do pacote: a roupa e o crachá aparecem mais, sem perder o jeito chibi. */
const HEAD_SCALE = 0.85;

/** Animações do pacote usadas pelos estados do Space (p.anim). */
export const CLIPS = ["idle", "walk", "sprint", "sit"] as const;
export type Clip = (typeof CLIPS)[number];

type Role = "skin" | "hair" | "top" | "top2" | "bottom" | "shoes" | "acc" | "fixed";

interface Kit {
  /** Geometrias de cada peça, uma por papel de cor (userData.role). */
  parts: Map<string, THREE.BufferGeometry[]>;
  /** Ossos na ordem do skinIndex: nome, pai, posição de repouso e matriz inversa. */
  names: string[];
  parents: number[];
  rest: THREE.Vector3[];
  inverses: THREE.Matrix4[];
  clips: Record<Clip, THREE.AnimationClip>;
}

const kits = new WeakMap<object, Kit>();
function kitOf(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): Kit {
  const cached = kits.get(gltf);
  if (cached) return cached;
  const parts = new Map<string, THREE.BufferGeometry[]>();
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  for (const m of meshes) {
    const piece = m.geometry.userData.piece as string;
    parts.set(piece, [...(parts.get(piece) ?? []), m.geometry]);
  }
  const skel = meshes[0]?.skeleton;
  if (!skel) throw new Error("avatar/kit.glb sem esqueleto");
  const clips = {} as Record<Clip, THREE.AnimationClip>;
  for (const c of CLIPS) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, c);
    if (!clip) throw new Error(`avatar/kit.glb sem a animação ${c}`);
    clips[c] = clip;
  }
  const kit: Kit = {
    parts,
    names: skel.bones.map((b) => b.name),
    parents: skel.bones.map((b) => skel.bones.indexOf(b.parent as THREE.Bone)),
    rest: skel.bones.map((b) => b.position.clone()),
    inverses: skel.boneInverses,
    clips,
  };
  kits.set(gltf, kit);
  return kit;
}

/** Peças dos avatares. Suspende quem chama até o kit (~0,45 MB) chegar; depois fica em cache. */
export function useAvatarKit(): Kit {
  return kitOf(useGLTF(KIT_URL, false, false));
}
useGLTF.preload(KIT_URL, false, false);

// ---------------------------------------------------------------- visual -> peças

interface Part {
  piece: string;
  /** Deslocamento para a frente (crachá por cima de roupa mais grossa). */
  dz?: number;
  /** Troca de papel de cor (saia do vestido na cor da blusa, manga da regata na cor da pele). */
  as?: Partial<Record<Role, Role>>;
}

/** Cabelo de cada opção do criador (null = careca). */
const HAIR: Array<string | null> = ["hair-crop", "hair-short", "hair-quiff", "hair-flat", "hair-afro", "hair-long", "hair-knot", "hair-bun", "hair-band", "hair-mohawk", "hair-braids", null];
/** Tronco e braços de cada parte de cima, e a frente do peito (para o crachá encostar). */
const TOP: Array<[torso: string, arms: string, front: number]> = [
  ["torso-tee", "arms-short", 0.08], // Camiseta
  ["torso-tee", "arms-long", 0.08], // Manga longa
  ["torso-hoodie", "arms-long", 0.12], // Moletom
  ["torso-blazer", "arms-cuff", 0.1], // Blazer
  ["torso-polo", "arms-short", 0.1], // Polo
  ["torso-tee", "arms-short", 0.08], // Vestido
  ["torso-tee", "arms-short", 0.08], // Regata
  ["torso-vest", "arms-cuff", 0.105], // Jaqueta
  ["torso-coat", "arms-long", 0.112], // Jaleco
];
const BOTTOM: Array<[waist: string, legs: string]> = [
  ["waist", "legs-pants"],
  ["waist", "legs-shorts"],
  ["skirt", "legs-bare"],
  ["waist", "legs-jogger"],
];
const SHOES = ["shoes-sneaker", "shoes-boot", "shoes-social"];
const ACC = ["glasses", "glasses-square", "sunglasses", "headphones", "cap", "beanie", "earrings", "watch", "badge", "backpack"];

function partsOf(look: AvatarLook): Part[] {
  const out: Part[] = [{ piece: "head" }];
  // Boné e gorro trocam o cabelo pelo do pacote feito para ir por baixo deles (nada atravessa).
  const hat = look.acc.includes(4) ? "hair-cap" : look.acc.includes(5) ? "hair-beanie" : null;
  const hair = look.hair in HAIR ? HAIR[look.hair] : HAIR[1];
  if (hair) out.push({ piece: hat ?? hair });
  if (look.facial === 3) out.push({ piece: "beard" });
  const [torso, arms, front] = TOP[look.top] ?? TOP[0]!;
  out.push({ piece: torso }, { piece: arms, as: look.top === 6 ? { top: "skin" } : undefined });
  if (look.top === 5) out.push({ piece: "skirt", as: { bottom: "top" } }, { piece: "legs-bare" });
  else for (const piece of BOTTOM[look.bottom] ?? BOTTOM[0]!) out.push({ piece });
  out.push({ piece: SHOES[look.shoes] ?? SHOES[0]! });
  for (const a of look.acc) {
    const piece = ACC[a];
    if (piece) out.push({ piece, dz: piece === "badge" ? front - 0.08 : 0 });
  }
  return out;
}

const COLOR_OF: Record<Exclude<Role, "fixed">, keyof AvatarLook> = { skin: "skin", hair: "hairColor", top: "topColor", top2: "topColor2", bottom: "bottomColor", shoes: "shoesColor", acc: "accColor" };

/** Junta as peças do visual numa geometria só, com a cor de cada papel multiplicada no sombreado do vértice. */
function geometryOf(kit: Kit, look: AvatarLook): THREE.BufferGeometry {
  const list: Array<{ g: THREE.BufferGeometry; c: THREE.Color | null; dz: number }> = [];
  let nv = 0;
  let ni = 0;
  for (const p of partsOf(look)) {
    for (const g of kit.parts.get(p.piece) ?? []) {
      const own = g.userData.role as Role;
      const role = p.as?.[own] ?? own;
      list.push({ g, c: role === "fixed" ? null : new THREE.Color(look[COLOR_OF[role]] as string), dz: p.dz ?? 0 });
      nv += g.attributes.position!.count;
      ni += g.index!.count;
    }
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const ji = new Uint8Array(nv * 4);
  const jw = new Uint8Array(nv * 4);
  const idx = new Uint16Array(ni);
  let v = 0;
  let i = 0;
  for (const { g, c, dz } of list) {
    const a = g.attributes;
    const n = a.position!.count;
    pos.set(a.position!.array, v * 3);
    nrm.set(a.normal!.array, v * 3);
    col.set(a.color!.array, v * 3);
    ji.set(a.skinIndex!.array, v * 4);
    jw.set(a.skinWeight!.array, v * 4);
    for (let k = v; k < v + n; k++) {
      pos[k * 3 + 2]! += dz;
      if (c) {
        col[k * 3]! *= c.r;
        col[k * 3 + 1]! *= c.g;
        col[k * 3 + 2]! *= c.b;
      }
    }
    const src = g.index!.array;
    for (let k = 0; k < src.length; k++) idx[i + k] = src[k]! + v;
    v += n;
    i += src.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(ji, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(jw, 4, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// ---------------------------------------------------------------- montagem

export interface AvatarRig {
  root: THREE.Group;
  /** Corpo na escala do mundo: sobe e desce inteiro (pulo, assento). */
  body: THREE.Group;
  bones: { root: THREE.Bone; torso: THREE.Bone; head: THREE.Bone; armL: THREE.Bone; armR: THREE.Bone; legL: THREE.Bone; legR: THREE.Bone };
  face: THREE.Mesh;
  /** Pegadas das mãos (no centro da mão, em metros): onde vão os itens segurados. */
  handL: THREE.Group;
  handR: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  look: AvatarLook;
  setExpression(e: Expression): void;
  /** Libera a geometria e o esqueleto deste avatar (os materiais são compartilhados). */
  dispose(): void;
}

let bodyMat: THREE.Material | null = null;
/** Material único de todos os corpos: a cor vem dos vértices (mesmo modelo de luz do resto do mundo). */
function bodyMaterial(): THREE.Material {
  if (!bodyMat) {
    bodyMat = lit({ color: "#ffffff" });
    bodyMat.vertexColors = true;
  }
  return bodyMat;
}

const faceMats = new Map<THREE.Texture, THREE.Material>();
function faceMaterial(tex: THREE.Texture): THREE.Material {
  let m = faceMats.get(tex);
  if (!m) {
    m = lit({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: true });
    faceMats.set(tex, m);
  }
  return m;
}

/** Rosto: decalque plano na frente da cabeça (a cabeça do pacote é um bloco de frente reta em z = 0,158). */
const FACE_GEO = new THREE.PlaneGeometry(0.3, 0.3);
const FACE_AT = new THREE.Vector3(0, 0.13, 0.163);
/** Centro da mão no osso do braço (o braço do pacote aponta para ±X na pose de repouso). */
const HAND_AT = 0.21;
/** Esfera fixa para o recorte da câmera (a padrão seria calculada uma vez, numa pose qualquer). */
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.33, 0), 0.62);

/** Monta um avatar. A geometria é deste avatar (chame dispose ao tirar da cena). */
export function buildAvatar(kit: Kit, look: AvatarLook): AvatarRig {
  const bones = kit.names.map((name, k) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(kit.rest[k]!);
    return b;
  });
  bones.forEach((b, k) => {
    const parent = bones[kit.parents[k]!];
    if (parent) parent.add(b);
  });
  const bone = (name: string) => bones[kit.names.indexOf(name)]!;
  const skeleton = new THREE.Skeleton(bones, kit.inverses);
  const mesh = new THREE.SkinnedMesh(geometryOf(kit, look), bodyMaterial());
  mesh.add(bones[0]!);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.boundingSphere = BOUNDS;

  const root = new THREE.Group();
  root.name = "avatar";
  const body = new THREE.Group();
  body.scale.setScalar(BODY_SCALE);
  body.add(mesh);
  root.add(body);

  const head = bone("head");
  head.scale.setScalar(HEAD_SCALE);
  const face = new THREE.Mesh(FACE_GEO, faceMaterial(faceTexture(look, "neutral")));
  face.position.copy(FACE_AT);
  face.renderOrder = 1;
  head.add(face);

  const hand = (arm: THREE.Bone, side: number, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(side * HAND_AT, 0, 0.04);
    g.scale.setScalar(1 / BODY_SCALE);
    arm.add(g);
    return g;
  };
  const armL = bone("arm-left");
  const armR = bone("arm-right");

  const mixer = new THREE.AnimationMixer(bones[0]!);
  const actions = {} as Record<Clip, THREE.AnimationAction>;
  for (const c of CLIPS) {
    const a = mixer.clipAction(kit.clips[c]);
    a.setEffectiveWeight(c === "idle" ? 1 : 0).play();
    actions[c] = a;
  }

  return {
    root,
    body,
    bones: { root: bones[0]!, torso: bone("torso"), head, armL, armR, legL: bone("leg-left"), legR: bone("leg-right") },
    face,
    handL: hand(armL, 1, "handL"),
    handR: hand(armR, -1, "handR"),
    mixer,
    actions,
    look,
    setExpression(e) {
      // fantasma (Impostor): o rosto fica translúcido como o resto, sem voltar a cada piscada
      if (face.material === GHOST_MATERIAL) return;
      const m = faceMaterial(faceTexture(look, e));
      if (face.material !== m) face.material = m;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(bones[0]!);
      mesh.geometry.dispose();
      skeleton.dispose();
    },
  };
}
