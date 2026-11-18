import * as THREE from "three";
import { CATALOG, type MapObject, type ObjectType } from "@infinity/world";
import { glow } from "../materials.ts";
import { Builder, SLOT_ACCENT, SLOT_COLOR, furnitureShaderPatch, type AnimSpec, type ModelFn, type Mold } from "./core.ts";
import { leaderboardTexture, neonTexture, screenTexture } from "./textures.ts";
import * as work from "./work.ts";
import * as seating from "./seating.ts";
import * as tables from "./tables.ts";
import * as screens from "./screens.ts";
import * as tech from "./tech.ts";
import * as kitchen from "./kitchen.ts";
import * as decor from "./decor.ts";
import * as games from "./games.ts";
import * as grupo from "./grupo.ts";
import * as escritorio from "./escritorio.ts";
import * as vivo from "./vivo.ts";
import * as arcade from "./arcade.ts";

/**
 * Catálogo de móveis 3D estilizados (cel shading), feito em código.
 *
 * Instancing: cada combinação (tipo, variante) vira um "molde" com as peças fundidas por material
 * (quase sempre 1 geometria: opaco + partes acesas; translúcidos à parte). Cada geometria vira um
 * InstancedMesh com todas as cópias. Cor e accent de cada objeto vão em atributos por instância
 * (ver core.ts), então salas de cores diferentes não multiplicam moldes nem draw calls.
 * Ficam fora do instancing só as telas (recebem vídeo) e o texto dos neons; as peças animadas
 * também são instanciadas (um InstancedMesh por peça, com matriz/cor atualizadas).
 */

/** Para o pipeline: chame dentro de um onBeforeCompile próprio se substituir o dos móveis. */
export { furnitureShaderPatch } from "./core.ts";

export interface FurnitureBuild {
  /** Tudo pronto para adicionar à cena. */
  group: THREE.Group;
  /** Malha da tela de cada TV/ranking, por screenId (vai receber vídeo depois). */
  screens: Map<string, THREE.Mesh>;
  /** Animações (LEDs do rack, holograma, luz do jukebox...). */
  update(dt: number, t: number): void;
  /**
   * Muda o visual de uma cópia pelo id do objeto (planta murcha, por exemplo), sem mexer nas outras.
   * Vale para as peças estáticas do móvel. Devolve false se o objeto não existe.
   */
  setInstance(objectId: string, look: InstanceLook): boolean;
  dispose(): void;
}

/**
 * Visual de uma cópia. `tint` multiplica a cor (as partes pintadas com a cor própria do objeto,
 * como o vaso de uma planta, ficam como estão); `shape` é uma matriz extra no referencial do objeto
 * (base no chão: inclinar, achatar). `null` volta ao original; ausente não mexe.
 */
export interface InstanceLook {
  tint?: THREE.Color | null;
  shape?: THREE.Matrix4 | null;
  /** Folhagem seca (0 a 1): só o que é verde-folha vira palha; vaso, terra e tronco ficam como estão. */
  dry?: number | null;
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
  "conference-table": tables.conferenceTable,
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
  "stop-board": grupo.stopBoard,
  "mission-console": grupo.missionConsole,
  // pacote escritorio
  "notice-board": escritorio.noticeBoard,
  telescope: vivo.telescope,
  chalkboard: vivo.chalkboard,
  "watering-station": vivo.wateringStation,
  // pacote arcade
  "tictactoe-table": arcade.tictactoeTable,
  "arcade-board": arcade.arcadeBoard,
  "trash-bin": arcade.trashBin,
};

// ---- mobília montada na cena (para as atividades mudarem o visual de uma cópia) ----------------

const mounted: { build: FurnitureBuild | null; version: number } = { build: null, version: 0 };

/** A Station registra a mobília que montou (igual ao registerScreens). Devolve a limpeza. */
export function registerFurniture(b: FurnitureBuild): () => void {
  mounted.build = b;
  mounted.version++;
  return () => {
    if (mounted.build === b) mounted.build = null;
  };
}

