import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minus, MonitorOff, Plus, X } from "lucide-react";
import { useApp } from "../state/store.ts";
import { onScreenNotice, stopShare, useMedia } from "../media/rtc.ts";
import { toast } from "./toasts.ts";

/** Faixa com as telas compartilhadas que chegam até você e o visualizador em tela cheia. */
export function ScreenShares() {
  const screens = useMedia((s) => s.screens);
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  const [open, setOpen] = useState<string | null>(null);
  const ids = Object.keys(screens);

  useEffect(() => onScreenNotice((text) => toast(text, 6000)), []);
  useEffect(() => {
    if (open && !screens[open]) setOpen(null);
  }, [open, screens]);

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 gap-2">
        <AnimatePresence>
          {ids.map((id) => (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => setOpen(id)}
              className="glass pointer-events-auto group relative w-44 overflow-hidden rounded-xl text-left"
              title="Abrir em tela cheia"
            >
              <MirrorVideo source={screens[id]!} className="aspect-video w-full bg-deep object-contain" />
              {players[id]?.screenPaused && <PausedBadge />}
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px]">
                <span className="truncate font-medium">{id === selfId ? "Sua tela" : `Tela de ${players[id]?.name ?? "alguém"}`}</span>
                <Maximize2 className="size-3 text-slate group-hover:text-offwhite" />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>{open && screens[open] && <Viewer id={open} el={screens[open]!} name={open === selfId ? "Sua tela" : `Tela de ${players[open]?.name ?? ""}`} paused={!!players[open]?.screenPaused} mine={open === selfId} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  );
}

/** Um <video> próprio com a mesma transmissão (o original fica alimentando a TV do mundo). */
function MirrorVideo({ source, className, style }: { source: HTMLVideoElement; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = source.srcObject;
    void v.play().catch(() => undefined);
  }, [source]);
  return <video ref={ref} muted playsInline autoPlay className={className} style={style} />;
}

function PausedBadge() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-space/80 p-2 text-center text-[11px] text-offwhite">
      <span className="flex items-center gap-1.5">
        <MonitorOff className="size-3.5 text-warn" /> Janela minimizada
      </span>
    </div>
  );
}

function Viewer({ el, name, paused, mine, onClose }: { id: string; el: HTMLVideoElement; name: string; paused: boolean; mine: boolean; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-deep/95 backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-display text-sm font-medium uppercase tracking-[0.08em]">{name}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Diminuir zoom">
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-slate">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Aumentar zoom">
            <Plus className="size-4" />
          </button>
          {mine && (
            <button type="button" onClick={() => void stopShare().then(onClose)} className="ml-2 rounded-lg bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/30">
              Parar de compartilhar
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-1 rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Fechar (Esc)">
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="relative flex-1 overflow-auto">
        <div className="grid min-h-full place-items-center p-4">
          <MirrorVideo source={el} className="max-h-full max-w-full rounded-lg shadow-2xl" style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }} />
        </div>
        {paused && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="glass max-w-sm rounded-2xl p-6 text-center">
              <MonitorOff className="mx-auto size-6 text-warn" />
              <p className="mt-3 font-medium">A janela compartilhada foi minimizada</p>
              <p className="mt-1 text-sm text-slate">A imagem volta assim que ela for reaberta.</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
