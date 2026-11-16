import type { MapDef, ObjectType } from "../../map/types.ts";
import type { NavGrid } from "../../nav.ts";
import type { Vec2 } from "../../geometry.ts";

/**
 * Impostor na Estação: dedução social sem violência. A tripulação faz tarefas espalhadas pela estação;
 * um infiltrado (dois, com 7+ pessoas) "congela" gente às escondidas. Quem acha alguém congelado
 * reporta e começa uma reunião: conversa rápida e votação. A tripulação vence terminando as tarefas
 * ou descobrindo os infiltrados; os infiltrados vencem quando ficam em número igual à tripulação.
 *
 * Papéis e tarefas são privados (evento "role"); o estado público mostra só o progresso do time.
 */

export const IMP_ID = "impostor";
export const IMP_KIND = "impostor";
/** Onde a sala abre (o terminal de missões fica no Átrio). */
export const IMP_ZONE = "atrio";
export const IMP_MIN_PLAYERS = 4;
export const IMP_MAX_PLAYERS = 10;
export const IMP_TASKS_PER_PLAYER = 4;
/** Tempo parado perto do objeto para concluir uma tarefa. */
export const IMP_TASK_MS = 2500;
export const IMP_TASK_RANGE = 2.0;
export const IMP_TAG_RANGE = 1.5;
export const IMP_REPORT_RANGE = 2.4;
/** Recarga entre dois congelamentos (o primeiro só depois de IMP_FIRST_TAG_MS). */
export const IMP_TAG_COOLDOWN_MS = 25_000;
export const IMP_FIRST_TAG_MS = 15_000;
export const IMP_MEETING_MS = 60_000;
export const IMP_RESULT_MS = 6_000;
export const IMP_CHAT_MAX = 80;
export const IMP_CHAT_KEEP = 30;

export type ImpPhase = "idle" | "lobby" | "playing" | "meeting" | "result" | "final";
export type ImpRole = "crew" | "impostor";

/** Tipos de objeto que viram tarefa, com o texto da tarefa. */
export const IMP_TASK_TYPES: Partial<Record<ObjectType, string>> = {
  "coffee-machine": "Recarregar a máquina de café",
  "server-rack": "Reiniciar um servidor",
  "holo-table": "Calibrar o holograma",
  "water-cooler": "Trocar o galão de água",
  "plant-tall": "Regar a planta",
  "big-button": "Testar o botão de deploy",
  jukebox: "Afinar a jukebox",
  fridge: "Organizar a geladeira",
  "robot-arm": "Lubrificar o braço robótico",
  "ring-light": "Ajustar a luz do estúdio",
  "camera-tripod": "Limpar a lente da câmera",
  directory: "Atualizar o mapa da estação",
  bookshelf: "Arrumar a estante",
};

export interface ImpTaskSpot {
  /** Id do objeto (também é o id da tarefa). */
  id: string;
  type: ObjectType;
  label: string;
  /** Ponto andável perto do objeto. */
  point: Vec2;
  zone: string;
  zoneName: string;
}

export interface ImpPlayer {
  id: string;
  name: string;
  alive: boolean;
  /** Já votou na reunião atual (sem dizer em quem). */
  voted: boolean;
  away?: boolean;
}

export interface ImpState {
  phase: ImpPhase;
  game: number;
  owner: string | null;
  players: ImpPlayer[];
  /** Quantos infiltrados há na partida. */
  impostors: number;
  progress: { done: number; total: number };
  /** Onde há gente congelada (para reportar). */
  frozen: { id: string; name: string; x: number; z: number }[];
  meeting: { by: string; reason: "report" | "emergency"; body: string | null; chat: { name: string; text: string }[] } | null;
  result: { ejected: string | null; wasImpostor: boolean | null; tie: boolean } | null;
  final: { winner: ImpRole; impostors: string[] } | null;
  left: number;
  duration: number;
  /** Chamadas de emergência já usadas (ids). */
  emergencies: string[];
}

/** Evento "role" (só para a pessoa). */
export interface ImpRoleEvent {
  game: number;
  role: ImpRole;
  /** Nomes dos outros infiltrados (só para infiltrados). */
  partners: string[];
  tasks: string[];
  done: string[];
  /** Quando pode congelar de novo (ms a partir do envio), só para infiltrados. */
  tagIn: number;
}

/** Pontos de tarefa da estação: um por objeto dos tipos de tarefa, com ponto andável por perto. */
export function impTaskSpots(map: MapDef, nav: NavGrid): ImpTaskSpot[] {
  const out: ImpTaskSpot[] = [];
  for (const o of map.objects) {
    const label = IMP_TASK_TYPES[o.type];
    if (!label) continue;
    const point = nav.nearestWalkable(o.pos, 2.2);
    if (!point) continue;
    const zone = map.zones.find((z) => z.id === o.zoneId);
    out.push({ id: o.id, type: o.type, label, point, zone: o.zoneId ?? "", zoneName: zone?.name ?? "" });
  }
  return out;
}

/** Quantos infiltrados para esse número de pessoas. */
export function impImpostorCount(players: number): number {
  return players >= 7 ? 2 : 1;
}

/** Sorteia os infiltrados. */
export function impPickImpostors(ids: readonly string[], rand: () => number): string[] {
  const pool = [...ids];
  const n = Math.min(impImpostorCount(ids.length), Math.max(0, ids.length - 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return out;
}

/** Sorteia tarefas em lugares diferentes, preferindo salas variadas. */
export function impPickTasks(spots: readonly ImpTaskSpot[], n: number, rand: () => number): string[] {
  const shuffled = [...spots].sort(() => rand() - 0.5);
  const out: ImpTaskSpot[] = [];
  for (const s of shuffled) {
    if (out.length >= n) break;
    if (out.some((o) => o.zone === s.zone || o.type === s.type)) continue;
    out.push(s);
  }
  for (const s of shuffled) {
    if (out.length >= n) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.map((s) => s.id);
}

/**
 * Apuração: maioria simples dos votos dados ganha; empate (ou "pular" na frente) não tira ninguém.
 * `votes` mapeia quem votou → em quem ("skip" para pular).
 */
export function impTally(votes: ReadonlyMap<string, string>): { ejected: string | null; tie: boolean; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const v of votes.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  let tie = false;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  if (!best || tie || best === "skip") return { ejected: null, tie, counts };
  return { ejected: best, tie: false, counts };
}

/** Quem venceu, se alguém venceu. */
export function impWinner(alive: { crew: number; impostors: number }, tasks: { done: number; total: number }): ImpRole | null {
  if (alive.impostors === 0) return "crew";
  if (tasks.total > 0 && tasks.done >= tasks.total) return "crew";
  if (alive.impostors >= alive.crew) return "impostor";
  return null;
}
