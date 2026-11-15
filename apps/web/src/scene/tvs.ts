import * as THREE from "three";
import { dist, type Vec2 } from "@infinity/world";
import { world } from "../world/world.ts";

/**
 * TVs do mundo: a tela compartilhada de uma pessoa aparece na TV mais próxima da sala onde ela está.
 * A regra é a mesma em todos os clientes, então todo mundo vê a tela na mesma TV.
 */

let meshes: Map<string, THREE.Mesh> = new Map();

export function registerScreens(m: Map<string, THREE.Mesh>): void {
  meshes = m;
}

export function screenMesh(screenId: string): THREE.Mesh | undefined {
  return meshes.get(screenId);
}

/** TV usada por quem está em `pos` (null se não há TV na sala). */
export function tvFor(pos: Vec2): { screenId: string; label: string } | null {
  const { map, zones } = world();
  const zone = zones.zoneAt(pos);
  if (!zone) return null;
  let best: { screenId: string; label: string } | null = null;
  let bestD = Infinity;
  for (const o of map.objects) {
    if (!o.screenId) continue;
    const z = o.zoneId ?? zones.zoneAt(o.pos)?.id;
    if (z !== zone.id) continue;
    const d = dist(o.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = { screenId: o.screenId, label: zone.name };
    }
  }
  return best;
}
