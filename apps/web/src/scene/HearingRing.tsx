import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HEARING } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { useMedia } from "../media/rtc.ts";
import { self } from "../world/registry.ts";

/**
 * Anel "quem te ouve": com o microfone ligado, um círculo fino no chão marca até onde sua voz chega
 * nítida (raio de conversa). Fica mais forte enquanto você fala. Igual nas duas lentes.
 */
export function HearingRing() {
  const mesh = useRef<THREE.Mesh>(null);
  const { geo, mat } = useMemo(
    () => ({
      geo: new THREE.RingGeometry(HEARING.conversation - 0.05, HEARING.conversation, 96).rotateX(-Math.PI / 2),
      mat: new THREE.MeshBasicMaterial({ color: "#00B7FF", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  const level = useRef(0);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const media = useMedia.getState();
    const id = useApp.getState().selfId;
    const speaking = !!id && !!media.speaking[id];
    const target = media.mic ? (speaking ? 0.55 : 0.22) : 0;
    level.current += (target - level.current) * Math.min(1, dt * 6);
    mat.opacity = level.current;
    m.visible = level.current > 0.01;
    m.position.set(self.x, 0.025, self.z);
  });
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={1} />;
}
