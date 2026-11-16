import { dirOfYaw, type Vec2 } from "../geometry.ts";
import { CATALOG } from "./catalog.ts";
import type { Desk, FloorArea, FloorStyle, MapDef, MapLabel, MapObject, ObjectType, Sign, Wall, WallKind, Zone, ZoneKind } from "./types.ts";

/**
 * Planta "Estação Infinity": um deck retangular com dois corredores (norte e sul) e cada área
 * numa sala própria, com identidade visual (cor, piso, parede e móveis diferentes) e placa na porta.
 * Janelas para o espaço em todo o casco externo.
 *
 *   z=-19 ┌─ Dev Lab ─┬─ Produto & Design ─┬─ Automação & IA ─┬─ Diretoria ─┐
 *   z=-7  ├────────────────────── corredor norte ─────────────────────────┤
 *   z=-4  │ Órbita/Lua │ Marketing │      Átrio      │ Comercial │ Foco ×4  │
 *   z=9   ├────────────────────── corredor sul ───────────────────────────┤
 *   z=12  │  Arcade   │ Café & Copa │ Gestão & Projetos │    Auditório      │
 *   z=22  └───────────────────────────────────────────────────────────────┘
 *        x=-26                                                         x=26
 *
 * Convenções: metros; x = leste, z = sul; yaw 0 = norte, PI/2 = leste, PI = sul, -PI/2 = oeste.
 */

const N = 0;
const E = Math.PI / 2;
const S = Math.PI;
const W = -Math.PI / 2;

const T = 0.15; // espessura das paredes
const WALL_H = 2.8;
const HULL_H = 3.0;
const DOOR = 1.8;
const HALL = "#E9E5DF"; // face das paredes voltada para os corredores

interface RoomStyle {
  accent: string;
  icon: string;
  floor: FloorStyle;
  wall: string;
}

/** Identidade de cada área. Mude aqui para trocar cores e pisos. */
const STYLE = {
  dev: { accent: "#2BC48A", icon: "code", floor: "carpet-graphite", wall: "#2E3440" },
  design: { accent: "#E85D9A", icon: "pen-tool", floor: "wood-light", wall: "#F4EEE8" },
  ia: { accent: "#00B7FF", icon: "cpu", floor: "tile-dark", wall: "#163A63" },
  diretoria: { accent: "#E8B44A", icon: "crown", floor: "wood-warm", wall: "#E9DFD0" },
  orbita: { accent: "#4C7DFF", icon: "orbit", floor: "carpet-navy", wall: "#DCE6F2" },
  lua: { accent: "#C9D2DE", icon: "moon", floor: "carpet-warm", wall: "#E3E6EC" },
  marketing: { accent: "#EE5C29", icon: "megaphone", floor: "wood-light", wall: "#F6EFE6" },
  atrio: { accent: "#F2F0EF", icon: "sparkles", floor: "marble", wall: "#EFEBE6" },
  comercial: { accent: "#FF6B57", icon: "trending-up", floor: "carpet-warm", wall: "#F3E1DC" },
  foco: { accent: "#8A93A3", icon: "headphones", floor: "carpet-navy", wall: "#D7DCE4" },
  arcade: { accent: "#9B8CFF", icon: "gamepad-2", floor: "neon-grid", wall: "#241B3D" },
  cafe: { accent: "#C68A4A", icon: "coffee", floor: "tile-white", wall: "#EADBC8" },
  gestao: { accent: "#2EC4B6", icon: "kanban", floor: "carpet-navy", wall: "#DCEFEC" },
  auditorio: { accent: "#46AFE3", icon: "presentation", floor: "carpet-navy", wall: "#1B2A44" },
  corredor: { accent: "#00B7FF", icon: "", floor: "tile-dark", wall: HALL },
} satisfies Record<string, RoomStyle>;

class Builder {
  floors: FloorArea[] = [];
  walls: Wall[] = [];
  zones: Zone[] = [];
  objects: MapObject[] = [];
  desks: Desk[] = [];
  signs: Sign[] = [];
  labels: MapLabel[] = [];
  spawns: Vec2[] = [];
  private seq = new Map<string, number>();

  id(prefix: string): string {
    const n = (this.seq.get(prefix) ?? 0) + 1;
    this.seq.set(prefix, n);
    return `${prefix}-${n}`;
  }

  /** Coloca um objeto do catálogo. Assentos e objetos interativos ganham o ponto de interação. */
  put(type: ObjectType, x: number, z: number, rot: number, extra: Partial<MapObject> = {}): MapObject {
    const c = CATALOG[type];
    const pos = { x, z };
    const obj: MapObject = {
      id: extra.id ?? this.id(type),
      type,
      pos,
      rot,
      size: { w: c.w, d: c.d, h: c.h },
      blocks: c.blocks,
      ...(c.wallMounted !== undefined ? { elevation: c.wallMounted } : {}),
      ...(c.action
        ? {
            interact: {
              point: pos,
              yaw: c.action === "sit" ? rot : rot + Math.PI,
              radius: c.action === "sit" ? 1.3 : 1.8,
              action: c.action,
              ...(c.seatHeight !== undefined ? { seatHeight: c.seatHeight } : {}),
              ...(c.label ? { label: c.label } : {}),
            },
          }
        : {}),
      ...extra,
    };
    this.objects.push(obj);
    return obj;
  }

  /** Parede horizontal em z, de x0 a x1, com vãos [centro, largura]. Faces: norte e sul. */
  hwall(z: number, x0: number, x1: number, gaps: Array<[number, number]>, kind: WallKind, north: string, south: string): void {
    for (const [a, b] of cut(x0, x1, gaps)) {
      this.walls.push({ a: { x: a, z }, b: { x: b, z }, kind, height: kind === "solid" ? WALL_H : HULL_H, colors: [north, south] });
    }
  }

