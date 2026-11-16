import { useEffect, useState } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SPACE } from "../world/theme.ts";
import { WorldScene } from "../scene/WorldScene.tsx";
import { wallUniforms } from "../scene/walls.ts";
import { CameraRig } from "./CameraRig.tsx";
import { setWallView } from "../scene/wallFacing.ts";
import { MIN_AUTO_DPR, maxDpr, useQuality } from "../scene/quality.ts";

/** Lente 3D: o escritório em terceira pessoa, paredes inteiras e vazadas em volta de você. */
export default function Lens3D() {
  const quality = useQuality((s) => s.mode);
  const top = maxDpr(quality);
  const [dpr, setDpr] = useState(top);
  useEffect(() => setDpr(maxDpr(quality)), [quality]);
  useEffect(() => {
    wallUniforms.uCut.value = 100;
    wallUniforms.uSee.value = 1;
    setWallView(null);
  }, []);

  return (
    <div className="absolute inset-0" aria-label="Escritório em 3D" role="application">
      <Canvas
        // Trocar o modo recria o contexto (a suavização de bordas só é definida na criação).
        key={quality}
        dpr={dpr}
        gl={{ antialias: quality !== "leve", powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 3000, position: [0, 8, 14] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.background = new THREE.Color(SPACE);
        }}
      >
        {quality === "auto" && (
          // Escada automática: se os quadros por segundo caem, baixa a resolução; se sobram, sobe.
          <PerformanceMonitor
            factor={1}
            step={0.2}
            ms={200}
            flipflops={4}
            onChange={({ factor }) => setDpr(Math.round((MIN_AUTO_DPR + (top - MIN_AUTO_DPR) * factor) * 10) / 10)}
            onFallback={() => setDpr(MIN_AUTO_DPR)}
          />
        )}
        <WorldScene lens="3d" />
        <CameraRig />
      </Canvas>
    </div>
  );
}
