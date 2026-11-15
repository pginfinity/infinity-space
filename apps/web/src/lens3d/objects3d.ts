import * as THREE from "three";
import { dirOfYaw, type MapObject, type ObjectType } from "@infinity/world";

/**
 * Móveis estilizados montados por partes simples. Cada parte vira um InstancedMesh com
 * todas as cópias daquele tipo: centenas de objetos em poucas dezenas de draw calls.
 */

type Shape = "box" | "cyl" | "sphere";
type V3 = [number, number, number];

interface Part {
  shape: Shape;
  /** [lateral, altura, profundidade] em metros. */
  size: (o: MapObject) => V3;
  /** [lateral, altura, para frente] em metros, relativo ao centro do objeto. */
  at: (o: MapObject) => V3;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

const NAVY = "#1D3557";
const TOP = "#E4DED6";
const SEAT = "#24436F";

const P = (shape: Shape, size: Part["size"], at: Part["at"], color: string, extra: Partial<Part> = {}): Part => ({ shape, size, at, color, ...extra });

const PARTS: Partial<Record<ObjectType, Part[]>> = {
  desk: [
    P("box", (o) => [o.size.w, 0.04, o.size.d], (o) => [0, o.size.h - 0.02, 0], TOP, { roughness: 0.6 }),
    P("box", (o) => [o.size.w * 0.94, o.size.h - 0.06, 0.03], (o) => [0, (o.size.h - 0.06) / 2, -(o.size.d / 2 - 0.05)], NAVY),
    P("box", () => [0.56, 0.33, 0.025], (o) => [0, o.size.h + 0.27, -(o.size.d / 2 - 0.17)], "#0B0F17", { emissive: "#0E3A66", emissiveIntensity: 0.55, roughness: 0.3 }),
    P("box", () => [0.05, 0.2, 0.05], (o) => [0, o.size.h + 0.1, -(o.size.d / 2 - 0.19)], "#2A2F3A"),
  ],
  chair: [
    P("box", (o) => [o.size.w * 0.85, 0.08, o.size.d * 0.85], () => [0, 0.46, 0], SEAT, { roughness: 0.9 }),
    P("box", (o) => [o.size.w * 0.85, 0.42, 0.06], (o) => [0, 0.74, -o.size.d * 0.4], SEAT, { roughness: 0.9 }),
    P("cyl", () => [0.07, 0.42, 0.07], () => [0, 0.21, 0], "#3A3F4A", { metalness: 0.5, roughness: 0.4 }),
  ],
  sofa: [
    P("box", (o) => [o.size.w, 0.4, o.size.d], () => [0, 0.2, 0], "#2C4F7C", { roughness: 0.95 }),
    P("box", (o) => [o.size.w, 0.44, 0.22], (o) => [0, 0.56, -(o.size.d / 2 - 0.11)], "#2C4F7C", { roughness: 0.95 }),
    P("box", (o) => [0.18, 0.58, o.size.d], (o) => [-(o.size.w / 2 - 0.09), 0.29, 0], "#284870", { roughness: 0.95 }),
    P("box", (o) => [0.18, 0.58, o.size.d], (o) => [o.size.w / 2 - 0.09, 0.29, 0], "#284870", { roughness: 0.95 }),
  ],
  armchair: [
    P("box", (o) => [o.size.w, 0.4, o.size.d], () => [0, 0.2, 0], "#2C4F7C", { roughness: 0.95 }),
    P("box", (o) => [o.size.w, 0.44, 0.2], (o) => [0, 0.56, -(o.size.d / 2 - 0.1)], "#2C4F7C", { roughness: 0.95 }),
  ],
  "coffee-table": [
    P("box", (o) => [o.size.w, 0.05, o.size.d], (o) => [0, o.size.h, 0], TOP),
    P("box", (o) => [o.size.w * 0.5, o.size.h, o.size.d * 0.5], (o) => [0, o.size.h / 2, 0], NAVY),
  ],
  "meeting-table": [
    P("box", (o) => [o.size.w, 0.05, o.size.d], (o) => [0, o.size.h, 0], TOP, { roughness: 0.5 }),
    P("box", (o) => [o.size.w * 0.25, o.size.h, o.size.d * 0.55], (o) => [0, o.size.h / 2, 0], NAVY),
  ],
  counter: [
    P("box", (o) => [o.size.w, o.size.h - 0.04, o.size.d], (o) => [0, (o.size.h - 0.04) / 2, 0], NAVY),
    P("box", (o) => [o.size.w + 0.08, 0.04, o.size.d + 0.08], (o) => [0, o.size.h - 0.02, 0], TOP, { roughness: 0.4 }),
    P("box", (o) => [o.size.w * 0.98, 0.025, 0.012], (o) => [0, 0.14, o.size.d / 2 + 0.006], "#00B7FF", { emissive: "#00B7FF", emissiveIntensity: 1.4 }),
  ],
  tv: [
    P("box", (o) => [o.size.w + 0.06, o.size.h + 0.06, 0.05], (o) => [0, o.elevation ?? 1.5, 0], "#0B0F17", { roughness: 0.4 }),
    P("box", (o) => [o.size.w, o.size.h, 0.012], (o) => [0, o.elevation ?? 1.5, 0.03], "#05080F", { emissive: "#0B3A66", emissiveIntensity: 0.5, roughness: 0.15 }),
  ],
  plant: [
    P("cyl", () => [0.42, 0.42, 0.42], () => [0, 0.21, 0], "#ECE6DF", { roughness: 0.7 }),
    P("sphere", () => [0.78, 0.92, 0.78], () => [0, 0.86, 0], "#2F9E74", { roughness: 1 }),
    P("sphere", () => [0.46, 0.5, 0.46], () => [0.12, 1.28, 0.05], "#38B282", { roughness: 1 }),
  ],
  "stage-seat": [
    P("box", () => [0.52, 0.08, 0.5], () => [0, 0.44, 0], "#26385C", { roughness: 0.9 }),
    P("box", () => [0.52, 0.5, 0.06], () => [0, 0.72, -0.24], "#26385C", { roughness: 0.9 }),
  ],
  lectern: [
    P("box", (o) => [o.size.w, o.size.h, o.size.d], (o) => [0, o.size.h / 2, 0], NAVY),
    P("box", (o) => [o.size.w + 0.06, 0.04, o.size.d + 0.06], (o) => [0, o.size.h, 0], TOP),
  ],
  airhockey: [
    P("box", (o) => [o.size.w, 0.7, o.size.d], () => [0, 0.35, 0], NAVY),
    P("box", (o) => [o.size.w * 0.9, 0.03, o.size.d * 0.93], () => [0, 0.715, 0], "#EEF3F8", { emissive: "#00B7FF", emissiveIntensity: 0.12, roughness: 0.2 }),
  ],
  pool: [
    P("box", (o) => [o.size.w, 0.7, o.size.d], () => [0, 0.35, 0], "#4A3222", { roughness: 0.6 }),
    P("box", (o) => [o.size.w * 0.84, 0.04, o.size.d * 0.9], () => [0, 0.72, 0], "#0A2547", { roughness: 1 }),
  ],
  "chess-table": [
    P("box", (o) => [o.size.w, 0.04, o.size.d], (o) => [0, o.size.h, 0], TOP),
    P("cyl", (o) => [0.12, o.size.h, 0.12], (o) => [0, o.size.h / 2, 0], NAVY),
    P("box", (o) => [o.size.w * 0.7, 0.012, o.size.d * 0.7], (o) => [0, o.size.h + 0.026, 0], "#0A2547"),
  ],
  jukebox: [
    P("box", (o) => [o.size.w, o.size.h, o.size.d], (o) => [0, o.size.h / 2, 0], "#1D2B44"),
    P("box", (o) => [o.size.w * 0.78, o.size.h * 0.48, 0.02], (o) => [0, o.size.h * 0.6, o.size.d / 2 + 0.01], "#EE5C29", { emissive: "#EE5C29", emissiveIntensity: 1.1 }),
  ],
  bookshelf: [
    P("box", (o) => [o.size.w, o.size.h, o.size.d], (o) => [0, o.size.h / 2, 0], NAVY),
    P("box", (o) => [o.size.w * 0.9, o.size.h * 0.82, 0.02], (o) => [0, o.size.h / 2, o.size.d / 2], "#B9A88E", { roughness: 1 }),
  ],
  beanbag: [P("sphere", (o) => [o.size.w, 0.55, o.size.d], () => [0, 0.25, 0], "#2E5A8C", { roughness: 1 })],
};

const UNIT: Record<Shape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  sphere: () => new THREE.SphereGeometry(0.5, 20, 14),
};

