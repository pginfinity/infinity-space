import type { Vec2 } from "../../geometry.ts";
import type { MapObject } from "../../map/types.ts";

/**
 * Ponto no referencial de um objeto (x para a lateral, z para a frente dele) levado para o mundo.
 * Mesma conta da matriz dos móveis no 3D (rotation.y = PI - rot).
 */
export function vivoLocalToWorld(o: Pick<MapObject, "pos" | "rot">, lx: number, lz: number): Vec2 {
  const th = Math.PI - o.rot;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return { x: o.pos.x + lx * c + lz * s, z: o.pos.z - lx * s + lz * c };
}

/** Onde fica a pipoqueira em cima da bancada da copa (referencial da bancada). */
export const VIVO_POPCORN_SPOT = { x: -0.68, z: -0.04 } as const;
