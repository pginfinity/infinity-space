import * as THREE from "three";
import { CATALOG, type MapObject, type ObjectType } from "@infinity/world";
import { glow } from "../materials.ts";
import { Builder, type AnimSpec, type ModelFn, type Mold } from "./core.ts";
import { leaderboardTexture, neonTexture, screenTexture } from "./textures.ts";
import * as work from "./work.ts";
import * as seating from "./seating.ts";
import * as tables from "./tables.ts";
import * as screens from "./screens.ts";
import * as tech from "./tech.ts";
import * as kitchen from "./kitchen.ts";
import * as decor from "./decor.ts";
import * as games from "./games.ts";

/**
 * Catálogo de móveis 3D estilizados (cel shading), feito em código.
 *
 * Instancing: cada combinação (tipo, variante, cor, accent) vira um "molde" com as peças fundidas
 * por material (1 a 3 geometrias); cada geometria vira um InstancedMesh com todas as cópias.
 * Ficam fora do instancing só as telas (recebem vídeo), o texto dos neons e nada mais: as peças
 * animadas também são instanciadas (um InstancedMesh por peça, com matriz/cor atualizadas).
 */

export interface FurnitureBuild {
  /** Tudo pronto para adicionar à cena. */
  group: THREE.Group;
  /** Malha da tela de cada TV/ranking, por screenId (vai receber vídeo depois). */
  screens: Map<string, THREE.Mesh>;
  /** Animações (LEDs do rack, holograma, luz do jukebox...). */
  update(dt: number, t: number): void;
  dispose(): void;
}

/** Modelo de cada tipo (sculpture e pod são feitos à parte). */
export const MODELS: Partial<Record<ObjectType, ModelFn>> = {
  desk: work.desk,
  "desk-dual": work.deskDual,
  "standing-desk": work.standingDesk,
  "exec-desk": work.execDesk,
  "curved-desk": work.curvedDesk,
  "workshop-table": work.workshopTable,
  "office-chair": seating.officeChair,
  "exec-chair": seating.execChair,
  chair: seating.chair,
  stool: seating.stool,
  bench: seating.bench,
  sofa: seating.sofa,
  armchair: seating.armchair,
  beanbag: seating.beanbag,
  pouf: seating.pouf,
  "stage-seat": seating.stageSeat,
  "meeting-table": tables.meetingTable,
  "round-table": tables.roundTable,
  "oval-table": tables.ovalTable,
  "high-table": tables.highTable,
  "coffee-table": tables.coffeeTable,
  "bistro-table": tables.bistroTable,
  tv: screens.tv,
  leaderboard: screens.leaderboard,
  whiteboard: screens.whiteboard,
  "kanban-board": screens.kanbanBoard,
  moodboard: screens.moodboard,
  "neon-sign": screens.neonSign,
  "art-frame": screens.artFrame,
  directory: screens.directory,
  "server-rack": tech.serverRack,
  "holo-table": tech.holoTable,
  "robot-arm": tech.robotArm,
  "big-button": tech.bigButton,
  "ring-light": tech.ringLight,
  "camera-tripod": tech.cameraTripod,
  backdrop: tech.backdrop,
  counter: kitchen.counter,
  "kitchen-counter": kitchen.kitchenCounter,
  "coffee-machine": kitchen.coffeeMachine,
  fridge: kitchen.fridge,
  "water-cooler": kitchen.waterCooler,
  plant: decor.plant,
  "plant-tall": decor.plantTall,
  "plant-small": decor.plantSmall,
  bookshelf: decor.bookshelf,
  "lamp-floor": decor.lampFloor,
  rug: decor.rug,
  gong: decor.gong,
  lectern: decor.lectern,
  airhockey: games.airhockey,
  pool: games.pool,
  pingpong: games.pingpong,
  "chess-table": games.chessTable,
  "connect4-table": games.connect4Table,
  arcade: games.arcade,
  jukebox: games.jukebox,
};

/** Quantas variantes (o.variant) cada tipo tem. Tipos ausentes têm só a 0. */
export const VARIANTS: Partial<Record<ObjectType, number>> = {
  desk: 3,
  chair: 2,
  sofa: 2,
  armchair: 2,
  bench: 2,
  plant: 3,
  "plant-tall": 2,
  "plant-small": 3,
  bookshelf: 2,
  rug: 3,
  "art-frame": 3,
  whiteboard: 2,
  moodboard: 2,
  arcade: 3,
  "coffee-table": 2,
};

