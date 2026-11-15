/** Gongo do Comercial: toca para o escritório inteiro quando uma venda fecha. */

export const GONG_ID = "gongo";
export const GONG_KIND = "gong";
/** Distância máxima (m) do gongo para tocar. */
export const GONG_RANGE = 2.6;
/** Intervalo mínimo entre dois toques (de qualquer pessoa). */
export const GONG_COOLDOWN_MS = 8000;
export const GONG_MSG_MAX = 80;

export interface GongState {
  /** Mês da contagem, "AAAA-MM". */
  month: string;
  /** Comemorações no mês (contagem do time, sem nome de ninguém). */
  count: number;
  /** Último toque, para quem chega depois ver a faixa. */
  last: { name: string; msg: string; at: number } | null;
}

/** Evento "ring". */
export interface GongRing {
  name: string;
  msg: string;
  count: number;
}

export function gongMonth(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Limpa a mensagem opcional do gongo. */
export function gongCleanMsg(msg: unknown): string {
  return typeof msg === "string" ? msg.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, GONG_MSG_MAX) : "";
}
