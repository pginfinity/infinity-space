import { dirOfYaw, rectCorners, type Vec2 } from "../geometry.ts";
import type { Desk, FloorArea, MapDef, MapLabel, MapObject, ObjectType, Wall, Wing, Zone } from "./types.ts";

/**
 * Planta "Círculo de Evolução": um átrio circular com a estrela no centro e sete alas,
 * uma para cada etapa do método da Infinity (E·V·O·L·U·I·R), em sentido horário a partir do norte.
 *
 * Para trocar a área de uma ala, mude `team` em WINGS. A geometria não depende disso.
 */
export const WINGS: ReadonlyArray<Pick<Wing, "step" | "letter" | "team">> = [
  { step: "Examinar", letter: "E", team: "Comercial" },
  { step: "Visualizar", letter: "V", team: "Marketing & Criação" },
  { step: "Ordenar", letter: "O", team: "Gestão & Projetos" },
  { step: "Lapidar", letter: "L", team: "Produto & Design" },
  { step: "Usar", letter: "U", team: "Desenvolvimento" },
  { step: "Integrar", letter: "I", team: "Automação & IA" },
  { step: "Revisar", letter: "R", team: "Diretoria & Auditório" },
];

export const HUB_RADIUS = 9;
const CORRIDOR_HALF = 1.5;
const WING_S0 = 12;
const WING_S1 = 25;
const WING_HALF = 6;
const WALL_H = 3.2;
const GLASS_H = 3.0;
const DOOR = 1.4;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Ponto em coordenadas polares do átrio: raio e yaw (0 = norte, sentido horário). */
export function polar(r: number, yaw: number): Vec2 {
  const d = dirOfYaw(yaw);
  return { x: d.x * r, z: d.z * r };
}

/** Converte coordenadas locais da ala (s = distância do centro, t = lateral, positivo à direita) para o mundo. */
function frame(yaw: number) {
  const u = dirOfYaw(yaw);
  const r = { x: -u.z, z: u.x };
  const W = (s: number, t: number): Vec2 => ({ x: s * u.x + t * r.x, z: s * u.z + t * r.z });
  const rect = (s0: number, s1: number, t0: number, t1: number): Vec2[] => [W(s0, t0), W(s1, t0), W(s1, t1), W(s0, t1)];
  return { W, rect, yaw };
}

class Builder {
  floors: FloorArea[] = [];
  walls: Wall[] = [];
  zones: Zone[] = [];
  objects: MapObject[] = [];
  desks: Desk[] = [];
  labels: MapLabel[] = [];
  spawns: Vec2[] = [];
  private seq = new Map<string, number>();

  id(prefix: string): string {
    const n = (this.seq.get(prefix) ?? 0) + 1;
    this.seq.set(prefix, n);
    return `${prefix}-${n}`;
  }

  wall(a: Vec2, b: Vec2, kind: Wall["kind"] = "solid"): void {
    this.walls.push({ a, b, kind, height: kind === "glass" ? GLASS_H : WALL_H });
  }

  object(o: Omit<MapObject, "id"> & { id?: string }): MapObject {
    const obj: MapObject = { ...o, id: o.id ?? this.id(o.type) };
    this.objects.push(obj);
    return obj;
  }
}

