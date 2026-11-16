import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Lens } from "@infinity/world";
import { world } from "../world/world.ts";
import { buildFurniture, registerFurniture } from "./furniture/index.ts";
import { buildFloors } from "./floors.ts";
import { buildWalls } from "./walls.ts";
import { buildSigns } from "./signs.ts";
import { registerScreens } from "./tvs.ts";
import { Sculpture } from "../lens3d/Sculpture.tsx";

/** A estação inteira: pisos, paredes, móveis, placas e a estrela. Igual nas duas lentes. */
export function Station({ lens }: { lens: Lens }) {
  const { map } = world();
  const built = useMemo(() => {
    const group = new THREE.Group();
    group.name = "station";
    const floors = buildFloors(map);
    const walls = buildWalls(map);
    const signs = buildSigns(map);
    const furniture = buildFurniture(map.objects);
    group.add(floors, walls, signs, furniture.group);
    return { group, signs, furniture, owned: [floors, walls, signs] };
  }, [map]);

  // Registra as TVs só depois de montar: no StrictMode o useMemo roda duas vezes e uma cópia é descartada.
  useEffect(() => registerScreens(built.furniture.screens), [built]);
  useEffect(() => registerFurniture(built.furniture), [built]);

  useEffect(
    () => () => {
      built.furniture.dispose();
      for (const g of built.owned) {
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
        });
      }
    },
    [built],
  );

  // No 2D isométrico as placas de porta somem (as paredes ficam baixas) e entram as etiquetas das salas.
  useEffect(() => {
    built.signs.visible = lens === "3d";
  }, [built, lens]);

  useFrame((state, dt) => built.furniture.update(dt, state.clock.elapsedTime));

  const sculpture = map.objects.find((o) => o.type === "sculpture");

  return (
    <>
      <primitive object={built.group} />
      {sculpture && <Sculpture pos={sculpture.pos} />}
      {lens === "2d" && <RoomLabels />}
    </>
  );
}

/** Etiquetas das salas no 2D (texto nítido em HTML por cima do pixel art). */
function RoomLabels() {
  const { map } = world();
  const labels = useMemo(
    () =>
      map.labels.map((l) => {
        const zone = map.zones.find((z) => z.name === l.text);
        return { ...l, accent: zone?.theme?.accent ?? "#00B7FF" };
      }),
    [map],
  );
  return (
    <>
      {labels.map((l) => (
        <Html key={`${l.text}-${l.pos.x}`} position={[l.pos.x, 0.2, l.pos.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full bg-space/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-offwhite shadow-lg backdrop-blur-sm" style={{ borderLeft: `3px solid ${l.accent}` }}>
            {l.text}
          </div>
        </Html>
      ))}
    </>
  );
}
