/**
 * Regras puras do pacote "arcade" (compartilhadas entre servidor e cliente).
 * Nomes exportados com prefixo do assunto (RT_, HOCKEY_, PONG_...) para não colidir com outros pacotes.
 */
export * from "./realtime.ts";
export * from "./hockey.ts";
export * from "./pong.ts";
