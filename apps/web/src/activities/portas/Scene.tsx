import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "../../scene/Html.tsx";
import * as THREE from "three";
import { DoorClosed, Ear, Lock, StickyNote } from "lucide-react";
import { PORTAS, PORTAS_ID, dirOfYaw, type DoorDef, type DoorState, type Lens, type PortasState } from "@infinity/world";
import { useAct } from "../registry.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { doors, usePortasUi, zoneAt } from "./state.ts";
import { T } from "./strings.ts";

/**
 * O pacote "portas" no mundo, igual nas duas lentes:
 * - a folha de cada porta (abre para dentro quando a porta está aberta), batente, luz e soleira na cor
 *   do estado (azul = fechada, laranja = não perturbe), e o selo/bilhete para quem chega perto;
 * - o anel e a cúpula discreta das rodas fechadas;
 * - a marca de sussurro sobre a outra pessoa, só para quem está sussurrando e para quem recebe.
 */
export function PortasScene({ lens }: { lens: Lens }) {
  return (
    <>
      <Doors lens={lens} />
      <DoorLabels lens={lens} />
      <Circles />
      <WhisperMarks />
    </>
  );
}

// ---- portas -------------------------------------------------------------------------------------

const LEAF_H = { "3d": 2.15, "2d": 0.98 } as const;
const OPEN_ANGLE = Math.PI * 0.48;
const COLOR: Record<DoorState, THREE.Color> = {
  open: new THREE.Color("#2A3A55"),
  closed: new THREE.Color("#00B7FF"),
  locked: new THREE.Color("#EE5C29"),
};

const tmpM = new THREE.Matrix4();
const tmpA = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Matriz da porta (origem no centro do vão, +Z para fora). */
function doorBase(d: DoorDef, out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(tmpV.set(d.pos.x, 0, d.pos.z), tmpQ.setFromAxisAngle(UP, Math.PI - d.rot), tmpS.set(1, 1, 1));
}

