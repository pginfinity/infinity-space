import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";

/** Peças de interface do pacote "presenca". */

/** Barrinha do tempo que falta para o pedido expirar. */
export function Countdown({ start, ms }: { start: number; ms: number }) {
  const left = Math.max(0, ms - (performance.now() - start));
  return (
    <span className="pointer-events-none absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-offwhite/10" aria-hidden>
      <motion.span
        className="block h-full bg-signal"
        initial={{ scaleX: left / ms }}
        animate={{ scaleX: 0 }}
        transition={{ duration: left / 1000, ease: "linear" }}
        style={{ transformOrigin: "left" }}
      />
    </span>
  );
}

/** Tecla no visual da interface. */
export function Kbd({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <kbd className={`inline-grid h-5 min-w-5 place-items-center rounded-md px-1 font-display text-[10px] font-bold ${light ? "bg-offwhite text-space" : "bg-offwhite/12 text-offwhite"}`}>
      {children}
    </kbd>
  );
}

/** Digitando num campo? (atalhos de tecla não valem) */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Tecla sem modificadores, fora de campos de texto. */
export function plainKey(e: KeyboardEvent): boolean {
  return !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}

/** Atalho de uma tecla (código `KeyI`, `Escape`...) enquanto o componente existir. */
export function useKey(code: string, fn: () => void, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === code && plainKey(e)) ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, enabled]);
}

/** Cartão de pedido (chamado, seguir): mesma família visual dos convites de gesto. */
export const cardMotion = {
  initial: { opacity: 0, y: 10, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6 },
  transition: { type: "spring", stiffness: 420, damping: 28 },
} as const;

export const chipMotion = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -6 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
} as const;
