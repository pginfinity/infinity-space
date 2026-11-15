import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { CATALOG, type MapObject, type ObjectType } from "@infinity/world";
import { PALETTE, toon } from "../materials.ts";
import { buildFurniture, FURNITURE_TYPES, VARIANTS } from "./index.ts";

/**
 * Galeria de móveis (desenvolvimento): http://localhost:5173/?galeria=1
 *
 * Parâmetros (também usados pelos screenshots automáticos):
 *   cam=iso|persp   pixel=1   grupo=<id>|variantes|teste   piso=escuro|claro|madeira
 */

const NAMES: Record<string, string> = {
  desk: "Mesa de trabalho",
  "desk-dual": "Mesa dev",
  "standing-desk": "Mesa em pé",
  "exec-desk": "Mesa executiva",
  "curved-desk": "Mesa de controle",
  "workshop-table": "Mesa de oficina",
  "office-chair": "Cadeira de escritório",
  "exec-chair": "Cadeira executiva",
  chair: "Cadeira",
  stool: "Banqueta",
  bench: "Banco",
  sofa: "Sofá",
  armchair: "Poltrona",
  beanbag: "Pufe de saco",
  pouf: "Pufe",
  "stage-seat": "Poltrona de auditório",
  "meeting-table": "Mesa de reunião",
  "round-table": "Mesa redonda",
  "oval-table": "Mesa oval",
  "high-table": "Mesa alta",
  "coffee-table": "Mesa de centro",
  "bistro-table": "Mesa bistrô",
  tv: "TV",
  leaderboard: "Ranking",
  whiteboard: "Quadro branco",
  "kanban-board": "Kanban",
  moodboard: "Moodboard",
  "neon-sign": "Letreiro neon",
  "art-frame": "Quadro",
  directory: "Totem de mapa",
  "server-rack": "Rack de servidores",
  "holo-table": "Mesa holográfica",
  "robot-arm": "Braço robótico",
  "big-button": "Botão de deploy",
  "ring-light": "Ring light",
  "camera-tripod": "Câmera",
  backdrop: "Fundo infinito",
  counter: "Recepção",
  "kitchen-counter": "Bancada de cozinha",
  "coffee-machine": "Máquina de café",
  fridge: "Geladeira",
  "water-cooler": "Bebedouro",
  plant: "Planta",
  "plant-tall": "Planta alta",
  "plant-small": "Vasinho",
  bookshelf: "Estante",
  "lamp-floor": "Luminária",
  rug: "Tapete",
  gong: "Gongo",
  lectern: "Púlpito",
  airhockey: "Air hockey",
  pool: "Sinuca",
  pingpong: "Pingue-pongue",
  "chess-table": "Xadrez",
  "connect4-table": "Lig 4",
  arcade: "Fliperama",
  jukebox: "Jukebox",
};

const GROUPS: { id: string; name: string; types: ObjectType[] }[] = [
  { id: "trabalho", name: "Trabalho", types: ["desk", "desk-dual", "standing-desk", "exec-desk", "curved-desk", "workshop-table"] },
  { id: "assentos", name: "Assentos", types: ["office-chair", "exec-chair", "chair", "stool", "bench", "sofa", "armchair", "beanbag", "pouf", "stage-seat"] },
  { id: "mesas", name: "Mesas", types: ["meeting-table", "round-table", "oval-table", "high-table", "coffee-table", "bistro-table"] },
  { id: "paredes", name: "Telas e paredes", types: ["tv", "leaderboard", "whiteboard", "kanban-board", "moodboard", "neon-sign", "art-frame", "directory"] },
  { id: "tecnologia", name: "Tecnologia e estúdio", types: ["server-rack", "holo-table", "robot-arm", "big-button", "ring-light", "camera-tripod", "backdrop"] },
  { id: "copa", name: "Copa", types: ["counter", "kitchen-counter", "coffee-machine", "fridge", "water-cooler"] },
  { id: "decoracao", name: "Decoração e palco", types: ["plant", "plant-tall", "plant-small", "bookshelf", "lamp-floor", "rug", "gong", "lectern"] },
  { id: "jogos", name: "Jogos", types: ["airhockey", "pool", "pingpong", "chess-table", "connect4-table", "arcade", "jukebox"] },
];