const SIZES: Record<ObjectType, { w: number; d: number; h: number; blocks: boolean }> = {
  desk: { w: 1.4, d: 0.7, h: 0.75, blocks: true },
  chair: { w: 0.55, d: 0.55, h: 0.9, blocks: false },
  sofa: { w: 2.4, d: 0.9, h: 0.8, blocks: true },
  armchair: { w: 0.95, d: 0.9, h: 0.8, blocks: true },
  "coffee-table": { w: 1.2, d: 0.7, h: 0.42, blocks: true },
  "meeting-table": { w: 1.2, d: 2.8, h: 0.75, blocks: true },
  counter: { w: 3.0, d: 0.75, h: 1.05, blocks: true },
  tv: { w: 1.6, d: 0.08, h: 0.9, blocks: false },
  plant: { w: 0.6, d: 0.6, h: 1.4, blocks: true },
  sculpture: { w: 2.0, d: 2.0, h: 3.6, blocks: true },
  "stage-seat": { w: 0.6, d: 0.6, h: 0.85, blocks: false },
  lectern: { w: 0.7, d: 0.5, h: 1.15, blocks: true },
  airhockey: { w: 1.1, d: 2.0, h: 0.8, blocks: true },
  pool: { w: 1.45, d: 2.6, h: 0.82, blocks: true },
  "chess-table": { w: 0.8, d: 0.8, h: 0.74, blocks: true },
  jukebox: { w: 0.9, d: 0.6, h: 1.6, blocks: true },
  bookshelf: { w: 2.0, d: 0.4, h: 2.0, blocks: true },
  beanbag: { w: 0.85, d: 0.85, h: 0.55, blocks: false },
};

/** Cria um objeto com o tamanho padrão do tipo. */
function place(b: Builder, type: ObjectType, pos: Vec2, rot: number, extra: Partial<MapObject> = {}): MapObject {
  const s = SIZES[type];
  return b.object({
    type,
    pos,
    rot,
    size: { w: s.w, d: s.d, h: s.h },
    blocks: s.blocks,
    ...extra,
  });
}

/** Assento: objeto não bloqueante com ponto de sentar no próprio lugar. */
function seat(b: Builder, type: "chair" | "stage-seat" | "beanbag", pos: Vec2, yaw: number, extra: Partial<MapObject> = {}): MapObject {
  return place(b, type, pos, yaw, { interact: { point: pos, yaw, radius: 1.2, action: "sit" }, ...extra });
}

function circlePolygon(r: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) pts.push(polar(r, (i / n) * TAU));
  return pts;
}

