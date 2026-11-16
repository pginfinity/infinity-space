import type { HeldItem } from "@infinity/world";
import type { AvatarRig } from "./build.ts";

/**
 * Gestos de mão pedidos de fora (as atividades): regar uma planta, brindar... O avatar mostra o
 * item do gesto por cima do que segura e volta ao normal no fim. Fora do React, lido a cada quadro.
 */

export type HandActionKind = "water" | "pet";

export interface HandAction {
  kind: HandActionKind;
  /** Item mostrado na mão durante o gesto (o regador, por exemplo). */
  item: HeldItem | null;
  at: number;
  ms: number;
  /** Para onde virar o corpo durante o gesto (yaw), se houver. */
  face: number | null;
  /** Tempo decorrido (s) e progresso (0 a 1), atualizados a cada consulta. */
  t: number;
  k: number;
}

const actions = new Map<string, HandAction>();

export function playHandAction(id: string, kind: HandActionKind, ms: number, opts: { item?: HeldItem | null; face?: number } = {}): void {
  actions.set(id, { kind, item: opts.item ?? null, at: performance.now(), ms, face: opts.face ?? null, t: 0, k: 0 });
}

/** Gesto ativo de uma pessoa, com o tempo decorrido e o progresso (sem alocar: chamado a cada quadro). */
export function currentHandAction(id: string, now = performance.now()): Readonly<HandAction> | null {
  const a = actions.get(id);
  if (!a) return null;
  const el = now - a.at;
  if (el > a.ms) {
    actions.delete(id);
    return null;
  }
  a.t = el / 1000;
  a.k = el / a.ms;
  return a;
}

/** Esqueletos dos avatares na cena, por id (para efeitos saírem da mão certa). */
const rigs = new Map<string, AvatarRig>();

export function registerRig(id: string, rig: AvatarRig): () => void {
  rigs.set(id, rig);
  return () => {
    if (rigs.get(id) === rig) rigs.delete(id);
  };
}

export function avatarRig(id: string): AvatarRig | undefined {
  return rigs.get(id);
}