/** Variações de cor para a seção "variantes". */
const COLOR_SAMPLES: { type: ObjectType; color?: string; accent?: string; text?: string }[] = [
  { type: "office-chair", color: PALETTE.orange },
  { type: "office-chair", color: PALETTE.sky },
  { type: "sofa", color: PALETTE.cream, accent: PALETTE.signal },
  { type: "armchair", color: PALETTE.green },
  { type: "beanbag", color: PALETTE.signal },
  { type: "pouf", color: PALETTE.gold, accent: PALETTE.navy },
  { type: "rug", color: PALETTE.cream, accent: PALETTE.orange },
  { type: "neon-sign", text: "Bora codar", accent: PALETTE.orange },
  { type: "neon-sign", text: "evolução", accent: PALETTE.pink },
  { type: "desk", color: PALETTE.woodLight, accent: PALETTE.signal },
];

const FLOORS = {
  escuro: { floor: "#1B2B45", plinth: "#243A5C", label: "Piso escuro" },
  claro: { floor: "#B9BEC7", plinth: "#CDD1D8", label: "Piso claro" },
  madeira: { floor: "#8A6446", plinth: "#9C7453", label: "Piso madeira" },
} as const;
type FloorKey = keyof typeof FLOORS;

interface Item {
  obj: MapObject;
  label: string;
  wall: boolean;
}

const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const DOWN = new THREE.Vector3(1, 0, 1).normalize();

let uid = 0;
function makeObj(type: ObjectType, x: number, z: number, extra: Partial<MapObject> = {}): MapObject {
  const cat = CATALOG[type];
  return {
    id: `g${uid++}-${type}`,
    type,
    pos: { x, z },
    rot: Math.PI,
    size: { w: cat.w, d: cat.d, h: cat.h },
    blocks: cat.blocks,
    ...(type === "tv" ? { screenId: `galeria-tv-${uid}` } : {}),
    ...(type === "leaderboard" ? { screenId: `galeria-ranking-${uid}` } : {}),
    ...(type === "neon-sign" ? { text: "Infinity Space", accent: PALETTE.signal } : {}),
    ...extra,
  };
}

/** Distribui itens em fileiras horizontais na tela isométrica. */
function layoutRows(rows: { type: ObjectType; extra?: Partial<MapObject>; label: string }[][]): Item[] {
  const items: Item[] = [];
  let v = 0;
  for (const row of rows) {
    let u = 0;
    let rowDepth = 0;
    const placed: { type: ObjectType; extra?: Partial<MapObject>; label: string; u: number }[] = [];
    for (const it of row) {
      const cat = CATALOG[it.type];
      const span = (cat.w + cat.d) / Math.SQRT2;
      u += span / 2;
      placed.push({ ...it, u });
      u += span / 2 + 0.9;
      rowDepth = Math.max(rowDepth, (cat.w + cat.d) / Math.SQRT2 + (cat.wallMounted !== undefined ? 0.6 : 0));
    }
    v += rowDepth / 2;
    const off = u / 2;
    for (const p of placed) {
      const pos = RIGHT.clone().multiplyScalar(p.u - off).addScaledVector(DOWN, v);
      const cat = CATALOG[p.type];
      items.push({ obj: makeObj(p.type, pos.x, pos.z, p.extra), label: p.label, wall: cat.wallMounted !== undefined });
    }
    v += rowDepth / 2 + 1.4;
  }
  return items;
}

function buildItems(mode: string): Item[] {
  if (mode === "teste") return stressItems();
  if (mode.startsWith("tipos:")) {
    const types = mode.slice(6).split(",").filter((t): t is ObjectType => t in CATALOG);
    const per = Math.ceil(types.length / Math.ceil(types.length / 4));
    const rows: { type: ObjectType; label: string }[][] = [];
    for (let i = 0; i < types.length; i += per) rows.push(types.slice(i, i + per).map((t) => ({ type: t, label: NAMES[t] ?? t })));
    return layoutRows(rows);
  }
  if (mode === "variantes") {
    const rows: { type: ObjectType; extra?: Partial<MapObject>; label: string }[][] = [];
    let cur: { type: ObjectType; extra?: Partial<MapObject>; label: string }[] = [];
    for (const t of FURNITURE_TYPES) {
      const n = VARIANTS[t] ?? 1;
      if (n < 2) continue;
      for (let v = 0; v < n; v++) cur.push({ type: t, extra: { variant: v }, label: `${NAMES[t]} · v${v}` });
      if (cur.length >= 7) {
        rows.push(cur);
        cur = [];
      }
    }
    if (cur.length) rows.push(cur);
    cur = [];
    for (const s of COLOR_SAMPLES) {
      cur.push({ type: s.type, extra: { color: s.color, accent: s.accent, ...(s.text ? { text: s.text } : {}) }, label: `${NAMES[s.type]} · cor` });
      if (cur.length >= 6) {
        rows.push(cur);
        cur = [];
      }
    }
    if (cur.length) rows.push(cur);
    return layoutRows(rows);
  }
  const groups = GROUPS.filter((g) => mode === "todos" || g.id === mode);
  const rows = groups.map((g) => g.types.map((t) => ({ type: t, label: NAMES[t] ?? t })));
  // fileiras muito longas viram duas
  const split = rows.flatMap((r) => (r.length > 6 && mode !== "todos" ? [r.slice(0, Math.ceil(r.length / 2)), r.slice(Math.ceil(r.length / 2))] : [r]));
  return layoutRows(split);
}

