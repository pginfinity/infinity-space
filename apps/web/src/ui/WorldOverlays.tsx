import { AnimatePresence, motion } from "motion/react";
import { activate, useInteract } from "../engine/interact.ts";
import { useToasts } from "./toasts.ts";

/** Botão de interação: "E · Sentar", como no vídeo de referência. Clicável no celular. */
export function InteractPrompt() {
  const target = useInteract((s) => s.target);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+68px)] flex justify-center">
      <AnimatePresence>
        {target && (
          <motion.button
            key={target.key}
            type="button"
            onClick={() => activate()}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass pointer-events-auto flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-medium text-offwhite hover:border-signal/60"
          >
            <kbd className="grid size-7 place-items-center rounded-full bg-offwhite font-display text-xs font-bold text-space">E</kbd>
            {target.label}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Avisos curtos. */
export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-3" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="glass rounded-full px-4 py-2 text-sm text-offwhite"
          >
            {t.text}
            {t.sub && <span className="ml-3 text-[12.5px] font-semibold tracking-[0.14em] text-offwhite/55">{t.sub}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
