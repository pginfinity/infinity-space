import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ListMusic, Music2, SkipForward, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { JUKEBOX_ID, JUKEBOX_KIND, JUKEBOX_PER_PERSON, type JukeboxState, type Lens, type MapObject, type Vec2 } from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { serverNow } from "./clock.ts";
import { Particles, flatMaterial, noteGeometry } from "./particles.ts";
import { TRACK_LIST, getVolume, music, onVolume, setVolume, trackById } from "./music.ts";
import { T } from "./strings.ts";

/**
 * Jukebox do Arcade: escolhe uma faixa, ela entra na fila do servidor e toca para todo mundo perto,
 * no mesmo trecho. Cada um ajusta o próprio volume. Notas sobem da jukebox enquanto toca.
 */

interface JukeUi {
  open: boolean;
}
const useJukeUi = create<JukeUi>(() => ({ open: false }));

let boxAt: Vec2 | null = null;
function jukeboxPoint(): Vec2 {
  if (!boxAt) {
    const o = world().map.objects.find((x) => x.type === "jukebox");
    boxAt = o?.interact?.point ?? o?.pos ?? { x: 0, z: 0 };
  }
  return boxAt;
}

export const jukeboxClient: ActivityClient = {
  name: "vivo/jukebox",
  kinds: [JUKEBOX_KIND],
  objects: ["jukebox"],
  label: () => T.jukebox.action,
  use: (_o: MapObject) => useJukeUi.setState({ open: true }),
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    if (e.ev === "added" && e.from === me) {
      const d = e.data as { track: string };
      toast(T.jukebox.added(trackById.get(d.track)?.title ?? d.track));
    }
    if (e.ev === "refuse") {
      const reason = (e.data as { reason: string }).reason;
      toast(reason === "far" ? T.jukebox.tooFar : (T.jukebox.refused[reason as keyof typeof T.jukebox.refused] ?? T.jukebox.tooFar));
    }
  },
  Overlay: JukeboxOverlay,
  Scene: JukeboxScene,
};

// ---- som ----------------------------------------------------------------------------------

