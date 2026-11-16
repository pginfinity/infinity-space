import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  PLANTS_ID,
  PLANTS_KIND,
  PLANT_FULL,
  PLANT_HAPPY,
  PLANT_WATER_MS,
  isPlantType,
  plantLevel,
  plantStage,
  plantWilt,
  vivoHash,
  yawOf,
  type Lens,
  type MapObject,
  type PlantWatered,
  type PlantsState,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { mountedFurniture } from "../../scene/furniture/index.ts";
import { SIGN_FACE } from "../../scene/furniture/vivo.ts";
import { avatarRig, playHandAction } from "../../avatar/hands.ts";
import { SPOUT_TIP, heldScale } from "../../avatar/held.ts";
import { serverNow } from "./clock.ts";
import { FaceBoard } from "./board.ts";
import { Particles, dropGeometry, flatMaterial, glintGeometry } from "./particles.ts";
import { dropHeld } from "./held.tsx";
import { T } from "./strings.ts";

/**
 * Plantas: cada planta murcha devagar (cor apagada, inclinada, folhas no chão) e volta ao regar.
 * Regar mostra o regador na mão, gotas e um brilho, para todo mundo. A estação de rega do Átrio
 * tem os regadores e a plaquinha "plantas felizes: N de M".
 */

interface Plant {
  o: MapObject;
  /** Altura do topo (para gotas, brilho e o aviso de sede). */
  top: number;
  /** Direção para onde ela tomba quando murcha. */
  lean: number;
  /** Murcha mostrada agora e a do estado (a mostrada segue a do estado devagar). */
  shown: number;
  target: number;
  /** Quando foi regada por último aqui no cliente (para o "pulinho" de alegria). */
  revivedAt: number;
}

let plants: Plant[] | null = null;
function allPlants(): Plant[] {
  plants ??= world()
    .map.objects.filter((o) => isPlantType(o.type))
    .map((o) => ({ o, top: o.size.h, lean: vivoHash(`inclina:${o.id}`) * Math.PI * 2, shown: -1, target: 0, revivedAt: 0 }));
  return plants;
}

function levelOf(id: string, s: PlantsState | undefined, now = serverNow()): number {
  return s ? plantLevel(s.wateredAt[id], now) : 1;
}

/** Murcha forçada por planta (só para testes e para a galeria de screenshots). */
export const wiltOverride = new Map<string, number>();

/** Regas em andamento (para as gotas saírem do regador certo). */
const waterings: Array<{ who: string; plant: Plant; at: number }> = [];

const targetsCache: DynamicTarget[] = [];

export const plantsClient: ActivityClient = {
  name: "vivo/plantas",
  kinds: [PLANTS_KIND],
  objects: ["watering-station"],
  label: () => (holdingCan() ? T.plants.canDrop : T.plants.canPick),
  use: () => {
    sfx("vivo-can", { volume: 0.5 });
    if (holdingCan()) dropHeld();
    else sendAct(PLANTS_ID, "can");
  },
  targets: () => {
    targetsCache.length = 0;
    const s = actState<PlantsState>(PLANTS_ID);
    if (!s) return targetsCache;
    const now = serverNow();
    for (const p of allPlants()) {
      const d = Math.hypot(p.o.pos.x - self.x, p.o.pos.z - self.z);
      if (d > 1.9) continue;
      const level = levelOf(p.o.id, s, now);
      if (level >= PLANT_FULL) continue;
      const stage = plantStage(level);
      targetsCache.push({
        key: `planta:${p.o.id}`,
        point: p.o.pos,
        radius: p.o.type === "plant-small" ? 1.4 : 1.8,
        label: stage === "happy" ? T.plants.water : `${T.plants.water} · ${T.plants.stage[stage]}`,
        run: () => sendAct(PLANTS_ID, "water", { plant: p.o.id }),
      });
    }
    return targetsCache;
  },
  onEvent: (e) => {
    if (e.ev === "full") {
      toast(T.plants.full);
      return;
    }
    if (e.ev !== "water" || !e.from) return;
    const d = e.data as PlantWatered;
    const plant = allPlants().find((p) => p.o.id === d.plant);
    if (!plant) return;
    const me = useApp.getState().selfId;
    const from = e.from === me ? { x: self.x, z: self.z } : null;
    const rig = avatarRig(e.from);
    const pos = from ?? (rig ? { x: rig.root.position.x, z: rig.root.position.z } : plant.o.pos);
    const face = yawOf({ x: plant.o.pos.x - pos.x, z: plant.o.pos.z - pos.z });
    playHandAction(e.from, "water", PLANT_WATER_MS, { item: "watering-can", face });
    if (e.from === me) self.yaw = face;
    waterings.push({ who: e.from, plant, at: performance.now() });
    sfx("vivo-watering", { at: plant.o.pos, volume: 0.6, range: 12 });
    window.setTimeout(() => {
      plant.revivedAt = performance.now();
      sfx("vivo-plant-happy", { at: plant.o.pos, volume: 0.5, range: 10 });
    }, 1500);
  },
  Scene: PlantsScene,
};