/** 600 objetos com combinações realistas (tipos, variantes e cores repetidas por sala). */
function stressItems(): Item[] {
  const items: Item[] = [];
  const colors = [undefined, PALETTE.orange, PALETTE.sky, PALETTE.green];
  const weights: [ObjectType, number][] = FURNITURE_TYPES.map((t) => [t, t === "office-chair" || t === "desk" || t === "chair" || t === "plant" ? 8 : t.includes("table") || t === "desk-dual" ? 3 : 1]);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = 25;
  for (let i = 0; i < 600; i++) {
    let r = rnd() * total;
    let type: ObjectType = "desk";
    for (const [t, w] of weights) {
      r -= w;
      if (r <= 0) {
        type = t;
        break;
      }
    }
    const x = (i % cols) * 3.4 - (cols * 3.4) / 2;
    const z = Math.floor(i / cols) * 3.4 - 40;
    const nv = VARIANTS[type] ?? 1;
    items.push({
      obj: makeObj(type, x, z, { variant: Math.floor(rnd() * nv), color: rnd() < 0.3 ? colors[Math.floor(rnd() * colors.length)] : undefined, rot: Math.floor(rnd() * 4) * (Math.PI / 2) }),
      label: "",
      wall: false,
    });
  }
  return items;
}

interface Fit {
  box: THREE.Box3;
  /** Cantos de cada item (para enquadrar pela silhueta, não pela caixa alinhada). */
  pts: THREE.Vector3[];
}

function bounds(items: Item[]): Fit {
  const box = new THREE.Box3();
  const pts: THREE.Vector3[] = [];
  for (const it of items) {
    const c = CATALOG[it.obj.type];
    const hw = c.w / 2 + 0.3;
    const hd = c.d / 2 + (it.wall ? 0.8 : 0.4);
    const top = it.wall ? 2.9 : c.h + 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, top]) {
      const p = new THREE.Vector3(it.obj.pos.x + sx * hw, y, it.obj.pos.z + sz * hd);
      pts.push(p);
      box.expandByPoint(p);
    }
  }
  return { box, pts };
}

// ---------------------------------------------------------------- cena

/** Contadores do renderizador, fora do React da cena (o HUD assina sem re-renderizar o Canvas). */
const statsStore = {
  value: { calls: 0, tris: 0 },
  subs: new Set<() => void>(),
  set(v: { calls: number; tris: number }) {
    this.value = v;
    this.subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    statsStore.subs.add(f);
    return () => statsStore.subs.delete(f);
  },
};

function Stats({ count }: { count: number }) {
  const s = useSyncExternalStore(statsStore.subscribe, () => statsStore.value);
  return (
    <span className="text-[11px] text-[#8A93A3]" data-testid="stats">
      {count} objetos · {s.calls} draw calls · {(s.tris / 1000).toFixed(0)} mil triângulos
    </span>
  );
}

const Furniture = memo(function Furniture({ items }: { items: Item[] }) {
  const build = useMemo(() => buildFurniture(items.map((i) => i.obj)), [items]);
  useEffect(() => () => build.dispose(), [build]);
  const gl = useThree((s) => s.gl);
  const acc = useRef(0);
  const frames = useRef(0);
  useFrame((state, dt) => {
    build.update(dt, state.clock.elapsedTime);
    acc.current += dt;
    frames.current++;
    if (acc.current > 0.5) {
      acc.current = 0;
      const stats = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
      statsStore.set(stats);
      const w = window as unknown as { __galeria?: Record<string, unknown> };
      w.__galeria = { ...stats, frames: frames.current, ready: frames.current > 3, screens: build.screens.size };
    }
  });
  return <primitive object={build.group} />;
});