/** Cria os InstancedMesh de todos os móveis. Quem chama é dono dos recursos (dispose). */
export function buildFurniture(objects: readonly MapObject[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "furniture";
  const byType = new Map<ObjectType, MapObject[]>();
  for (const o of objects) {
    if (!PARTS[o.type]) continue;
    const list = byType.get(o.type) ?? [];
    list.push(o);
    byType.set(o.type, list);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (const [type, list] of byType) {
    for (const part of PARTS[type]!) {
      const material = new THREE.MeshStandardMaterial({
        color: part.color,
        roughness: part.roughness ?? 0.8,
        metalness: part.metalness ?? 0.05,
        ...(part.emissive ? { emissive: new THREE.Color(part.emissive), emissiveIntensity: part.emissiveIntensity ?? 1 } : {}),
      });
      const mesh = new THREE.InstancedMesh(UNIT[part.shape](), material, list.length);
      mesh.name = `${type}:${part.shape}`;
      list.forEach((o, i) => {
        const f = dirOfYaw(o.rot);
        const r = { x: -f.z, z: f.x };
        const [lat, y, fwd] = part.at(o);
        const [sx, sy, sz] = part.size(o);
        pos.set(o.pos.x + r.x * lat + f.x * fwd, y, o.pos.z + r.z * lat + f.z * fwd);
        e.set(0, Math.PI - o.rot, 0);
        q.setFromEuler(e);
        scl.set(sx, sy, sz);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
