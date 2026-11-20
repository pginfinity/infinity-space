import { Suspense, lazy, useEffect, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Presentation, X } from "lucide-react";
import { QUADRO_ID, QUADRO_KIND, recGroup, recordable, type QuadroState, type Zone } from "@infinity/world";
import { useAct, type ActivityClient } from "../registry.ts";
import { InStack } from "../../ui/HudStack.tsx";
import { toast } from "../../ui/toasts.ts";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { T } from "./strings.ts";

/**
 * Quadro branco das salas (Excalidraw, carregado só quando alguém abre). Um por sala de reunião, o
 * mesmo do auditório e do palco. Só quem está na sala abre; ao sair da sala, o quadro fecha.
 */

// Fontes servidas pelo próprio app (scripts/excalidraw.mjs), antes de o Excalidraw carregar.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`;
const Board = lazy(() => import("./quadroBoard.tsx"));

/** Eventos do servidor (`cena`, `mudou`) para o quadro aberto. */
type Listener = (ev: string, data: unknown) => void;
const listeners = new Set<Listener>();
export function onQuadro(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const useQuadroUi = create<{ open: string | null }>(() => ({ open: null }));

export const quadro: ActivityClient = {
  name: "escritorio/quadro",
  kinds: [QUADRO_KIND],
  onEvent: (e) => {
    for (const fn of listeners) fn(e.ev, e.data);
  },
  Overlay: QuadroOverlay,
};

function useMyZone(): Zone | undefined {
  const [zone, setZone] = useState<Zone | undefined>(undefined);
  useEffect(() => {
    const id = window.setInterval(() => {
      const z = world().zones.zoneAt({ x: self.x, z: self.z });
      setZone((prev) => (prev?.id === z?.id ? prev : z));
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return zone;
}

function QuadroOverlay() {
  const zone = useMyZone();
  const group = recordable(zone) ? recGroup(zone!) : null;
  const open = useQuadroUi((s) => s.open);
  const count = useAct<QuadroState>(QUADRO_ID)?.open[group ?? ""] ?? 0;
  // Saiu da sala com o quadro aberto: fecha (o servidor já não aceita o desenho de fora).
  useEffect(() => {
    if (open && open !== group) {
      useQuadroUi.setState({ open: null });
      toast(T.quadro.left, 4000);
    }
  }, [open, group]);

  return (
    <>
      {group && !open && (
        <InStack side="top-left" order={1}>
          <button
            type="button"
            onClick={() => useQuadroUi.setState({ open: group })}
            className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs text-offwhite/90 hover:text-offwhite"
          >
            <Presentation className="size-3.5 text-signal" aria-hidden />
            {T.quadro.action}
            {count > 0 && <span className="text-slate">· {count}</span>}
          </button>
        </InStack>
      )}
      <AnimatePresence>{open && open === group && <QuadroDialog key={open} room={zone!.name} others={Math.max(0, count - 1)} />}</AnimatePresence>
    </>
  );
}

function QuadroDialog({ room, others }: { room: string; others: number }) {
  // O foco vai para o Excalidraw (autoFocus), para os atalhos dele funcionarem já.
  const close = () => useQuadroUi.setState({ open: null });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto fixed inset-0 z-50 grid bg-space/70 p-2 pb-20 sm:p-6 sm:pb-24"
      role="dialog"
      aria-modal="true"
      aria-label={T.quadro.title(room)}
      // O Excalidraw usa as teclas (Esc inclusive): nada chega ao mundo nem aos atalhos do app.
      // Embaixo fica livre a barra de controles (microfone, sair).
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-offwhite/10 bg-space shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-offwhite/8 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Presentation className="size-4 shrink-0 text-signal" aria-hidden />
            <h2 className="truncate font-display text-sm font-medium uppercase tracking-[0.1em]">{T.quadro.title(room)}</h2>
            <p className="hidden truncate text-xs text-slate sm:block">{others > 0 ? T.quadro.others(others) : T.quadro.hint}</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.quadro.close} title={T.quadro.close}>
            <X className="size-4" />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 bg-white">
          <Suspense fallback={<p className="grid h-full place-items-center text-sm text-space/60">{T.quadro.loading}</p>}>
            <Board />
          </Suspense>
        </div>
      </div>
    </motion.div>
  );
}
