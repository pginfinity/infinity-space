import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WALL_THICKNESS, type FloorMaterial, type MapDef, type Wall } from "@infinity/world";
import { buildFurniture } from "./objects3d.ts";
import { applySeeThrough } from "./seeThrough.ts";

const FLOOR_COLOR: Record<FloorMaterial, string> = {
  concrete: "#1A2A44",
  carpet: "#1C3152",
  wood: "#5A3F2C",
  stage: "#3A2622",
  rug: "#14335F",
};

const FLOOR_ROUGH: Record<FloorMaterial, number> = { concrete: 0.85, carpet: 1, wood: 0.65, stage: 0.6, rug: 1 };

/** Escritório estático: pisos, paredes (com filete de luz no topo) e móveis. */
export function Office3D({ map }: { map: MapDef }) {
  const group = useMemo(() => buildOffice(map), [map]);
  useEffect(() => () => disposeDeep(group), [group]);
  return <primitive object={group} />;
}

function buildOffice(map: MapDef): THREE.Group {
  const root = new THREE.Group();
  root.name = "office";

  // Pisos, agrupados por material para virar poucas malhas.
  const byMat = new Map<FloorMaterial, THREE.BufferGeometry[]>();
  for (const f of map.floors) {
    const shape = new THREE.Shape(f.polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const elev = f.elevation ?? 0;
    let geo: THREE.BufferGeometry;
    if (elev > 0.05) {
      geo = new THREE.ExtrudeGeometry(shape, { depth: elev, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
    } else {
      geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, elev, 0);
    }
    const list = byMat.get(f.material) ?? [];
    list.push(geo.index ? geo.toNonIndexed() : geo);
    byMat.set(f.material, list);
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: FLOOR_COLOR[mat], roughness: FLOOR_ROUGH[mat], metalness: 0.02 }));
    mesh.name = `floor:${mat}`;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // Paredes sólidas, vidro e o filete de luz no topo das sólidas.
  const solid: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const trims: THREE.BufferGeometry[] = [];
  for (const w of map.walls) {
    (w.kind === "glass" ? glass : solid).push(wallBox(w, w.height, WALL_THICKNESS * (w.kind === "glass" ? 0.5 : 1), 0));
    if (w.kind === "solid") trims.push(wallBox(w, 0.018, WALL_THICKNESS + 0.01, w.height));
    else trims.push(wallBox(w, 0.05, WALL_THICKNESS * 0.7, w.height - 0.05));
  }
  const add = (geos: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    root.add(mesh);
  };
  const wallMat = new THREE.MeshStandardMaterial({ color: "#DCD8D2", roughness: 0.9, metalness: 0 });
  applySeeThrough(wallMat, { baseShade: true });
  add(solid, wallMat, "walls");
  add(
    glass,
    new THREE.MeshStandardMaterial({ color: "#A8E4FF", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
    "glass",
  );
  const trimMat = new THREE.MeshBasicMaterial({ color: "#5FD0FF", transparent: true, opacity: 0.55 });
  applySeeThrough(trimMat);
  add(trims, trimMat, "wall-trim");

  root.add(buildFurniture(map.objects));
  return root;
}

function wallBox(w: Wall, height: number, thickness: number, baseY: number): THREE.BufferGeometry {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz);
  const geo = new THREE.BoxGeometry(len + thickness * 0.5, height, thickness);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((w.a.x + w.b.x) / 2, baseY + height / 2, (w.a.z + w.b.z) / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(dz, dx), 0)),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  return geo.toNonIndexed();
}

export function disposeDeep(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