function Stage({ items, floor }: { items: Item[]; floor: FloorKey }) {
  const meshes = useMemo(() => {
    const plinths: THREE.BufferGeometry[] = [];
    const walls: THREE.BufferGeometry[] = [];
    for (const it of items) {
      const c = CATALOG[it.obj.type];
      const { x, z } = it.obj.pos;
      if (it.wall) {
        const g = new THREE.BoxGeometry(c.w + 0.7, 2.9, 0.12);
        g.translate(x, 1.45, z - c.d / 2 - 0.06);
        walls.push(g);
      }
      if (it.label) {
        const g = new THREE.BoxGeometry(c.w + 0.5, 0.03, c.d + (it.wall ? 0.9 : 0.5));
        g.translate(x, 0.015, z + (it.wall ? 0.2 : 0));
        plinths.push(g);
      }
    }
    return { plinths, walls };
  }, [items]);
  useEffect(() => () => [...meshes.plinths, ...meshes.walls].forEach((g) => g.dispose()), [meshes]);
  const f = FLOORS[floor];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow material={toon(f.floor)}>
        <planeGeometry args={[400, 400]} />
      </mesh>
      {meshes.plinths.map((g, i) => (
        <mesh key={`p${i}`} geometry={g} material={toon(f.plinth)} receiveShadow />
      ))}
      {meshes.walls.map((g, i) => (
        <mesh key={`w${i}`} geometry={g} material={toon("#D9D4CC")} receiveShadow />
      ))}
    </group>
  );
}

const Labels = memo(function Labels({ items }: { items: Item[] }) {
  return (
    <>
      {items
        .filter((i) => i.label)
        .map((it) => {
          const c = CATALOG[it.obj.type];
          return (
            <Html key={it.obj.id} position={[it.obj.pos.x + 0.2, 0.05, it.obj.pos.z + c.d / 2 + (it.wall ? 0.7 : 0.35)]} center zIndexRange={[10, 0]}>
              <div className="pointer-events-none whitespace-nowrap rounded-full bg-[#00112A]/85 px-2 py-0.5 text-[11px] font-medium text-[#F2F0EF] shadow">{it.label}</div>
            </Html>
          );
        })}
    </>
  );
});

const ISO_YAW = Math.PI / 4;
const ISO_PITCH = (30 * Math.PI) / 180;

function Cameras({ mode, fit, zoomMul }: { mode: "iso" | "persp"; fit: Fit; zoomMul: number }) {
  const box = fit.box;
  const size = useThree((s) => s.size);
  const controls = useRef<React.ComponentRef<typeof MapControls>>(null);
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const persp = useRef<THREE.PerspectiveCamera>(null);
  useLayoutEffect(() => {
    const center = box.getCenter(new THREE.Vector3());
    center.y = 0.6;
    if (mode === "iso" && ortho.current) {
      const dir = new THREE.Vector3(Math.sin(ISO_YAW) * Math.cos(ISO_PITCH), Math.sin(ISO_PITCH), Math.cos(ISO_YAW) * Math.cos(ISO_PITCH));
      const cam = ortho.current;
      cam.position.copy(center).addScaledVector(dir, 120);
      cam.up.set(0, 1, 0);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      // mede a caixa no espaço da câmera para enquadrar
      const inv = cam.matrixWorldInverse;
      const pb = new THREE.Box3();
      for (const p of fit.pts) pb.expandByPoint(p.clone().applyMatrix4(inv));
      const w = pb.max.x - pb.min.x;
      const h = pb.max.y - pb.min.y;
      // centraliza pela silhueta projetada
      const mid = new THREE.Vector3((pb.max.x + pb.min.x) / 2, (pb.max.y + pb.min.y) / 2, (pb.max.z + pb.min.z) / 2).applyMatrix4(cam.matrixWorld);
      const shift = mid.sub(center);
      cam.position.add(shift);
      center.add(shift);
      cam.zoom = Math.min(size.width / w, size.height / h) * 0.95 * zoomMul;
      cam.near = 0.1;
      cam.far = 600;
      cam.updateProjectionMatrix();
    } else if (persp.current) {
      const cam = persp.current;
      const r = box.getSize(new THREE.Vector3()).length() / 2;
      const yaw = (35 * Math.PI) / 180;
      const pitch = (34 * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const dist = (r / Math.sin(((cam.fov / 2) * Math.PI) / 180)) * 0.82 / zoomMul;
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.near = 0.1;
      cam.far = dist * 4;
      cam.updateProjectionMatrix();
    }
    if (controls.current) {
      controls.current.target.copy(center);
      controls.current.update();
    }
  }, [mode, fit, size, zoomMul]);
  return (
    <>
      {mode === "iso" ? <OrthographicCamera ref={ortho} makeDefault /> : <PerspectiveCamera ref={persp} makeDefault fov={35} />}
      <MapControls ref={controls} enableRotate={mode === "persp"} screenSpacePanning makeDefault />
    </>
  );
}

function Lights({ box }: { box: THREE.Box3 }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const center = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2 + 2;
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.5;
    cam.far = r * 4;
    cam.updateProjectionMatrix();
  });
  return (
    <>
      <hemisphereLight args={["#DDEBFF", "#2A2433", 1.15]} />
      <directionalLight
        ref={light}
        position={[center.x - r * 0.55, r * 1.6, center.z + r * 0.9]}
        intensity={2.1}
        color="#FFF4E6"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

function PixelCanvas({ pixel }: { pixel: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.domElement.style.imageRendering = pixel ? "pixelated" : "auto";
  }, [gl, pixel]);
  return null;
}