function Doors({ lens }: { lens: Lens }) {
  const state = useAct<PortasState>(PORTAS_ID);
  const list = useMemo(() => doors(), []);
  const solid = useMemo(() => list.filter((d) => !d.glass), [list]);
  const glass = useMemo(() => list.filter((d) => d.glass), [list]);
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const handleRef = useRef<THREE.InstancedMesh>(null);
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.InstancedMesh>(null);
  const sillRef = useRef<THREE.InstancedMesh>(null);
  /** Ângulo atual de cada folha (anima até o alvo). */
  const angle = useRef(new Map<string, number>());
  const dirty = useRef(true);
  const h = LEAF_H[lens];

  const geo = useMemo(
    () => ({
      leaf: new THREE.BoxGeometry(1, 1, 0.045).translate(0.5, 0.5, 0),
      handle: new THREE.BoxGeometry(0.03, 0.03, 0.14),
      unit: new THREE.BoxGeometry(1, 1, 1),
      sill: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    }),
    [],
  );
  const mat = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ color: "#C9A27E", roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: "#CDE9F8", roughness: 0.15, transparent: true, opacity: 0.38, depthWrite: false }),
      handle: new THREE.MeshStandardMaterial({ color: "#D9DEE6", metalness: 0.6, roughness: 0.3 }),
      frame: new THREE.MeshStandardMaterial({ color: "#1B2A44", roughness: 0.6 }),
      light: new THREE.MeshBasicMaterial({ toneMapped: false }),
      sill: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
    },
    [geo, mat],
  );

  // Batente fixo: dois montantes e, no 3D, a verga.
  useEffect(() => {
    const m = frameRef.current;
    if (!m) return;
    let i = 0;
    for (const d of list) {
      doorBase(d, tmpA);
      for (const side of [-1, 1]) {
        tmpM.compose(tmpV.set((side * d.width) / 2, h / 2, 0), tmpQ.identity(), tmpS.set(0.06, h, 0.18));
        m.setMatrixAt(i++, tmpA.clone().multiply(tmpM));
      }
      tmpM.compose(tmpV.set(0, h + 0.03, 0), tmpQ.identity(), lens === "3d" ? tmpS.set(d.width + 0.06, 0.06, 0.18) : tmpS.set(0, 0, 0));
      m.setMatrixAt(i++, tmpA.clone().multiply(tmpM));
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    dirty.current = true;
  }, [list, h, lens]);

  // Cor da luz e da soleira pelo estado.
  useEffect(() => {
    const light = lightRef.current;
    const sill = sillRef.current;
    if (!light || !sill) return;
    list.forEach((d, i) => {
      const s = state?.doors[d.zoneId]?.state ?? "open";
      light.setColorAt(i, COLOR[s]);
      sill.setColorAt(i, COLOR[s]);
    });
    if (light.instanceColor) light.instanceColor.needsUpdate = true;
    if (sill.instanceColor) sill.instanceColor.needsUpdate = true;
    dirty.current = true;
  }, [state, list]);

  useFrame((_, dt) => {
    let moving = dirty.current;
    dirty.current = false;
    for (const d of list) {
      const target = (state?.doors[d.zoneId]?.state ?? "open") === "open" ? OPEN_ANGLE : 0;
      const cur = angle.current.get(d.zoneId) ?? target;
      const next = Math.abs(target - cur) < 0.002 ? target : cur + (target - cur) * Math.min(1, dt * 7);
      if (next !== cur || !angle.current.has(d.zoneId)) moving = true;
      angle.current.set(d.zoneId, next);
    }
    if (!moving) return;
    const place = (mesh: THREE.InstancedMesh | null, group: DoorDef[]) => {
      if (!mesh) return;
      group.forEach((d, i) => {
        doorBase(d, tmpA);
        const a = angle.current.get(d.zoneId) ?? 0;
        // Dobradiça num lado do vão; a folha gira para dentro da sala.
        tmpM.makeTranslation(-d.width / 2 + 0.04, 0, 0);
        tmpA.multiply(tmpM);
        tmpA.multiply(tmpM.makeRotationY(a));
        tmpA.multiply(tmpM.makeScale(d.width - 0.08, h, 1));
        mesh.setMatrixAt(i, tmpA);
      });
      mesh.count = group.length;
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(solidRef.current, solid);
    place(glassRef.current, glass);
    const handle = handleRef.current;
    const light = lightRef.current;
    const sill = sillRef.current;
    list.forEach((d, i) => {
      const a = angle.current.get(d.zoneId) ?? 0;
      const s = state?.doors[d.zoneId]?.state ?? "open";
      if (handle) {
        doorBase(d, tmpA);
        tmpA.multiply(tmpM.makeTranslation(-d.width / 2 + 0.04, 0, 0)).multiply(tmpM.makeRotationY(a));
        tmpA.multiply(tmpM.makeTranslation(d.width - 0.2, Math.min(1.0, h * 0.5), 0));
        handle.setMatrixAt(i, tmpA);
      }
      if (light) {
        // Faixa de luz sobre a porta (no 2D, em cima da folha baixa). Aberta: apagada e fininha.
        doorBase(d, tmpA);
        tmpM.compose(tmpV.set(0, lens === "3d" ? h + 0.1 : h + 0.03, 0), tmpQ.identity(), tmpS.set(d.width * 0.62, s === "open" ? 0.012 : 0.05, 0.2));
        light.setMatrixAt(i, tmpA.multiply(tmpM));
      }
      if (sill) {
        doorBase(d, tmpA);
        tmpM.compose(tmpV.set(0, 0.012, 0), tmpQ.identity(), s === "open" ? tmpS.set(0, 0, 0) : tmpS.set(d.width, 1, 0.16));
        sill.setMatrixAt(i, tmpA.multiply(tmpM));
      }
    });
    for (const m of [handle, light, sill]) {
      if (!m) continue;
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="portas">
      {solid.length > 0 && <instancedMesh ref={solidRef} args={[geo.leaf, mat.solid, solid.length]} frustumCulled={false} />}
      {glass.length > 0 && <instancedMesh ref={glassRef} args={[geo.leaf, mat.glass, glass.length]} frustumCulled={false} renderOrder={2} />}
      <instancedMesh ref={handleRef} args={[geo.handle, mat.handle, list.length]} frustumCulled={false} />
      <instancedMesh ref={frameRef} args={[geo.unit, mat.frame, list.length * 3]} frustumCulled={false} />
      <instancedMesh ref={lightRef} args={[geo.unit, mat.light, list.length]} frustumCulled={false} />
      <instancedMesh ref={sillRef} args={[geo.sill, mat.sill, list.length]} frustumCulled={false} />
    </group>
  );
}

/** Selo de estado (fechada / não perturbe) e bilhete, só para quem está perto da porta. */
function DoorLabels({ lens }: { lens: Lens }) {
  const state = useAct<PortasState>(PORTAS_ID);
  const list = useMemo(() => doors(), []);
  const [near, setNear] = useState<string>("");
  useEffect(() => {
    const read = () => {
      const zone = zoneAt(self)?.id;
      const ids = list
        .filter((d) => d.zoneId !== zone && Math.hypot(d.outside.x - self.x, d.outside.z - self.z) <= PORTAS.noteRange)
        .map((d) => d.zoneId)
        .join(",");
      setNear((prev) => (prev === ids ? prev : ids));
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [list]);
  const nearSet = new Set(near.split(",").filter(Boolean));
  // Placa na parede ao lado da porta, do lado de fora (não cobre quem está parado no vão).
  // No 3D, na altura dos olhos; no 2D (paredes baixas), na metade da parede.
  const y = lens === "3d" ? 1.55 : 0.55;
  return (
    <>
      {list.map((d) => {
        const s = state?.doors[d.zoneId];
        if (!s) return null;
        const close = nearSet.has(d.zoneId);
        if (s.state === "open" && !(close && s.note)) return null;
        const f = dirOfYaw(d.rot);
        const side = d.width / 2 + 0.5;
        const at: [number, number, number] = [d.pos.x - f.z * side + f.x * 0.15, y, d.pos.z + f.x * side + f.z * 0.15];
        const locked = s.state === "locked";
        return (
          <Html key={d.zoneId} position={at} center zIndexRange={[7, 0]} style={{ pointerEvents: "none" }}>
            <div className="flex flex-col items-center gap-1" data-portas-selo={d.zoneId} data-estado={s.state}>
              {s.state !== "open" && (
                <div
                  className={
                    locked
                      ? "flex items-center gap-1 whitespace-nowrap rounded-full bg-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-offwhite shadow-lg"
                      : "flex items-center gap-1 whitespace-nowrap rounded-full bg-space/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-signal shadow-lg ring-1 ring-signal/40"
                  }
                >
                  {locked ? <Lock className="size-3" aria-hidden /> : <DoorClosed className="size-3" aria-hidden />}
                  {close ? T.door.badge[s.state] : null}
                </div>
              )}
              {close && s.note && (
                <div className="flex max-w-[220px] items-start gap-1.5 rounded-md bg-cream px-2 py-1 text-[11px] font-medium leading-snug text-space shadow-lg">
                  <StickyNote className="mt-px size-3 shrink-0 text-space/60" aria-hidden />
                  <span>{s.note}</span>
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}

// ---- rodas fechadas -----------------------------------------------------------------------------

function Circles() {
  const state = useAct<PortasState>(PORTAS_ID);
  const circles = state?.circles ?? [];
  return (
    <>
      {circles.map((c) => (
        <CircleRing key={c.id} id={c.id} />
      ))}
    </>
  );
}

const RING_COLOR = new THREE.Color("#00B7FF");

function CircleRing({ id }: { id: string }) {
  const state = useAct<PortasState>(PORTAS_ID);
  const c = state?.circles.find((x) => x.id === id);
  const group = useRef<THREE.Group>(null);
  const shown = useRef<{ x: number; z: number; r: number } | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const cur = shown.current;
      setNear(!!cur && Math.hypot(cur.x - self.x, cur.z - self.z) <= cur.r + 6);
    }, 300);
    return () => window.clearInterval(iv);
  }, []);
  const geo = useMemo(
    () => ({
      ring: new THREE.RingGeometry(0.965, 1, 72).rotateX(-Math.PI / 2),
      dome: new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    }),
    [],
  );
  const mat = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }),
      dome: new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
    },
    [geo, mat],
  );
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !c) return;
    const want = { x: c.center.x, z: c.center.z, r: c.radius };
    const cur = (shown.current ??= { ...want });
    const k = Math.min(1, dt * 4);
    cur.x += (want.x - cur.x) * k;
    cur.z += (want.z - cur.z) * k;
    cur.r += (want.r - cur.r) * k;
    g.position.set(cur.x, 0.015, cur.z);
    g.scale.set(cur.r, cur.r * 0.55, cur.r);
  });
  if (!c) return null;
  return (
    <group ref={group} name={`roda-${id}`} position={[c.center.x, 0.015, c.center.z]} scale={[c.radius, c.radius * 0.55, c.radius]}>
      <mesh geometry={geo.ring} material={mat.ring} renderOrder={3} />
      <mesh geometry={geo.dome} material={mat.dome} renderOrder={3} />
      {near && (
        <Html position={[0, 0.05, 1.0]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div className="flex items-center gap-1 whitespace-nowrap rounded-full bg-space/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-signal shadow-lg ring-1 ring-signal/40" data-portas-roda={id}>
            <Lock className="size-3" aria-hidden />
            {T.circle.badge}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- sussurro -----------------------------------------------------------------------------------

/** Marca sobre a outra pessoa do sussurro (só as duas pessoas veem). */
function WhisperMarks() {
  const whisper = usePortasUi((s) => s.whisper);
  const incoming = usePortasUi((s) => s.incoming);
  const ids = [...new Set([...(whisper ? [whisper.to] : []), ...Object.keys(incoming)])];
  return (
    <>
      {ids.map((id) => (
        <WhisperMark key={id} id={id} />
      ))}
    </>
  );
}

/**
 * Anel pulsando no chão, sob a outra pessoa do sussurro, com um selinho de orelha na borda
 * (no chão: não briga com a etiqueta de nome nem com a bolha de vídeo).
 */
function WhisperMark({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((state) => {
    const r = sampleRemote(id);
    if (!r || !group.current) return;
    group.current.position.set(r.x, 0.02, r.z);
    const k = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 5);
    mat.opacity = 0.45 + 0.4 * k;
    group.current.scale.setScalar(1 + 0.08 * k);
  });
  return (
    <group ref={group}>
      <mesh geometry={geo} material={mat} renderOrder={3} />
      <Html position={[0, 0.05, 0.62]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
        <div className="grid size-5 place-items-center rounded-full bg-signal text-space shadow-lg" data-portas-sussurro={id}>
          <Ear className="size-3" aria-hidden />
        </div>
      </Html>
    </group>
  );
}