function buildHub(b: Builder, wingYaws: number[]): void {
  b.floors.push({ id: "hub", polygon: circlePolygon(HUB_RADIUS + 0.1, 72), material: "concrete" });
  b.zones.push({ id: "atrio", name: "Átrio", kind: "open", group: "open", polygon: circlePolygon(HUB_RADIUS, 72) });
  b.labels.push({ text: "Átrio", pos: polar(3.4, Math.PI), kind: "hub" });

  // Paredes do átrio: arcos entre as aberturas dos corredores.
  const alpha = Math.asin(CORRIDOR_HALF / HUB_RADIUS);
  for (let i = 0; i < wingYaws.length; i++) {
    const from = wingYaws[i]! + alpha;
    const to = (wingYaws[(i + 1) % wingYaws.length]! - alpha + TAU) % TAU;
    const span = (to - from + TAU) % TAU;
    const steps = Math.max(3, Math.round((span * HUB_RADIUS) / 0.9));
    for (let k = 0; k < steps; k++) {
      b.wall(polar(HUB_RADIUS, from + (span * k) / steps), polar(HUB_RADIUS, from + (span * (k + 1)) / steps));
    }
  }

  const facing = (pos: Vec2, target: Vec2) => Math.atan2(target.x - pos.x, -(target.z - pos.z));
  const center = { x: 0, z: 0 };
  const mid = (i: number) => wingYaws[i]! + Math.PI / wingYaws.length; // meio do vão entre a ala i e a i+1

  // Centro: a estrela da Infinity.
  place(b, "sculpture", center, 0, { label: "Estrela Infinity" });

  // Sul (entre as alas 3 e 4): chegada e recepção.
  const south = Math.PI;
  place(b, "counter", polar(4.7, south), south, { label: "Recepção", size: { w: 3.2, d: 0.8, h: 1.05 } });
  place(b, "plant", polar(8.2, south - 14 * DEG), 0);
  place(b, "plant", polar(8.2, south + 14 * DEG), 0);

  // Lounge com TV (vão 0).
  const lounge = mid(0);
  b.floors.push({ id: "lounge-rug", polygon: circlePolygon(2.1, 32).map((p) => ({ x: p.x + polar(6.1, lounge).x, z: p.z + polar(6.1, lounge).z })), material: "rug", elevation: 0.004 });
  place(b, "tv", polar(HUB_RADIUS - 0.12, lounge), lounge + Math.PI, { screenId: "lounge", elevation: 1.55, size: { w: 2.6, d: 0.08, h: 1.46 }, label: "TV do lounge" });
  place(b, "coffee-table", polar(6.2, lounge), lounge + Math.PI / 2);
  const sofaPos = polar(4.7, lounge);
  place(b, "sofa", sofaPos, lounge, { interact: { point: sofaPos, yaw: lounge, radius: 1.6, action: "sit" } });
  for (const side of [-1, 1]) {
    const p = polar(6.3, lounge + side * 15 * DEG);
    place(b, "armchair", p, facing(p, polar(6.2, lounge)), { interact: { point: p, yaw: facing(p, polar(6.2, lounge)), radius: 1.2, action: "sit" } });
  }

  // Estante e plantas (vão 1).
  const shelf = mid(1);
  place(b, "bookshelf", polar(HUB_RADIUS - 0.35, shelf), shelf + Math.PI);
  place(b, "plant", polar(8.0, shelf - 12 * DEG), 0);
  place(b, "plant", polar(8.0, shelf + 12 * DEG), 0);

  // Café (vão 2).
  const cafe = mid(2);
  place(b, "counter", polar(7.9, cafe), cafe + Math.PI, { label: "Café" });
  for (const off of [-9, 9]) {
    const t = polar(5.4, cafe + off * DEG);
    place(b, "coffee-table", t, 0, { size: { w: 0.75, d: 0.75, h: 0.75 } });
    for (const side of [-1, 1]) {
      const p = polar(5.4, cafe + off * DEG + side * 7.5 * DEG);
      seat(b, "chair", p, facing(p, t));
    }
  }

  // Jogos (vão 4): hockey de mesa e sinuca.
  const games = mid(4);
  const hockeyPos = polar(6.2, games - 12 * DEG);
  place(b, "airhockey", hockeyPos, games - 12 * DEG, { label: "Hockey de mesa", interact: { point: hockeyPos, yaw: 0, radius: 1.8, action: "play" } });
  const poolPos = polar(5.6, games + 11 * DEG);
  place(b, "pool", poolPos, games + 11 * DEG, { label: "Sinuca", interact: { point: poolPos, yaw: 0, radius: 2.0, action: "play" } });

  // Xadrez (vão 5).
  const chess = mid(5);
  for (const off of [-8, 8]) {
    const yaw = chess + off * DEG;
    const t = polar(6.4, yaw);
    place(b, "chess-table", t, yaw, { label: "Xadrez", interact: { point: t, yaw: 0, radius: 1.4, action: "play" } });
    for (const side of [-1, 1]) {
      const p = polar(6.4, yaw + side * 7.5 * DEG);
      seat(b, "chair", p, facing(p, t));
    }
  }

  // Jukebox e pufes (vão 6).
  const juke = mid(6);
  place(b, "jukebox", polar(HUB_RADIUS - 0.45, juke), juke + Math.PI, { label: "Jukebox", interact: { point: polar(7.6, juke), yaw: juke, radius: 1.4, action: "use" } });
  for (const off of [-11, 0, 11]) {
    const p = polar(6.3, juke + off * DEG);
    seat(b, "beanbag", p, facing(p, polar(HUB_RADIUS, juke)));
  }

  // Pontos de chegada, ao sul, de frente para a estrela.
  for (const [r, off] of [
    [7.3, 0],
    [7.3, -6],
    [7.3, 6],
    [6.6, -3],
    [6.6, 3],
    [7.9, -3],
    [7.9, 3],
  ] as const) {
    b.spawns.push(polar(r, south + off * DEG));
  }
}

