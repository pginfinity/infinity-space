import type { ComponentType } from "react";
import { create } from "zustand";
import type { ActSnapshot, Lens, MapObject, ObjectType, Vec2 } from "@infinity/world";
import { send } from "../net/session.ts";

/**
 * Registro das atividades no cliente. Cada pacote (pasta em `activities/`) tem um `index.ts(x)`
 * que chama `registerActivity(...)`; o `activities/index.ts` carrega todos sozinho.
 *
 * Uma atividade pode:
 * - tratar a interação (E) com tipos de objeto do mapa (`objects` + `use`), com o rótulo do botão (`label`);
 * - oferecer alvos de interação que não são objetos do mapa (`targets`: o robô, outra pessoa, um avião no chão);
 * - reagir a acontecimentos do servidor (`onEvent`);
 * - desenhar UI por cima do mundo (`Overlay`) e coisas no mundo (`Scene`, dentro do Canvas, igual nas duas lentes).
 */
export interface ActivityClient {
  /** Nome do pacote/atividade, para depuração. */
  name: string;
  /** Tipos de `kind` (do servidor) que esta atividade entende. */
  kinds?: string[];
  /** Tipos de objeto do mapa cuja interação esta atividade assume. */
  objects?: ObjectType[];
  /** Rótulo do botão de interação para um objeto (senão usa o do catálogo). */
  label?(o: MapObject): string | undefined;
  /** Interagir com o objeto. */
  use?(o: MapObject): void;
  /** Alvos de interação dinâmicos, consultados ~10x por segundo. Mantenha barato. */
  targets?(): DynamicTarget[];
  /** Acontecimento pontual (`{ t: "actev" }`) de uma atividade com `kind` em `kinds`. */
  onEvent?(e: ActEvent): void;
  Overlay?: ComponentType;
  Scene?: ComponentType<{ lens: Lens }>;
}

export interface DynamicTarget {
  /** Único e estável enquanto o alvo existir (para a UI não piscar). */
  key: string;
  point: Vec2;
  /** Alcance em metros. */
  radius: number;
  label: string;
  run(): void;
}

export interface ActEvent {
  id: string;
  kind: string | undefined;
  ev: string;
  data: unknown;
  from: string | undefined;
}

const clients: ActivityClient[] = [];
const byObject = new Map<string, ActivityClient>();

export function registerActivity(a: ActivityClient): void {
  if (clients.some((c) => c.name === a.name)) return; // HMR
  clients.push(a);
  for (const t of a.objects ?? []) byObject.set(t, a);
  useActs.setState((s) => ({ version: s.version + 1 }));
}

export function activityClients(): readonly ActivityClient[] {
  return clients;
}

export function clientForObject(type: string): ActivityClient | undefined {
  return byObject.get(type);
}

// ---- estado vindo do servidor -------------------------------------------------------------

interface ActsState {
  acts: Record<string, ActSnapshot>;
  /** Muda quando um pacote se registra (para as camadas remontarem). */
  version: number;
}

export const useActs = create<ActsState>(() => ({ acts: {}, version: 0 }));

/** Estado atual de uma atividade (hook React). */
export function useAct<T>(id: string): T | undefined {
  return useActs((s) => s.acts[id]?.state as T | undefined);
}

/** Estado atual de uma atividade (fora do React, ex.: dentro de useFrame). */
export function actState<T>(id: string): T | undefined {
  return useActs.getState().acts[id]?.state as T | undefined;
}

/** Todas as atividades de um tipo. */
export function actsOfKind(kind: string): ActSnapshot[] {
  return Object.values(useActs.getState().acts).filter((a) => a.kind === kind);
}

/** Pede algo a uma atividade no servidor. */
export function sendAct(id: string, op: string, data?: unknown): void {
  send(data === undefined ? { t: "act", id, op } : { t: "act", id, op, data });
}

export function setActs(list: ActSnapshot[]): void {
  const acts: Record<string, ActSnapshot> = {};
  for (const a of list) acts[a.id] = a;
  useActs.setState({ acts });
}

export function setAct(a: ActSnapshot): void {
  useActs.setState((s) => ({ acts: { ...s.acts, [a.id]: a } }));
}

export function dispatchActEvent(id: string, ev: string, data: unknown, from: string | undefined): void {
  const kind = useActs.getState().acts[id]?.kind;
  const e: ActEvent = { id, kind, ev, data, from };
  for (const c of clients) {
    if (!c.onEvent || (c.kinds && kind && !c.kinds.includes(kind))) continue;
    try {
      c.onEvent(e);
    } catch (err) {
      console.error(`[atividades] ${c.name} falhou no evento ${ev}:`, err);
    }
  }
}