  /** Parede vertical em x, de z0 a z1, com vãos [centro, largura]. Faces: oeste e leste. */
  vwall(x: number, z0: number, z1: number, gaps: Array<[number, number]>, kind: WallKind, west: string, east: string): void {
    for (const [a, b] of cut(z0, z1, gaps)) {
      // a → b para o sul: esquerda = leste, direita = oeste.
      this.walls.push({ a: { x, z: a }, b: { x, z: b }, kind, height: kind === "solid" ? WALL_H : HULL_H, colors: [east, west] });
    }
  }

  room(
    id: string,
    name: string,
    kind: ZoneKind,
    r: Rect,
    style: RoomStyle,
    opts: { team?: string; glass?: boolean; capacity?: number; listed?: boolean; group?: string; floor?: boolean } = {},
  ): Zone {
    const polygon = rectPoly(r);
    if (opts.floor !== false) this.floors.push({ id, polygon, style: style.floor });
    const zone: Zone = {
      id,
      name,
      kind,
      polygon,
      group: opts.group ?? (kind === "open" ? "open" : id),
      theme: { accent: style.accent, icon: style.icon },
      listed: opts.listed ?? true,
      ...(opts.team ? { team: opts.team } : {}),
      ...(opts.glass ? { glass: true } : {}),
      ...(opts.capacity ? { capacity: opts.capacity } : {}),
    };
    this.zones.push(zone);
    if (opts.listed !== false) this.labels.push({ text: name, ...(opts.team && opts.team !== name ? { sub: opts.team } : {}), pos: { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }, kind: "room" });
    return zone;
  }

  sign(zoneId: string, text: string, x: number, z: number, yaw: number, accent: string): void {
    this.signs.push({ zoneId, text, pos: { x, z }, yaw, accent });
  }

  /** Objeto de parede (TV, quadro, neon) encostado numa parede, olhando para `facing`. */
  onWall(type: ObjectType, lineCoord: number, along: number, facing: number, extra: Partial<MapObject> = {}): MapObject {
    const d = (extra.size?.d ?? CATALOG[type].d) / 2 + T / 2 + 0.01;
    const f = dirOfYaw(facing);
    // Paredes horizontais (olhando norte/sul) usam lineCoord como z; verticais (leste/oeste) como x.
    const horizontal = Math.abs(f.z) > 0.5;
    const x = horizontal ? along : lineCoord + f.x * d;
    const z = horizontal ? lineCoord + f.z * d : along;
    return this.put(type, x, z, facing, extra);
  }

  /** Mesa com cadeira: a pessoa olha para `face` e senta do lado oposto da mesa. */
  desk(type: ObjectType, x: number, z: number, face: number, chair: ObjectType, zoneId: string, color?: string): MapObject {
    const f = dirOfYaw(face);
    const c = CATALOG[type];
    const desk = this.put(type, x, z, face + Math.PI, { zoneId, ...(color ? { accent: color } : {}) });
    const back = c.d / 2 + 0.42;
    const seat = { x: x - f.x * back, z: z - f.z * back };
    this.put(chair, seat.x, seat.z, face, { zoneId, deskId: desk.id, ...(color ? { color } : {}) });
    this.desks.push({ id: desk.id, zoneId, seat, seatYaw: face, objectId: desk.id });
    return desk;
  }

  /** Ilha de 4 mesas: duas fileiras frente a frente ao longo de `axis`. */
  island(type: ObjectType, cx: number, cz: number, axis: "x" | "z", chair: ObjectType, zoneId: string, color?: string): void {
    const c = CATALOG[type];
    const half = c.d / 2;
    const lat = c.w / 2 + 0.02;
    for (const side of [-1, 1]) {
      for (const k of [-1, 1]) {
        if (axis === "z") {
          // Fileiras separadas no eixo z; mesas lado a lado no x.
          this.desk(type, cx + k * lat, cz + side * half, side < 0 ? S : N, chair, zoneId, color);
        } else {
          this.desk(type, cx + side * half, cz + k * lat, side < 0 ? E : W, chair, zoneId, color);
        }
      }
    }
  }

  /** Assento virado para um ponto (o centro de uma mesa). */
  seatToward(type: ObjectType, x: number, z: number, tx: number, tz: number, extra: Partial<MapObject> = {}): MapObject {
    return this.put(type, x, z, Math.atan2(tx - x, -(tz - z)), extra);
  }

  /** Cadeiras em volta de uma mesa redonda, viradas para o centro. */
  around(type: ObjectType, cx: number, cz: number, radius: number, n: number, offset: number, extra: Partial<MapObject> = {}): void {
    for (let i = 0; i < n; i++) {
      const p = dirOfYaw(offset + (i / n) * Math.PI * 2);
      this.seatToward(type, cx + p.x * radius, cz + p.z * radius, cx, cz, extra);
    }
  }

  /** Mesa de jogo com duas cadeiras frente a frente (lugar 0 e 1 da partida). */
  gameTable(type: "chess-table" | "connect4-table" | "tictactoe-table", x: number, z: number, axis: "x" | "z", gameId: string, zoneId: string): void {
    this.put(type, x, z, axis === "x" ? E : N, { gameId, zoneId });
    const off = 0.78;
    if (axis === "x") {
      this.put("chair", x - off, z, E, { gameId, gameSeat: 0, zoneId });
      this.put("chair", x + off, z, W, { gameId, gameSeat: 1, zoneId });
    } else {
      this.put("chair", x, z + off, N, { gameId, gameSeat: 0, zoneId });
      this.put("chair", x, z - off, S, { gameId, gameSeat: 1, zoneId });
    }
  }
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });
const rectPoly = (r: Rect): Vec2[] => [
  { x: r.x0, z: r.z0 },
  { x: r.x1, z: r.z0 },
  { x: r.x1, z: r.z1 },
  { x: r.x0, z: r.z1 },
];

