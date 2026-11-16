import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Citrus, Coffee, Droplets, FileText, Flower2, GlassWater, Leaf, Mic, Popcorn, Trophy, type LucideIcon } from "lucide-react";
import { isHeldItem, type HeldItem } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { sendInfo } from "../../net/session.ts";
import { T } from "./strings.ts";

/**
 * Item na mão: o chip "Segurando: Café · Soltar (G)" e a tecla G para soltar.
 * O desenho do item na mão do avatar fica em avatar/held.ts (nas duas lentes).
 */

export const ICON: Record<HeldItem, LucideIcon> = {
  coffee: Coffee,
  tea: Leaf,
  water: GlassWater,
  juice: Citrus,
  popcorn: Popcorn,
  paper: FileText,
  microphone: Mic,
  trophy: Trophy,
  flower: Flower2,
  "watering-can": Droplets,
};

/** O que a própria pessoa segura agora. */
export function useMyHeld(): HeldItem | null {
  return useApp((s) => {
    const h = s.selfId ? s.players[s.selfId]?.held : undefined;
    return isHeldItem(h) ? h : null;
  });
}

export function dropHeld(): void {
  // O servidor transforma o que não está na lista em "nada".
  sendInfo({ held: "" });
}

function HeldChip() {
  const held = useMyHeld();

  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === "KeyG") dropHeld();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held]);

  const Icon = held ? ICON[held] : null;
  return (
    <AnimatePresence>
      {held && Icon && (
        <motion.div
          key="held"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="glass pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+84px)] left-3 z-20 flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm text-offwhite"
          role="status"
          aria-live="polite"
        >
          <span className="grid size-7 place-items-center rounded-full bg-card text-sky" aria-hidden>
            <Icon className="size-4" />
          </span>
          <span className="pr-1">
            <span className="text-slate">{T.held.holding}:</span> <span className="font-medium">{T.item(held)}</span>
          </span>
          <button
            type="button"
            onClick={dropHeld}
            aria-label={T.held.dropHint}
            title={T.held.dropHint}
            className="flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs text-offwhite/85 transition-colors hover:bg-offwhite/10 hover:text-offwhite"
          >
            {T.held.drop}
            <kbd className="grid size-5 place-items-center rounded-full bg-offwhite/90 font-display text-[10px] font-bold text-space">G</kbd>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const heldClient: ActivityClient = {
  name: "vivo/mao",
  Overlay: HeldChip,
};
