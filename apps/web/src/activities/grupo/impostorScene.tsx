import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { IMP_ID, type ImpState, type Lens } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { impSpots, useImpLocal } from "./impostorStore.ts";

/**
 * Impostor no mundo (nas duas lentes): bloco de gelo onde alguém foi congelado (até a próxima reunião),
 * um floco de neve sobre quem já está fora do jogo e, só para você, marcadores nas suas tarefas.
 */
export function ImpostorScene(_: { lens: Lens }) {
  const s = useAct<ImpState>(IMP_ID);
  const playing = !!s && (s.phase === "playing" || s.phase === "meeting" || s.phase === "result");
  if (!playing) return null;
  return (
    <>
      {s.frozen.map((f) => (
        <IceBlock key={`${s.game}-${f.id}`} x={f.x} z={f.z} />
      ))}
      <OutMarkers />
      <TaskMarkers />
    </>
  );
}

const iceMat = new THREE.MeshToonMaterial({ color: "#BFE8FF", transparent: true, opacity: 0.5, depthWrite: false });
const iceEdge = new THREE.MeshBasicMaterial({ color: "#E9F7FF", transparent: true, opacity: 0.85, toneMapped: false });
const flakeMat = new THREE.MeshBasicMaterial({ color: "#9FDcff", toneMapped: false });
const taskMat = new THREE.MeshBasicMaterial({ color: "#00B7FF", toneMapped: false });

function IceBlock({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // cresce rápido ao aparecer
    const k = Math.min(1, (performance.now() - born.current) / 350);
    g.scale.set(1, 0.2 + 0.8 * k, 1);
  });
  return (
    <group ref={ref} position={[x, 0, z]} name="impostor:gelo">
      <mesh position={[0, 0.95, 0]} material={iceMat} renderOrder={3}>
        <boxGeometry args={[0.8, 1.9, 0.8]} />
      </mesh>
      <mesh position={[0, 1.91, 0]} material={iceEdge} renderOrder={3}>
        <boxGeometry args={[0.84, 0.04, 0.84]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={iceEdge} renderOrder={3}>
        <boxGeometry args={[0.9, 0.05, 0.9]} />
      </mesh>
    </group>
  );
}

/** Floco de neve sobre quem já saiu do jogo (congelado ou ejetado). */
function OutMarkers() {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => new THREE.OctahedronGeometry(0.12, 0), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state) => {
    const g = group.current;
    const s = actState<ImpState>(IMP_ID);
    if (!g || !s) return;
    const me = useApp.getState().selfId;
    const out = s.players.filter((p) => !p.alive && !p.away);
    while (g.children.length < out.length) g.add(new THREE.Mesh(geo, flakeMat));
    const now = performance.now();
    g.children.forEach((m, i) => {
      const p = out[i];
      const pos = p ? (p.id === me ? self : sampleRemote(p.id, now)) : null;
      m.visible = !!pos;
      if (!pos) return;
      m.position.set(pos.x, 2.35 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.05, pos.z);
      m.rotation.y = state.clock.elapsedTime * 1.5;
    });
  });
  return <group ref={group} name="impostor:fora" />;
}

/** Marcadores das minhas tarefas pendentes (só eu vejo). */
function TaskMarkers() {
  const role = useImpLocal((l) => l.role);
  const s = useAct<ImpState>(IMP_ID);
  const pending = role && s && role.game === s.game && s.phase === "playing" ? role.tasks.filter((t) => !role.done.includes(t)) : [];
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => new THREE.OctahedronGeometry(0.11, 0), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((m, i) => {
      m.position.y = 1.8 + Math.sin(state.clock.elapsedTime * 2.2 + i) * 0.08;
      m.rotation.y = state.clock.elapsedTime * 1.8;
    });
  });
  const spots = impSpots();
  return (
    <group ref={group} name="impostor:tarefas">
      {pending.map((id) => {
        const p = spots.get(id)!.point;
        return <mesh key={id} geometry={geo} material={taskMat} position={[p.x, 1.8, p.z]} scale={[1, 1.5, 1]} />;
      })}
    </group>
  );
}
