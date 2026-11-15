import { AVATAR_RADIUS, NAV_CELL, WALL_THICKNESS } from "./constants.ts";
import { boundsOf, distToSegment, pointInPolygon, type Vec2 } from "./geometry.ts";
import { objectFootprint } from "./map/circulo.ts";
import type { MapDef } from "./map/types.ts";

/**
 * Grade de navegação gerada do mapa. Uma célula é andável se está dentro de algum piso,
 * longe o bastante das paredes e fora dos móveis que bloqueiam.
 * A folga do avatar já está embutida: basta testar o centro do avatar.
 */
export class NavGrid {
  readonly cell = NAV_CELL;
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originZ: number;
  readonly walkable: Uint8Array;

  private constructor(cols: number, rows: number, originX: number, originZ: number, walkable: Uint8Array) {
    this.cols = cols;
    this.rows = rows;
    this.originX = originX;
    this.originZ = originZ;
    this.walkable = walkable;
  }

  static fromMap(map: MapDef): NavGrid {
    const cell = NAV_CELL;
    const b = boundsOf(map.floors.flatMap((f) => f.polygon));
    const originX = Math.floor(b.minX) - 1;
    const originZ = Math.floor(b.minZ) - 1;
    const cols = Math.ceil((b.maxX - originX + 1) / cell);
    const rows = Math.ceil((b.maxZ - originZ + 1) / cell);
    const walk = new Uint8Array(cols * rows);
    const center = (c: number, r: number): Vec2 => ({ x: originX + (c + 0.5) * cell, z: originZ + (r + 0.5) * cell });

    // 1. Pisos.
    for (const floor of map.floors) {
      const fb = boundsOf(floor.polygon);
      const [c0, r0] = [Math.floor((fb.minX - originX) / cell), Math.floor((fb.minZ - originZ) / cell)];
      const [c1, r1] = [Math.ceil((fb.maxX - originX) / cell), Math.ceil((fb.maxZ - originZ) / cell)];
      for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) {
        for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
          if (pointInPolygon(center(c, r), floor.polygon)) walk[r * cols + c] = 1;
        }
      }
    }

    // 2. Paredes, com a folga do avatar.
    const clearance = AVATAR_RADIUS + WALL_THICKNESS / 2;
    for (const w of map.walls) {
      const c0 = Math.floor((Math.min(w.a.x, w.b.x) - clearance - originX) / cell);
      const c1 = Math.ceil((Math.max(w.a.x, w.b.x) + clearance - originX) / cell);
      const r0 = Math.floor((Math.min(w.a.z, w.b.z) - clearance - originZ) / cell);
      const r1 = Math.ceil((Math.max(w.a.z, w.b.z) + clearance - originZ) / cell);
      for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) {
        for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
          if (distToSegment(center(c, r), w.a, w.b) < clearance) walk[r * cols + c] = 0;
        }
      }
    }

    // 3. Móveis que bloqueiam. Folga menor que nas paredes, para dar para encostar na mesa.
    const objClear = AVATAR_RADIUS * 0.8;
    for (const o of map.objects) {
      if (!o.blocks) continue;
      const poly = objectFootprint(o);
      const ob = boundsOf(poly);
      const c0 = Math.floor((ob.minX - objClear - originX) / cell);
      const c1 = Math.ceil((ob.maxX + objClear - originX) / cell);
      const r0 = Math.floor((ob.minZ - objClear - originZ) / cell);
      const r1 = Math.ceil((ob.maxZ + objClear - originZ) / cell);
      for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) {
        for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
          const p = center(c, r);
          if (pointInPolygon(p, poly) || distToPolygonEdges(p, poly) < objClear) walk[r * cols + c] = 0;
        }
      }
    }

    return new NavGrid(cols, rows, originX, originZ, walk);
  }

  index(c: number, r: number): number {
    return r * this.cols + c;
  }

  cellOf(p: Vec2): { c: number; r: number } {
    return { c: Math.floor((p.x - this.originX) / this.cell), r: Math.floor((p.z - this.originZ) / this.cell) };
  }

  centerOf(c: number, r: number): Vec2 {
    return { x: this.originX + (c + 0.5) * this.cell, z: this.originZ + (r + 0.5) * this.cell };
  }

  isCellWalkable(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walkable[r * this.cols + c] === 1;
  }

  isWalkable(p: Vec2): boolean {
    const { c, r } = this.cellOf(p);
    return this.isCellWalkable(c, r);
  }

  /** Célula andável mais próxima de `p`, procurando até `maxRadius` metros. */
  nearestWalkable(p: Vec2, maxRadius = 3): Vec2 | null {
    if (this.isWalkable(p)) return p;
    const { c, r } = this.cellOf(p);
    const maxRing = Math.ceil(maxRadius / this.cell);
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.isCellWalkable(c + dc, r + dr)) continue;
          const q = this.centerOf(c + dc, r + dr);
          const d = Math.hypot(q.x - p.x, q.z - p.z);
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

  /** Há caminho reto e livre entre dois pontos. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /**
   * Rota de `from` até `to` (A* em 8 direções, sem cortar quinas), já suavizada.
   * Se o destino não for andável, vai até o ponto andável mais próximo dele.
   * Retorna os pontos a percorrer, sem incluir `from`. `null` se não houver caminho.
   */
  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    const start = this.nearestWalkable(from, 1.5);
    const goal = this.nearestWalkable(to, 3);
    if (!start || !goal) return null;
    if (this.lineOfSight(start, goal)) return [goal];

    const s = this.cellOf(start);
    const g = this.cellOf(goal);
    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const si = this.index(s.c, s.r);
    const gi = this.index(g.c, g.r);
    gScore[si] = 0;
    heap.push(si, octile(s.c, s.r, g.c, g.r));

    const DIRS = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;

    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === gi) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur - cc) / this.cols;
      for (const [dc, dr, cost] of DIRS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.isCellWalkable(nc, nr)) continue;
        if (dc !== 0 && dr !== 0 && (!this.isCellWalkable(cc + dc, cr) || !this.isCellWalkable(cc, cr + dr))) continue;
        const ni = this.index(nc, nr);
        if (closed[ni]) continue;
        const tentative = gScore[cur]! + cost;
        if (tentative < gScore[ni]!) {
          gScore[ni] = tentative;
          came[ni] = cur;
          heap.push(ni, tentative + octile(nc, nr, g.c, g.r));
        }
      }
    }
    if (!found) return null;

    const cells: Vec2[] = [];
    for (let i = gi; i !== -1 && i !== si; i = came[i]!) {
      const c = i % this.cols;
      cells.push(this.centerOf(c, (i - c) / this.cols));
    }
    cells.reverse();
    if (cells.length > 0) cells[cells.length - 1] = goal;
    return this.smooth(start, cells);
  }

  /** Remove pontos intermediários quando há linha reta livre (string pulling simples). */
  private smooth(start: Vec2, pts: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = start;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineOfSight(anchor, pts[j]!)) j--;
      out.push(pts[j]!);
      anchor = pts[j]!;
      i = j + 1;
    }
    return out;
  }

  /**
   * Move `pos` por `delta` respeitando a colisão: tenta o movimento inteiro e, se bater,
   * desliza pela parede tentando cada eixo separado. Movimentos longos são feitos em passos curtos.
   */
  move(pos: Vec2, delta: Vec2): Vec2 {
    const d = Math.hypot(delta.x, delta.z);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    let p = pos;
    const sx = delta.x / steps;
    const sz = delta.z / steps;
    for (let i = 0; i < steps; i++) {
      const full = { x: p.x + sx, z: p.z + sz };
      if (this.isWalkable(full)) {
        p = full;
        continue;
      }
      const onlyX = { x: p.x + sx, z: p.z };
      const onlyZ = { x: p.x, z: p.z + sz };
      if (sx !== 0 && this.isWalkable(onlyX)) p = onlyX;
      else if (sz !== 0 && this.isWalkable(onlyZ)) p = onlyZ;
      else break;
    }
    return p;
  }
}

function octile(c0: number, r0: number, c1: number, r1: number): number {
  const dx = Math.abs(c1 - c0);
  const dy = Math.abs(r1 - r0);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function distToPolygonEdges(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(p, poly[j]!, poly[i]!));
  }
  return best;
}

/** Heap binário mínimo de índices com prioridade. */
class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, priority: number): void {
    this.items.push(item);
    this.prio.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}
