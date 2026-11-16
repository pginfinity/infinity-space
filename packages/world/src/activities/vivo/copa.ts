import type { Vec2 } from "../../geometry.ts";
import type { MapObject, ObjectType } from "../../map/types.ts";
import { vivoDay } from "./day.ts";
import { VIVO_POPCORN_SPOT, vivoLocalToWorld } from "./place.ts";

/**
 * Copa: máquina de café (café, chá), bebedouro (água), geladeira (suco) e bancada (pipoca).
 * A pessoa escolhe, espera o preparo curto e sai com o item na mão. O contador do dia é do time.
 */

export const COPA_ID = "copa";
export const COPA_KIND = "copa";

export const COPA_ITEMS = ["coffee", "tea", "water", "juice", "popcorn"] as const;
export type CopaItem = (typeof COPA_ITEMS)[number];

export type CopaStationType = Extract<ObjectType, "coffee-machine" | "water-cooler" | "fridge" | "kitchen-counter">;
export const COPA_STATION_TYPES: readonly CopaStationType[] = ["coffee-machine", "water-cooler", "fridge", "kitchen-counter"];

export interface CopaStationRule {
  items: readonly CopaItem[];
  /** Duração do preparo (ms). */
  prepMs: number;
}

export const COPA_STATIONS: Record<CopaStationType, CopaStationRule> = {
  "coffee-machine": { items: ["coffee", "tea"], prepMs: 3200 },
  "water-cooler": { items: ["water"], prepMs: 1800 },
  fridge: { items: ["juice"], prepMs: 1600 },
  "kitchen-counter": { items: ["popcorn"], prepMs: 4200 },
};

/** Distância máxima (m) do ponto da estação para pedir. */
export const COPA_RANGE = 2.6;
/** Folga ao entregar: quem deu um passinho para o lado ainda recebe. */
export const COPA_DELIVER_RANGE = 3.6;

/** Preparo em andamento numa estação. */
export interface CopaBusy {
  /** Quem pediu (id da sessão; some quando entrega). */
  id: string;
  name: string;
  item: CopaItem;
  /** Início e fim, no relógio do servidor (ms). */
  at: number;
  until: number;
}

export interface CopaState {
  /** Dia do contador, "AAAA-MM-DD" no fuso do escritório. */
  day: string;
  /** Quantos de cada item o time pegou hoje (sem nome de ninguém). */
  counts: Record<CopaItem, number>;
  /** Preparos em andamento, por id do objeto da estação. */
  busy: Record<string, CopaBusy>;
  /** Relógio do servidor quando o estado saiu (para o cliente acertar o próprio relógio). */
  now: number;
}

/** Evento "ready" (só para quem pediu) e "served" (para todos, para o som e o brilho). */
export interface CopaServed {
  station: string;
  item: CopaItem;
  name: string;
}

export function copaEmptyCounts(): Record<CopaItem, number> {
  return { coffee: 0, tea: 0, water: 0, juice: 0, popcorn: 0 };
}

export function isCopaStation(type: string): type is CopaStationType {
  return (COPA_STATION_TYPES as readonly string[]).includes(type);
}

export function isCopaItem(v: unknown): v is CopaItem {
  return typeof v === "string" && (COPA_ITEMS as readonly string[]).includes(v);
}

/** A estação serve esse item? */
export function copaServes(type: string, item: unknown): item is CopaItem {
  return isCopaStation(type) && isCopaItem(item) && COPA_STATIONS[type].items.includes(item);
}

/** Contadores do dia `day`: zera quando o dia vira. */
export function copaCountsFor(state: Pick<CopaState, "day" | "counts">, day: string): Record<CopaItem, number> {
  return state.day === day ? { ...copaEmptyCounts(), ...state.counts } : copaEmptyCounts();
}

/** Soma um item no contador do dia em que foi servido. */
export function copaCount(state: Pick<CopaState, "day" | "counts">, item: CopaItem, at: number): { day: string; counts: Record<CopaItem, number> } {
  const day = vivoDay(at);
  const counts = copaCountsFor(state, day);
  counts[item] += 1;
  return { day, counts };
}

/** Progresso de um preparo (0 a 1) no instante `now` (relógio do servidor). */
export function copaProgress(b: Pick<CopaBusy, "at" | "until">, now: number): number {
  if (b.until <= b.at) return 1;
  return Math.min(1, Math.max(0, (now - b.at) / (b.until - b.at)));
}

/** Ponto de cada estação (onde o preparo acontece e de onde se mede a distância). */
export function copaStationPoint(o: Pick<MapObject, "type" | "pos" | "rot" | "interact">): Vec2 {
  if (o.type === "kitchen-counter") return vivoLocalToWorld(o, VIVO_POPCORN_SPOT.x, VIVO_POPCORN_SPOT.z);
  return o.interact?.point ?? o.pos;
}