// ---------------------------------------------------------------- página

function param(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

export default function Gallery() {
  const [cam, setCam] = useState<"iso" | "persp">(param("cam") === "persp" ? "persp" : "iso");
  const [pixel, setPixel] = useState(param("pixel") === "1");
  const [mode, setMode] = useState(param("tipos") ? `tipos:${param("tipos")}` : (param("grupo") ?? "todos"));
  const [floor, setFloor] = useState<FloorKey>((param("piso") as FloorKey) in FLOORS ? (param("piso") as FloorKey) : "escuro");
  const [shadows] = useState(param("sombras") !== "0");
  const zoomMul = Number(param("zoom") ?? 1) || 1;
  const items = useMemo(() => buildItems(mode), [mode]);
  const fit = useMemo(() => bounds(items), [items]);
  const isPixel = pixel && cam === "iso";

  const btn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? "bg-[#00B7FF] text-[#00112A]" : "bg-white/8 text-[#F2F0EF] hover:bg-white/15"}`;

  return (
    <div className="relative h-full w-full bg-[#020B18]">
      <Canvas
        key={isPixel ? "pixel" : "liso"}
        flat
        shadows={shadows}
        dpr={isPixel ? 1 / 3 : [1, 2]}
        gl={{ antialias: !isPixel, preserveDrawingBuffer: true }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(PALETTE.space);
        }}
      >
        <PixelCanvas pixel={isPixel} />
        <Cameras mode={cam} fit={fit} zoomMul={zoomMul} />
        <Lights box={fit.box} />
        <Stage items={items} floor={floor} />
        <Furniture items={items} />
        {mode !== "teste" && <Labels items={items} />}
      </Canvas>

      <div className="pointer-events-auto absolute left-3 top-3 flex max-w-[min(92vw,760px)] flex-col gap-2 rounded-xl bg-[#00112A]/90 p-3 text-[#F2F0EF] shadow-lg">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-sm tracking-wide">Galeria de móveis</h1>
          <Stats count={items.length} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={btn(cam === "iso")} onClick={() => setCam("iso")}>
            Isométrica
          </button>
          <button className={btn(cam === "persp")} onClick={() => setCam("persp")}>
            3/4 perspectiva
          </button>
          <button className={btn(isPixel)} disabled={cam !== "iso"} onClick={() => setPixel((p) => !p)} title="Renderiza em 1/3 da resolução, como o 2D">
            Pixel
          </button>
          <span className="mx-1 w-px bg-white/15" />
          {(Object.keys(FLOORS) as FloorKey[]).map((k) => (
            <button key={k} className={btn(floor === k)} onClick={() => setFloor(k)}>
              {FLOORS[k].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={btn(mode === "todos")} onClick={() => setMode("todos")}>
            Todos
          </button>
          {GROUPS.map((g) => (
            <button key={g.id} className={btn(mode === g.id)} onClick={() => setMode(g.id)}>
              {g.name}
            </button>
          ))}
          <button className={btn(mode === "variantes")} onClick={() => setMode("variantes")}>
            Variantes
          </button>
          <button className={btn(mode === "teste")} onClick={() => setMode("teste")}>
            Teste com 600
          </button>
        </div>
      </div>
    </div>
  );
}