/** Liga o motor de som e passa a faixa atual para ele (vive no HUD: não reinicia ao trocar de lente). */
function useMusicEngine(state: JukeboxState | undefined): void {
  useEffect(() => {
    music.start(serverNow, jukeboxPoint());
    return () => music.stop();
  }, []);
  useEffect(() => {
    music.set(state?.playing ? { track: state.playing.track, startAt: state.playing.startAt } : null);
  }, [state?.playing?.track, state?.playing?.startAt]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useVolume(): number {
  return useSyncExternalStore(onVolume, getVolume);
}

// ---- interface ----------------------------------------------------------------------------

function JukeboxOverlay() {
  const state = useAct<JukeboxState>(JUKEBOX_ID);
  const open = useJukeUi((s) => s.open);
  useMusicEngine(state);
  return (
    <>
      <AnimatePresence>{open && <JukeboxPanel key="panel" state={state} />}</AnimatePresence>
      {!open && <NowPlaying state={state} />}
    </>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function JukeboxPanel({ state }: { state: JukeboxState | undefined }) {
  const me = useApp((s) => s.selfId);
  const vol = useVolume();
  const first = useRef<HTMLButtonElement>(null);
  const close = () => useJukeUi.setState({ open: false });
  useEffect(() => first.current?.focus(), []);
  // Sair de perto fecha o painel.
  useEffect(() => {
    const at = jukeboxPoint();
    const t = window.setInterval(() => {
      if (Math.hypot(self.x - at.x, self.z - at.z) > 4.2) close();
    }, 300);
    return () => window.clearInterval(t);
  }, []);
  const playing = state?.playing ?? null;
  const cur = playing ? trackById.get(playing.track) : undefined;
  const mine = state?.queue.filter((e) => e.byId === me).length ?? 0;
  const pos = playing ? Math.max(0, (serverNow() - playing.startAt) / 1000) : 0;
  const len = cur?.seconds ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] left-1/2 z-30 flex max-h-[min(70vh,560px)] w-[min(94vw,420px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-offwhite/10 bg-space shadow-2xl"
      role="dialog"
      aria-label={T.jukebox.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between border-b border-offwhite/8 px-4 py-3">
        <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.1em]">
          <Music2 className="size-4 text-sky" aria-hidden />
          {T.jukebox.title}
        </p>
        <button type="button" onClick={close} aria-label={T.close} className="grid size-8 place-items-center rounded-lg text-slate hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-4" />
        </button>
      </div>

      {/* tocando agora */}
      <div className="px-4 pt-3">
        <p className="label-caps">{T.jukebox.nowPlaying}</p>
        {cur && playing ? (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-offwhite">{cur.title}</p>
              <p className="truncate text-xs text-slate">
                {cur.mood} · {T.jukebox.by(playing.by)}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-offwhite/10" aria-hidden>
                <div
                  key={playing.startAt}
                  className="h-full origin-left rounded-full bg-signal"
                  style={{ transform: `scaleX(${Math.min(1, pos / len)})`, animation: `vivo-juke ${Math.max(0, (len - pos) * 1000)}ms linear forwards` }}
                />
              </div>
              <style>{`@keyframes vivo-juke { from { transform: scaleX(${Math.min(1, pos / len)}); } to { transform: scaleX(1); } }`}</style>
            </div>
            <button
              type="button"
              onClick={() => sendAct(JUKEBOX_ID, "skip")}
              aria-label={T.jukebox.skip}
              title={T.jukebox.skip}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-offwhite/10 text-offwhite/85 hover:border-offwhite/25 hover:text-offwhite"
            >
              <SkipForward className="size-4" />
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate">{T.jukebox.nothing}</p>
        )}
        <VolumeRow vol={vol} />
      </div>

      {/* fila */}
      <div className="mt-3 border-t border-offwhite/8 px-4 pt-3">
        <p className="label-caps flex items-center gap-1.5">
          <ListMusic className="size-3.5" aria-hidden />
          {T.jukebox.queue}
        </p>
        {state && state.queue.length > 0 ? (
          <ol className="mt-1.5 space-y-1">
            {state.queue.map((e, i) => (
              <li key={`${e.track}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 text-right text-[11px] tabular-nums text-slate">{i + 1}</span>
                <span className="truncate text-offwhite">{trackById.get(e.track)?.title ?? e.track}</span>
                <span className="ml-auto shrink-0 text-slate">{e.by}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-xs text-slate">{T.jukebox.queueEmpty}</p>
        )}
      </div>

      {/* faixas */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-offwhite/8 px-2 py-2">
        <p className="label-caps px-2 pb-1">{T.jukebox.tracks}</p>
        <ul>
          {TRACK_LIST.map((t, i) => (
            <li key={t.id}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                disabled={mine >= JUKEBOX_PER_PERSON}
                onClick={() => sendAct(JUKEBOX_ID, "add", { track: t.id })}
                aria-label={`${T.jukebox.add}: ${t.title}`}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-offwhite/6 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-sky" aria-hidden>
                  <Music2 className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-offwhite">{t.title}</span>
                  <span className="block truncate text-[11px] text-slate">
                    {t.mood} · {fmt(t.seconds)}
                  </span>
                </span>
                {playing?.track === t.id ? (
                  <span className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-sky">{T.jukebox.playingTag}</span>
                ) : (
                  <span className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-slate group-hover:text-offwhite">{T.jukebox.add}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {mine >= JUKEBOX_PER_PERSON && <p className="px-2 pt-1 text-[11px] text-slate">{T.jukebox.refused.limit}</p>}
      </div>
    </motion.div>
  );
}

function VolumeRow({ vol, compact }: { vol: number; compact?: boolean }) {
  const [before, setBefore] = useState(0.7);
  const Icon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  return (
    <div className={compact ? "flex items-center gap-1.5" : "mt-3 flex items-center gap-2"}>
      <button
        type="button"
        onClick={() => {
          if (vol > 0) {
            setBefore(vol);
            setVolume(0);
          } else setVolume(before || 0.7);
        }}
        aria-label={vol > 0 ? T.jukebox.mute : T.jukebox.unmute}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite"
      >
        <Icon className="size-4" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={vol}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label={T.jukebox.volumeHint}
        className={`${compact ? "w-20" : "w-full"} accent-signal`}
      />
    </div>
  );
}

/** Minitocador: aparece quando dá para ouvir a jukebox, com o nome da faixa e o volume. */
function NowPlaying({ state }: { state: JukeboxState | undefined }) {
  const [audible, setAudible] = useState(false);
  const vol = useVolume();
  useEffect(() => {
    const t = window.setInterval(() => setAudible(music.level > 0.04), 400);
    return () => window.clearInterval(t);
  }, []);
  const cur = state?.playing ? trackById.get(state.playing.track) : undefined;
  return (
    <AnimatePresence>
      {audible && cur && (
        <motion.div
          key="np"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="glass pointer-events-auto absolute right-3 top-16 z-20 flex items-center gap-2 rounded-full py-1 pl-3 pr-2 text-xs text-offwhite"
          role="status"
          aria-live="polite"
        >
          <Music2 className="size-3.5 text-sky" aria-hidden />
          <span className="max-w-[16ch] truncate">{cur.title}</span>
          <span className="h-4 w-px bg-offwhite/15" />
          <VolumeRow vol={vol} compact />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- no mundo -----------------------------------------------------------------------------

const NOTE_COLORS = ["#9B8CFF", "#00B7FF", "#F2F0EF", "#46AFE3"].map((c) => new THREE.Color(c));

function JukeboxScene(_: { lens: Lens }) {
  const camera = useThree((s) => s.camera);
  const notes = useMemo(() => {
    const p = new Particles(noteGeometry(), flatMaterial({ side: THREE.DoubleSide }), 30);
    p.billboard = true;
    return p;
  }, []);
  const acc = useRef(0);
  const top = useMemo(() => {
    const o = world().map.objects.find((x) => x.type === "jukebox");
    return o ? { x: o.pos.x, z: o.pos.z, y: (o.size?.h ?? 1.6) + 0.05 } : null;
  }, []);
  useEffect(() => () => notes.dispose(), [notes]);
  useFrame((_, dt) => {
    const s = actState<JukeboxState>(JUKEBOX_ID);
    if (s?.playing && top) {
      acc.current += dt;
      if (acc.current > 0.55) {
        acc.current = 0;
        const c = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]!;
        notes.spawn({ x: top.x + (Math.random() - 0.5) * 0.4, y: top.y, z: top.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.2, vy: 0.35 + Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.2, life: 2.6, size: 0.16 + Math.random() * 0.06, drag: 0.2, color: c });
      }
    }
    notes.update(dt, camera);
  });
  return <primitive object={notes.mesh} />;
}
