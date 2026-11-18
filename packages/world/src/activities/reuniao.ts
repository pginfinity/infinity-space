import type { Zone } from "../map/types.ts";

/**
 * Gravação de reuniões. Grava só o áudio de quem está na sala (o mesmo que essas pessoas ouvem),
 * com aviso para todos dentro dela. O arquivo vai para o Google Drive do time.
 */

export const REC_ID = "gravacao";
export const REC_KIND = "recording";
/** Duração máxima de uma gravação. */
export const REC_MAX_MS = 4 * 60 * 60 * 1000;
/** Sala vazia por este tempo encerra a gravação sozinha. */
export const REC_EMPTY_MS = 60 * 1000;

export type RecStatus = "starting" | "recording" | "saving" | "uploaded" | "saved" | "error";

export interface RecSession {
  /** Grupo de salas gravado (ex.: "eclipse", "aud" = auditório + palco). */
  group: string;
  /** Nome da sala, para os avisos. */
  room: string;
  status: RecStatus;
  startedAt: number;
  /** Quem iniciou. */
  by: string;
  /** Link do arquivo no Drive, quando enviado. */
  link?: string;
  /** Mensagem curta de erro ou de onde ficou salvo. */
  note?: string;
}

export interface RecState {
  /** Gravações ativas ou recém-terminadas, por grupo de salas. */
  sessions: Record<string, RecSession>;
}

const RECORDABLE: ReadonlySet<Zone["kind"]> = new Set(["meeting", "office", "auditorium", "stage"]);

/** Dá para gravar nesta sala? (salas de reunião, diretoria e auditório). */
export function recordable(zone: Zone | undefined): zone is Zone {
  return !!zone && RECORDABLE.has(zone.kind);
}

/** Grupo usado para gravar (auditório e palco gravam juntos). */
export function recGroup(zone: Zone): string {
  return zone.group ?? zone.id;
}

/** Identidade do gravador no LiveKit para um grupo de salas. */
export function recIdentity(group: string): string {
  return `gravador-${group}`;
}
