import { rectCorners, type Vec2 } from "../geometry.ts";
import type { MapObject } from "./types.ts";

/** Polígono de um objeto no chão (para colisão e para o desenho). */
export function objectFootprint(o: MapObject): Vec2[] {
  return rectCorners(o.pos, o.size.w, o.size.d, o.rot);
}