/** Tipos com modelo neste catálogo, na ordem do catálogo. */
export const FURNITURE_TYPES = (Object.keys(CATALOG) as ObjectType[]).filter((t) => MODELS[t]);

/** Matriz de mundo de um objeto (posição, yaw do projeto, escala para o tamanho pedido). */
export function objectMatrix(o: MapObject, out = new THREE.Matrix4()): THREE.Matrix4 {
  const cat = CATALOG[o.type];
  const sx = ratio(o.size?.w, cat.w);
  const sy = ratio(o.size?.h, cat.h);
  const sz = ratio(o.size?.d, cat.d);
  const h = cat.h * sy;
  // objetos de parede: altura do centro; no chão: elevation (palco) ou zero
  const y = cat.wallMounted !== undefined ? (o.elevation ?? cat.wallMounted) - h / 2 : (o.elevation ?? 0);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI - o.rot);
  return out.compose(new THREE.Vector3(o.pos.x, y, o.pos.z), q, new THREE.Vector3(sx, sy, sz));
}

const UP = new THREE.Vector3(0, 1, 0);

function ratio(v: number | undefined, base: number): number {
  return v && v > 0 && base > 0 ? v / base : 1;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Quais campos de variação o modelo de um tipo lê. */
interface Usage {
  color: boolean;
  accent: boolean;
  variant: boolean;
}

/** Monta um molde registrando quais campos de variação o modelo leu. */
function buildMold(fn: ModelFn, o: MapObject, sep: boolean): { mold: Mold; used: Usage } {
  const b = new Builder();
  const used: Usage = { color: false, accent: false, variant: false };
  fn({
    b,
    o,
    separateScreen: sep,
    get color() {
      used.color = true;
      return o.color;
    },
    get accent() {
      used.accent = true;
      return o.accent;
    },
    get variant() {
      used.variant = true;
      return o.variant ?? 0;
    },
  });
  return { mold: b.finish(), used };
}

function moldKey(o: MapObject, sep: boolean, u: Usage): string {
  return `${o.type}|${u.variant ? (o.variant ?? 0) : "-"}|${u.color ? (o.color ?? "") : "-"}|${u.accent ? (o.accent ?? "") : "-"}|${sep ? 1 : 0}`;
}

interface Animator {
  spec: AnimSpec;
  meshes: THREE.InstancedMesh[];
  objMats: THREE.Matrix4[];
  seeds: number[];
}

const _m = new THREE.Matrix4();
const _pose = new THREE.Matrix4();
const _c = new THREE.Color();

export function buildFurniture(objects: readonly MapObject[]): FurnitureBuild {
  const group = new THREE.Group();
  group.name = "mobilia";
  const screenMap = new Map<string, THREE.Mesh>();
  const geometries: THREE.BufferGeometry[] = [];
  const ownMaterials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const animators: Animator[] = [];
  const neons: { mat: THREE.MeshBasicMaterial; seed: number }[] = [];
  let disposed = false;

  // 1. agrupa objetos por molde. A chave só inclui cor, accent e variante se o modelo do tipo
  //    os lê (descoberto ao montar o primeiro molde do tipo): cor num rack não cria molde novo.
  const usage = new Map<ObjectType, Usage>();
  const probes = new Map<string, Mold>();
  const groups = new Map<string, { type: ObjectType; objs: MapObject[]; sep: boolean; key: string }>();
  for (const o of objects) {
    const fn = MODELS[o.type];
    if (!fn) continue;
    const sep = o.type === "leaderboard" || (o.type === "tv" && !!o.screenId);
    let u = usage.get(o.type);
    if (!u) {
      const probe = buildMold(fn, o, sep);
      u = probe.used;
      usage.set(o.type, u);
      probes.set(moldKey(o, sep, u), probe.mold);
    }
    const key = moldKey(o, sep, u);
    const g = groups.get(key);
    if (g) g.objs.push(o);
    else groups.set(key, { type: o.type, objs: [o], sep, key });
  }

  let idleTex: THREE.Texture | null = null;
  let boardTex: THREE.Texture | null = null;

  for (const { type, objs, sep, key } of groups.values()) {
    const first = objs[0] as MapObject;
    const mold: Mold = probes.get(key) ?? buildMold(MODELS[type] as ModelFn, first, sep).mold;
    const mats = objs.map((o) => objectMatrix(o));
    const n = objs.length;

    // 2. peças estáticas: um InstancedMesh por material do molde
    for (const part of mold.parts) {
      geometries.push(part.geometry);
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = part.bucket === "t1" && type !== "rug";
      mesh.receiveShadow = part.bucket[0] === "t";
      mesh.name = `mobilia:${type}:${part.bucket}`;
      mesh.userData.objectIds = objs.map((o) => o.id);
      meshes.push(mesh);
      group.add(mesh);
    }

    // 3. peças animadas (também instanciadas)
    for (const spec of mold.anims) {
      const count = n * spec.copies.length;
      const am: THREE.InstancedMesh[] = [];
      for (const part of spec.meshes) {
        geometries.push(part.geometry);
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        mesh.frustumCulled = false;
        mesh.castShadow = part.bucket === "t1";
        mesh.receiveShadow = part.bucket[0] === "t";
        mesh.name = `mobilia:${type}:anim`;
        meshes.push(mesh);
        am.push(mesh);
        group.add(mesh);
      }
      const an: Animator = { spec, meshes: am, objMats: mats, seeds: objs.map((o) => hash(o.id)) };
      animators.push(an);
      animate(an, 0, true);
    }

    // 4. telas separadas e textos neon (um por objeto)
    objs.forEach((o, i) => {
      const om = mats[i] as THREE.Matrix4;
      if (mold.screen && sep) {
        const s = mold.screen;
        let tex: THREE.Texture;
        if (s.kind === "leaderboard") tex = boardTex ??= track(leaderboardTexture());
        else tex = idleTex ??= track(screenTexture());
        const mat = glow("#FFFFFF").clone();
        mat.map = tex;
        mat.name = "mobilia:tela";
        ownMaterials.push(mat);
        const geo = new THREE.PlaneGeometry(s.w, s.h);
        geometries.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        _m.multiplyMatrices(om, s.m).decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.name = `screen:${o.screenId ?? o.id}`;
        mesh.userData.objectId = o.id;
        if (o.screenId) screenMap.set(o.screenId, mesh);
        group.add(mesh);
      }
      if (mold.neon) {
        const s = mold.neon;
        const tex = track(neonTexture(o.text ?? "Infinity", o.accent ?? "#00B7FF", s.w / s.h, () => disposed));
        const mat = glow("#FFFFFF").clone();
        mat.map = tex;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.blending = THREE.AdditiveBlending;
        mat.name = "mobilia:neon";
        ownMaterials.push(mat);
        const geo = new THREE.PlaneGeometry(s.w, s.h);
        geometries.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        _m.multiplyMatrices(om, s.m).decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.name = `neon:${o.id}`;
        mesh.renderOrder = 2;
        group.add(mesh);
        neons.push({ mat, seed: hash(o.id) });
      }
    });
  }

  function track<Tx extends THREE.Texture>(t: Tx): Tx {
    textures.push(t);
    return t;
  }

  function animate(an: Animator, t: number, first = false): void {
    const { spec, meshes: am, objMats, seeds } = an;
    const k = spec.copies.length;
    if (!first && !spec.pose && !spec.tint) return;
    for (let i = 0; i < objMats.length; i++) {
      const seed = seeds[i] as number;
      for (let j = 0; j < k; j++) {
        const idx = i * k + j;
        if (first || spec.pose) {
          _m.multiplyMatrices(objMats[i] as THREE.Matrix4, spec.copies[j] as THREE.Matrix4);
          if (spec.pose) {
            _pose.identity();
            spec.pose(t, seed, j, _pose);
            _m.multiply(_pose);
          }
          for (const mesh of am) mesh.setMatrixAt(idx, _m);
        }
        if (spec.tint) {
          _c.setRGB(1, 1, 1);
          spec.tint(t, seed, j, _c);
          for (const mesh of am) mesh.setColorAt(idx, _c);
        }
      }
    }
    for (const mesh of am) {
      if (first || spec.pose) mesh.instanceMatrix.needsUpdate = true;
      if (spec.tint && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    group,
    screens: screenMap,
    update(_dt: number, t: number) {
      for (const an of animators) animate(an, t);
      for (const n of neons) {
        // zumbido do neon: quase sempre aceso, com raras piscadas
        const f = Math.sin(t * 13 + n.seed * 40) * Math.sin(t * 2.3 + n.seed * 9);
        n.mat.opacity = f > 0.93 ? 0.55 : 1;
      }
    },
    dispose() {
      disposed = true;
      for (const m of meshes) m.dispose();
      for (const g of geometries) g.dispose();
      for (const m of ownMaterials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
      screenMap.clear();
    },
  };
}
