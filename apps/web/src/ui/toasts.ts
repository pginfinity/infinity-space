import { create } from "zustand";

/** Avisos curtos no rodapé ("Café servido."). */

export interface Toast {
  id: number;
  text: string;
  /** Complemento pequeno e apagado depois do texto (ex.: o Morse do livro torto). */
  sub?: string;
}

interface ToastState {
  list: Toast[];
}

export const useToasts = create<ToastState>(() => ({ list: [] }));

let seq = 0;

export function toast(text: string, ms = 3200, opts: { sub?: string } = {}): void {
  const id = ++seq;
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), { id, text, ...(opts.sub ? { sub: opts.sub } : {}) }] }));
  window.setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms);
}
