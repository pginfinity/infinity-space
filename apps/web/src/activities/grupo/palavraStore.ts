import { create } from "zustand";
import type { PalCardEvent } from "@infinity/world";

/**
 * Estado só desta pessoa na Palavra secreta: a carta da vez (chega só para quem dá as dicas e para o
 * time adversário), o último "quase" e a última dica barrada.
 */
export interface PalLocal {
  card: PalCardEvent | null;
  /** Último palpite "quase" (só para quem chutou). */
  close: { text: string; key: number } | null;
  /** Última dica escrita barrada (só para quem dá as dicas). */
  blocked: { text: string; word: string; key: number } | null;
  /** Carta já pedida de novo ("partida:vez:carta"), para não repetir o pedido. */
  asked: string;
}

export const usePalLocal = create<PalLocal>(() => ({ card: null, close: null, blocked: null, asked: "" }));

/** A carta guardada é a carta atual do estado? */
export function cardMatches(card: PalCardEvent | null, s: { game: number; turn: number; cardNo: number } | undefined): card is PalCardEvent {
  return !!card && !!s && card.game === s.game && card.turn === s.turn && card.n === s.cardNo;
}
