import { create } from "zustand";
import { CHAT_BALLOON_MS, chatPreview } from "@infinity/world";

/**
 * Balões do Perto: a última mensagem de cada pessoa, por alguns segundos, acima da cabeça.
 * Só muda quando chega ou some uma mensagem (nada por quadro): a posição é da cena.
 */

export interface Balloon {
  /** Id da mensagem (troca o balão quando a mesma pessoa escreve de novo). */
  key: number;
  text: string;
}

export const useBalloons = create<{ list: Record<string, Balloon> }>(() => ({ list: {} }));

/** Mostra (ou troca) o balão de quem escreveu. */
export function showBalloon(from: string, key: number, text: string): void {
  useBalloons.setState((s) => ({ list: { ...s.list, [from]: { key, text: chatPreview(text, 160) } } }));
  window.setTimeout(() => {
    useBalloons.setState((s) => {
      if (s.list[from]?.key !== key) return {};
      const list = { ...s.list };
      delete list[from];
      return { list };
    });
  }, CHAT_BALLOON_MS);
}
