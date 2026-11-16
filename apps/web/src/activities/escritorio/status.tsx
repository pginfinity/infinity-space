import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, Send, X } from "lucide-react";
import * as THREE from "three";
import { NOTE_MAX, STATUS_PRESETS, statusNote, statusSplit } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";
import { sendInfo } from "../../net/session.ts";
import { useApp } from "../../state/store.ts";
import { currentEmote } from "../../world/registry.ts";
import { useMedia } from "../../media/rtc.ts";
import { focusSoon, groundY, poseOf, useAfterRender, useEscape } from "./shared.tsx";
import { usePlaneUi } from "./plane.tsx";
import { T } from "./strings.ts";

/**
 * Status curto no avatar: chip no canto superior esquerdo para escolher (atalhos ou texto livre)
 * e um balão acima da cabeça de cada pessoa com status, nas duas lentes.
 *
 * Os balões são HTML numa camada própria, posicionados depois de cada quadro (projeção da cabeça
 * na tela, fora do React), logo acima da etiqueta de nome; sobem quando há emote ou vídeo.
 */

const useStatusUi = create<{ open: boolean }>(() => ({ open: false }));
const SESSION_KEY = "infinity-space:escritorio:status";

function presetText(id: string, emoji: string): string {
  return `${emoji} ${T.status.presets[id] ?? id}`;
}

