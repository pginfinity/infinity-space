import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { AvatarLook, PlayerInfo } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { sampleRemote, self, type Pose } from "../world/registry.ts";
import { STATUS_COLOR } from "../world/theme.ts";

/** Todos os avatares da sala. */
export function Avatars3D() {
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  return (
    <>
      {Object.values(players).map((p) => (
        <Avatar3D key={p.id} info={p} isSelf={p.id === selfId} />
      ))}
    </>
  );
}

// Geometrias compartilhadas por todos os avatares.
const GEO = {
  torso: new THREE.CapsuleGeometry(0.21, 0.34, 6, 16),
  limb: new THREE.CapsuleGeometry(0.075, 0.42, 4, 10),
  head: new THREE.SphereGeometry(0.19, 24, 18),
  hair: new THREE.SphereGeometry(0.2, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
  bun: new THREE.SphereGeometry(0.09, 16, 12),
  eye: new THREE.SphereGeometry(0.024, 10, 8),
  shadow: new THREE.CircleGeometry(0.42, 32),
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.75): THREE.MeshStandardMaterial {
  const key = `${color}:${rough}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
    matCache.set(key, m);
  }
  return m;
}
const EYE = new THREE.MeshBasicMaterial({ color: "#141414" });
const SHADOW = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false });
const PANTS = "#1C2433";

function Avatar3D({ info, isSelf }: { info: PlayerInfo; isSelf: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const scratch = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0, anim: "idle" }), []);
  const phase = useRef(0);
  const look: AvatarLook = info.look;

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const p = isSelf ? self : sampleRemote(info.id, performance.now(), scratch);
    if (!p) return;
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.PI - p.yaw;
    const moving = p.anim === "walk" || p.anim === "run";
    const speed = p.anim === "run" ? 15 : 9;
    phase.current = moving ? phase.current + dt * speed : phase.current * 0.85;
    const swing = moving ? Math.sin(phase.current) * (p.anim === "run" ? 0.75 : 0.5) : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = swing * 0.8;
    if (body.current) body.current.position.y = moving ? Math.abs(Math.sin(phase.current)) * 0.045 : Math.sin(performance.now() * 0.002) * 0.006;
  });

  const away = info.status === "away";

  return (
    <group ref={root}>
      <mesh geometry={GEO.shadow} material={SHADOW} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
      <group ref={body}>
        {/* Pernas com pivô no quadril. */}
        <group ref={legL} position={[-0.1, 0.78, 0]}>
          <mesh geometry={GEO.limb} material={mat(PANTS)} position={[0, -0.36, 0]} />
        </group>
        <group ref={legR} position={[0.1, 0.78, 0]}>
          <mesh geometry={GEO.limb} material={mat(PANTS)} position={[0, -0.36, 0]} />
        </group>
        <mesh geometry={GEO.torso} material={mat(look.color, 0.85)} position={[0, 1.08, 0]} />
        {/* Braços com pivô no ombro. */}
        <group ref={armL} position={[-0.28, 1.3, 0]}>
          <mesh geometry={GEO.limb} material={mat(look.color, 0.85)} position={[0, -0.27, 0]} scale={[0.95, 0.85, 0.95]} />
        </group>
        <group ref={armR} position={[0.28, 1.3, 0]}>
          <mesh geometry={GEO.limb} material={mat(look.color, 0.85)} position={[0, -0.27, 0]} scale={[0.95, 0.85, 0.95]} />
        </group>
        <mesh geometry={GEO.head} material={mat(look.skin, 0.6)} position={[0, 1.58, 0]} />
        <Hair look={look} />
        <mesh geometry={GEO.eye} material={EYE} position={[-0.065, 1.6, 0.172]} />
        <mesh geometry={GEO.eye} material={EYE} position={[0.065, 1.6, 0.172]} />
      </group>
      <Suspense fallback={null}>
        <Billboard position={[0, 2.08, 0]}>
          <Text
            font="/fonts/Geist-Variable.ttf"
            fontSize={0.15}
            color={isSelf ? "#9BDBFF" : "#F2F0EF"}
            outlineWidth={0.012}
            outlineColor="#00112A"
            anchorX="center"
            anchorY="middle"
            fillOpacity={away ? 0.6 : 1}
          >
            {info.name}
          </Text>
          <mesh position={[-(info.name.length * 0.045 + 0.1), 0, 0]}>
            <circleGeometry args={[0.035, 16]} />
            <meshBasicMaterial color={STATUS_COLOR[info.status]} />
          </mesh>
        </Billboard>
      </Suspense>
    </group>
  );
}

/** Estilos de cabelo: 0 raspado, 1 curto, 2 com coque, 3 longo. */
function Hair({ look }: { look: AvatarLook }) {
  const m = mat(look.hairColor, 0.9);
  if (look.hair === 0) return null;
  return (
    <group position={[0, 1.6, 0]}>
      <mesh geometry={GEO.hair} material={m} rotation={[-0.35, 0, 0]} position={[0, 0.005, -0.012]} />
      {look.hair === 2 && <mesh geometry={GEO.bun} material={m} position={[0, 0.16, -0.12]} />}
      {look.hair === 3 && (
        <mesh material={m} position={[0, -0.16, -0.1]}>
          <capsuleGeometry args={[0.15, 0.2, 4, 12]} />
        </mesh>
      )}
    </group>
  );
}
