import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SPACE } from "../world/theme.ts";
import { WorldScene } from "../scene/WorldScene.tsx";
import { wallUniforms } from "../scene/walls.ts";
import { CameraRig } from "./CameraRig.tsx";
import { setWallView } from "../scene/wallFacing.ts";

/** Lente 3D: o escritório em terceira pessoa, paredes inteiras e vazadas em volta de você. */
export default function Lens3D() {
  useEffect(() => {
    wallUniforms.uCut.value = 100;
    wallUniforms.uSee.value = 1;
    setWallView(null);
  }, []);

  return (
    <div className="absolute inset-0" aria-label="Escritório em 3D" role="application">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 3000, position: [0, 8, 14] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.background = new THREE.Color(SPACE);
        }}
      >
        <WorldScene lens="3d" />
        <CameraRig />
      </Canvas>
    </div>
  );
}
