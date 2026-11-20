/**
 * Cliente convidado por link para uma reunião: quem está numa sala de reunião (ou no auditório) gera o
 * link; o convidado abre, diz o nome e espera alguém da sala deixar entrar. Dentro, ele fica parado na
 * sala, só com voz, vídeo e a lista de quem está ali: nada do resto do escritório chega até ele.
 */

export const CONVITE_ID = "convite";
export const CONVITE_KIND = "convite";
/** Parâmetro do endereço (`/?convite=…`) e do WebSocket do convidado. */
export const CONVITE_PARAM = "convite";
/** Por quanto tempo o link deixa pedir para entrar (a reunião em si pode passar disso). */
export const CONVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** Links válidos ao mesmo tempo, no escritório todo. */
export const CONVITE_MAX_LINKS = 100;
/** Convidados esperando na porta ao mesmo tempo, no escritório todo. */
export const CONVITE_MAX_WAITING = 20;

/** Quem está esperando para entrar (visto só por quem é do escritório). */
export interface ConvitePedido {
  pid: string;
  name: string;
  group: string;
}

export interface ConviteState {
  pedidos: ConvitePedido[];
}
