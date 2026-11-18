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

// ---- telas ocupadas por atividades ----------------------------------------------------------

const claims = new Map<string, THREE.Material>();

/**
 * Uma atividade ocupa a tela de uma TV com o próprio material (ex.: "Assistindo junto" na TV do
 * lounge); `null` devolve a tela. Compartilhamento de tela de alguém na sala tem prioridade; sem
 * nenhum dos dois, a TV mostra a tela de espera (sala e hora). Quem ocupa cuida do material.
 */
export function claimScreen(screenId: string, material: THREE.Material | null): void {
  if (material) claims.set(screenId, material);
  else claims.delete(screenId);
}

/** Material com que uma atividade ocupa a tela (ou undefined). */
export function screenClaim(screenId: string): THREE.Material | undefined {
  return claims.get(screenId);
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
