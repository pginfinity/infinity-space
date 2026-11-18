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

/** Damas: tabuleiro em dois tons de madeira (diferente do xadrez) e peças claras e escuras. */
export const CHECKERS_LIGHT = "#E6D3B3";
export const CHECKERS_DARK = "#9C6B45";
export const CHECKER = [
  { fill: "#F2F0EF", rim: "#C9C2BA", ring: "#DCD6CF", ink: "#0A2547" },
  { fill: "#1E2633", rim: "#0B0F16", ring: "#3A4456", ink: "#F2F0EF" },
] as const;
/** Coroa da dama. */
export const CHECKER_CROWN = "#E8B44A";

/** Dominó: pedras cor de marfim com pontos navy; o tampo é de madeira. */
export const TILE = { face: "#F4EFE6", edge: "#D6CDBE", pip: "#0A2547", line: "#BFB4A3", back: "#1E5A99", backRim: "#9CC3EA" } as const;
export const DOMINO_WOOD = { top: "#6E4A30", mid: "#7E5639", rim: "#3E2A1C" } as const;

/** Baralho espanhol: cor de cada naipe (ouros, espadas, copas, paus) e um tom escuro para texto. */
export const SUIT_COLOR = ["#E8B44A", "#2D7FD3", "#E0483B", "#2F9E74"] as const;
export const SUIT_INK = ["#9A6A10", "#1F5FA8", "#B8322A", "#1F7A57"] as const;
export const CARD = { face: "#F8F5F0", edge: "#D9D2C7", back: "#0A2547", backLine: "#1C4A7E", backRim: "#F2F0EF" } as const;
/** Feltro da mesa de truco. */
export const FELT = { center: "#23785A", edge: "#164E3B" } as const;
