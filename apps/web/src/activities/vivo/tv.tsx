import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { create } from "zustand";
import { clsx } from "clsx";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Eye, EyeOff, ListVideo, Maximize2, Minimize2, Pause, Play, RotateCcw, RotateCw, SkipForward, Tv, Volume1, Volume2, VolumeX } from "lucide-react";
import {
  TV_ID,
  TV_KIND,
  TV_LOUNGE_MARGIN,
  TV_SCREEN,
  TV_VOLUME_START,
  tvInLounge,
  tvPosition,
  tvSyncPlan,
  tvVideoId,
  tvVolume,
  type Lens,
  type MapObject,
  type TvPlaying,
  type TvState,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { serverNow } from "../../net/session.ts";
import { useMedia } from "../../media/rtc.ts";
import { seatedAt, walkTo } from "../../engine/movement.ts";
import { claimScreen, screenClaim } from "../../scene/tvs.ts";
import { glow } from "../../scene/materials.ts";
import { createTvPlayer, type TvPlayer } from "./tvPlayer.ts";
import { T } from "./strings.ts";

/**
 * TV do lounge do Átrio: "Assistir junto" (servidor: apps/server/src/activities/vivo/tv.ts).
 *
 * - Quem está no lounge vê o vídeo num painel do HUD (pequeno no canto; grande ao abrir a TV com E),
 *   no mesmo ponto que os outros: o player se ajusta quando fica mais de 1,5 s fora do tempo.
 * - A TV do mundo (nas duas lentes) mostra "Assistindo junto", o título e o progresso.
 * - Áudio primeiro: volume próprio (começa moderado), abaixa sozinho quando alguém que você ouve fala
 *   e só toca no lounge. Saiu do lounge, o player fecha.
 */

interface TvUi {
  /** Painel grande aberto. */
  open: boolean;
  /** Vídeo escondido (só o som e uma pílula com o título). */
  hidden: boolean;
  inLounge: boolean;
}
const useTvUi = create<TvUi>(() => ({ open: false, hidden: false, inLounge: false }));

function openTv(): void {
  if (!tvInLounge({ x: self.x, z: self.z }, TV_LOUNGE_MARGIN)) {
    toast(T.tv.refused.far);
    return;
  }
  useTvUi.setState({ open: true, hidden: false, inLounge: true });
}

const closeTv = () => useTvUi.setState({ open: false });

/** Vai até o lounge e abre a TV (busca, Ctrl+K). */
export function goToTv(): void {
  if (tvInLounge({ x: self.x, z: self.z })) return openTv();
  walkTo({ x: 5, z: -2.2 }, openTv);
}

export const tvClient: ActivityClient = {
  name: "vivo/tv",
  kinds: [TV_KIND],
  // Assume a interação das TVs: a do lounge abre o "Assistir junto"; as outras seguem como antes.
  objects: ["tv"],
  label: (o: MapObject) => (o.screenId === TV_SCREEN ? T.tv.action : undefined),
  use: (o: MapObject) => (o.screenId === TV_SCREEN ? openTv() : toast(T.tv.otherTv)),
  // Sentado no sofá ou nas poltronas do lounge: E também abre a TV.
  targets: () => {
    const ui = useTvUi.getState();
    if (!seatedAt() || !ui.inLounge || ui.open) return [];
    return [{ key: "tv-lounge-sentado", point: { x: self.x, z: self.z }, radius: 1, label: T.tv.action, run: openTv, priority: 1 }];
  },
  onEvent: (e) => {
    if (e.ev === "refuse") {
      const reason = (e.data as { reason?: string } | undefined)?.reason as keyof typeof T.tv.refused | undefined;
      toast(T.tv.refused[reason ?? "far"] ?? T.tv.refused.far);
    } else if (e.ev === "added") {
      const d = e.data as { by: string; now: boolean };
      if (e.from === useApp.getState().selfId) toast(d.now ? T.tv.added.now : T.tv.added.queued);
      else toast(T.tv.addedBy(d.by, d.now));
    }
  },
  Overlay: TvOverlay,
  Scene: TvScene,
};

// ---- volume (de cada um) --------------------------------------------------------------------

const VOL_KEY = "infinity-space:tv-volume";
let userVol = (() => {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : TV_VOLUME_START;
  } catch {
    return TV_VOLUME_START;
  }
})();
const volSubs = new Set<() => void>();

