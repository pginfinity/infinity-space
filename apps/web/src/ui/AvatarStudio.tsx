import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AvatarLook, Emote } from "@infinity/world";
import { buildAvatar } from "../avatar/build.ts";
import { animate, newAnimState } from "../avatar/animate.ts";

/** Prévia 3D do avatar no criador: gira devagar, pisca e acena quando o visual muda. */
export default function AvatarStudio({ look, emote }: { look: AvatarLook; emote?: { e: Emote; at: number } | null }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [0, 0.95, 3.4] }} gl={{ antialias: true, alpha: true }} onCreated={({ camera }) => camera.lookAt(0, 0.78, 0)}>
      <hemisphereLight args={["#E6F0FF", "#2A3550", 1.25]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} color="#FFF1DE" />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#7FC8FF" />
      <Model look={look} emote={emote ?? null} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[0.75, 48]} />
        <meshBasicMaterial color="#00B7FF" transparent opacity={0.12} />
      </mesh>
    </Canvas>
  );
}

function Model({ look, emote }: { look: AvatarLook; emote: { e: Emote; at: number } | null }) {
  const key = JSON.stringify(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rig = useMemo(() => buildAvatar(look), [key]);
  const st = useMemo(newAnimState, []);
  const spin = useRef(0.35);
  const lastKey = useRef(key);
  const waveAt = useRef(performance.now());

  // Acena quando o visual muda (feedback de "ficou bom!").
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      waveAt.current = performance.now();
    }
  }, [key]);

  useFrame((_, dt) => {
    const now = performance.now();
    spin.current += dt * 0.35;
    rig.root.rotation.y = Math.sin(spin.current) * 0.6;
    const custom = emote && now - emote.at < 2500 ? { e: emote.e, t: (now - emote.at) / 1000 } : null;
    const since = (now - waveAt.current) / 1000;
    const auto = since < 1.6 ? { e: "wave" as Emote, t: since } : null;
    animate(rig, st, "idle", 0, dt, now, 0, custom ?? auto);
  });

  return <primitive object={rig.root} />;
}

export const _three = THREE;