/** Mobília montada agora (ou null) e um número que muda a cada montagem (troca de lente). Lido a cada quadro: não aloca. */
export function mountedFurniture(): Readonly<{ build: FurnitureBuild | null; version: number }> {
  return mounted;
}

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

/**
 * Monta um molde registrando quais campos de variação o modelo leu.
 * colors: "real" usa as cores do objeto; "padrao" deixa color/accent vazios (cores padrão do
 * modelo); "fichas" entrega SLOT_COLOR/SLOT_ACCENT para descobrir quais vértices seguem a cor.
 */
function buildMold(fn: ModelFn, o: MapObject, sep: boolean, colors: "real" | "padrao" | "fichas" = "real"): { mold: Mold; used: Usage } {
  const b = new Builder();
  const used: Usage = { color: false, accent: false, variant: false };
  fn({
    b,
    o,
    separateScreen: sep,
    get color() {
      used.color = true;
      return colors === "real" ? o.color : colors === "fichas" ? SLOT_COLOR : undefined;
    },
    get accent() {
      used.accent = true;
      return colors === "real" ? o.accent : colors === "fichas" ? SLOT_ACCENT : undefined;
    },
    get variant() {
      used.variant = true;
      return o.variant ?? 0;
    },
  });
  return { mold: b.finish(), used };
}

function moldGeometries(m: Mold): THREE.BufferGeometry[] {
  return [...m.parts.map((p) => p.geometry), ...m.anims.flatMap((a) => a.meshes.map((p) => p.geometry))];
}

/**
 * Molde com cor por instância: geometria e cores padrão da montagem "padrao", mais os atributos
 * aSlot/aTarget da montagem "fichas". Devolve null se as duas montagens não baterem
 * (modelo que muda de forma conforme a cor): aí a cor volta a fazer parte da chave do molde.
 */
function buildSlotMold(fn: ModelFn, o: MapObject, sep: boolean): Mold | null {
  const base = buildMold(fn, o, sep, "padrao").mold;
  const slots = buildMold(fn, o, sep, "fichas").mold;
  const pairs: [THREE.BufferGeometry, THREE.BufferGeometry][] = [];
  const collect = (a: Mold["parts"], b: Mold["parts"]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const pa = a[i] as Mold["parts"][number];
      const pb = b[i] as Mold["parts"][number];
      if (pa.bucket !== pb.bucket || pa.geometry.attributes.position!.count !== pb.geometry.attributes.position!.count) return false;
      pairs.push([pa.geometry, pb.geometry]);
    }
    return true;
  };
  let ok = collect(base.parts, slots.parts) && base.anims.length === slots.anims.length;
  for (let i = 0; ok && i < base.anims.length; i++) ok = collect((base.anims[i] as AnimSpec).meshes, (slots.anims[i] as AnimSpec).meshes);
  if (ok)
    for (const [ga, gb] of pairs) {
      ga.setAttribute("aSlot", gb.getAttribute("aSlot"));
      ga.setAttribute("aTarget", gb.getAttribute("aTarget"));
    }
  moldGeometries(slots).forEach((g) => g.dispose());
  if (!ok) {
    moldGeometries(base).forEach((g) => g.dispose());
    return null;
  }
  return base;
}

function moldKey(o: MapObject, sep: boolean, u: Usage, slots: boolean): string {
  const head = `${o.type}|${u.variant ? (o.variant ?? 0) : "-"}|${sep ? 1 : 0}`;
  if (slots || (!u.color && !u.accent)) return head;
  return `${head}|${u.color ? (o.color ?? "") : "-"}|${u.accent ? (o.accent ?? "") : "-"}`;
}

const _ic = new THREE.Color();
/** Cor por instância (linear) + flag "tem cor própria". */
function writeTint(arr: Float32Array, i: number, hex: string | undefined): void {
  if (!hex) return;
  _ic.set(hex);
  arr.set([_ic.r, _ic.g, _ic.b, 1], i * 4);
}

