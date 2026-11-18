import { create } from "zustand";
import type { PalBank, PalCardEvent } from "@infinity/world";

/**
 * Estado só desta pessoa na Palavra secreta: a carta da vez (chega só para quem dá as dicas e para o
 * time adversário), o último "quase", a última dica barrada e o banco aberto no editor de cartas.
 */
export interface PalLocal {
  card: PalCardEvent | null;
  /** Último palpite "quase" (só para quem chutou). */
  close: { text: string; key: number } | null;
  /** Última dica escrita barrada (só para quem dá as dicas). */
  blocked: { text: string; word: string; key: number } | null;
  /** Carta já pedida de novo ("partida:vez:carta"), para não repetir o pedido. */
  asked: string;
  /** Banco de cartas (só chega a quem abriu o editor; some quando uma partida começa). */
  bank: PalBank | null;
  /** Último erro do editor (código do servidor ou da conferência local). */
  bankError: string | null;
  /** De onde saiu o último pedido do editor (o erro aparece ali): barra de temas ou formulário de carta. */
  editScope: "theme" | "card" | null;
}

export const usePalLocal = create<PalLocal>(() => ({ card: null, close: null, blocked: null, asked: "", bank: null, bankError: null, editScope: null }));

/** A carta guardada é a carta atual do estado? */
export function cardMatches(card: PalCardEvent | null, s: { game: number; turn: number; cardNo: number } | undefined): card is PalCardEvent {
  return !!card && !!s && card.game === s.game && card.turn === s.turn && card.n === s.cardNo;
}
