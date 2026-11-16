import { wallBetween } from "../../audio.ts";
import { RUN_SPEED } from "../../constants.ts";
import { dist, pointInPolygon, polygonCentroid, type Vec2 } from "../../geometry.ts";
import type { Wall, Zone } from "../../map/types.ts";
import type { NavGrid } from "../../nav.ts";

/**
 * Lugares para presença: um ponto livre perto de alguém (destino do teleporte) e um ponto de
 * chegada em cada sala (ir até a sala pela busca).
 */

/**
 * Velocidade da travessia rápida (teleporte enquanto a sala não move o avatar sozinha).
 * A sala aceita até 1,6x a corrida por segundo + 0,5 m por pose: 1,4x cabe com folga para atraso de rede.
 */
export const PRESENCA_DASH_SPEED = RUN_SPEED * 1.4;
/** Ninguém é posto a menos disso (m) de outro avatar. */
export const PRESENCA_PERSONAL = 0.75;

const RINGS = [1.1, 1.5, 1.9, 2.4, 3];
const STEPS = 16;

/**
 * Ponto livre perto de `center`: andável, sem parede no meio, com caminho reto livre até quem
 * está no centro e longe dos outros avatares. Prefere o lado de `prefer` (de onde a pessoa vem).
 */
export function presencaFreeSpot(nav: NavGrid, walls: readonly Wall[], center: Vec2, others: readonly Vec2[], prefer?: Vec2): Vec2 | null {
  const base = prefer && dist(prefer, center) > 1e-3 ? Math.atan2(prefer.x - center.x, -(prefer.z - center.z)) : 0;
  // Quem chamou pode estar sentado (cadeira não é andável): a linha reta parte do chão mais perto.
  const anchor = nav.nearestWalkable(center, 1.5) ?? center;
  const order: number[] = [0];
  for (let k = 1; k <= STEPS / 2; k++) order.push(k, -k);
  for (const strict of [true, false]) {
    for (const r of RINGS) {
      for (const k of order) {
        const a = base + (k * Math.PI * 2) / STEPS;
        const p = { x: center.x + Math.sin(a) * r, z: center.z - Math.cos(a) * r };
        if (!nav.isWalkable(p) || wallBetween(walls, center, p)) continue;
        if (others.some((o) => dist(o, p) < PRESENCA_PERSONAL)) continue;
        if (strict && !nav.lineOfSight(anchor, p)) continue;
        return p;
      }
    }
  }
  return null;
}

/** Ponto andável dentro da sala, o mais perto possível do centro dela. */
export function presencaRoomSpot(nav: NavGrid, zone: Zone, maxRadius = 8): Vec2 | null {
  const c = polygonCentroid(zone.polygon);
  if (nav.isWalkable(c)) return c;
  const { c: cc, r: cr } = nav.cellOf(c);
  const rings = Math.ceil(maxRadius / nav.cell);
  for (let ring = 1; ring <= rings; ring++) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring || !nav.isCellWalkable(cc + dc, cr + dr)) continue;
        const q = nav.centerOf(cc + dc, cr + dr);
        if (!pointInPolygon(q, zone.polygon)) continue;
        const d = dist(q, c);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
