import type { Vec2, Zone } from "@infinity/world";
import { world } from "./world.ts";

/** Nome amigável do lugar onde um ponto está. */
export function placeName(p: Vec2): string {
  const zone: Zone | undefined = world().zones.zoneAt(p);
  if (!zone) return "Em trânsito";
  if (zone.id.endsWith("-corredor")) {
    const wing = world().map.wings.find((w) => w.id === zone.wingId);
    return wing ? `Indo para ${wing.team}` : zone.name;
  }
  return zone.name;
}
