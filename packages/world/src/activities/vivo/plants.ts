import type { ObjectType } from "../../map/types.ts";
import { vivoHash } from "./day.ts";

/**
 * Plantas: cada planta do mapa tem água que cai devagar até murchar (cerca de 3 dias sem rega).
 * Regar enche de novo. O que aparece para o time é só a contagem "plantas felizes: N de M".
 */

export const PLANTS_ID = "plantas";
export const PLANTS_KIND = "plants";

export const PLANT_TYPES: readonly ObjectType[] = ["plant", "plant-tall", "plant-small"];

/** De cheia a seca, sem ninguém regar. */
export const PLANT_DRY_MS = 3 * 24 * 60 * 60 * 1000;
/** A partir daqui a planta conta como feliz. */
export const PLANT_HAPPY = 0.4;
/** Acima disso, regar de novo não faz falta (evita encharcar). */
export const PLANT_FULL = 0.92;
/** Distância máxima (m) do centro da planta para regar. */
export const PLANT_RANGE = 2.2;
/** Duração da animação de rega (ms): o servidor só aceita outra rega da mesma pessoa depois disso. */
export const PLANT_WATER_MS = 2400;

export interface PlantsState {
  /** Última rega de cada planta (relógio do servidor, ms), por id do objeto. */
  wateredAt: Record<string, number>;
  /** Relógio do servidor quando o estado saiu. */
  now: number;
  /** Plantas felizes agora e total (contagem do time). */
  happy: number;
  total: number;
}

/** Evento "water": alguém regou (para todos verem o regador, as gotas e o brilho). */
export interface PlantWatered {
  plant: string;
  name: string;
}

export function isPlantType(type: string): boolean {
  return (PLANT_TYPES as readonly string[]).includes(type);
}

/** Água da planta, de 0 (seca) a 1 (acabou de ser regada). */
export function plantLevel(wateredAt: number | undefined, now: number): number {
  if (wateredAt === undefined) return 0;
  return Math.min(1, Math.max(0, 1 - (now - wateredAt) / PLANT_DRY_MS));
}

export function plantHappy(level: number): boolean {
  return level >= PLANT_HAPPY;
}

/**
 * Quanto a planta está murcha, de 0 (viçosa) a 1 (bem murcha), para o desenho.
 * Começa a cair um pouco antes de deixar de ser "feliz", para dar tempo de alguém notar.
 */
export function plantWilt(level: number): number {
  const t = Math.min(1, Math.max(0, (0.5 - level) / 0.42));
  return t * t * (3 - 2 * t);
}

/** Estágio da planta para textos: "feliz", "com sede" ou "murcha". */
export function plantStage(level: number): "happy" | "thirsty" | "wilted" {
  if (level >= PLANT_HAPPY) return "happy";
  return level >= 0.15 ? "thirsty" : "wilted";
}

/**
 * Primeira vez que o servidor vê uma planta: começa num ponto estável e espalhado do ciclo,
 * para a estação nascer com algumas plantas pedindo água (e o hábito começar no primeiro dia).
 */
export function plantInitialWateredAt(id: string, now: number): number {
  return now - vivoHash(`planta:${id}`) * PLANT_DRY_MS * 0.95;
}

export function plantsHappyCount(wateredAt: Record<string, number>, ids: readonly string[], now: number): number {
  let n = 0;
  for (const id of ids) if (plantHappy(plantLevel(wateredAt[id], now))) n++;
  return n;
}

/** Instante em que a planta deixa de ser feliz (para o servidor avisar todo mundo na hora certa). */
export function plantSadAt(wateredAt: number): number {
  return wateredAt + (1 - PLANT_HAPPY) * PLANT_DRY_MS;
}