function buildCorridor(b: Builder, wing: Wing): void {
  const f = frame(wing.yaw);
  const s0 = Math.sqrt(HUB_RADIUS * HUB_RADIUS - CORRIDOR_HALF * CORRIDOR_HALF);
  b.floors.push({ id: `${wing.id}-corredor`, polygon: f.rect(s0 - 0.25, WING_S0 + 0.05, -CORRIDOR_HALF, CORRIDOR_HALF), material: "concrete", elevation: 0.002 });
  b.zones.push({ id: `${wing.id}-corredor`, name: `Corredor ${wing.step}`, kind: "open", group: "open", wingId: wing.id, polygon: f.rect(s0 - 0.25, WING_S0, -CORRIDOR_HALF, CORRIDOR_HALF) });
  b.wall(f.W(s0, -CORRIDOR_HALF), f.W(WING_S0, -CORRIDOR_HALF));
  b.wall(f.W(s0, CORRIDOR_HALF), f.W(WING_S0, CORRIDOR_HALF));
}

function buildWingShell(b: Builder, wing: Wing): ReturnType<typeof frame> {
  const f = frame(wing.yaw);
  b.floors.push({ id: `${wing.id}-piso`, polygon: f.rect(WING_S0, WING_S1, -WING_HALF, WING_HALF), material: wing.index === 6 ? "wood" : "carpet", elevation: 0.003 });
  b.wall(f.W(WING_S0, -WING_HALF), f.W(WING_S0, -CORRIDOR_HALF));
  b.wall(f.W(WING_S0, CORRIDOR_HALF), f.W(WING_S0, WING_HALF));
  b.wall(f.W(WING_S1, -WING_HALF), f.W(WING_S1, WING_HALF));
  b.wall(f.W(WING_S0, -WING_HALF), f.W(WING_S1, -WING_HALF));
  b.wall(f.W(WING_S0, WING_HALF), f.W(WING_S1, WING_HALF));
  return f;
}

