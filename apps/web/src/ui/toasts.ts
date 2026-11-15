import { create } from "zustand";

/** Avisos curtos no rodapé ("Café servido."). */

export interface Toast {
  id: number;
  text: string;
}

interface ToastState {
  list: Toast[];
}

export const useToasts = create<ToastState>(() => ({ list: [] }));

let seq = 0;

export function toast(text: string, ms = 3200): void {
  const id = ++seq;
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), { id, text }] }));
  window.setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms);
}
