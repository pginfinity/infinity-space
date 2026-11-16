import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { clsx } from "clsx";

/**
 * Pilhas do lado esquerdo do HUD: avisos e cartões que antes tinham posição fixa e se cobriam
 * (Orbi seguindo × última mesa; primeiros passos × aviãozinho × reunião). Cada pacote põe o seu com
 * `<InStack side order>`; a pilha cuida do espaço entre eles.
 *
 * - `top-left`: abaixo do status, de cima para baixo (order menor fica mais em cima).
 * - `bottom-left`: acima das dicas de controle, de baixo para cima (order menor fica mais embaixo).
 */

export type StackSide = "top-left" | "bottom-left";

const useSlots = create<Record<StackSide, HTMLElement | null>>(() => ({ "top-left": null, "bottom-left": null }));

// Refs estáveis (uma função nova a cada render faria o React soltar e pegar o nó de novo).
const topRef = (el: HTMLDivElement | null) => useSlots.setState({ "top-left": el });
const bottomRef = (el: HTMLDivElement | null) => useSlots.setState({ "bottom-left": el });

/** As duas pilhas (o HUD desenha uma vez). */
export function HudStacks() {
  return (
    <>
      <div ref={topRef} data-hud-stack="top-left" className="pointer-events-none absolute left-3 top-[100px] z-20 flex w-[min(360px,calc(100vw-24px))] flex-col items-start gap-2" />
      <div
        ref={bottomRef}
        data-hud-stack="bottom-left"
        className="pointer-events-none absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+84px)] left-3 z-20 flex w-[min(360px,calc(100vw-24px))] flex-col-reverse items-start gap-2 lg:bottom-[calc(max(12px,env(safe-area-inset-bottom))+116px)]"
      />
    </>
  );
}

/** Põe o conteúdo numa das pilhas. Sem conteúdo, o espaço some (não sobra vão entre os itens). */
export function InStack({ side, order = 0, className, children }: { side: StackSide; order?: number; className?: string; children: ReactNode }) {
  const el = useSlots((s) => s[side]);
  if (!el) return null;
  return createPortal(
    <div style={{ order }} className={clsx("flex max-w-full flex-col items-start gap-2 empty:hidden", className)}>
      {children}
    </div>,
    el,
  );
}
