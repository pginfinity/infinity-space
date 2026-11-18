import { dirOfYaw, dist, type Vec2 } from "../../geometry.ts";
import type { MapDef, Wall, Zone } from "../../map/types.ts";
import { PRIVACY, wallBetween, type PrivacyRules } from "../../audio.ts";

/**
 * Pacote "portas": privacidade de conversa.
 * - Portas das salas fechadas (reunião, suítes e cabines) com três estados: aberta, fechada (bate e
 *   alguém de dentro deixa entrar) e trancada / não perturbe. Bilhete opcional na porta.
 * - Cadeado de conversa: um grupo numa área aberta "fecha a roda" e só quem está nela se ouve.
 * - Sussurro: segurando uma tecla perto de alguém, a voz vai só para essa pessoa.
 *
 * A regra de quem ouve quem fica em `audio.ts` (`hearing` com `PrivacyRules`); aqui ficam o estado
 * compartilhado e as contas puras usadas pelo servidor e pelo cliente.
 */

export const PORTAS_ID = "portas";
export const PORTAS_KIND = "doors";

export type DoorState = "open" | "closed" | "locked";
export const DOOR_STATES: readonly DoorState[] = ["open", "closed", "locked"];

export const PORTAS = {
  /** Tamanho máximo do bilhete na porta. */
  noteMax: 60,
  /** Distância (m) da porta para bater. */
  knockRange: 2.4,
  /** Distância (m) da porta, por dentro, para mudar o estado com E. */
  useRange: 2.0,
  /** Quem chega até aqui (m) da porta vê o bilhete. */
  noteRange: 5.5,
  /** Uma batida sem resposta some depois disso. */
  knockTtlMs: 45_000,
  /** Intervalo mínimo entre duas batidas da mesma pessoa. */
  knockCooldownMs: 4000,
  /** Sala vazia por este tempo volta a "aberta" (sem bilhete). */
  emptyMs: 5000,
  /** Quem está até aqui (m) da borda da roda pode pedir para entrar. */
  askRange: 2.2,
  /** Um pedido para entrar na roda sem resposta some depois disso. */
  askTtlMs: 45_000,
} as const;

/** Uma porta do mapa (objeto "door" no vão de uma sala fechada). */
export interface DoorDef {
  zoneId: string;
  objectId: string;
  /** Centro do vão. */
  pos: Vec2;
  /** Yaw de dentro para fora. */
  rot: number;
  /** Largura do vão. */
  width: number;
  /** Folha de vidro (parede de vidro). */
  glass: boolean;
  /** Ponto andável logo do lado de fora (para bater e para devolver quem não podia entrar). */
  outside: Vec2;
  /** Ponto andável logo do lado de dentro. */
  inside: Vec2;
}

export function doorsOf(map: MapDef): DoorDef[] {
  const out: DoorDef[] = [];
  for (const o of map.objects) {
    if (o.type !== "door" || !o.zoneId) continue;
    const f = dirOfYaw(o.rot);
    out.push({
      zoneId: o.zoneId,
      objectId: o.id,
      pos: o.pos,
      rot: o.rot,
      width: o.size.w,
      glass: o.variant === 1,
      outside: { x: o.pos.x + f.x * 0.9, z: o.pos.z + f.z * 0.9 },
      inside: { x: o.pos.x - f.x * 0.9, z: o.pos.z - f.z * 0.9 },
    });
  }
  return out;
}

/**
 * Uma sala pode ter mais de uma entrada (a Sala Eclipse tem duas): o estado da porta é da sala,
 * e cada entrada física usa esse estado. Esta é a entrada da sala mais perto de `p`.
 */
