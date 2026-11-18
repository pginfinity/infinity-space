import type { Vec2 } from "../../geometry.ts";
import type { MapDef, MapObject } from "../../map/types.ts";

/**
 * Pacote "foco": a mesa de foco do corredorzinho Foco, com um Pomodoro compartilhado.
 *
 * Quem senta entra no ciclo do grupo: 25 min de foco e 5 de pausa; a cada 4 focos, pausa de 15.
 * O relógio é um só, no servidor, e quem chega no meio entra no ciclo em andamento. Ninguém mexe no
 * relógio dos outros: pausar, retomar e reiniciar só valem quando todos os sentados concordam.
 * Mesa vazia zera.
 *
 * Presença, não vigilância: o estado é só o agora (quem está sentado e onde está o relógio).
 * Nada de contar pomodoros por pessoa, nem histórico, nem nada salvo.
 */

export const FOCO_ID = "foco";
export const FOCO_KIND = "pomodoro";

/** Id do móvel (mesa de foco) e prefixo dos ids das cadeiras dela, na ordem dos lugares. */
export const FOCO_TABLE_ID = "mesa-foco";
export const FOCO_SEAT_PREFIX = "mesa-foco-lugar-";

const MIN = 60_000;
/** Duração de cada fase (ms). */
export const FOCO_FOCUS_MS = 25 * MIN;
export const FOCO_SHORT_MS = 5 * MIN;
export const FOCO_LONG_MS = 15 * MIN;
/** Focos por rodada (depois do último vem a pausa longa). */
export const FOCO_ROUNDS = 4;
/** Uma proposta (pausar, retomar, reiniciar) sem acordo some depois disso. */
export const FOCO_VOTE_MS = 90_000;
/** Distância (m) do lugar para continuar sentado na mesa (o servidor confere a cada tique). */
export const FOCO_SEAT_RANGE = 1.2;

export type FocoPhase = "focus" | "short" | "long";
export type FocoVoteOp = "pause" | "resume" | "restart";
export const FOCO_VOTE_OPS: readonly FocoVoteOp[] = ["pause", "resume", "restart"];

export interface FocoVote {
  op: FocoVoteOp;
  /** Quem já concorda (só os sentados agora). */
  ids: string[];
  /** Quando a proposta foi feita (relógio do servidor). */
  at: number;
}

export interface FocoState {
  /** Quem está em cada lugar (id da sessão) ou null. */
  seats: Array<string | null>;
  /** Início do ciclo (relógio do servidor, ms), já descontadas as pausas. null = mesa vazia. */
  startAt: number | null;
  /** Relógio parado desde este instante (todos concordaram em pausar). */
  pausedAt: number | null;
  /** Proposta em aberto. */
  vote: FocoVote | null;
}

/** Uma fase do ciclo, calculada a partir do tempo corrido. */
export interface FocoPhaseInfo {
  phase: FocoPhase;
  /** Foco da rodada (1 a 4); nas pausas, o foco que acabou de terminar. */
  round: number;
  /** Número da fase desde o começo (0, 1, 2...): muda a cada troca, serve de chave. */
  index: number;
  /** Duração da fase (ms). */
  length: number;
  /** Quanto falta (ms). */
  left: number;
  /** 0 a 1. */
  progress: number;
}

/** Duração da rodada completa: 4 focos, 3 pausas curtas e a longa. */
export const FOCO_SET_MS = FOCO_ROUNDS * FOCO_FOCUS_MS + (FOCO_ROUNDS - 1) * FOCO_SHORT_MS + FOCO_LONG_MS;

/** Mesa vazia com `n` lugares. */
export function focoEmpty(n: number): FocoState {
  return { seats: Array.from({ length: n }, () => null), startAt: null, pausedAt: null, vote: null };
}

/** Tempo de ciclo corrido (ms) no instante `now`, sem contar as pausas. null = parado (mesa vazia). */
export function focoElapsed(s: Pick<FocoState, "startAt" | "pausedAt">, now: number): number | null {
  if (s.startAt === null) return null;
  return Math.max(0, (s.pausedAt ?? now) - s.startAt);
}

/** Em que fase o ciclo está depois de `elapsed` ms. O ciclo se repete depois da pausa longa. */
export function focoPhaseAt(elapsed: number): FocoPhaseInfo {
  const e = Math.max(0, elapsed);
  const set = Math.floor(e / FOCO_SET_MS);
  let t = e - set * FOCO_SET_MS;
  const perSet = FOCO_ROUNDS * 2;
  for (let i = 0; i < perSet; i++) {
    const round = Math.floor(i / 2) + 1;
    const phase: FocoPhase = i % 2 === 0 ? "focus" : round === FOCO_ROUNDS ? "long" : "short";
    const length = phase === "focus" ? FOCO_FOCUS_MS : phase === "long" ? FOCO_LONG_MS : FOCO_SHORT_MS;
    if (t < length || i === perSet - 1) {
      const into = Math.min(t, length);
      return { phase, round, index: set * perSet + i, length, left: length - into, progress: into / length };
    }
    t -= length;
  }
  /* c8 ignore next */
  return { phase: "focus", round: 1, index: 0, length: FOCO_FOCUS_MS, left: FOCO_FOCUS_MS, progress: 0 };
}

