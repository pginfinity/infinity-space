import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minimize2, Minus, MonitorOff, PenLine, Plus, X } from "lucide-react";
import { clsx } from "clsx";
import { PEN_COLORS, STROKE_LIFE, sendStroke, strokesOf } from "../activities/tela/index.ts";
import { useApp } from "../state/store.ts";
import { focusScreen, hearingOf, onScreenNotice, screenSid, stopShare, useMedia } from "../media/rtc.ts";
import { toast } from "./toasts.ts";

/** Faixa com as telas compartilhadas que chegam até você e o visualizador (grande ou minimizado). */
export function ScreenShares() {
  const screens = useMedia((s) => s.screens);
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  const [open, setOpen] = useState<string | null>(null);
  const [mini, setMini] = useState(false);
  /** Compartilhamentos (id da publicação) que já abriram sozinhos: depois de fechados, não reabrem. */
  const opened = useRef(new Set<string>());
  const ids = Object.keys(screens);
  const nameOf = (id: string) => (id === selfId ? "Sua tela" : `Tela de ${players[id]?.name ?? "alguém"}`);
  const show = (id: string | null) => {
    setOpen(id);
    setMini(false);
  };

  useEffect(() => onScreenNotice((text) => toast(text, 6000)), []);
  useEffect(() => {
    if (open && !screens[open]) show(null);
  }, [open, screens]);

  // Abre direto, grande, a tela de quem você ouve com clareza (a mesma regra da voz: mesma sala ou
  // roda). Quem está longe só vê a miniatura. Com uma já aberta, as novas entram na troca do visualizador.
  useEffect(() => {
    const tick = () => {
      const fresh = Object.keys(useMedia.getState().screens).filter((id) => {
        const sid = id === selfId ? undefined : screenSid(id);
        return !!sid && !opened.current.has(sid) && hearingOf(id)?.mode === "clear";
      });
      for (const id of fresh) opened.current.add(screenSid(id)!);
      if (fresh[0]) setOpen((cur) => cur ?? fresh[0]!);
    };
    tick();
    const t = window.setInterval(tick, 400);
    return () => window.clearInterval(t);
  }, [selfId]);

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 gap-2">
        <AnimatePresence>
          {ids.filter((id) => id !== open).map((id) => (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => show(id)}
              className="glass pointer-events-auto group relative w-44 overflow-hidden rounded-xl text-left"
              title="Abrir grande"
            >
              <MirrorVideo source={screens[id]!} className="aspect-video w-full bg-deep object-contain" />
              {players[id]?.screenPaused && <PausedBadge />}
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px]">
                <span className="truncate font-medium">{nameOf(id)}</span>
                <Maximize2 className="size-3 text-slate group-hover:text-offwhite" />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {open && screens[open] && (
          <Viewer
            key={open}
            id={open}
            el={screens[open]!}
            name={nameOf(open)}
            paused={!!players[open]?.screenPaused}
            mine={open === selfId}
            others={ids.filter((id) => id !== open).map((id) => ({ id, name: nameOf(id) }))}
            onSwitch={setOpen}
            mini={mini}
            onMini={setMini}
            onClose={() => show(null)}
          />
        )}
      </AnimatePresence>
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

interface ViewerProps {
  id: string;
  el: HTMLVideoElement;
  name: string;
  paused: boolean;
  mine: boolean;
  others: { id: string; name: string }[];
  onSwitch: (id: string) => void;
  mini: boolean;
  onMini: (mini: boolean) => void;
  onClose: () => void;
}

const ICON_BTN = "rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite";

function Viewer({ id, el, name, paused, mine, others, onSwitch, mini, onMini, onClose }: ViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pen, setPen] = useState(false);
  const face = useMedia((s) => (mine ? undefined : s.videos[id]));
  const talking = useMedia((s) => !!s.speaking[id]);
  // Aberta (grande ou minimizada) = camada mais alta do LiveKit; a miniatura do topo fica com a baixa.
  useEffect(() => focusScreen(id), [id, el]);
  useEffect(() => {
    if (mini) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mini, onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label={name}
      className={clsx(
        "pointer-events-auto absolute flex flex-col",
        mini
          ? "glass bottom-[calc(max(12px,env(safe-area-inset-bottom))+228px)] right-3 z-20 w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-2xl"
          : "inset-0 z-40 bg-deep/95 backdrop-blur-sm",
      )}
    >
      <header className={clsx("flex items-center justify-between gap-3", mini ? "px-2 py-1.5" : "px-4 py-3")}>
        <div className="flex min-w-0 items-center gap-2">
          {/* Quem apresenta: rosto (ou um ponto) que acende quando fala. */}
          {face ? (
            <MirrorVideo source={face} className={clsx("size-7 shrink-0 rounded-full object-cover ring-2", talking ? "ring-ok" : "ring-offwhite/20")} />
          ) : (
            !mine && <span className={clsx("size-2.5 shrink-0 rounded-full", talking ? "bg-ok" : "bg-offwhite/25")} aria-hidden />
          )}
          <span className={clsx("truncate font-display font-medium uppercase tracking-[0.08em]", mini ? "text-xs" : "text-sm")}>{name}</span>
          {!mini &&
            others.map((o) => (
              <button key={o.id} type="button" onClick={() => onSwitch(o.id)} className="shrink-0 rounded-full border border-offwhite/12 px-3 py-1 text-xs text-slate hover:border-offwhite/30 hover:text-offwhite">
                {o.name}
              </button>
            ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!mini && (
            <>
              <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className={ICON_BTN} aria-label="Diminuir zoom">
                <Minus className="size-4" />
              </button>
              <span className="w-12 text-center text-xs tabular-nums text-slate">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className={ICON_BTN} aria-label="Aumentar zoom">
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPen((v) => !v)}
                aria-pressed={pen}
                title="Caneta: aponte algo na tela para quem está vendo (some sozinha)"
                className={clsx("ml-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", pen ? "bg-signal/20 text-signal" : "text-slate hover:bg-offwhite/8 hover:text-offwhite")}
              >
                <PenLine className="size-3.5" />
                Caneta
              </button>
              {mine && (
                <button type="button" onClick={() => void stopShare().then(onClose)} className="ml-2 rounded-lg bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/30">
                  Parar de compartilhar
                </button>
              )}
            </>
          )}
          <button type="button" onClick={() => onMini(!mini)} className={clsx(ICON_BTN, "ml-1")} aria-label={mini ? "Abrir grande" : "Minimizar"}>
            {mini ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
          </button>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label={mini ? "Fechar" : "Fechar (Esc)"}>
            <X className="size-4" />
          </button>
        </div>
      </header>
      {mini ? (
        <button type="button" tabIndex={-1} onClick={() => onMini(false)} className="relative block" aria-hidden>
          <MirrorVideo source={el} className="aspect-video w-full bg-deep object-contain" />
          {paused && <PausedBadge />}
        </button>
      ) : (
        // Embaixo fica livre para a doca (microfone, câmera, compartilhar) seguir à mão.
        <div className="relative flex-1 overflow-auto pb-[calc(max(12px,env(safe-area-inset-bottom))+64px)]">
          <div className="grid min-h-full place-items-center p-4">
            <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}>
              <MirrorVideo source={el} className="block max-h-[calc(100dvh-200px)] max-w-full rounded-lg shadow-2xl" />
              <PenLayer screen={id} active={pen} />
            </div>
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
      )}
    </motion.div>
  );
}

/** Cor da minha caneta (fixa por nome, para cada pessoa ter a sua). */
function myPenColor(): number {
  const name = useApp.getState().profile.name || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PEN_COLORS.length;
}

/** Traços por cima da tela compartilhada: os seus e os de quem também está vendo. Somem sozinhos. */
function PenLayer({ screen, active }: { screen: string; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ pts: number[]; last: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvas.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(c.clientWidth * dpr);
        const h = Math.round(c.clientHeight * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const g = c.getContext("2d")!;
        g.clearRect(0, 0, w, h);
        const now = performance.now();
        g.lineCap = "round";
        g.lineJoin = "round";
        g.lineWidth = 4 * dpr;
        for (const s of strokesOf(screen, now)) {
          const age = now - s.at;
          g.globalAlpha = Math.max(0, Math.min(1, (STROKE_LIFE - age) / 1500));
          g.strokeStyle = PEN_COLORS[s.c] ?? PEN_COLORS[0]!;
          g.beginPath();
          for (let i = 0; i < s.pts.length; i += 2) {
            const x = s.pts[i]! * w;
            const y = s.pts[i + 1]! * h;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };
  const flush = (force: boolean) => {
    const d = drawing.current;
    if (!d || d.pts.length < 4) return;
    if (!force && d.pts.length < 24 && performance.now() - d.last < 60) return;
    sendStroke(screen, d.pts, myPenColor());
    // continua do último ponto, para o traço sair contínuo
    d.pts = d.pts.slice(-2);
    d.last = performance.now();
  };

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={clsx("absolute inset-0 h-full w-full rounded-lg", active ? "cursor-crosshair touch-none" : "pointer-events-none")}
      onPointerDown={(e) => {
        if (!active) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const [x, y] = at(e);
        drawing.current = { pts: [x, y], last: performance.now() };
      }}
      onPointerMove={(e) => {
        if (!active || !drawing.current) return;
        const [x, y] = at(e);
        drawing.current.pts.push(x, y);
        flush(false);
      }}
      onPointerUp={() => {
        flush(true);
        drawing.current = null;
      }}
      onPointerCancel={() => (drawing.current = null)}
    />
  );
}