/** Anexa iColor/iAccent (por instância) a uma geometria de molde com slots. */
function attachTints(geo: THREE.BufferGeometry, objs: readonly MapObject[], copies: number): void {
  const n = objs.length * copies;
  const ic = new Float32Array(n * 4);
  const ia = new Float32Array(n * 4);
  objs.forEach((o, i) => {
    for (let k = 0; k < copies; k++) {
      writeTint(ic, i * copies + k, o.color);
      writeTint(ia, i * copies + k, o.accent);
    }
  });
  geo.setAttribute("iColor", new THREE.InstancedBufferAttribute(ic, 4));
  geo.setAttribute("iAccent", new THREE.InstancedBufferAttribute(ia, 4));
}

interface Animator {
  spec: AnimSpec;
  meshes: THREE.InstancedMesh[];
  objMats: THREE.Matrix4[];
  seeds: number[];
}

interface InstanceCopy {
  mesh: THREE.InstancedMesh;
  index: number;
  base: THREE.Matrix4;
  obj: MapObject;
  /** O molde tem cor por instância (slots). */
  tinted: boolean;
}

/**
 * Cor padrão (linear) de cada slot de uma geometria com slots, deduzida dos vértices:
 * cor = mix(base, alvo, t)  =>  base = (cor - t * alvo) / (1 - t).
 */
const slotBases = new WeakMap<THREE.BufferGeometry, [THREE.Color | null, THREE.Color | null]>();
function slotBase(geo: THREE.BufferGeometry, slot: 1 | 2): THREE.Color | null {
  let bases = slotBases.get(geo);
  if (!bases) {
    bases = [null, null];
    const s = geo.getAttribute("aSlot");
    const tg = geo.getAttribute("aTarget");
    const col = geo.getAttribute("color");
    if (s && tg && col) {
      for (let i = 0; i < s.count && (!bases[0] || !bases[1]); i++) {
        const k = Math.round(s.getX(i));
        const t = s.getY(i);
        if ((k !== 1 && k !== 2) || bases[k - 1] || t > 0.995) continue;
        const inv = 1 / (1 - t);
        bases[k - 1] = new THREE.Color((col.getX(i) - t * tg.getX(i)) * inv, (col.getY(i) - t * tg.getY(i)) * inv, (col.getZ(i) - t * tg.getZ(i)) * inv);
      }
    }
    slotBases.set(geo, bases);
  }
  return bases[slot - 1] ?? null;
}

const _look = new THREE.Matrix4();

/**
 * Variante do material dos móveis com "folhagem seca" por instância (atributo iDry): o fragmento que
 * é verde-folha vira palha na proporção de iDry. Só as malhas que usam `dry` trocam de material.
 */