/** Ala padrão: área aberta com mesas, sala de reunião de vidro, cabine de foco e cantinho da TV. */
function buildStandardWing(b: Builder, wing: Wing): void {
  const f = buildWingShell(b, wing);
  const { W, rect } = f;
  const Y = (local: number) => wing.yaw + local; // yaw local -> mundo (0 = para fora)

  b.zones.push({ id: `${wing.id}-aberta`, name: wing.team, kind: "open", group: "open", wingId: wing.id, polygon: rect(WING_S0, WING_S1, -WING_HALF, WING_HALF) });
  b.labels.push({ text: wing.step, sub: wing.team, pos: W(17.2, -0.4), kind: "wing", yaw: wing.yaw });

  // Sala de reunião de vidro.
  const meetId = `${wing.id}-reuniao`;
  b.zones.push({ id: meetId, name: `Sala ${wing.step}`, kind: "meeting", group: meetId, wingId: wing.id, glass: true, capacity: 6, polygon: rect(19, WING_S1, 2, WING_HALF) });
  b.wall(W(19, 2), W(19, WING_HALF), "glass");
  b.wall(W(19, 2), W(19.4, 2), "glass");
  b.wall(W(19.4 + DOOR, 2), W(WING_S1, 2), "glass");
  b.labels.push({ text: `Sala ${wing.step}`, pos: W(22.0, 5.4), kind: "room" });
  place(b, "meeting-table", W(22.2, 4), Y(0), { zoneId: meetId });
  for (const s of [21.2, 22.2, 23.2]) {
    seat(b, "chair", W(s, 3.05), Y(Math.PI / 2), { zoneId: meetId });
    seat(b, "chair", W(s, 4.95), Y(-Math.PI / 2), { zoneId: meetId });
  }
  place(b, "tv", W(WING_S1 - 0.1, 4), Y(Math.PI), { screenId: meetId, elevation: 1.5, zoneId: meetId, label: `TV ${wing.step}` });

  // Cabine de foco.
  const focusId = `${wing.id}-foco`;
  b.zones.push({ id: focusId, name: `Foco ${wing.step}`, kind: "focus", group: focusId, wingId: wing.id, capacity: 1, polygon: rect(22.6, WING_S1, -WING_HALF, -3.6) });
  b.wall(W(22.6, -WING_HALF), W(22.6, -3.6));
  b.wall(W(22.6, -3.6), W(23.0, -3.6));
  b.wall(W(23.0 + DOOR, -3.6), W(WING_S1, -3.6));
  const focusDesk = place(b, "desk", W(24.5, -4.8), Y(Math.PI), { size: { w: 1.2, d: 0.6, h: 0.75 }, zoneId: focusId });
  seat(b, "chair", W(23.75, -4.8), Y(0), { zoneId: focusId, deskId: focusDesk.id });
  b.desks.push({ id: `${wing.id}-foco-mesa`, wingId: wing.id, seat: W(23.75, -4.8), seatYaw: Y(0), objectId: focusDesk.id });

  // Mesas em ilhas de 4.
  let n = 0;
  for (const [cs, ct] of [
    [14.6, -3.4],
    [14.6, 3.4],
    [20.6, -1.2],
  ] as const) {
    for (const row of [-1, 1]) {
      for (const col of [-1, 1]) {
        n++;
        const deskS = cs + row * 0.36;
        const deskT = ct + col * 0.72;
        const seatS = deskS + row * 0.75;
        const deskYaw = Y(row < 0 ? Math.PI : 0);
        const seatYaw = Y(row < 0 ? 0 : Math.PI);
        const deskId = `${wing.id}-mesa-${n}`;
        const desk = place(b, "desk", W(deskS, deskT), deskYaw, { id: deskId, label: `Mesa ${n}` });
        seat(b, "chair", W(seatS, deskT), seatYaw, { deskId: desk.id });
        b.desks.push({ id: deskId, wingId: wing.id, seat: W(seatS, deskT), seatYaw, objectId: desk.id });
      }
    }
  }

  // Cantinho da TV do time.
  place(b, "tv", W(18.0, -WING_HALF + 0.1), Y(Math.PI / 2), { screenId: `${wing.id}-time`, elevation: 1.5, label: `TV ${wing.team}` });
  seat(b, "beanbag", W(17.3, -4.4), Y(-Math.PI / 2));
  seat(b, "beanbag", W(18.7, -4.4), Y(-Math.PI / 2));

  place(b, "bookshelf", W(16.0, WING_HALF - 0.25), Y(-Math.PI / 2));
  place(b, "plant", W(12.6, -5.4), 0);
  place(b, "plant", W(12.6, 5.4), 0);
  place(b, "plant", W(18.4, 1.3), 0);
}

