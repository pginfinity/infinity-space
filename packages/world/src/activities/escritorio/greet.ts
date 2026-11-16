import type { Emote } from "../../protocol.ts";

/**
 * Toca aqui, brinde e abraço: gestos de duas pessoas. Uma convida quem está pertinho; a outra
 * aceita; as duas se viram uma para a outra e fazem o gesto juntas, com um efeito entre elas.
 */

export const GREET_ID = "toca";
export const GREET_KIND = "greet";
export const GREET_KINDS = ["highfive", "toast", "hug"] as const;
export type GreetKind = (typeof GREET_KINDS)[number];

/** Emote (já existente no avatar) que cada gesto usa. */
export const GREET_EMOTE: Record<GreetKind, Emote> = { highfive: "clap", toast: "cheer", hug: "heart" };
/** Distância (m) para aparecer a opção de convidar. */
export const GREET_RANGE = 1.6;
/** Folga do servidor (as poses chegam com atraso). */
export const GREET_SERVER_RANGE = 2.3;
/** O convite expira em 8 s. */
export const GREET_TTL_MS = 8000;
/** Intervalo mínimo entre dois convites da mesma pessoa. */
export const GREET_COOLDOWN_MS = 1200;

export function greetIsKind(k: unknown): k is GreetKind {
  return typeof k === "string" && (GREET_KINDS as readonly string[]).includes(k);
}

/** Evento "invite" (para quem é convidado). */
export interface GreetInvite {
  from: string;
  name: string;
  kind: GreetKind;
  ms: number;
}

/** Evento "pending" (para quem convidou). */
export interface GreetPending {
  to: string;
  name: string;
  kind: GreetKind;
  ms: number;
}

/** Evento "go" (para todos): o gesto aconteceu entre `a` (quem convidou) e `b`. */
export interface GreetGo {
  a: string;
  b: string;
  kind: GreetKind;
}

/** Eventos "declined" / "expired" / "cancel": o convite acabou sem gesto. */
export interface GreetEnd {
  from: string;
  to: string;
}