function setTvVolume(v: number): void {
  userVol = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOL_KEY, String(userVol));
  } catch {
    /* sem armazenamento: vale nesta sessão */
  }
  volSubs.forEach((f) => f());
}

function useTvVolume(): number {
  return useSyncExternalStore(
    (f) => {
      volSubs.add(f);
      return () => volSubs.delete(f);
    },
    () => userVol,
  );
}

// ---- player ---------------------------------------------------------------------------------

/** Player montado agora (para o gancho de testes e o botão "Clique para assistir"). */
let current: TvPlayer | null = null;
/** Volume aplicado agora (com a queda quando alguém fala). */
let applied = 0;

/** Cria o player no contêiner e o mantém igual ao estado compartilhado. */
function usePlayer(host: RefObject<HTMLDivElement | null>): { blocked: boolean; failed: boolean } {
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = createTvPlayer(el);
    current = p;
    applied = 0;
    let holdUntil = 0;
    let lastMeta = 0;
    p.onEnded((video) => sendAct(TV_ID, "ended", { video }));
    const sync = () => {
      const want = actState<TvState>(TV_ID)?.playing ?? null;
      const now = serverNow();
      const local = p.state();
      const plan = tvSyncPlan(want, local, now);
      const t = performance.now();
      if (plan.load !== undefined) {
        p.load(plan.load, plan.seek ?? 0, plan.play ?? false);
        holdUntil = t + 2500;
      } else {
        // Depois de um salto, espera o player chegar antes de corrigir de novo.
        if (plan.seek !== undefined && t > holdUntil) {
          p.seek(plan.seek);
          holdUntil = t + 2000;
        }
        if (plan.play === true) p.play();
        else if (plan.play === false) {
          p.pause();
          if (want) p.seek(tvPosition(want, now));
        }
      }
      // Título e duração: o primeiro player que souber conta para o servidor (ele guarda uma vez).
      if (want && local.video === want.video && (!want.title || !want.len) && t - lastMeta > 2000) {
        const m = p.meta();
        if (m && ((!want.title && m.title) || (!want.len && m.len > 0))) {
          lastMeta = t;
          sendAct(TV_ID, "meta", { video: want.video, title: m.title, len: m.len });
        }
      }
      setBlocked(p.blocked());
      setFailed(p.failed());
    };
    // Volume: abaixa rápido quando alguém que você ouve fala e volta devagar.
    const level = () => {
      const talking = Object.keys(useMedia.getState().speaking).length > 0;
      const target = tvVolume(userVol, talking);
      applied += (target - applied) * (target < applied ? 0.5 : 0.18);
      if (Math.abs(target - applied) < 0.004) applied = target;
      p.setVolume(applied);
    };
    sync();
    level();
    const a = window.setInterval(sync, 400);
    const b = window.setInterval(level, 120);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
      p.destroy();
      if (current === p) current = null;
    };
  }, [host]);
  return { blocked, failed };
}

// ---- interface ------------------------------------------------------------------------------

