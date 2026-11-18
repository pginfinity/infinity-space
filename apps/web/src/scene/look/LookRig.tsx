import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Lens } from "@infinity/world";
import { self } from "../../world/registry.ts";
import { LOOK } from "./looks.ts";
import { useQuality } from "../quality.ts";

/**
 * Luz e ambiente da prévia de visual (ver looks.ts): reflexos de ambiente, luz de recorte, exposição
 * e sombras projetadas pela luz principal (seguindo você, para cobrir o que está na tela).
 * No visual atual não faz nada.
 */
export function LookRig({ lens }: { lens: Lens }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rim = useRef<THREE.DirectionalLight>(null);
  const quality = useQuality((s) => s.mode);

  // Reflexos: um "estúdio" neutro gerado na hora (sem baixar nada).
  useEffect(() => {
    if (!LOOK.env) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // (no three atual, a força do ambiente da cena é aqui; a do material só vale para material.envMap)
    scene.environmentIntensity = LOOK.env;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    gl.toneMappingExposure = LOOK.exposure;
  }, [gl]);

  // Sombras: liga no renderizador e marca as malhas (de tempos em tempos, para as que chegam depois).
  useEffect(() => {
    if (!LOOK.shadows) return;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const mark = () => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.lookShadow) return;
        m.userData.lookShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const solid = mats.every((x) => !x.transparent && !(x as THREE.MeshBasicMaterial).isMeshBasicMaterial);
        m.castShadow = solid && !m.name.startsWith("floor");
        m.receiveShadow = true;
        mats.forEach((x) => (x.needsUpdate = true));
      });
    };
    mark();
    const id = window.setInterval(mark, 2000);
    return () => window.clearInterval(id);
  }, [gl, scene]);

  const key = useRef<THREE.DirectionalLight | null>(null);
  const offset = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!LOOK.shadows) return;
    // A luz principal é a direcional mais forte da cena (ver SunLights em WorldScene.tsx).
    if (!key.current) {
      let best: THREE.DirectionalLight | null = null;
      scene.traverse((o) => {
        const l = o as THREE.DirectionalLight;
        if (l.isDirectionalLight && l !== rim.current && (!best || l.intensity > best.intensity)) best = l;
      });
      if (!best) return;
      const l = best as THREE.DirectionalLight;
      key.current = l;
      offset.current.copy(l.position).sub(l.target.position).normalize().multiplyScalar(40);
      l.castShadow = true;
      // Resolução da sombra pelo modo de qualidade (borda mais limpa no "alta").
      const size = quality === "leve" ? 1024 : quality === "alta" ? 4096 : 2048;
      l.shadow.mapSize.set(size, size);
      const cam = l.shadow.camera;
      cam.left = -22;
      cam.right = 22;
      cam.top = 22;
      cam.bottom = -22;
      cam.near = 1;
      cam.far = 120;
      cam.updateProjectionMatrix();
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.03;
      l.shadow.radius = lens === "2d" ? 2 : 3;
      scene.add(l.target);
    }
    const l = key.current;
    l.target.position.set(self.x, 0, self.z);
    l.position.copy(l.target.position).add(offset.current);
  });

  if (!LOOK.lights.rim) return null;
  return <directionalLight ref={rim} position={[-30, 22, -26]} intensity={LOOK.lights.rim.intensity} color={LOOK.lights.rim.color} />;
}