const dryMats = new Map<THREE.Material, THREE.Material>();
function dryMaterial(base: THREE.Material): THREE.Material {
  let m = dryMats.get(base);
  if (!m) {
    m = base.clone();
    m.onBeforeCompile = (shader) => {
      furnitureShaderPatch(shader);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float iDry;\nvarying float vDry;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDry = iDry;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vDry;").replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 c = vColor.rgb;
          float leaf = smoothstep(0.015, 0.09, c.g - max(c.r, c.b * 1.1));
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l * 1.7, l * 1.25, l * 0.42), vDry * leaf);
        }`,
      );
    };
    m.customProgramCacheKey = () => "mobilia-v2-seca";
    dryMats.set(base, m);
  }
  return m;
}

/** Aplica o visual de uma cópia (ver FurnitureBuild.setInstance). */
function applyLook(c: InstanceCopy, look: InstanceLook): void {
  const { mesh, index } = c;
  if (look.dry !== undefined) {
    const geo = mesh.geometry;
    let attr = geo.getAttribute("iDry") as THREE.InstancedBufferAttribute | undefined;
    if (!attr && look.dry) {
      attr = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1);
      geo.setAttribute("iDry", attr);
      mesh.material = dryMaterial(mesh.material as THREE.Material);
    }
    if (attr) {
      attr.setX(index, look.dry ?? 0);
      attr.needsUpdate = true;
    }
  }
  if (look.shape !== undefined) {
    mesh.setMatrixAt(index, look.shape ? _look.multiplyMatrices(c.base, look.shape) : c.base);
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (look.tint === undefined) return;
  if (!mesh.instanceColor) {
    if (!look.tint) return;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3).fill(1), 3);
  }
  mesh.setColorAt(index, look.tint ?? _white);
  mesh.instanceColor.needsUpdate = true;
  // Partes com a cor própria do objeto (slots) não seguem o tom: fixa a cor padrão delas na instância.
  if (!c.tinted) return;
  const geo = mesh.geometry;
  ([["iColor", 1, c.obj.color], ["iAccent", 2, c.obj.accent]] as const).forEach(([name, slot, own]) => {
    const attr = geo.getAttribute(name) as THREE.InstancedBufferAttribute | undefined;
    if (!attr || own) return;
    const base = look.tint ? slotBase(geo, slot) : null;
    if (base) attr.setXYZW(index, base.r, base.g, base.b, 1);
    else attr.setXYZW(index, 0, 0, 0, 0);
    attr.needsUpdate = true;
  });
}

const _white = new THREE.Color(1, 1, 1);

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
  /** Cópias estáticas de cada objeto (para setInstance). */
  const copies = new Map<string, InstanceCopy[]>();
  let disposed = false;

  // 1. agrupa objetos por molde. A chave só inclui a variante se o modelo a lê; cor e accent
  //    viram atributos por instância (slots), então não criam moldes novos.
  const usage = new Map<ObjectType, Usage>();
  const ready = new Map<string, { mold: Mold; slots: boolean }>();
  const slotOk = new Map<string, boolean>();
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
      if (!u.color && !u.accent) ready.set(moldKey(o, sep, u, false), { mold: probe.mold, slots: false });
      else moldGeometries(probe.mold).forEach((g) => g.dispose());
    }
    let slots = false;
    if (u.color || u.accent) {
      const head = moldKey(o, sep, u, true);
      let st = slotOk.get(head);
      if (st === undefined) {
        const m = buildSlotMold(fn, o, sep);
        st = !!m;
        slotOk.set(head, st);
        if (m) ready.set(head, { mold: m, slots: true });
      }
      slots = st;
    }
    const key = moldKey(o, sep, u, slots);
    const g = groups.get(key);
    if (g) g.objs.push(o);
    else groups.set(key, { type: o.type, objs: [o], sep, key });
  }

  let idleTex: THREE.Texture | null = null;
  let boardTex: THREE.Texture | null = null;

  for (const { type, objs, sep, key } of groups.values()) {
    const first = objs[0] as MapObject;
    const pre = ready.get(key);
    const mold: Mold = pre?.mold ?? buildMold(MODELS[type] as ModelFn, first, sep).mold;
    const tinted = pre?.slots ?? false;
    const mats = objs.map((o) => objectMatrix(o));
    const n = objs.length;

    // 2. peças estáticas: um InstancedMesh por material do molde
    for (const part of mold.parts) {
      geometries.push(part.geometry);
      if (tinted) attachTints(part.geometry, objs, 1);
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
      objs.forEach((o, i) => {
        const list = copies.get(o.id) ?? [];
        list.push({ mesh, index: i, base: mats[i] as THREE.Matrix4, obj: o, tinted });
        copies.set(o.id, list);
      });
    }

    // 3. peças animadas (também instanciadas)
    for (const spec of mold.anims) {
      const count = n * spec.copies.length;
      const am: THREE.InstancedMesh[] = [];
      for (const part of spec.meshes) {
        geometries.push(part.geometry);
        if (tinted) attachTints(part.geometry, objs, spec.copies.length);
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

  group.userData.stats = {
    moldes: groups.size,
    instanciados: meshes.length - animators.reduce((n, a) => n + a.meshes.length, 0),
    animados: animators.reduce((n, a) => n + a.meshes.length, 0),
    telas: ownMaterials.length - neons.length,
    neons: neons.length,
  };

  return {
    group,
    screens: screenMap,
    setInstance(objectId, look) {
      const list = copies.get(objectId);
      if (!list || disposed) return false;
      for (const c of list) applyLook(c, look);
      return true;
    },
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