/** Define (ou apaga, com "") o próprio status. Fica lembrado nesta aba para voltar após reconexão. */
export function setStatus(text: string): void {
  const note = statusNote(text);
  sendInfo({ note });
  try {
    if (note) sessionStorage.setItem(SESSION_KEY, note);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export const status: ActivityClient = {
  name: "escritorio/status",
  Overlay: StatusOverlay,
  Scene: BalloonProjector,
};

function StatusOverlay() {
  const selfId = useApp((s) => s.selfId);
  // Reconectou (ou recarregou a aba): devolve o status que você tinha.
  useEffect(() => {
    if (!selfId) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(SESSION_KEY);
    } catch {
      /* nada */
    }
    if (saved && !useApp.getState().players[selfId]?.note) sendInfo({ note: saved });
  }, [selfId]);

  return (
    <>
      <Balloons />
      <SocialBar />
    </>
  );
}

// ---- barra social (status + aviãozinho) ---------------------------------------------------

function SocialBar() {
  const open = useStatusUi((s) => s.open);
  const note = useApp((s) => (s.selfId ? s.players[s.selfId]?.note : undefined));
  const chip = useRef<HTMLButtonElement>(null);
  const parts = note ? statusSplit(note) : null;
  return (
    <div className="pointer-events-auto absolute left-3 top-[60px] flex items-start gap-1.5">
      <div className="relative">
        <button
          ref={chip}
          type="button"
          onClick={() => useStatusUi.setState({ open: !open })}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={note ? T.status.current(note) : T.status.set}
          title={note ? T.status.current(note) : T.status.set}
          className="glass flex h-8 max-w-[220px] items-center gap-1.5 rounded-full pl-2 pr-3 text-xs text-offwhite/90 transition hover:border-offwhite/25 hover:text-offwhite"
        >
          {parts?.emoji ? <span className="text-sm leading-none">{parts.emoji}</span> : <MessageCircle className="size-3.5 shrink-0 text-slate" aria-hidden />}
          <span className="truncate">{parts ? parts.text || note : T.status.chip}</span>
        </button>
        <AnimatePresence>{open && <StatusPopover note={note ?? ""} onClose={() => chip.current?.focus()} />}</AnimatePresence>
      </div>
      <button
        type="button"
        onClick={() => usePlaneUi.getState().openComposer(null)}
        aria-label={T.plane.title}
        title={T.plane.title}
        className="glass flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-3 text-xs text-offwhite/90 transition hover:border-offwhite/25 hover:text-offwhite"
      >
        <Send className="size-3.5 text-slate" aria-hidden />
        {T.plane.chip}
      </button>
    </div>
  );
}

function StatusPopover({ note, onClose }: { note: string; onClose: () => void }) {
  const [text, setText] = useState(() => (STATUS_PRESETS.some((p) => presetText(p.id, p.emoji) === note) ? "" : note));
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    useStatusUi.setState({ open: false });
    onClose();
  }, [onClose]);

  useEffect(() => focusSoon(first.current), []);
  useEscape(close);
  // Clique fora fecha.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[aria-haspopup=dialog]")) close();
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [close]);

  const pick = (value: string) => {
    setStatus(value);
    close();
  };

  return (
    <motion.div
      ref={root}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="glass absolute left-0 top-10 z-30 w-[300px] rounded-2xl p-3"
      role="dialog"
      aria-label={T.status.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.1em]">{T.status.title}</p>
      <p className="mt-0.5 text-[11px] text-slate">{T.status.hint}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-1">
        {STATUS_PRESETS.map((p, i) => {
          const value = presetText(p.id, p.emoji);
          const active = note === value;
          return (
            <button
              key={p.id}
              ref={i === 0 ? first : undefined}
              type="button"
              onClick={() => pick(value)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${active ? "bg-signal/15 text-offwhite ring-1 ring-signal/60" : "text-offwhite/90 hover:bg-offwhite/8"}`}
            >
              <span className="text-base leading-none">{p.emoji}</span>
              {T.status.presets[p.id]}
            </button>
          );
        })}
      </div>
      <form
        className="mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) pick(text);
        }}
      >
        <label className="label-caps" htmlFor="esc-status-text">
          {T.status.custom}
        </label>
        <div className="mt-1 flex gap-1.5">
          <input
            id="esc-status-text"
            value={text}
            maxLength={NOTE_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={T.status.placeholder}
            className="min-w-0 flex-1 rounded-xl border border-offwhite/10 bg-deep px-2.5 py-1.5 text-xs text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
          />
          <button type="submit" disabled={!text.trim()} className="rounded-xl bg-offwhite/10 px-3 text-xs font-semibold text-offwhite hover:bg-offwhite/16 disabled:opacity-40">
            {T.status.save}
          </button>
        </div>
        <p className="mt-1 text-right text-[10px] tabular-nums text-slate">
          {text.length}/{NOTE_MAX}
        </p>
      </form>
      {note && (
        <button type="button" onClick={() => pick("")} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-3.5" aria-hidden />
          {T.status.clear}
        </button>
      )}
    </motion.div>
  );
}

// ---- balões acima das cabeças -------------------------------------------------------------

/** Elementos dos balões por pessoa (preenchidos pela camada HTML, movidos pela cena). */
const balloons = new Map<string, HTMLDivElement>();

function Balloons() {
  const players = useApp((s) => s.players);
  const list = useMemo(() => Object.values(players).filter((p) => p.note), [players]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: -1 }} aria-hidden>
      {list.map((p) => (
        <Balloon key={p.id} id={p.id} note={p.note!} away={p.status === "away"} />
      ))}
    </div>
  );
}

function Balloon({ id, note, away }: { id: string; note: string; away: boolean }) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) balloons.set(id, el);
      else balloons.delete(id);
    },
    [id],
  );
  const { emoji, text } = statusSplit(note);
  return (
    <div ref={ref} data-status-balloon={id} className="absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }}>
      <div
        className="relative flex max-w-[190px] items-center gap-1 rounded-[10px] bg-offwhite py-[3px] pl-1.5 pr-2 text-[11px] font-semibold leading-tight text-space shadow-[0_4px_14px_-4px_rgb(0_0_0/0.6)]"
        style={{ opacity: away ? 0.65 : 1 }}
      >
        {emoji && <span className="text-[12px] leading-none">{emoji}</span>}
        <span className="truncate">{text || note}</span>
        <span className="absolute -bottom-[4px] left-1/2 size-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-offwhite" />
      </div>
    </div>
  );
}

/**
 * Distância (px) da base do balão até o ponto da etiqueta de nome (1,72 m acima do chão).
 * A etiqueta é uma coluna centrada nesse ponto, com 4 px entre as peças:
 * [emoji do emote: 0 ou 32 px] [vídeo: 0 ou 76 px] [nome: ~20 px]. O balão fica logo acima do topo.
 */
function liftFor(video: boolean, emote: boolean): number {
  const h = (emote ? 32 : 0) + 4 + (video ? 80 : 0) + 20.5;
  return -h / 2 - 3;
}

function BalloonProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  const st = useMemo(() => new Map<string, { lift: number; x: number; y: number; shown: boolean }>(), []);
  const last = useRef(performance.now());
  useAfterRender(({ camera, size }) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    if (!balloons.size) return;
    const k = 1 - Math.exp(-dt * 16);
    const videos = useMedia.getState().videos;
    for (const [id, el] of balloons) {
      let s = st.get(id);
      if (!s) {
        s = { lift: NaN, x: NaN, y: NaN, shown: false };
        st.set(id, s);
      }
      const p = poseOf(id);
      let visible = false;
      if (p) {
        v.set(p.x, groundY(p.x, p.z) + 1.72, p.z).project(camera);
        visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      }
      if (!visible) {
        if (s.shown) el.style.visibility = "hidden";
        s.shown = false;
        continue;
      }
      const target = liftFor(!!videos[id], !!currentEmote(id, now));
      s.lift = Number.isNaN(s.lift) ? target : s.lift + (target - s.lift) * k;
      const x = Math.round(((v.x + 1) / 2) * size.width);
      const y = Math.round(((1 - v.y) / 2) * size.height + s.lift);
      if (x !== s.x || y !== s.y) {
        s.x = x;
        s.y = y;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      }
      if (!s.shown) el.style.visibility = "visible";
      s.shown = true;
    }
    if (st.size > balloons.size) for (const id of st.keys()) if (!balloons.has(id)) st.delete(id);
  });
  return null;
}
