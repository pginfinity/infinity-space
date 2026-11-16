import { yawOf, type Vec2 } from "../../geometry.ts";

/**
 * Orbi, o robô mascote. O servidor decide o trajeto (pontos da rota, velocidade e hora de saída)
 * e todo cliente calcula a mesma posição a partir disso: nada de posição a 15 Hz pela rede.
 */

export const ORBI_ID = "orbi";
export const ORBI_KIND = "orbi";

/** Áreas comuns por onde o Orbi passeia (nada de salas de reunião, suítes ou cabines de foco). */
export const ORBI_ZONES = ["atrio", "corredor-norte", "corredor-sul", "cafe", "arcade"] as const;

/** Velocidades (m/s): passeio tranquilo e seguindo alguém (quase o passo de uma pessoa). */
export const ORBI_WANDER_SPEED = 1.15;
export const ORBI_FOLLOW_SPEED = 3.3;
/** Seguindo: fica a esta distância de quem chamou. */
export const ORBI_FOLLOW_GAP = 1.3;
/** Para de seguir sozinho depois disso. */
export const ORBI_FOLLOW_MS = 2 * 60 * 1000;
/** Carinho: fica parado curtindo por este tempo. */
export const ORBI_PET_MS = 2800;
/** Distâncias (m) para chamar e para fazer carinho. */
export const ORBI_CALL_RANGE = 9;
export const ORBI_PET_RANGE = 2.2;

export type OrbiMode = "wander" | "rest" | "follow" | "pet";

export interface OrbiState {
  mode: OrbiMode;
  /** Trajeto atual: parte de `from` e passa pelos pontos de `path`. */
  from: Vec2;
  path: Vec2[];
  /** m/s ao longo do trajeto. */
  speed: number;
  /** Quando saiu de `from` (relógio do servidor, ms). */
  startAt: number;
  /** Para onde olha quando parado (yaw). */
  yaw: number;
  /** Quem chamou e até quando segue. */
  follow: { id: string; name: string; until: number } | null;
  /** Último carinho (para corações e emote). */
  pet: { name: string; at: number } | null;
  /** Relógio do servidor quando o estado saiu. */
  now: number;
}

export interface OrbiPose {
  x: number;
  z: number;
  yaw: number;
  /** Ainda andando pelo trajeto. */
  moving: boolean;
}

export function orbiPathLength(from: Vec2, path: readonly Vec2[]): number {
  let total = 0;
  let a = from;
  for (const b of path) {
    total += Math.hypot(b.x - a.x, b.z - a.z);
    a = b;
  }
  return total;
}

/** Quando termina o trajeto atual (relógio do servidor). */
export function orbiArriveAt(s: Pick<OrbiState, "from" | "path" | "speed" | "startAt">): number {
  return s.startAt + (s.speed > 0 ? (orbiPathLength(s.from, s.path) / s.speed) * 1000 : 0);
}

/** Posição no trajeto no instante `t` (relógio do servidor). Igual no servidor e em todo cliente. */
export function orbiPoseAt(s: Pick<OrbiState, "from" | "path" | "speed" | "startAt" | "yaw">, t: number, out: OrbiPose = { x: 0, z: 0, yaw: 0, moving: false }): OrbiPose {
  let left = Math.max(0, ((t - s.startAt) / 1000) * s.speed);
  let a = s.from;
  let yaw = s.yaw;
  for (const b of s.path) {
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg < 1e-6) {
      a = b;
      continue;
    }
    yaw = yawOf({ x: b.x - a.x, z: b.z - a.z });
    if (left < seg) {
      const k = left / seg;
      out.x = a.x + (b.x - a.x) * k;
      out.z = a.z + (b.z - a.z) * k;
      out.yaw = yaw;
      out.moving = true;
      return out;
    }
    left -= seg;
    a = b;
  }
  out.x = a.x;
  out.z = a.z;
  out.yaw = s.path.length > 0 ? yaw : s.yaw;
  out.moving = false;
  return out;
}

/** Ponto a `gap` metros antes do fim do trajeto (para parar ao lado de quem chamou, sem trombar). */
export function orbiTrimPath(from: Vec2, path: readonly Vec2[], gap: number): Vec2[] {
  const total = orbiPathLength(from, path);
  if (total <= gap) return [];
  const keep = total - gap;
  const out: Vec2[] = [];
  let a = from;
  let walked = 0;
  for (const b of path) {
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (walked + seg >= keep) {
      const k = seg > 0 ? (keep - walked) / seg : 0;
      out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
      return out;
    }
    out.push(b);
    walked += seg;
    a = b;
  }
  return out;
}
