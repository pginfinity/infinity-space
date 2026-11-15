/** Cores dos jogos (painel e textura do mundo usam as mesmas), derivadas da paleta da marca. */

/** Tabuleiro de xadrez: creme e azul-ardósia. */
export const CHESS_LIGHT = "#E6E0D6";
export const CHESS_DARK = "#4C6E9C";

/** Fichas do Lig 4 (lugar 0 = laranja, lugar 1 = branco). */
export const DISC = [
  { fill: "#EE5C29", rim: "#B8431B", shine: "#FF8A5C" },
  { fill: "#F2F0EF", rim: "#C9C2BA", shine: "#FFFFFF" },
] as const;

/** Grade do Lig 4. */
export const C4_FRAME = { top: "#2A6FD6", bottom: "#123B8A", hole: "#061328", holeRim: "#0A2A66", edge: "#5B95F0" } as const;

/** Jogo da velha (lugar 0 = X, lugar 1 = O). */
export const TTT_COLOR = ["#00B7FF", "#F2F0EF"] as const;