function holdingCan(): boolean {
  const s = useApp.getState();
  return !!s.selfId && s.players[s.selfId]?.held === "watering-can";
}

// ---- no mundo -----------------------------------------------------------------------------

const WHITE = new THREE.Color(1, 1, 1);
const DROP = new THREE.Color("#7FD3FF");
const GLINT = new THREE.Color("#FFE9A8");
const LEAF_GLINT = new THREE.Color("#9BF0C2");
const DRY = ["#C9A25A", "#B98A47", "#D8B66A", "#A9853F"].map((c) => new THREE.Color(c));

const _shape = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _o = new THREE.Object3D();

/** Folha seca no chão (forma plana deitada). */
let leafGeo: THREE.BufferGeometry | null = null;
function leafGeometry(): THREE.BufferGeometry {
  if (leafGeo) return leafGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.4, -0.25, 0.35, 0.3, 0, 0.5);
  s.bezierCurveTo(-0.35, 0.3, -0.4, -0.25, 0, -0.5);
  leafGeo = new THREE.ShapeGeometry(s, 4);
  leafGeo.rotateX(-Math.PI / 2);
  return leafGeo;
}

const LEAVES_PER_PLANT = 5;

function PlantsScene({ lens }: { lens: Lens }) {
  const camera = useThree((s) => s.camera);
  const list = allPlants();
  const fx = useMemo(() => {
    const drops = new Particles(dropGeometry(), flatMaterial(), 160);
    const glints = new Particles(glintGeometry(), flatMaterial(), 120);
    const leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshToonMaterial({ side: THREE.DoubleSide }), list.length * LEAVES_PER_PLANT);
    leaves.count = 0;
    leaves.frustumCulled = false;
    leaves.setColorAt(0, WHITE);
    const thirst = new THREE.InstancedMesh(dropGeometry(), flatMaterial(), list.length);
    thirst.count = 0;
    thirst.frustumCulled = false;
    return { drops, glints, leaves, thirst };
  }, [list.length]);
  const sign = useMemo(() => {
    const o = world().map.objects.find((x) => x.type === "watering-station");
    return o ? { o, fb: new FaceBoard(o, SIGN_FACE, 256, { lit: true }) } : null;
  }, []);
  const label = useRef<HTMLDivElement>(null);
  const state = useAct<PlantsState>(PLANTS_ID);
  const tick = useRef<{ next: number; version: number; leavesKey: string; state: PlantsState | undefined }>({ next: 0, version: -1, leavesKey: "", state: undefined });

  useEffect(
    () => () => {
      fx.drops.dispose();
      fx.glints.dispose();
      fx.leaves.dispose();
      (fx.leaves.material as THREE.Material).dispose();
      fx.thirst.dispose();
      (fx.thirst.material as THREE.Material).dispose();
      sign?.fb.dispose();
    },
    [fx, sign],
  );

  // Plaquinha: "Plantas felizes: N de M".
  const happy = state?.happy ?? 0;
  const total = state?.total ?? list.length;
  useEffect(() => {
    if (!sign) return;
    const draw = () => sign.fb.draw(`${happy}/${total}`, (ctx, w, h) => drawSign(ctx, w, h, happy, total));
    draw();
    if (document.fonts) void document.fonts.load("700 32px NORD").then(() => {
      sign.fb.invalidate();
      draw();
    });
  }, [sign, happy, total]);

  useFrame((_, dt) => {
    const t = performance.now();
    const st = tick.current;
    const { build, version } = mountedFurniture();
    const remount = version !== st.version;
    if (remount) {
      st.version = version;
      for (const p of list) p.shown = -1;
    }
    // A cada segundo: quanto cada planta deveria estar murcha agora.
    const s = actState<PlantsState>(PLANTS_ID);
    if (t >= st.next || remount || s !== st.state) {
      st.next = t + 1000;
      st.state = s;
      const now = serverNow();
      for (const p of list) {
        const forced = wiltOverride.get(p.o.id);
        if (forced !== undefined && forced !== p.target) p.shown = -1;
        p.target = forced ?? plantWilt(levelOf(p.o.id, s, now));
      }
      updateLeaves(list, fx.leaves, st);
    }
    // A planta mostrada segue a do estado: devagar ao murchar, rápido (com pulinho) ao ser regada.
    for (const p of list) {
      const revive = t - p.revivedAt < 1600;
      // regada agora: espera as gotas caírem antes de se animar
      const pending = p.target < p.shown && waterings.some((w) => w.plant === p && t - w.at < 1500);
      const rate = p.target < p.shown ? (revive ? 2.4 : 0.8) : 0.3;
      const next = p.shown < 0 ? p.target : pending ? p.shown : p.shown + (p.target - p.shown) * Math.min(1, dt * rate);
      const bounce = revive ? Math.sin(((t - p.revivedAt) / 1600) * Math.PI * 3) * 0.05 * (1 - (t - p.revivedAt) / 1600) : 0;
      if (Math.abs(next - p.shown) < 0.0005 && !revive && !remount) continue;
      p.shown = next;
      if (build) applyWilt(build, p, next, bounce);
    }
    emitWatering(fx.drops, fx.glints, t);
    fx.drops.update(dt, camera);
    fx.glints.update(dt, camera);
    updateThirst(list, fx.thirst, t);
    // Etiqueta nítida no 2D perto da estação de rega.
    if (label.current && sign) {
      const show = lens === "2d" && Math.hypot(self.x - sign.o.pos.x, self.z - sign.o.pos.z) < 9;
      if (label.current.dataset.show !== String(show)) {
        label.current.dataset.show = String(show);
        label.current.style.opacity = show ? "1" : "0";
      }
    }
  });

  return (
    <>
      <primitive object={fx.drops.mesh} />
      <primitive object={fx.glints.mesh} />
      <primitive object={fx.leaves} />
      <primitive object={fx.thirst} />
      {sign && <primitive object={sign.fb.mesh} />}
      {sign && (
        <Html position={[sign.o.pos.x, 1.5, sign.o.pos.z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-space/80 px-2.5 py-1 text-[11px] font-medium text-offwhite shadow-lg transition-opacity duration-300" style={{ opacity: 0 }}>
            <span className="text-slate">{T.plants.boardTitle}:</span>
            {T.plants.board(happy, total)}
          </div>
        </Html>
      )}
    </>
  );
}

/** Cor e forma de uma planta conforme a murcha (0 a 1). */
function applyWilt(build: NonNullable<ReturnType<typeof mountedFurniture>["build"]>, p: Plant, w: number, bounce: number): void {
  if (w < 0.002 && Math.abs(bounce) < 0.002) {
    build.setInstance(p.o.id, { dry: 0, shape: null });
    return;
  }
  // tomba para um lado (cisalhamento: a base fica no chão), encolhe um pouco e perde o viço
  const tall = p.o.type === "plant-tall" ? 0.7 : 1;
  const k = 0.3 * w * tall;
  const kx = Math.cos(p.lean) * k;
  const kz = Math.sin(p.lean) * k;
  const sy = 1 - 0.16 * w + bounce;
  const sxz = 1 + 0.05 * w - bounce * 0.5;
  _shape.set(sxz, kx, 0, 0, 0, sy, 0, 0, 0, kz, sxz, 0, 0, 0, 0, 1);
  build.setInstance(p.o.id, { dry: Math.min(1, w * 1.15), shape: _shape });
}

/** Folhas secas no chão em volta das plantas bem murchas. */
function updateLeaves(list: Plant[], mesh: THREE.InstancedMesh, st: { leavesKey: string }): void {
  const key = list.map((p) => Math.floor(Math.max(0, p.target - 0.35) * 8)).join("");
  if (key === st.leavesKey) return;
  st.leavesKey = key;
  let n = 0;
  for (const p of list) {
    const count = Math.min(LEAVES_PER_PLANT, Math.floor(Math.max(0, p.target - 0.35) * 8));
    const r0 = p.o.type === "plant-small" ? 0.2 : p.o.type === "plant-tall" ? 0.38 : 0.32;
    for (let i = 0; i < count; i++) {
      const h = vivoHash(`${p.o.id}:${i}`);
      const a = h * Math.PI * 2 + i * 1.7;
      const r = r0 + vivoHash(`${p.o.id}:r${i}`) * 0.25;
      _o.position.set(p.o.pos.x + Math.cos(a) * r, 0.012 + i * 0.002, p.o.pos.z + Math.sin(a) * r);
      _o.rotation.set(0, a * 3, 0);
      _o.scale.setScalar(p.o.type === "plant-small" ? 0.07 : 0.11);
      _o.updateMatrix();
      mesh.setMatrixAt(n, _o.matrix);
      mesh.setColorAt(n, DRY[i % DRY.length]!);
      n++;
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Gotinha azul flutuando em cima das plantas com sede, para quem está por perto. */
function updateThirst(list: Plant[], mesh: THREE.InstancedMesh, t: number): void {
  const s = actState<PlantsState>(PLANTS_ID);
  if (!s) return;
  const now = serverNow();
  let n = 0;
  for (const p of list) {
    if (Math.hypot(p.o.pos.x - self.x, p.o.pos.z - self.z) > 7) continue;
    if (levelOf(p.o.id, s, now) >= PLANT_HAPPY) continue;
    if (t - p.revivedAt < 3000) continue;
    const bob = Math.sin(t / 380 + p.lean * 3) * 0.05;
    _o.position.set(p.o.pos.x, p.top + 0.28 + bob, p.o.pos.z);
    _o.rotation.set(0, t / 900, 0);
    _o.scale.setScalar(0.13);
    _o.updateMatrix();
    mesh.setMatrixAt(n, _o.matrix);
    mesh.setColorAt(n, DROP);
    n++;
  }
  mesh.count = n;
  if (n) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/** Gotas saindo do bico do regador e brilho na planta depois da rega. */
function emitWatering(drops: Particles, glints: Particles, t: number): void {
  for (let i = waterings.length - 1; i >= 0; i--) {
    const w = waterings[i]!;
    const el = (t - w.at) / 1000;
    if (el > 2.6) {
      waterings.splice(i, 1);
      continue;
    }
    const rig = avatarRig(w.who);
    const soil = w.plant.o.type === "plant-small" ? 0.2 : w.plant.o.type === "plant-tall" ? 0.52 : 0.42;
    if (rig && el > 0.55 && el < 2.0) {
      _v.copy(SPOUT_TIP).multiplyScalar(heldScale("watering-can"));
      rig.handR.localToWorld(_v);
      const fx = Math.sin(Math.PI - rig.root.rotation.y);
      const fz = -Math.cos(Math.PI - rig.root.rotation.y);
      for (let k = 0; k < 2; k++) {
        drops.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: fx * 0.6 + (Math.random() - 0.5) * 0.25, vy: -0.2 - Math.random() * 0.3, vz: fz * 0.6 + (Math.random() - 0.5) * 0.25, life: 0.8, size: 0.03, gravity: -6, floor: soil, color: DROP });
      }
    }
    if (el > 1.5 && el < 2.3 && Math.random() < 0.6) {
      const p = w.plant;
      const a = Math.random() * Math.PI * 2;
      const r = 0.15 + Math.random() * 0.25;
      glints.spawn({ x: p.o.pos.x + Math.cos(a) * r, y: p.top * (0.5 + Math.random() * 0.5), z: p.o.pos.z + Math.sin(a) * r, vy: 0.45 + Math.random() * 0.3, life: 1.1, size: 0.05 + Math.random() * 0.03, spin: 4, drag: 0.6, color: Math.random() < 0.6 ? GLINT : LEAF_GLINT });
    }
  }
}

function drawSign(ctx: CanvasRenderingContext2D, w: number, h: number, happy: number, total: number): void {
  const u = w / 256;
  ctx.fillStyle = "#3B2A1E";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${15 * u}px Geist, sans-serif`;
  ctx.fillText(T.plants.boardTitle.toUpperCase(), w / 2, h * 0.27);
  ctx.font = `700 ${34 * u}px NORD, Geist, sans-serif`;
  ctx.fillStyle = "#2F7D55";
  ctx.fillText(`${happy}`, w / 2 - 34 * u, h * 0.66);
  ctx.fillStyle = "#3B2A1E";
  ctx.font = `600 ${18 * u}px Geist, sans-serif`;
  ctx.fillText(T.plants.ofTotal(total), w / 2 + 26 * u, h * 0.68);
  // barrinha de folhas
  const k = total ? happy / total : 0;
  ctx.fillStyle = "rgba(59,42,30,0.18)";
  ctx.fillRect(w * 0.12, h * 0.88, w * 0.76, 4 * u);
  ctx.fillStyle = "#3FAE7A";
  ctx.fillRect(w * 0.12, h * 0.88, w * 0.76 * k, 4 * u);
}
