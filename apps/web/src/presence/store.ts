import { create } from "zustand";
import type { ChamadoCalling, ChamadoInvite, SeguirAsk, SeguirAsking } from "@infinity/world";

/**
 * Estado de interface da presença (fora do React só o que muda pouco: pedidos, quem segue quem).
 * Posições e o andar automático ficam no controlador (`controller.ts`), sem passar pelo React.
 */

export interface Timed {
  /** performance.now() de quando chegou. */
  start: number;
}

export interface Travel {
  /** Quem chamou. */
  from: string;
  name: string;
  /** Caminho até lá (m), medido ao topar. */
  meters: number;
  /** O servidor ainda aceita o teleporte. */
  canTeleport: boolean;
  /** Já pediu o teleporte (esperando o destino) ou está atravessando. */
  warping: boolean;
}

export interface Following {
  leader: string;
  name: string;
  /** Quem é seguido entrou numa sala fechada onde o seguir não entra: esperando na porta. */
  waiting: boolean;
}

interface PresenceUi {
  /** Chamados recebidos (o mais novo por último; no máximo 3). */
  callsIn: Array<ChamadoInvite & Timed>;
  /** Seu chamado aberto. */
  callOut: (ChamadoCalling & Timed) | null;
  /** Até quando (performance.now) não dá para chamar de novo. */
  callBlockedUntil: number;
  /** Indo até quem chamou. */
  travel: Travel | null;
  /** Pedidos para te seguir. */
  followIn: Array<SeguirAsk & Timed>;
  /** Seu pedido para seguir alguém. */
  followOut: (SeguirAsking & Timed) | null;
  following: Following | null;
  /** Quem está te seguindo: id → nome. */
  followers: Record<string, string>;
  paletteOpen: boolean;
  /** Pedido para os ajustes abrirem rolando até a seção Presença. */
  focusSettings: boolean;
}

export const usePresence = create<PresenceUi>(() => ({
  callsIn: [],
  callOut: null,
  callBlockedUntil: 0,
  travel: null,
  followIn: [],
  followOut: null,
  following: null,
  followers: {},
  paletteOpen: false,
  focusSettings: false,
}));

/** Ações extras por pessoa oferecidas por outros pacotes (ex.: "Mensagem", quando o chat existir). */
export interface PersonCommand {
  key: string;
  label: (name: string) => string;
  run: (id: string) => void;
}

const personCommands: PersonCommand[] = [];

/**
 * Gancho para outros pacotes: acrescenta uma ação por pessoa na busca (Ctrl+K).
 * O chat, por exemplo: `registerPersonCommand({ key: "mensagem", label: (n) => \`Mensagem para ${n}\`, run: abrirConversa })`.
 */
export function registerPersonCommand(c: PersonCommand): void {
  const i = personCommands.findIndex((x) => x.key === c.key);
  if (i >= 0) personCommands[i] = c;
  else personCommands.push(c);
}

export function personCommandList(): readonly PersonCommand[] {
  return personCommands;
}
