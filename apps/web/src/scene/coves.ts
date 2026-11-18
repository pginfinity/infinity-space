import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MapDef, Zone } from "@infinity/world";

/**
 * Luz embutida no rodapé de cada sala, na cor de destaque dela (acabamento do visual Cinema):
 * um filete fino no chão, junto da parede, que brilha (entra no bloom) e dá identidade a cada área,
 * principalmente quando a estação está na sombra da Terra. Uma malha só para a estação inteira.
 * Corredores já têm as faixas azuis deles; palco e cabines de foco ficam sem.
 */

/** Distância da linha do centro da parede até o filete, e a largura e altura dele (m). */
const INSET = 0.13;
const WIDTH = 0.035;
const HEIGHT = 0.01;
/** Acima de 1: entra no bloom do Cinema; sem bloom (modo leve) fica só uma linha colorida. */
const GLOW = 1.7;

let material: THREE.MeshBasicMaterial | null = null;

function covesOf(z: Zone): boolean {
  if (!z.theme?.accent || z.kind === "stage") return false;
  if (z.id.startsWith("corredor") || z.id === "foco-hall" || z.kind === "focus") return false;
  return true;
}

export function buildCoves(map: MapDef): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  for (const z of map.zones) {
    if (!covesOf(z)) continue;
    color.set(z.theme!.accent).multiplyScalar(GLOW);
    const poly = z.polygon;
    // Centro da sala, para saber qual lado de cada aresta é "dentro".
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cz = poly.reduce((s, p) => s + p.z, 0) / poly.length;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) continue;
      // Normal para dentro da sala.
      let nx = -(b.z - a.z) / len;
      let nz = (b.x - a.x) / len;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if ((cx - mx) * nx + (cz - mz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const g = new THREE.BoxGeometry(len - INSET * 2, HEIGHT, WIDTH);
      g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      g.translate(mx + nx * INSET, HEIGHT / 2 + 0.004, mz + nz * INSET);
      const n = g.attributes.position!.count;
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) col.set([color.r, color.g, color.b], k * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.deleteAttribute("uv");
      parts.push(g);
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) return null;
  // Material compartilhado (a estação pode ser remontada; o material fica).
  material ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = "coves";
  return mesh;
}