/** Divide um trecho [a, b] removendo os vãos. */
function cut(a: number, b: number, gaps: Array<[number, number]>): Array<[number, number]> {
  const holes = gaps.map(([c, w]) => [c - w / 2, c + w / 2] as const).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cur = a;
  for (const [h0, h1] of holes) {
    if (h0 > cur + 0.01) out.push([cur, Math.min(h0, b)]);
    cur = Math.max(cur, h1);
  }
  if (b > cur + 0.01) out.push([cur, b]);
  return out;
}

export function buildStationMap(): MapDef {
  const b = new Builder();
  const s = STYLE;

  // ── Casco externo: janelas para o espaço ──────────────────────────────────────────────
  const HULL = "#C9D2DE";
  b.hwall(-19, -26, 26, [], "window", HULL, s.dev.wall);
  b.hwall(22, -26, 26, [], "window", s.arcade.wall, HULL);
  b.vwall(-26, -19, 22, [], "window", HULL, s.dev.wall);
  b.vwall(26, -19, 12, [], "window", s.diretoria.wall, HULL);
  b.vwall(26, 12, 22, [], "solid", s.auditorio.wall, HULL); // atrás do telão do auditório

  // ── Corredores ──────────────────────────────────────────────────────────────────────
  b.room("corredor-norte", "Corredor norte", "open", rect(-26, 26, -7, -4), s.corredor, { listed: false });
  b.room("corredor-sul", "Corredor sul", "open", rect(-26, 26, 9, 12), s.corredor, { listed: false });
  for (const z of [-5.5, 10.5]) b.floors.push({ id: b.id("faixa"), polygon: rectPoly(rect(-25.5, 25.5, z - 0.06, z + 0.06)), style: "line", elevation: 0.004 });

  // ── Paredes das fileiras (com as portas) ────────────────────────────────────────────
  // Fileira norte, face sul (corredor norte).
  b.hwall(-7, -26, -12, [[-19, DOOR]], "solid", s.dev.wall, HALL);
  b.hwall(-7, -12, 0, [[-6, DOOR]], "solid", s.design.wall, HALL);
  b.hwall(-7, 0, 13, [[6.5, DOOR]], "solid", s.ia.wall, HALL);
  b.hwall(-7, 13, 26, [[19.5, DOOR]], "solid", s.diretoria.wall, HALL);
  b.vwall(-12, -19, -7, [], "solid", s.dev.wall, s.design.wall);
  b.vwall(0, -19, -7, [], "solid", s.design.wall, s.ia.wall);
  b.vwall(13, -19, -7, [], "solid", s.ia.wall, s.diretoria.wall);
  // Diretoria: duas suítes e o lounge.
  b.hwall(-12.5, 13, 26, [[16.25, 1.4], [22.75, 1.4]], "glass", s.diretoria.wall, s.diretoria.wall);
  b.vwall(19.5, -19, -12.5, [], "solid", s.diretoria.wall, s.diretoria.wall);

  // Fileira do meio, face norte (corredor norte) e face sul (corredor sul).
  b.hwall(-4, -26, -16, [[-17.4, 1.6]], "solid", HALL, s.orbita.wall);
  b.hwall(-4, -16, -5, [[-10.5, DOOR]], "solid", HALL, s.marketing.wall);
  b.hwall(-4, -5, 7, [[1, 4.4]], "solid", HALL, s.atrio.wall);
  b.hwall(-4, 7, 19, [[13, DOOR]], "solid", HALL, s.comercial.wall);
  b.hwall(-4, 22, 26, [], "solid", HALL, s.foco.wall);
  b.hwall(9, -26, -16, [[-17.4, 1.6]], "solid", s.lua.wall, HALL);
  b.hwall(9, -16, -5, [[-10.5, DOOR]], "solid", s.marketing.wall, HALL);
  b.hwall(9, -5, 7, [[1, 4.4]], "solid", s.atrio.wall, HALL);
  b.hwall(9, 7, 19, [[13, DOOR]], "solid", s.comercial.wall, HALL);
  b.hwall(9, 22, 26, [], "solid", s.foco.wall, HALL);
  // Divisórias verticais da fileira do meio.
  b.hwall(2.5, -26, -16, [], "solid", s.orbita.wall, s.lua.wall);
  b.vwall(-16, -4, 9, [], "glass", s.orbita.wall, s.marketing.wall);
  b.vwall(-5, -4, 9, [[2.5, DOOR]], "solid", s.marketing.wall, s.atrio.wall);
  b.vwall(7, -4, 9, [[2.5, DOOR]], "solid", s.atrio.wall, s.comercial.wall);
  b.vwall(19, -4, 9, [[2.5, DOOR]], "solid", s.comercial.wall, s.foco.wall);
  // Cabines de foco: quatro, com porta para o corredorzinho.
  const pods = [-4, -0.75, 2.5, 5.75, 9];
  b.vwall(22, -4, 9, pods.slice(0, 4).map((z0, i) => [(z0 + pods[i + 1]!) / 2, 1.1] as [number, number]), "glass", s.foco.wall, s.foco.wall);
  for (const z of pods.slice(1, 4)) b.hwall(z, 22, 26, [], "solid", s.foco.wall, s.foco.wall);

  // Fileira sul, face norte (corredor sul).
  b.hwall(12, -26, -12, [[-19, DOOR]], "solid", HALL, s.arcade.wall);
  b.hwall(12, -12, -2, [[-7, DOOR]], "solid", HALL, s.cafe.wall);
  b.hwall(12, -2, 9, [[3.5, DOOR]], "solid", HALL, s.gestao.wall);
  b.hwall(12, 9, 26, [[11.5, DOOR], [20.5, DOOR]], "solid", HALL, s.auditorio.wall);
  b.vwall(-12, 12, 22, [], "solid", s.arcade.wall, s.cafe.wall);
  b.vwall(-2, 12, 22, [], "solid", s.cafe.wall, s.gestao.wall);
  b.vwall(9, 12, 22, [], "solid", s.gestao.wall, s.auditorio.wall);

  // ── Átrio: chegada, recepção, a estrela e o lounge ──────────────────────────────────
  b.room("atrio", "Átrio", "open", rect(-5, 7, -4, 9), s.atrio);
  b.sign("atrio", "Átrio", 1, -4.15, N, s.atrio.accent);
  b.sign("atrio", "Átrio", 1, 9.15, S, s.atrio.accent);
  b.put("sculpture", 1, 1.4, N, { zoneId: "atrio", label: "Estrela Infinity" });
  b.put("counter", 1, 5.4, S, { zoneId: "atrio", label: "Recepção" });
  b.put("office-chair", 1, 4.5, S, { zoneId: "atrio", color: "#0A2547" });
  b.put("rug", 5.0, -1.6, N, { zoneId: "atrio", size: { w: 3.6, d: 2.6, h: 0.02 }, color: "#0A2547", accent: "#00B7FF" });
  b.onWall("tv", -4, 5.0, S, { zoneId: "atrio", screenId: "atrio", size: { w: 2.4, d: 0.08, h: 1.35 } });
  b.put("sofa", 5.0, -0.6, N, { zoneId: "atrio", color: "#0A2547", interact: { point: { x: 5.0, z: -0.6 }, yaw: N, radius: 1.6, action: "sit", seatHeight: 0.42, label: "Sentar", more: [{ x: 4.25, z: -0.6 }, { x: 5.75, z: -0.6 }] } });
  b.put("coffee-table", 5.0, -1.9, N, { zoneId: "atrio" });
  b.put("armchair", 3.3, -1.9, E, { zoneId: "atrio", color: "#EE5C29" });
  b.put("armchair", 6.35, -1.9, W, { zoneId: "atrio", color: "#EE5C29" });
  b.onWall("neon-sign", -5, -1.6, E, { zoneId: "atrio", text: "INFINITY SPACE", accent: "#00B7FF" });
  b.put("directory", -4.3, 6.4, E, { zoneId: "atrio", label: "Mapa do escritório" });
  b.put("bench", -4.4, 0.6, E, { zoneId: "atrio", interact: { point: { x: -4.4, z: 0.6 }, yaw: E, radius: 1.5, action: "sit", seatHeight: 0.45, label: "Sentar", more: [{ x: -4.4, z: 0.0 }, { x: -4.4, z: 1.2 }] } });
  b.put("plant-tall", -4.3, -3.3, N, { zoneId: "atrio" });
  b.put("plant-tall", 6.3, 8.3, N, { zoneId: "atrio" });
  b.put("plant", -4.3, 8.3, N, { zoneId: "atrio", variant: 1 });
  b.put("plant", 6.3, 4.4, N, { zoneId: "atrio", variant: 2 });
  b.put("water-cooler", 6.4, 6.8, W, { zoneId: "atrio" });
  // pacote grupo: terminal de missões do Impostor na Estação, perto do lounge
  b.put("mission-console", 6.25, 2.3, W, { zoneId: "atrio", label: "Terminal de missões", interact: { point: { x: 5.4, z: 2.3 }, yaw: E, radius: 1.7, action: "use", label: "Impostor na Estação" } });
  // pacote escritorio: mural de recados na parede norte, à esquerda da entrada.
  b.onWall("notice-board", -4, -2.95, S, {
    zoneId: "atrio",
    label: "Mural de recados",
    interact: { point: { x: -2.95, z: -3.1 }, yaw: N, radius: 1.9, action: "use", label: "Ver mural" },
  });
  // pacote vivo: estação de rega (regadores e a plaquinha das plantas felizes)
  b.put("watering-station", 6.45, 5.6, W, { zoneId: "atrio", label: "Estação de rega" });
  for (const [x, z] of [
    [0, 7.5],
    [2, 7.5],
    [1, 8.1],
    [-0.6, 8.2],
    [2.6, 8.2],
    [0.4, 6.9],
    [1.6, 6.9],
  ] as const) {
    b.spawns.push({ x, z });
  }

  // ── Dev Lab (Usar) ──────────────────────────────────────────────────────────────────
  const dev = b.room("dev", "Dev Lab", "open", rect(-26, -12, -19, -7), s.dev, { team: "Desenvolvimento" });
  b.sign(dev.id, "Dev Lab", -19, -6.85, S, s.dev.accent);
  b.island("desk-dual", -22, -14.2, "z", "office-chair", dev.id, s.dev.accent);
  b.island("desk-dual", -16.6, -14.2, "z", "office-chair", dev.id, s.dev.accent);
  b.desk("standing-desk", -12.9, -17.3, E, "stool", dev.id);
  b.desk("standing-desk", -12.9, -15.7, E, "stool", dev.id);
  b.put("server-rack", -25.45, -17.8, E, { zoneId: dev.id });
  b.put("server-rack", -25.45, -16.95, E, { zoneId: dev.id });
  b.put("server-rack", -25.45, -16.1, E, { zoneId: dev.id });
  b.onWall("whiteboard", -12, -10.2, W, { zoneId: dev.id });
  b.onWall("neon-sign", -7, -23.4, N, { zoneId: dev.id, text: "</> DEPLOY", accent: s.dev.accent });
  b.put("big-button", -14.4, -8.4, W, { zoneId: dev.id, label: "Botão de deploy" });
  b.put("rug", -23.3, -9.4, N, { zoneId: dev.id, size: { w: 3.4, d: 2.4, h: 0.02 }, color: "#1E242E", accent: s.dev.accent });
  b.put("beanbag", -24.4, -9.6, E, { zoneId: dev.id, color: s.dev.accent });
  b.put("beanbag", -23.2, -10.3, N, { zoneId: dev.id, color: "#3A4250" });
  b.put("beanbag", -22.1, -9.4, W, { zoneId: dev.id, color: s.dev.accent });
  b.onWall("tv", -12, -16.5, W, { zoneId: dev.id, screenId: "dev" });
  b.put("plant-tall", -12.6, -7.6, N, { zoneId: dev.id });
  b.put("plant", -19.3, -18.4, N, { zoneId: dev.id, variant: 2 });

  // ── Produto & Design (Lapidar) ──────────────────────────────────────────────────────
  const design = b.room("design", "Produto & Design", "open", rect(-12, 0, -19, -7), s.design, { team: "Produto & Design" });
  b.sign(design.id, "Produto & Design", -6, -6.85, S, s.design.accent);
  for (const x of [-9.8, -7.4, -5.0, -2.6]) b.desk("desk", x, -18.1, N, "office-chair", design.id, s.design.accent);
  b.put("workshop-table", -6.2, -13.4, N, { zoneId: design.id });
  for (const [x, z] of [
    [-7.8, -13.9],
    [-7.8, -12.9],
    [-4.6, -13.9],
    [-4.6, -12.9],
    [-6.2, -14.45],
  ] as const) {
    b.seatToward("stool", x, z, -6.2, -13.4, { zoneId: design.id });
  }
  b.onWall("moodboard", 0, -13.2, W, { zoneId: design.id });
  b.put("bookshelf", -11.75, -12.6, E, { zoneId: design.id, size: { w: 2.0, d: 0.4, h: 2.0 } });
  b.put("rug", -2.6, -9.3, N, { zoneId: design.id, size: { w: 3.0, d: 2.2, h: 0.02 }, color: "#F2C6D8", accent: "#E85D9A" });
  b.put("sofa", -2.6, -8.1, N, { zoneId: design.id, color: "#E85D9A", interact: { point: { x: -2.6, z: -8.1 }, yaw: N, radius: 1.6, action: "sit", seatHeight: 0.42, label: "Sentar", more: [{ x: -3.35, z: -8.1 }, { x: -1.85, z: -8.1 }] } });
  b.put("coffee-table", -2.6, -9.5, N, { zoneId: design.id });
  b.onWall("art-frame", -7, -9.6, N, { zoneId: design.id, variant: 1 });
  b.put("plant-tall", -11.4, -7.6, N, { zoneId: design.id, variant: 1 });
  b.put("plant", -0.6, -12.0, N, { zoneId: design.id });

  // ── Automação & IA (Integrar) ───────────────────────────────────────────────────────
  const ia = b.room("ia", "Automação & IA", "open", rect(0, 13, -19, -7), s.ia, { team: "Automação & IA" });
  b.sign(ia.id, "Automação & IA", 6.5, -6.85, S, s.ia.accent);
  b.put("curved-desk", 6.5, -17.5, S, { zoneId: ia.id });
  for (const x of [5.4, 6.5, 7.6]) b.put("office-chair", x, -16.4, N, { zoneId: ia.id, color: "#0A2547" });
  b.put("holo-table", 6.5, -12.6, N, { zoneId: ia.id });
  b.island("desk-dual", 2.6, -11.3, "x", "office-chair", ia.id, s.ia.accent);
  b.put("robot-arm", 11.9, -17.9, W, { zoneId: ia.id });
  b.put("server-rack", 12.45, -11.6, W, { zoneId: ia.id });
  b.put("server-rack", 12.45, -10.75, W, { zoneId: ia.id });
  b.onWall("neon-sign", -7, 10.2, N, { zoneId: ia.id, text: "AI · AUTOMAÇÃO", accent: s.ia.accent });
  b.put("plant-tall", 0.6, -18.4, N, { zoneId: ia.id, variant: 2 });
  b.put("plant", 12.3, -7.7, N, { zoneId: ia.id, variant: 1 });

  // ── Diretoria (Revisar) ─────────────────────────────────────────────────────────────
  const dirL = b.room("diretoria-lounge", "Diretoria", "open", rect(13, 26, -12.5, -7), s.diretoria, { team: "Diretoria" });
  b.sign(dirL.id, "Diretoria", 19.5, -6.85, S, s.diretoria.accent);
  for (const [i, x0, x1] of [
    [1, 13, 19.5],
    [2, 19.5, 26],
  ] as const) {
    const suite = b.room(`diretoria-${i}`, `Suíte ${i}`, "office", rect(x0, x1, -19, -12.5), s.diretoria, { team: "Diretoria", capacity: 4 });
    const cx = (x0 + x1) / 2;
    b.sign(suite.id, `Suíte ${i}`, cx, -12.35, S, s.diretoria.accent);
    const exec = b.put("exec-desk", cx, -16.3, N, { zoneId: suite.id });
    b.put("exec-chair", cx, -17.35, S, { zoneId: suite.id, color: "#3B2A22", deskId: exec.id });
    b.desks.push({ id: exec.id, zoneId: suite.id, seat: { x: cx, z: -17.35 }, seatYaw: S, objectId: exec.id });
    b.put("chair", cx - 0.55, -15.2, N, { zoneId: suite.id, color: "#6B4A32" });
    b.put("chair", cx + 0.55, -15.2, N, { zoneId: suite.id, color: "#6B4A32" });
    b.put("bookshelf", i === 1 ? 13.3 : 25.7, -16.0, i === 1 ? E : W, { zoneId: suite.id });
    b.onWall("tv", i === 1 ? 19.5 : 19.5, -15.6, i === 1 ? W : E, { zoneId: suite.id, screenId: suite.id });
    b.put("plant-tall", i === 1 ? 13.6 : 25.4, -13.2, N, { zoneId: suite.id });
  }
  b.put("rug", 16.2, -9.6, N, { zoneId: dirL.id, size: { w: 3.6, d: 2.6, h: 0.02 }, color: "#E9DFD0", accent: s.diretoria.accent });
  b.put("sofa", 16.2, -8.3, N, { zoneId: dirL.id, color: "#3B2A22", interact: { point: { x: 16.2, z: -8.3 }, yaw: N, radius: 1.6, action: "sit", seatHeight: 0.42, label: "Sentar", more: [{ x: 15.45, z: -8.3 }, { x: 16.95, z: -8.3 }] } });
  b.put("coffee-table", 16.2, -9.7, N, { zoneId: dirL.id });
  b.put("armchair", 14.3, -10.4, E, { zoneId: dirL.id, color: "#6B4A32" });
  b.put("round-table", 23.0, -9.8, N, { zoneId: dirL.id });
  b.around("chair", 23.0, -9.8, 1.08, 4, 0, { zoneId: dirL.id, color: "#6B4A32" });
  b.put("plant-tall", 25.5, -7.6, N, { zoneId: dirL.id });
  // pacote vivo: telescópio apontado para a janela leste
  b.put("telescope", 25.1, -11.7, E, { zoneId: dirL.id, label: "Telescópio" });

  // ── Salas de reunião Órbita e Lua ───────────────────────────────────────────────────
  const orb = b.room("orbita", "Sala Órbita", "meeting", rect(-26, -16, -4, 2.5), s.orbita, { glass: true, capacity: 10 });
  b.sign(orb.id, "Sala Órbita", -17.4, -4.15, N, s.orbita.accent);
  b.put("meeting-table", -21, -0.2, N, { zoneId: orb.id, size: { w: 1.3, d: 3.6, h: 0.75 } });
  for (const z of [-1.3, -0.2, 0.9]) {
    b.put("office-chair", -22.08, z, E, { zoneId: orb.id, color: s.orbita.accent });
    b.put("office-chair", -19.92, z, W, { zoneId: orb.id, color: s.orbita.accent });
  }
  b.onWall("tv", -4, -21, S, { zoneId: orb.id, screenId: orb.id, size: { w: 2.2, d: 0.08, h: 1.24 } });
  b.onWall("whiteboard", 2.5, -21, N, { zoneId: orb.id });
  b.put("plant", -16.6, -3.4, N, { zoneId: orb.id, variant: 1 });

  const lua = b.room("lua", "Sala Lua", "meeting", rect(-26, -16, 2.5, 9), s.lua, { glass: true, capacity: 6 });
  b.sign(lua.id, "Sala Lua", -17.4, 9.15, S, s.lua.accent);
  b.put("round-table", -21, 6.0, N, { zoneId: lua.id, size: { w: 1.7, d: 1.7, h: 0.75 } });
  b.around("chair", -21, 6.0, 1.3, 6, Math.PI / 6, { zoneId: lua.id, color: "#8A93A3" });
  b.onWall("tv", 2.5, -21, S, { zoneId: lua.id, screenId: lua.id });
  b.put("plant", -16.6, 8.4, N, { zoneId: lua.id, variant: 2 });

  // ── Marketing Studio (Visualizar) ───────────────────────────────────────────────────
  const mkt = b.room("marketing", "Marketing Studio", "open", rect(-16, -5, -4, 9), s.marketing, { team: "Marketing & Criação" });
  b.sign(mkt.id, "Marketing Studio", -10.5, -4.15, N, s.marketing.accent);
  b.sign(mkt.id, "Marketing Studio", -10.5, 9.15, S, s.marketing.accent);
  b.put("backdrop", -13.9, -3.4, S, { zoneId: mkt.id });
  b.put("ring-light", -15.2, -1.6, Math.PI * 0.75, { zoneId: mkt.id });
  b.put("camera-tripod", -13.9, 0.1, N, { zoneId: mkt.id });
  b.onWall("moodboard", -5, 6.3, W, { zoneId: mkt.id });
  b.put("workshop-table", -9.4, 3.4, N, { zoneId: mkt.id, size: { w: 2.2, d: 1.1, h: 0.9 } });
  for (const [x, z] of [
    [-10.9, 3.0],
    [-10.9, 3.8],
    [-7.9, 3.0],
    [-7.9, 3.8],
  ] as const) {
    b.seatToward("stool", x, z, -9.4, 3.4, { zoneId: mkt.id });
  }
  b.island("desk", -8.6, -1.6, "z", "office-chair", mkt.id, s.marketing.accent);
  b.put("rug", -7.3, 7.0, N, { zoneId: mkt.id, size: { w: 3.2, d: 2.2, h: 0.02 }, color: "#F6C9B5", accent: s.marketing.accent });
  b.put("beanbag", -8.3, 7.1, E, { zoneId: mkt.id, color: s.marketing.accent });
  b.put("beanbag", -7.2, 6.5, N, { zoneId: mkt.id, color: "#F2B134" });
  b.put("beanbag", -6.2, 7.3, W, { zoneId: mkt.id, color: "#00B7FF" });
  b.onWall("neon-sign", -4, -7.2, S, { zoneId: mkt.id, text: "IDEIAS QUE VENDEM", accent: s.marketing.accent });
  b.onWall("art-frame", 9, -13.2, N, { zoneId: mkt.id, variant: 2 });
  b.put("plant-tall", -5.6, -3.4, N, { zoneId: mkt.id });
  b.put("plant", -15.4, 8.4, N, { zoneId: mkt.id });

  // ── Comercial (Examinar) ────────────────────────────────────────────────────────────
  const com = b.room("comercial", "Comercial", "open", rect(7, 19, -4, 9), s.comercial, { team: "Comercial" });
  b.sign(com.id, "Comercial", 13, -4.15, N, s.comercial.accent);
  b.sign(com.id, "Comercial", 13, 9.15, S, s.comercial.accent);
  b.island("desk", 10.2, -0.2, "z", "office-chair", com.id, s.comercial.accent);
  b.island("desk", 10.2, 5.2, "z", "office-chair", com.id, s.comercial.accent);
  b.onWall("leaderboard", 19, 0.0, W, { zoneId: com.id, screenId: "comercial" });
  b.put("gong", 17.9, -2.8, W, { zoneId: com.id });
  b.put("high-table", 15.6, 6.4, N, { zoneId: com.id });
  for (const [x, z] of [
    [15.0, 5.6],
    [16.2, 5.6],
    [15.0, 7.2],
    [16.2, 7.2],
  ] as const) {
    b.seatToward("stool", x, z, x, 6.4, { zoneId: com.id });
  }
  b.onWall("neon-sign", 9, 9.4, N, { zoneId: com.id, text: "BORA VENDER", accent: s.comercial.accent });
  b.put("plant-tall", 18.4, 8.4, N, { zoneId: com.id });
  b.put("plant", 7.6, -3.4, N, { zoneId: com.id, variant: 1 });

  // ── Foco: corredorzinho silencioso e quatro cabines ─────────────────────────────────
  b.room("foco-hall", "Foco", "open", rect(19, 22, -4, 9), s.foco, { listed: true });
  b.sign("foco-hall", "Foco", 20.5, -4.15, N, s.foco.accent);
  b.put("plant", 19.5, 8.4, N, { zoneId: "foco-hall", variant: 2 });
  for (let i = 0; i < 4; i++) {
    const z0 = pods[i]!;
    const z1 = pods[i + 1]!;
    const cz = (z0 + z1) / 2;
    const pod = b.room(`foco-${i + 1}`, `Cabine ${i + 1}`, "focus", rect(22, 26, z0, z1), s.foco, { capacity: 1, listed: false });
    b.sign(pod.id, `Cabine ${i + 1}`, 21.85, cz, W, s.foco.accent);
    b.desk("desk", 25.4, cz, E, "office-chair", pod.id, s.foco.accent);
    b.put("lamp-floor", 25.6, z0 + 0.45, N, { zoneId: pod.id });
    b.put("plant-small", 25.6, z1 - 0.4, N, { zoneId: pod.id });
  }

  // ── Arcade: a sala de jogos ─────────────────────────────────────────────────────────
  const arc = b.room("arcade", "Arcade", "open", rect(-26, -12, 12, 22), s.arcade);
  b.sign(arc.id, "Arcade", -19, 11.85, N, s.arcade.accent);
  b.put("airhockey", -23.4, 15.2, N, { zoneId: arc.id, gameId: "arcade-hockey-1" });
  b.put("pingpong", -22.9, 19.7, E, { zoneId: arc.id, gameId: "arcade-pingpong-1" });
  b.put("pool", -18.0, 15.4, E, { zoneId: arc.id, gameId: "arcade-sinuca-1" });
  b.gameTable("chess-table", -18.6, 19.9, "x", "arcade-xadrez-1", arc.id);
  b.gameTable("chess-table", -15.6, 19.9, "x", "arcade-xadrez-2", arc.id);
  b.gameTable("connect4-table", -14.3, 17.0, "z", "arcade-lig4-1", arc.id);
  b.gameTable("connect4-table", -16.6, 12.95, "x", "arcade-lig4-2", arc.id);
  for (const z of [13.2, 14.3, 15.4]) b.put("arcade", -12.55, z, W, { zoneId: arc.id, variant: Math.round(z) % 3 });
  b.put("jukebox", -25.55, 12.8, E, { zoneId: arc.id });
  b.put("beanbag", -25.2, 17.1, E, { zoneId: arc.id, color: s.arcade.accent });
  b.put("beanbag", -25.2, 18.0, E, { zoneId: arc.id, color: "#E85D9A" });
  b.onWall("neon-sign", 12, -23.2, S, { zoneId: arc.id, text: "ARCADE", accent: s.arcade.accent });
  // pacote arcade: jogo da velha, placar de recordes dos fliperamas e lixeiras da bolinha de papel
  b.gameTable("tictactoe-table", -20.9, 17.6, "x", "arcade-velha-1", arc.id);
  b.onWall("arcade-board", 12, -14.6, S, { zoneId: arc.id, label: "Recordes do Arcade", interact: { point: { x: -14.9, z: 13.0 }, yaw: N, radius: 1.1, action: "use", label: "Ver recordes" } });
  for (const [x, z, zoneId] of [
    [-19.3, -14.2, "dev"],
    [-8.6, -18.5, "design"],
    [-6.4, -1.6, "marketing"],
    [12.3, 2.5, "comercial"],
    [1.5, 21.6, "gestao"],
    [-11.55, 13.1, "cafe"],
    [-5.1, 21.55, "cafe"],
  ] as const) {
    b.put("trash-bin", x, z, N, { zoneId });
  }

  // ── Café & Copa ─────────────────────────────────────────────────────────────────────
  const cafe = b.room("cafe", "Café & Copa", "open", rect(-12, -2, 12, 22), s.cafe);
  b.sign(cafe.id, "Café & Copa", -7, 11.85, N, s.cafe.accent);
  b.put("kitchen-counter", -11.6, 16.6, E, { zoneId: cafe.id });
  b.put("coffee-machine", -11.65, 14.4, E, { zoneId: cafe.id });
  b.put("fridge", -11.6, 18.7, E, { zoneId: cafe.id });
  b.put("water-cooler", -11.7, 20.3, E, { zoneId: cafe.id });
  b.put("high-table", -7.0, 15.4, N, { zoneId: cafe.id });
  for (const [x, z] of [
    [-7.6, 14.6],
    [-6.4, 14.6],
    [-7.6, 16.2],
    [-6.4, 16.2],
  ] as const) {
    b.seatToward("stool", x, z, x, 15.4, { zoneId: cafe.id });
  }
  for (const x of [-9.0, -6.4, -3.8]) {
    b.put("bistro-table", x, 20.4, N, { zoneId: cafe.id });
    b.put("chair", x - 0.74, 20.4, E, { zoneId: cafe.id, color: "#C68A4A" });
    b.put("chair", x + 0.74, 20.4, W, { zoneId: cafe.id, color: "#C68A4A" });
  }
  b.put("sofa", -2.55, 16.2, W, { zoneId: cafe.id, color: "#6B4A32", interact: { point: { x: -2.55, z: 16.2 }, yaw: W, radius: 1.6, action: "sit", seatHeight: 0.42, label: "Sentar", more: [{ x: -2.55, z: 15.45 }, { x: -2.55, z: 16.95 }] } });
  b.put("coffee-table", -3.9, 16.2, E, { zoneId: cafe.id });
  b.onWall("neon-sign", 12, -9.6, S, { zoneId: cafe.id, text: "CAFÉ", accent: s.cafe.accent });
  b.put("plant-tall", -2.5, 12.6, N, { zoneId: cafe.id, variant: 1 });
  // pacote grupo: cavalete do Stop (Adedonha), ponto de entrada do jogo no Café
  b.put("stop-board", -4.4, 13.25, S, { zoneId: cafe.id, label: "Stop", interact: { point: { x: -4.4, z: 14.1 }, yaw: N, radius: 1.7, action: "use", label: "Jogar Stop" } });
  // pacote vivo: quadro de giz com o contador do dia, embaixo do neon
  b.put("chalkboard", -9.6, 12.6, S, { zoneId: cafe.id, label: "Quadro da copa" });

  // ── Gestão & Projetos (Ordenar) ─────────────────────────────────────────────────────
  const ges = b.room("gestao", "Gestão & Projetos", "open", rect(-2, 9, 12, 22), s.gestao, { team: "Gestão & Projetos" });
  b.sign(ges.id, "Gestão & Projetos", 3.5, 11.85, N, s.gestao.accent);
  b.onWall("kanban-board", -2, 16.4, E, { zoneId: ges.id });
  b.onWall("whiteboard", 9, 15.0, W, { zoneId: ges.id });
  b.put("round-table", 3.6, 16.2, N, { zoneId: ges.id, size: { w: 1.6, d: 1.6, h: 0.75 } });
  b.around("chair", 3.6, 16.2, 1.25, 5, 0.3, { zoneId: ges.id, color: s.gestao.accent });
  for (const x of [0.4, 2.6, 4.8, 7.0]) b.desk("desk", x, 21.35, S, "office-chair", ges.id, s.gestao.accent);
  b.put("plant-tall", 8.4, 12.6, N, { zoneId: ges.id });
  b.put("plant", -1.4, 12.7, N, { zoneId: ges.id, variant: 1 });

  // ── Auditório ───────────────────────────────────────────────────────────────────────
  const aud = b.room("auditorio", "Auditório", "auditorium", rect(9, 26, 12, 22), s.auditorio, { group: "aud", capacity: 48 });
  b.sign(aud.id, "Auditório", 11.5, 11.85, N, s.auditorio.accent);
  b.sign(aud.id, "Auditório", 20.5, 11.85, N, s.auditorio.accent);
  b.room("palco", "Palco", "stage", rect(23, 26, 13.4, 20.6), { ...s.auditorio, floor: "stage" }, { group: "aud", listed: false, floor: false });
  b.floors.push({ id: "palco", polygon: rectPoly(rect(23, 26, 13.4, 20.6)), style: "stage", elevation: 0.35 });
  b.onWall("tv", 26, 17, W, { zoneId: aud.id, screenId: "auditorio", size: { w: 4.6, d: 0.1, h: 2.6 }, elevation: 1.95 });
  b.put("lectern", 23.9, 14.6, W, { zoneId: "palco", interact: { point: { x: 23.25, z: 14.6 }, yaw: W, radius: 1.3, action: "use", label: "Ir ao púlpito" } });
  for (const x of [11.6, 12.9, 14.2, 15.5, 16.8, 18.1]) {
    for (const z of [13.6, 14.6, 15.6, 16.5, 17.5, 18.4, 19.4, 20.4]) b.put("stage-seat", x, z, E, { zoneId: aud.id, color: "#2B3F63" });
  }
  b.put("plant-tall", 9.6, 21.4, N, { zoneId: aud.id });
  b.put("plant-tall", 22.4, 21.4, N, { zoneId: aud.id });

  // pacote portas: uma porta no vão de cada sala fechada (reunião, suítes e cabines de foco).
  // `rot` aponta de dentro para fora; `size.w` é a largura do vão; variante 1 = folha de vidro.
  const door = (zoneId: string, x: number, z: number, out: number, w: number, glass: boolean) =>
    b.put("door", x, z, out, { zoneId, size: { w, d: 0.08, h: 2.2 }, ...(glass ? { variant: 1 } : {}) });
  door(orb.id, -17.4, -4, N, 1.6, false);
  door(lua.id, -17.4, 9, S, 1.6, false);
  door("diretoria-1", 16.25, -12.5, S, 1.4, true);
  door("diretoria-2", 22.75, -12.5, S, 1.4, true);
  for (let i = 0; i < 4; i++) door(`foco-${i + 1}`, 22, (pods[i]! + pods[i + 1]!) / 2, W, 1.1, true);

  return {
    id: "estacao",
    version: 1,
    name: "Estação Infinity",
    floors: b.floors,
    walls: b.walls,
    zones: b.zones,
    objects: b.objects,
    desks: b.desks,
    signs: b.signs,
    labels: b.labels,
    spawns: b.spawns,
  };
}