/** Ala Revisar: duas salas da diretoria e o auditório com palco. */
function buildRevisarWing(b: Builder, wing: Wing): void {
  const f = buildWingShell(b, wing);
  const { W, rect } = f;
  const Y = (local: number) => wing.yaw + local;

  b.zones.push({ id: `${wing.id}-passagem`, name: "Passagem", kind: "open", group: "open", wingId: wing.id, polygon: rect(WING_S0, 17, -2, 2) });
  b.labels.push({ text: wing.step, sub: wing.team, pos: W(14.4, 0), kind: "wing", yaw: wing.yaw });

  // Salas da diretoria.
  for (const side of [-1, 1] as const) {
    const id = `${wing.id}-diretoria-${side < 0 ? 1 : 2}`;
    const t0 = side < 0 ? -WING_HALF : 2;
    const t1 = side < 0 ? -2 : WING_HALF;
    const tWall = side < 0 ? -2 : 2;
    const tMid = (t0 + t1) / 2;
    b.zones.push({ id, name: `Diretoria ${side < 0 ? 1 : 2}`, kind: "office", group: id, wingId: wing.id, capacity: 4, polygon: rect(WING_S0, 17, t0, t1) });
    b.wall(W(WING_S0, tWall), W(15.2, tWall));
    b.wall(W(15.2 + DOOR, tWall), W(17, tWall));
    b.wall(W(17, t0), W(17, t1));
    b.labels.push({ text: `Diretoria ${side < 0 ? 1 : 2}`, pos: W(14.5, tMid + side * 1.2), kind: "room" });
    const desk = place(b, "desk", W(13.7, tMid), Y(0), { size: { w: 1.7, d: 0.8, h: 0.76 }, zoneId: id });
    seat(b, "chair", W(12.85, tMid), Y(0), { zoneId: id, deskId: desk.id });
    b.desks.push({ id: `${id}-mesa`, wingId: wing.id, seat: W(12.85, tMid), seatYaw: Y(0), objectId: desk.id });
    seat(b, "chair", W(14.6, tMid - 0.5), Y(Math.PI), { zoneId: id });
    seat(b, "chair", W(14.6, tMid + 0.5), Y(Math.PI), { zoneId: id });
    place(b, "tv", W(14.8, side < 0 ? -WING_HALF + 0.1 : WING_HALF - 0.1), Y(side < 0 ? Math.PI / 2 : -Math.PI / 2), { screenId: id, elevation: 1.5, zoneId: id });
    place(b, "plant", W(16.4, side < 0 ? -5.4 : 5.4), 0);
  }

  // Auditório.
  const audId = `${wing.id}-auditorio`;
  b.zones.push({ id: audId, name: "Auditório", kind: "auditorium", group: "aud", wingId: wing.id, capacity: 40, polygon: rect(17, WING_S1, -WING_HALF, WING_HALF) });
  b.zones.push({ id: `${wing.id}-palco`, name: "Palco", kind: "stage", group: "aud", wingId: wing.id, polygon: rect(22.8, WING_S1, -4.5, 4.5) });
  b.floors.push({ id: `${wing.id}-palco`, polygon: rect(22.8, WING_S1, -4.5, 4.5), material: "stage", elevation: 0.3 });
  b.labels.push({ text: "Auditório", pos: W(18.0, 0), kind: "room" });
  place(b, "tv", W(WING_S1 - 0.1, 0), Y(Math.PI), { screenId: "auditorio", elevation: 1.75, size: { w: 4.2, d: 0.1, h: 2.36 }, label: "Telão do auditório" });
  place(b, "lectern", W(23.7, 2.8), Y(Math.PI), { interact: { point: W(22.95, 2.8), yaw: Y(Math.PI), radius: 1.2, action: "use" }, label: "Púlpito" });
  for (const s of [18.6, 19.7, 20.8, 21.9]) {
    for (const t of [-5, -4, -3, -2, 2, 3, 4, 5]) seat(b, "stage-seat", W(s, t), Y(0), { zoneId: audId });
  }
}

/** Monta a planta completa. Determinística: o mesmo código gera o mesmo mapa no servidor e nos clientes. */
export function buildCirculoMap(): MapDef {
  const b = new Builder();
  const wings: Wing[] = WINGS.map((w, i) => ({
    id: `ala-${w.letter.toLowerCase()}`,
    index: i,
    step: w.step,
    letter: w.letter,
    team: w.team,
    yaw: (i / WINGS.length) * TAU,
  }));

  buildHub(
    b,
    wings.map((w) => w.yaw),
  );
  for (const wing of wings) {
    buildCorridor(b, wing);
    if (wing.index === 6) buildRevisarWing(b, wing);
    else buildStandardWing(b, wing);
  }

  return {
    id: "circulo",
    version: 1,
    name: "Infinity Space · Círculo de Evolução",
    floors: b.floors,
    walls: b.walls,
    zones: b.zones,
    objects: b.objects,
    desks: b.desks,
    wings,
    labels: b.labels,
    spawns: b.spawns,
  };
}

/** Ponto no referencial de uma ala: `s` = distância do centro do átrio, `t` = deslocamento lateral (positivo à direita de quem olha para fora). */
export function wingPoint(wing: Pick<Wing, "yaw">, s: number, t: number): Vec2 {
  return frame(wing.yaw).W(s, t);
}

/** Polígono de um objeto no chão (para colisão e para o desenho 2D). */
export function objectFootprint(o: MapObject): Vec2[] {
  return rectCorners(o.pos, o.size.w, o.size.d, o.rot);
}
