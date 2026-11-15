import type { Emote, HeldItem, MapDef, MapObject, NavGrid, ObjectType, Vec2, Zone, ZoneIndex } from "@infinity/world";
import type { Store } from "../store.ts";

/**
 * Contrato de uma atividade no servidor. Cada pacote (pasta em `activities/`) exporta por padrão
 * uma função `(host) => Activity[]`, carregada sozinha quando o servidor sobe.
 *
 * Regras:
 * - O servidor é a autoridade: confira distância, vez, limites e tipos de tudo que chega em `handle`.
 * - O estado (`snapshot`) vai inteiro para os clientes a cada `host.changed(this)`; mantenha-o pequeno.
 *   Para coisas muito frequentes (física a 30 Hz), use `host.event` só para quem precisa.
 * - Nada de métrica individual de tempo, atividade ou fala. Contador agregado e ranking de jogo são ok.
 */
export interface Activity {
  readonly id: string;
  readonly kind: string;
  /** Estado que os clientes recebem (no welcome e a cada mudança). */
  snapshot(): unknown;
  /** Pedido de uma pessoa (`{ t: "act", id, op, data }`). `data` não é confiável. */
  handle(from: string, op: string, data: unknown): void;
  /** Chamado a cada tique da sala (15 Hz). Física mais rápida pode usar um timer próprio. */
  tick?(dt: number): void;
  join?(id: string): void;
  leave?(id: string): void;
  dispose?(): void;
}

export interface ActivityHost {
  readonly map: MapDef;
  readonly nav: NavGrid;
  readonly zones: ZoneIndex;
  readonly store: Store;
  /** O estado desta atividade mudou: manda o snapshot (agrupado no fim do tique ou da mensagem). */
  changed(act: Activity): void;
  /** Acontecimento pontual. Sem `to`, vai para todos. */
  event(act: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string>; from?: string }): void;
  /** Ids de quem está online. */
  players(): string[];
  playerName(id: string): string | undefined;
  playerPos(id: string): Vec2 | undefined;
  playerZone(id: string): Zone | undefined;
  /** Faz a pessoa executar um emote (visto por todos). */
  emote(id: string, e: Emote): void;
  /** Coloca (ou tira, com null) um item na mão da pessoa. */
  setHeld(id: string, item: HeldItem | null): void;
  /** Objetos do mapa de um tipo. */
  objects(type: ObjectType): MapObject[];
  /** A pessoa está a até `range` metros do ponto, sem parede no meio? */
  near(id: string, p: Vec2, range: number): boolean;
}

export type ActivityFactory = (host: ActivityHost) => Activity[];
