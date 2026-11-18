import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LOOK } from "./looks.ts";
import { useQuality } from "../quality.ts";

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

/**
 * Ambiente do visual (ver looks.ts): reflexos, luz de recorte e quais malhas projetam
 * sombra (paredes e avatares também, além dos móveis). Ligar as sombras e mover a luz do Sol é da
 * lente (Canvas `shadows`) e do SunLights (WorldScene.tsx), que também cuida da exposição (sobe à
 * noite). No modo "leve" não há sombras.
 */
export function LookRig() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
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

  // Paredes, avatares e o resto também projetam sombra (de tempos em tempos, para o que chega depois).
  useEffect(() => {
    if (!LOOK.shadows || quality === "leve") return;
    const mark = () => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.lookShadow) return;
        m.userData.lookShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const solid = mats.every((x) => !x.transparent && !(x as THREE.MeshBasicMaterial).isMeshBasicMaterial);
        // (pisos e tapetes só recebem: rente ao chão, só fariam "acne" na sombra)
        if (solid && !m.name.startsWith("floor") && !m.name.startsWith("mobilia:rug")) m.castShadow = true;
        m.receiveShadow = true;
      });
    };
    mark();
    // A cada segundo: quem acabou de entrar já chega com sombra.
    const id = window.setInterval(mark, 1000);
    return () => window.clearInterval(id);
  }, [scene, quality]);

  if (!LOOK.lights.rim) return null;
  return <directionalLight position={[-30, 22, -26]} intensity={LOOK.lights.rim.intensity} color={LOOK.lights.rim.color} />;
}
