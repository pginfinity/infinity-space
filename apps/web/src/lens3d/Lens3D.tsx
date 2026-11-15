import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { world } from "../world/world.ts";
import { SPACE } from "../world/theme.ts";
import { Office3D } from "./Office3D.tsx";
import { Sculpture } from "./Sculpture.tsx";
import { Starfield } from "./Starfield.tsx";
import { Avatars3D } from "./Avatars3D.tsx";
import { CameraRig } from "./CameraRig.tsx";

/** Lente 3D: o mesmo escritório, em terceira pessoa. Carregada só quando alguém entra no 3D. */
export default function Lens3D() {
  const { map } = world();
  const sculpture = useMemo(() => map.objects.find((o) => o.type === "sculpture"), [map]);

  return (
    <div className="absolute inset-0" aria-label="Escritório em 3D" role="application">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 900, position: [0, 8, 14] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          scene.background = new THREE.Color(SPACE);
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.32;
          pmrem.dispose();
        }}
      >
        <hemisphereLight args={["#BFD9FF", "#0B1220", 0.85]} />
        <directionalLight position={[18, 30, 12]} intensity={1.35} color="#FFF1E4" />
        <directionalLight position={[-20, 16, -18]} intensity={0.35} color="#7FC8FF" />
        <Starfield />
        <Office3D map={map} />
        {sculpture && <Sculpture pos={sculpture.pos} />}
        <Avatars3D />
        <CameraRig />
      </Canvas>
    </div>
  );
}