/** Fase atual da mesa (null = mesa vazia). */
export function focoNow(s: Pick<FocoState, "startAt" | "pausedAt">, now: number): FocoPhaseInfo | null {
  const e = focoElapsed(s, now);
  return e === null ? null : focoPhaseAt(e);
}

/** Lugar (índice) de uma pessoa, ou -1. */
export function focoSeatOf(s: Pick<FocoState, "seats">, id: string): number {
  return s.seats.indexOf(id);
}

/** Quantas pessoas estão sentadas. */
export function focoCount(s: Pick<FocoState, "seats">): number {
  let n = 0;
  for (const x of s.seats) if (x) n++;
  return n;
}

/** A proposta faz sentido no estado atual? (pausar só rodando, retomar só pausado) */
export function focoVoteValid(s: Pick<FocoState, "startAt" | "pausedAt">, op: FocoVoteOp): boolean {
  if (s.startAt === null) return false;
  if (op === "pause") return s.pausedAt === null;
  if (op === "resume") return s.pausedAt !== null;
  return true;
}

/** Aplica uma mudança de relógio (já aprovada por todos). */
function apply(s: FocoState, op: FocoVoteOp, now: number): FocoState {
  if (op === "pause") return { ...s, pausedAt: now, vote: null };
  if (op === "resume") return { ...s, startAt: (s.startAt ?? now) + (now - (s.pausedAt ?? now)), pausedAt: null, vote: null };
  return { ...s, startAt: now, pausedAt: null, vote: null };
}

/** Se todos os sentados concordam com a proposta, ela vale. */
function settle(s: FocoState, now: number): FocoState {
  const v = s.vote;
  if (!v) return s;
  const seated = s.seats.filter((x): x is string => !!x);
  const ids = v.ids.filter((id) => seated.includes(id));
  if (!ids.length || !focoVoteValid(s, v.op)) return { ...s, vote: null };
  if (seated.every((id) => ids.includes(id))) return apply(s, v.op, now);
  return ids.length === v.ids.length ? s : { ...s, vote: { ...v, ids } };
}

/**
 * Senta a pessoa no lugar `seat` (se estiver livre). Quem já estava em outro lugar da mesa troca de
 * lugar. Mesa vazia: o ciclo começa agora. Mesa em andamento: entra no ciclo como está.
 */
export function focoSit(s: FocoState, id: string, seat: number, now: number): FocoState {
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.seats.length) return s;
  const cur = s.seats[seat];
  if (cur === id) return s;
  if (cur) return s;
  const seats = s.seats.map((x) => (x === id ? null : x));
  seats[seat] = id;
  const start = s.startAt === null;
  return settle({ ...s, seats, startAt: start ? now : s.startAt, pausedAt: start ? null : s.pausedAt, vote: start ? null : s.vote }, now);
}

/** A pessoa saiu da mesa. Mesa vazia zera o relógio; uma proposta pode passar a valer (os que ficaram concordam). */
export function focoLeave(s: FocoState, id: string, now: number): FocoState {
  if (!s.seats.includes(id)) return s;
  const seats = s.seats.map((x) => (x === id ? null : x));
  if (!seats.some(Boolean)) return focoEmpty(seats.length);
  return settle({ ...s, seats, vote: s.vote ? { ...s.vote, ids: s.vote.ids.filter((x) => x !== id) } : null }, now);
}

/**
 * Concorda com uma proposta (ou faz uma nova). Uma proposta diferente da que está aberta a substitui.
 * Quando todos os sentados concordam, vale na hora.
 */
export function focoVote(s: FocoState, id: string, op: FocoVoteOp, now: number): FocoState {
  if (!s.seats.includes(id) || !FOCO_VOTE_OPS.includes(op) || !focoVoteValid(s, op)) return s;
  const v = s.vote && s.vote.op === op ? s.vote : null;
  if (v?.ids.includes(id)) return s;
  const vote: FocoVote = v ? { ...v, ids: [...v.ids, id] } : { op, ids: [id], at: now };
  return settle({ ...s, vote }, now);
}

/** Retira a própria concordância (a proposta some se ninguém mais concorda). */
export function focoUnvote(s: FocoState, id: string): FocoState {
  if (!s.vote?.ids.includes(id)) return s;
  const ids = s.vote.ids.filter((x) => x !== id);
  return { ...s, vote: ids.length ? { ...s.vote, ids } : null };
}

/** Proposta velha (sem acordo) some. */
export function focoExpire(s: FocoState, now: number): FocoState {
  return s.vote && now - s.vote.at > FOCO_VOTE_MS ? { ...s, vote: null } : s;
}

/** Cadeiras da mesa de foco, na ordem dos lugares. */
export function focoSeats(map: Pick<MapDef, "objects">): MapObject[] {
  return map.objects.filter((o) => o.id.startsWith(FOCO_SEAT_PREFIX) && o.interact?.action === "sit").sort((a, b) => seatNo(a.id) - seatNo(b.id));
}

/** Ponto onde a pessoa senta em cada lugar. */
export function focoSeatPoints(map: Pick<MapDef, "objects">): Vec2[] {
  return focoSeats(map).map((o) => o.interact!.point);
}

function seatNo(id: string): number {
  return Number(id.slice(FOCO_SEAT_PREFIX.length)) || 0;
}
