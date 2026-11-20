/**
 * Megafone do gestor: um aviso falado ou escrito que chega a todo o escritório de uma vez.
 * Falado: com o megafone ligado, a voz do admin chega a todas as áreas (`megaphone` em audio.ts),
 * menos às salas de porta fechada e às rodas fechadas. Escrito: um cartão na tela de todo mundo.
 */

export const MEGAFONE_ID = "megafone";
export const MEGAFONE_KIND = "megafone";
/** Tamanho máximo do aviso escrito. */
export const MEGAFONE_TEXT = 280;
/** O megafone desliga sozinho depois disso (para não ficar ligado por esquecimento). */
export const MEGAFONE_MAX_MS = 5 * 60_000;

export interface MegafoneState {
  /** Quem está falando para todos agora (um por vez). */
  speaker: { id: string; name: string; since: number } | null;
}

/** Aviso escrito (evento `aviso`, para todos). */
export interface MegafoneAviso {
  text: string;
  by: string;
}
