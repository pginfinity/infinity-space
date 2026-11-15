import type { Vec2 } from "@infinity/world";
import { world } from "./world.ts";

/** Nome amigável do lugar onde um ponto está. */
export function placeName(p: Vec2): string {
  const zone = world().zones.zoneAt(p);
  if (!zone) return "Em trânsito";
  return zone.name;
}