function fmt(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function titleOf(p: { title: string } | null): string {
  return p?.title || T.tv.noTitle;
}

function TvOverlay() {
  const state = useAct<TvState>(TV_ID);
  const open = useTvUi((s) => s.open);
  const inLounge = useTvUi((s) => s.inLounge);
  // Quem está no lounge (com folga na borda para não piscar).
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = { x: self.x, z: self.z };
      const was = useTvUi.getState().inLounge;
      const now = was ? tvInLounge(p, TV_LOUNGE_MARGIN) : tvInLounge(p);
      if (now !== was) useTvUi.setState(now ? { inLounge: true } : { inLounge: false, open: false });
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  if (!inLounge || (!state?.playing && !open)) return null;
  return <TvDock state={state} />;
}

function TvDock({ state }: { state: TvState | undefined }) {
  const open = useTvUi((s) => s.open);
  const hidden = useTvUi((s) => s.hidden);
  const host = useRef<HTMLDivElement>(null);
  const { blocked, failed } = usePlayer(host);
  const playing = state?.playing ?? null;
  const mode = open ? "big" : hidden && playing ? "pill" : "mini";

  return (
    <section
      aria-label={T.tv.title}
      role={mode === "big" ? "dialog" : "region"}
      data-tv-mode={mode}
      onKeyDown={(e) => {
        if (mode !== "big") return;
        if (e.key === "Escape") closeTv();
        e.stopPropagation();
      }}
      className={clsx(
        "pointer-events-auto absolute flex flex-col text-offwhite",
        mode === "big" && "left-1/2 top-[max(64px,6vh)] z-30 max-h-[calc(100dvh-180px)] w-[min(94vw,640px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-offwhite/10 bg-space shadow-2xl",
        // 368 px de largura: o vídeo fica com pelo menos 200 px de altura (mínimo do player do YouTube).
        mode === "mini" && "right-3 top-16 z-10 w-[min(368px,calc(100vw-24px))] overflow-hidden rounded-2xl p-1.5 glass",
        mode === "pill" && "right-3 top-16 z-10 overflow-hidden rounded-full glass",
      )}
    >
      <header className={clsx("flex items-center gap-2", mode === "big" ? "border-b border-offwhite/8 px-4 py-3" : mode === "pill" ? "py-1 pl-3 pr-1.5" : "hidden")}>
        {mode === "big" && (
          <>
            <Tv className="size-4 text-signal" aria-hidden />
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em]">{T.tv.title}</h2>
            <span className="ml-auto" />
            <IconBtn label={T.tv.shrink} onClick={closeTv}>
              <Minimize2 className="size-4" />
            </IconBtn>
          </>
        )}
        {mode === "pill" && playing && (
          <>
            <Tv className="size-3.5 shrink-0 text-signal" aria-hidden />
            <span className="max-w-[18ch] truncate text-xs">{titleOf(playing)}</span>
            <PlayPause playing={playing} small />
            <VolumeRow compact />
            <IconBtn label={T.tv.show} onClick={() => useTvUi.setState({ hidden: false })} small>
              <Eye className="size-3.5" />
            </IconBtn>
          </>
        )}
      </header>

      {/* O contêiner do player fica sempre no mesmo lugar da árvore: trocar de modo não recarrega o vídeo. */}
      <div className={clsx(mode === "pill" ? "pointer-events-none fixed -left-[9999px] top-0 w-[356px] opacity-0" : "relative", mode === "big" && "px-4 pt-4")} aria-hidden={mode === "pill" || undefined}>
        <div ref={host} data-tv-player className="aspect-video w-full overflow-hidden rounded-xl bg-deep" />
        {!playing && mode !== "pill" && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate">{T.tv.nothing}</p>}
        {failed && playing && mode !== "pill" && <p className="absolute inset-0 grid place-items-center bg-space/80 px-6 text-center text-sm text-offwhite/90">{T.tv.cantPlay}</p>}
        {blocked && playing && mode !== "pill" && (
          <button type="button" onClick={() => current?.play()} className="absolute inset-0 grid place-items-center bg-space/60 text-sm font-semibold text-offwhite">
            <span className="flex items-center gap-2 rounded-full bg-offwhite/10 px-4 py-2">
              <Play className="size-4" aria-hidden />
              {T.tv.tapToPlay}
            </span>
          </button>
        )}
      </div>

      {mode === "big" ? <BigControls state={state} /> : mode === "mini" ? <MiniControls playing={playing} queue={state?.queue.length ?? 0} /> : null}
    </section>
  );
}

function MiniControls({ playing, queue }: { playing: TvPlaying | null; queue: number }) {
  return (
    <div className="flex items-center gap-1 px-1.5 pb-0.5 pt-1.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-slate">
          <Tv className="size-3 text-signal" aria-hidden />
          {playing?.paused ? T.tv.paused : T.tv.watching}
          {queue > 0 && <span className="normal-case tracking-normal">· {T.tv.inQueue(queue)}</span>}
        </p>
        <p className="truncate text-xs text-offwhite" data-tv-title>
          {titleOf(playing)}
        </p>
      </div>
      {playing && <PlayPause playing={playing} small />}
      <VolumeRow compact />
      <IconBtn label={T.tv.expand} onClick={openTv} small>
        <Maximize2 className="size-3.5" />
      </IconBtn>
      <IconBtn label={T.tv.hide} onClick={() => useTvUi.setState({ hidden: true })} small>
        <EyeOff className="size-3.5" />
      </IconBtn>
    </div>
  );
}

function BigControls({ state }: { state: TvState | undefined }) {
  const playing = state?.playing ?? null;
  const queue = state?.queue ?? [];
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!playing) input.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (now: boolean) => {
    if (!tvVideoId(link)) {
      setError(T.tv.invalid);
      input.current?.focus();
      return;
    }
    setError(null);
    sendAct(TV_ID, "add", { link: link.trim(), now });
    setLink("");
  };
  const seekBy = (ds: number) => {
    const p = actState<TvState>(TV_ID)?.playing;
    if (p) sendAct(TV_ID, "seek", { to: tvPosition(p, serverNow()) + ds });
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
      {playing && (
        <>
          <div className="min-w-0">
            <p className="label-caps">{playing.paused ? T.tv.paused : T.tv.watching}</p>
            <p className="truncate text-sm font-semibold" data-tv-title>
              {titleOf(playing)}
            </p>
          </div>
          <Progress playing={playing} />
          <div className="flex items-center gap-1">
            <IconBtn label={T.tv.back} onClick={() => seekBy(-10)}>
              <RotateCcw className="size-4" />
            </IconBtn>
            <PlayPause playing={playing} />
            <IconBtn label={T.tv.forward} onClick={() => seekBy(10)}>
              <RotateCw className="size-4" />
            </IconBtn>
            <IconBtn label={queue.length ? T.tv.next : T.tv.stop} onClick={() => sendAct(TV_ID, "next")}>
              <SkipForward className="size-4" />
            </IconBtn>
            <div className="ml-auto w-40">
              <VolumeRow />
            </div>
          </div>
        </>
      )}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
      >
        <label htmlFor="tv-link" className="label-caps">
          {T.tv.linkLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="tv-link"
            ref={input}
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              if (error) setError(null);
            }}
            placeholder={T.tv.linkPlaceholder}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "tv-link-erro" : undefined}
            className="min-w-0 flex-1 basis-56 rounded-xl border border-offwhite/10 bg-deep/60 px-3 py-2 text-sm text-offwhite placeholder:text-slate focus:border-signal focus:outline-none"
          />
          <button type="submit" className="rounded-xl bg-orange px-3.5 py-2 text-sm font-semibold text-offwhite hover:brightness-110">
            {T.tv.watchNow}
          </button>
          <button type="button" onClick={() => submit(false)} className="rounded-xl border border-offwhite/12 px-3.5 py-2 text-sm text-offwhite/90 hover:border-offwhite/30 hover:text-offwhite">
            {T.tv.enqueue}
          </button>
        </div>
        {error && (
          <p id="tv-link-erro" role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </form>

      <div>
        <p className="label-caps flex items-center gap-1.5">
          <ListVideo className="size-3.5" aria-hidden />
          {T.tv.queue}
        </p>
        {queue.length ? (
          <ol className="mt-1.5 space-y-1" aria-label={T.tv.queue}>
            {queue.map((e, i) => (
              <li key={`${e.video}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 text-right text-[11px] tabular-nums text-slate">{i + 1}</span>
                <span className="truncate">{e.title || `${T.tv.noTitle} · ${e.video}`}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-xs text-slate">{T.tv.queueEmpty}</p>
        )}
      </div>
      <p className="text-[11px] text-slate">{T.tv.audioNote}</p>
    </div>
  );
}

/** Barra de progresso e tempo (atualizados fora do React, duas vezes por segundo). */
function Progress({ playing }: { playing: TvPlaying }) {
  const bar = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => {
      const p = actState<TvState>(TV_ID)?.playing;
      if (!p) return;
      const pos = tvPosition(p, serverNow());
      if (time.current) time.current.textContent = p.len ? `${fmt(pos)} / ${fmt(p.len)}` : fmt(pos);
      if (bar.current) bar.current.style.transform = `scaleX(${p.len ? Math.min(1, pos / p.len) : 0})`;
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, [playing]);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-offwhite/10"
        onClick={(e) => {
          if (!playing.len) return;
          const r = e.currentTarget.getBoundingClientRect();
          sendAct(TV_ID, "seek", { to: ((e.clientX - r.left) / r.width) * playing.len });
        }}
        aria-hidden
      >
        <div ref={bar} className="h-full origin-left rounded-full bg-signal transition-transform duration-500" style={{ transform: "scaleX(0)" }} />
      </div>
      <span ref={time} className="shrink-0 text-[11px] tabular-nums text-slate" data-tv-time />
    </div>
  );
}

function PlayPause({ playing, small }: { playing: TvPlaying; small?: boolean }) {
  const paused = playing.paused;
  return (
    <IconBtn label={paused ? T.tv.play : T.tv.pause} onClick={() => sendAct(TV_ID, paused ? "play" : "pause")} small={small}>
      {paused ? <Play className={small ? "size-3.5" : "size-4"} /> : <Pause className={small ? "size-3.5" : "size-4"} />}
    </IconBtn>
  );
}

function VolumeRow({ compact }: { compact?: boolean }) {
  const vol = useTvVolume();
  const [before, setBefore] = useState(TV_VOLUME_START);
  const Icon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;
  const toggle = () => {
    if (vol > 0) {
      setBefore(vol);
      setTvVolume(0);
    } else setTvVolume(before || TV_VOLUME_START);
  };
  if (compact)
    return (
      <IconBtn label={vol > 0 ? T.tv.mute : T.tv.unmute} onClick={toggle} small>
        <Icon className="size-3.5" />
      </IconBtn>
    );
  return (
    <div className="flex items-center gap-1.5">
      <IconBtn label={vol > 0 ? T.tv.mute : T.tv.unmute} onClick={toggle}>
        <Icon className="size-4" />
      </IconBtn>
      <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setTvVolume(Number(e.target.value))} aria-label={T.tv.volume} className="w-full accent-signal" />
    </div>
  );
}

function IconBtn({ label, onClick, small, children }: { label: string; onClick: () => void; small?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx("grid shrink-0 place-items-center rounded-lg text-offwhite/85 transition-colors hover:bg-offwhite/10 hover:text-offwhite", small ? "size-7" : "size-9")}
    >
      {children}
    </button>
  );
}

// ---- no mundo: a TV mostra "Assistindo junto" -----------------------------------------------

const DAY_BG = ["#051326", "#0B2A4D"] as const;

/** Tela da TV do lounge enquanto há vídeo: título, estado e progresso (canvas redesenhado no máximo 1x/s). */
class TvCard {
  readonly material: THREE.MeshBasicMaterial;
  private readonly canvas = document.createElement("canvas");
  private readonly tex: THREE.CanvasTexture;
  private key = "";

  constructor() {
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = glow("#FFFFFF").clone();
    this.material.map = this.tex;
    this.material.name = "tv:assistir-junto";
  }

  draw(p: TvPlaying, queue: number, now: number): void {
    const pos = tvPosition(p, now);
    const key = `${p.video}|${p.title}|${p.paused}|${Math.floor(pos)}|${p.len ?? 0}|${queue}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext("2d")!;
    const { width: w, height: h } = this.canvas;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, DAY_BG[0]);
    bg.addColorStop(1, DAY_BG[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const glowG = g.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.55, w * 0.6);
    glowG.addColorStop(0, "rgba(0,183,255,0.18)");
    glowG.addColorStop(1, "rgba(0,183,255,0)");
    g.fillStyle = glowG;
    g.fillRect(0, 0, w, h);
    const ls = (v: string) => ((g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = v);
    g.textAlign = "center";
    // estado
    g.fillStyle = p.paused ? "#8A93A3" : "#00B7FF";
    g.font = '500 24px NORD, "Arial Black", sans-serif';
    ls("4px");
    g.fillText(`${p.paused ? "❚❚" : "▶"}  ${(p.paused ? T.tv.paused : T.tv.watching).toUpperCase()}`, w / 2, 74);
    ls("0px");
    // título em até duas linhas
    g.fillStyle = "#F2F0EF";
    g.font = '600 38px Geist, system-ui, sans-serif';
    const lines = wrap(g, p.title || T.tv.noTitle, w - 100, 2);
    lines.forEach((l, i) => g.fillText(l, w / 2, (lines.length === 1 ? 180 : 156) + i * 48));
    // progresso e tempo
    const bw = w - 160;
    const bx = (w - bw) / 2;
    g.fillStyle = "rgba(242,240,239,0.14)";
    roundRect(g, bx, 262, bw, 8, 4);
    if (p.len) {
      g.fillStyle = p.paused ? "#8A93A3" : "#00B7FF";
      roundRect(g, bx, 262, Math.max(8, bw * Math.min(1, pos / p.len)), 8, 4);
    }
    g.fillStyle = "#8A93A3";
    g.font = '400 24px Geist, system-ui, sans-serif';
    const t = p.len ? `${fmt(pos)} / ${fmt(p.len)}` : fmt(pos);
    g.fillText(queue ? `${t}  ·  ${T.tv.inQueue(queue)}` : t, w / 2, 314);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.material.dispose();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

/** Quebra o texto em até `max` linhas que cabem em `width` (a última ganha reticências). */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (g.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i]!;
    if (lines.length === max - 1) {
      line = words.slice(i).join(" ");
      break;
    }
  }
  lines.push(line);
  const last = lines.length - 1;
  if (g.measureText(lines[last]!).width > width) {
    let s = lines[last]!;
    while (s.length > 1 && g.measureText(`${s}…`).width > width) s = s.slice(0, -1);
    lines[last] = `${s.trimEnd()}…`;
  }
  return lines;
}

function TvScene(_: { lens: Lens }) {
  const card = useMemo(() => new TvCard(), []);
  useEffect(
    () => () => {
      if (screenClaim(TV_SCREEN) === card.material) claimScreen(TV_SCREEN, null);
      card.dispose();
    },
    [card],
  );
  useFrame(() => {
    const st = actState<TvState>(TV_ID);
    const mine = screenClaim(TV_SCREEN) === card.material;
    if (!st?.playing) {
      if (mine) claimScreen(TV_SCREEN, null);
      return;
    }
    if (!mine) claimScreen(TV_SCREEN, card.material);
    card.draw(st.playing, st.queue.length, serverNow());
  });
  return null;
}

// Gancho de testes, só em desenvolvimento.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __tv: {
      player: () => (current ? { ...current.state(), volume: current.volume() } : null),
      nudge: (s: number) => (current as unknown as { nudge?: (s: number) => void } | null)?.nudge?.(s),
      claimed: () => !!screenClaim(TV_SCREEN),
      /** Onde o vídeo deveria estar agora, pelo estado compartilhado (s). */
      shared: () => tvPosition(actState<TvState>(TV_ID)?.playing ?? null, serverNow()),
      inLounge: () => useTvUi.getState().inLounge,
      applied: () => applied,
    },
  });
}
