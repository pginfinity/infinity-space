import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Lens } from "@infinity/world";
import { self } from "../../world/registry.ts";
import { LOOK } from "./looks.ts";
import { useQuality } from "../quality.ts";

/**
 * Luz e ambiente da prévia de visual (ver looks.ts): reflexos de ambiente, luz de recorte, exposição
 * e sombras projetadas pela luz principal (seguindo você, para cobrir o que está na tela).
 * No visual atual não faz nada.
 */
/**
 * Ambiente para os reflexos: uma sala escura (o casco da estação) com faixas de luz no teto e uma
 * janela quente de um lado. No mármore e no vidro, o reflexo lê como luminária e janela, não como
 * um estúdio de fotografia genérico.
 */
function stationEnvironment(): THREE.Scene {
  const scene = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const shell = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color("#0C1828"), side: THREE.BackSide }));
  shell.scale.set(30, 12, 30);
  shell.position.y = 4;
  scene.add(shell);
  const light = (color: string, intensity: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }));
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    scene.add(m);
  };
  // luminárias lineares no teto
  for (const x of [-8, -2.7, 2.7, 8]) light("#F4F1EA", 5, 1.1, 0.1, 18, x, 9.8, 0);
  // janela para o espaço (o Sol e a Terra entram quentes por um lado) e um rebatimento frio do outro
  light("#FFD9A8", 3, 0.1, 5, 16, 14.8, 5, 0);
  light("#7FB6FF", 0.9, 0.1, 4, 14, -14.8, 4, 0);
  // piso escuro e um leve rebatimento de baixo
  light("#1B2638", 1, 28, 0.1, 28, 0, -1.9, 0);
  return scene;
}

export function LookRig({ lens }: { lens: Lens }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rim = useRef<THREE.DirectionalLight>(null);
  const quality = useQuality((s) => s.mode);

  // Reflexos: o "interior" da estação gerado na hora (sem baixar nada), ver stationEnvironment().
  useEffect(() => {
    if (!LOOK.env) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = stationEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
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
  const shadows = LOOK.shadows && quality !== "leve";
  useEffect(() => {
    if (!shadows) return;
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
  }, [gl, scene, shadows]);

  const key = useRef<THREE.DirectionalLight | null>(null);
  const offset = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!shadows) return;
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
      const size = quality === "alta" ? 4096 : 2048;
      l.shadow.mapSize.set(size, size);
      const cam = l.shadow.camera;
      // Área coberta pela sombra em volta de você (o 3D enxerga mais longe que o 2D).
      const half = lens === "3d" ? 28 : 22;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
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
