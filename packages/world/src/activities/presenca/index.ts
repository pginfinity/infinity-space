/**
 * Regras puras do pacote "presenca" (achar e chamar pessoas), compartilhadas entre servidor e cliente.
 * Nomes com prefixo do assunto (CHAMADO_, SEGUIR_, PRESENCA_) para não colidir com outros pacotes.
 */
export * from "./chamado.ts";
export * from "./seguir.ts";
export * from "./lugar.ts";