export function nearestDoor(defs: readonly DoorDef[], zoneId: string, p?: Vec2): DoorDef | undefined {
  let best: DoorDef | undefined;
  let bestD = Infinity;
  for (const d of defs) {
    if (d.zoneId !== zoneId) continue;
    const dd = p ? Math.hypot(p.x - d.pos.x, p.z - d.pos.z) : 0;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

export interface PortasRequest {
  id: string;
  name: string;
  at: number;
}

export interface DoorSnap {
  state: DoorState;
  /** Quem pode estar lá dentro (só vale com a porta fechada ou trancada). */
  admitted: string[];
  /** Bilhete na porta ("Em entrevista até 15h"); vazio = sem bilhete. */
  note: string;
  /** Quem bateu e espera resposta. */
  knocks: PortasRequest[];
}

export interface CircleSnap {
  id: string;
  members: string[];
  center: Vec2;
  radius: number;
  /** Quem pediu para entrar e espera resposta. */
  asks: PortasRequest[];
}

export interface PortasState {
  /** Por id da zona (sala). */
  doors: Record<string, DoorSnap>;
  circles: CircleSnap[];
}

/** Regras de audição a partir do estado (o servidor usa o próprio estado; o cliente, o snapshot). */
export function portasPrivacy(state: PortasState | undefined, whispers?: ReadonlyMap<string, string>): PrivacyRules {
  const doors = new Map<string, ReadonlySet<string>>();
  const circles = new Map<string, string>();
  for (const [zone, d] of Object.entries(state?.doors ?? {})) if (d.state !== "open") doors.set(zone, new Set(d.admitted));
  for (const c of state?.circles ?? []) for (const m of c.members) circles.set(m, c.id);
  return whispers ? { doors, circles, whispers } : { doors, circles };
}

/** A pessoa não pode estar nesta sala agora (porta fechada ou trancada e ela não foi admitida). */
export function doorBars(state: PortasState | undefined, zoneId: string | undefined, id: string): boolean {
  if (!zoneId) return false;
  const d = state?.doors[zoneId];
  return !!d && d.state !== "open" && !d.admitted.includes(id);
}

/** Limpa o bilhete da porta: uma linha, curta. */
export function portasCleanNote(text: unknown): string {
  return typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PORTAS.noteMax) : "";
}

// ---- roda fechada (cadeado de conversa) -------------------------------------------------------

export interface PortasPerson {
  id: string;
  pos: Vec2;
  zone: Zone | undefined;
}

/** A roda só existe em áreas abertas (átrio, corredores, salas de time). */
export function circleZoneOk(zone: Zone | undefined): boolean {
  return zone?.kind === "open";
}

/**
 * Quem entra na roda quando `from` a fecha: quem está a até `PRIVACY.circleRange` dela, sem parede
 * no meio, numa área aberta e fora de outra roda. Só os vizinhos diretos (quem está passando a 5 m
 * de outro participante não entra por tabela).
 */
export function circleCandidates(walls: readonly Wall[], from: PortasPerson, people: readonly PortasPerson[], taken: ReadonlySet<string>): string[] {
  if (!circleZoneOk(from.zone) || taken.has(from.id)) return [];
  const out: string[] = [];
  for (const p of people) {
    if (p.id === from.id || taken.has(p.id) || !circleZoneOk(p.zone)) continue;
    if (dist(p.pos, from.pos) <= PRIVACY.circleRange && !wallBetween(walls, p.pos, from.pos)) out.push(p.id);
  }
  return out;
}

/**
 * Quem continua na roda: fica quem está numa área aberta e no maior grupo de pessoas ligadas entre si
 * (cada uma a até `PRIVACY.circleKeep` de outra, sem parede). No empate, o grupo de quem fechou a roda.
 * Recebe os membros na ordem da roda (o primeiro é quem fechou).
 */
export function circleKeep(walls: readonly Wall[], members: readonly PortasPerson[]): string[] {
  const ok = members.filter((m) => circleZoneOk(m.zone));
  const comp = new Array<number>(ok.length).fill(-1);
  let best: number[] = [];
  for (let i = 0; i < ok.length; i++) {
    if (comp[i] !== -1) continue;
    const group: number[] = [];
    const stack = [i];
    comp[i] = i;
    while (stack.length) {
      const a = stack.pop()!;
      group.push(a);
      for (let b = 0; b < ok.length; b++) {
        if (comp[b] !== -1) continue;
        if (dist(ok[a]!.pos, ok[b]!.pos) <= PRIVACY.circleKeep && !wallBetween(walls, ok[a]!.pos, ok[b]!.pos)) {
          comp[b] = i;
          stack.push(b);
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  return best.sort((a, b) => a - b).map((i) => ok[i]!.id);
}

/** Centro e raio do anel desenhado no chão. */
export function circleShape(points: readonly Vec2[]): { center: Vec2; radius: number } {
  if (points.length === 0) return { center: { x: 0, z: 0 }, radius: 1.3 };
  const center = { x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length };
  const far = Math.max(...points.map((p) => dist(p, center)));
  return { center: { x: round(center.x), z: round(center.z) }, radius: round(Math.max(1.3, far + 0.8)) };
}

/** Dá para pedir para entrar nesta roda daqui? */
export function circleCanAsk(c: Pick<CircleSnap, "center" | "radius">, p: Vec2, zone: Zone | undefined): boolean {
  return circleZoneOk(zone) && dist(p, c.center) <= c.radius + PORTAS.askRange;
}

const round = (n: number) => Math.round(n * 100) / 100;
