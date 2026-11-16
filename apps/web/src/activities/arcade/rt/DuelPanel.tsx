import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Eye, Flag, LoaderCircle, LogOut, X } from "lucide-react";
import type { DuelState, MapObject } from "@infinity/world";
import { useApp } from "../../../state/store.ts";
import { STATUS_COLOR } from "../../../world/theme.ts";
import { world } from "../../../world/world.ts";
import { sendAct, useAct } from "../../registry.ts";
import { sfx } from "../../../audio/sfx.ts";
import { duelNet, type DuelGameClient } from "./net.ts";
import { cancelDuelSeat, leaveDuel, openDuel, requestDuelSeat, useDuelUi } from "./ui.ts";
import { T } from "../strings.ts";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Como cada jogo de tempo real aparece no painel. */
export interface DuelView<S> {
  kind: string;
  title: string;
  seatNames: readonly [string, string];
  colors: readonly [string, string];
  game: DuelGameClient<S>;
  /** Meia largura e meio comprimento da área desenhada (m), com o lugar 0 embaixo. */
  hw: number;
  hl: number;
  hint: string;
  /** O jogo tem ação (saque) no clique e no Espaço. */
  action?: boolean;
  /** Ponto se chama gol (hockey) ou ponto (pingue-pongue). */
  goal?: boolean;
  /** Linha extra de estado (ex.: de quem é o saque). */
  status?(st: DuelState, sim: S | null, seat: number): string | null;
  draw(ctx: CanvasRenderingContext2D, d: DrawArgs<S>): void;
}

export interface DrawArgs<S> {
  /** Pontos (x, z) do jogo: bola primeiro, depois os controles 0 e 1. */
  pts: Float64Array;
  live: boolean;
  sim: S | null;
  seat: number;
  /** Converte coordenadas da mesa em pixels do canvas. */
  px(x: number, z: number): [number, number];
  /** Pixels por metro. */
  scale: number;
  w: number;
  h: number;
  now: number;
  target: { x: number; z: number } | null;
  state: DuelState;
  dpr: number;
}

/** Teclas do jogo: não andam com o avatar nem disparam atalhos enquanto se joga. */
const MOVE: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};
const BLOCKED = new Set(["Space", "KeyE", "KeyF", "KeyQ", "KeyR", "KeyL", ...Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`)]);
const KEY_SPEED = 1.7;

export function tableOf(id: string): MapObject | undefined {
  return world().map.objects.find((o) => o.gameId === id);
}

export function DuelPanel<S>({ id, view }: { id: string; view: DuelView<S> }) {
  const st = useAct<DuelState>(id);
  const selfId = useApp((s) => s.selfId);
  const seat = st && selfId ? st.seats.indexOf(selfId) : -1;
  const net = useMemo(() => duelNet(id, view.game), [id, view.game]);
  const active = st?.phase === "countdown" || st?.phase === "playing";
  const playing = seat >= 0 && active;

  useEffect(() => {
    net.setSeat(playing ? seat : -1);
  }, [net, seat, playing]);
  useEffect(() => () => net.setSeat(-1), [net]);

  return (
    <motion.aside
      role="dialog"
      aria-label={view.title}
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={clsx(
        "glass pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite",
        "inset-x-2 bottom-2 max-h-[calc(100dvh-72px)]",
        "sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-16 sm:h-[calc(100dvh-64px-84px)] sm:max-h-[860px] sm:w-[400px]",
      )}
      data-duel-panel={id}
    >
      <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
        <span className="mt-1 flex shrink-0 gap-1" aria-hidden>
          <span className="size-3 rounded-full" style={{ background: view.colors[0] }} />
          <span className="size-3 rounded-full" style={{ background: view.colors[1] }} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold uppercase leading-tight tracking-[0.1em]">{view.title}</h2>
          {st && <StatusLine st={st} seat={seat} view={view} net={net} />}
        </div>
        <button type="button" onClick={() => openDuel(null)} className="-mr-1.5 rounded-lg p-2 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close} title={T.close}>
          <X className="size-4" />
        </button>
      </header>
      {st ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-[max(14px,env(safe-area-inset-bottom))] sm:pb-3.5">
          <SeatStrip id={id} st={st} view={view} seat={seat === 1 ? 0 : 1} me={seat} />
          <Arena id={id} st={st} view={view} seat={seat} net={net} />
          <SeatStrip id={id} st={st} view={view} seat={seat === 1 ? 1 : 0} me={seat} />
          <Notice />
          <AnimatePresence mode="wait" initial={false}>
            {st.phase === "finished" ? <EndBanner key={`end-${st.round}`} id={id} st={st} view={view} seat={seat} /> : <Footer key="footer" id={id} st={st} seat={seat} view={view} />}
          </AnimatePresence>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-slate">…</p>
      )}
    </motion.aside>
  );
}

function StatusLine<S>({ st, seat, view, net }: { st: DuelState; seat: number; view: DuelView<S>; net: ReturnType<typeof duelNet<S>> }) {
  let text: ReactNode;
  if (st.phase === "playing") {
    const extra = view.status?.(st, net.latest()?.sim ?? null, seat);
    text = (
      <>
        <span className="text-offwhite/80">{view.goal ? T.duel.firstTo(7) : T.duel.firstToBy(11)}</span>
        {extra && <span className={clsx(extra === T.duel.yourServe ? "font-medium text-signal" : "text-slate")}>· {extra}</span>}
      </>
    );
  } else if (st.phase === "countdown") text = <span className="font-medium text-signal">{T.duel.countdown}</span>;
  else if (st.phase === "finished") text = <span className="text-offwhite/80">{T.duel.finished}</span>;
  else text = <span className="text-slate">{st.seats.filter((s) => s === null).length === 1 ? T.duel.waitingOne : T.duel.waiting}</span>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" aria-live="polite">
      {text}
    </p>
  );
}

/** Um lado da mesa: quem joga, o placar dele; ou o botão de pegar o lugar. */
function SeatStrip<S>({ id, st, view, seat, me }: { id: string; st: DuelState; view: DuelView<S>; seat: number; me: number }) {
  const pid = st.seats[seat] ?? null;
  const player = useApp((s) => (pid ? s.players[pid] : undefined));
  const pending = useDuelUi((s) => s.pending);
  const walking = pending?.id === id && pending.seat === seat;
  const isMe = me === seat;
  const canSit = !pid && me < 0 && st.phase !== "playing" && st.phase !== "countdown";
  const name = pid ? (player?.name ?? st.names[seat] ?? "—") : null;
  const shownName = name ?? (st.phase === "finished" ? st.players[seat] : null);
  const free = st.seats.filter((s) => s === null).length;
  const winner = st.phase === "finished" && st.winner === seat;

  return (
    <div className={clsx("flex min-h-[46px] items-center gap-3 rounded-xl px-3 py-1.5 ring-1", isMe ? "bg-offwhite/[0.06] ring-offwhite/14" : "bg-offwhite/[0.035] ring-offwhite/8")} data-seat={seat}>
      <span className={clsx("size-5 shrink-0 rounded-full ring-2 ring-space", !pid && "opacity-40")} style={{ background: view.colors[seat] }} aria-hidden />
      <div className="min-w-0 flex-1">
        {shownName ? (
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {pid && <span className="size-2 shrink-0 rounded-full" style={{ background: player ? STATUS_COLOR[player.status] : "#8A93A3" }} aria-hidden />}
            <span className="truncate">{shownName}</span>
            {isMe && <span className="shrink-0 text-xs font-normal text-slate">({T.you})</span>}
            {winner && <span className="shrink-0 rounded-full bg-offwhite/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]">Venceu</span>}
          </p>
        ) : (
          <p className="text-sm text-slate">{T.duel.emptySeat}</p>
        )}
        <p className="text-[11px] uppercase tracking-[0.12em] text-slate">{view.seatNames[seat]}</p>
      </div>
      {canSit &&
        (walking ? (
          <button type="button" onClick={cancelDuelSeat} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-offwhite/80 ring-1 ring-offwhite/15 hover:bg-offwhite/8" title={T.cancel}>
            <LoaderCircle className="size-3.5 animate-spin" />
            {T.duel.walking}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const t = tableOf(id);
              if (t) requestDuelSeat(id, t, view.game.def as never, seat);
            }}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              free === 1 ? "bg-orange text-offwhite hover:bg-orange/90" : "bg-offwhite/8 text-offwhite ring-1 ring-offwhite/15 hover:bg-signal hover:text-space hover:ring-signal",
            )}
          >
            {T.duel.playAs(view.seatNames[seat]!)}
          </button>
        ))}
      {(pid || st.phase === "finished") && (
        <span className="min-w-[2ch] shrink-0 text-right text-[26px] font-extrabold leading-none tabular-nums" aria-label={T.duel.score(shownName ?? view.seatNames[seat]!, st.score[seat]!)}>
          {st.score[seat]}
        </span>
      )}
    </div>
  );
}

function Notice() {
  const notice = useDuelUi((s) => s.notice);
  if (!notice) return null;
  return (
    <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn" role="status">
      {notice}
    </p>
  );
}

/** A mesa vista de cima: canvas a 60 fps fora do React, com o controle de quem joga. */
function Arena<S>({ id, st, view, seat, net }: { id: string; st: DuelState; view: DuelView<S>; seat: number; net: ReturnType<typeof duelNet<S>> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stRef = useRef(st);
  stRef.current = st;
  const seatRef = useRef(seat);
  seatRef.current = seat;
  const countdownEnd = useRef(0);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [count, setCount] = useState<string | null>(null);
  const players = useApp((s) => s.players);
  const prevScore = useRef<[number, number]>([st.score[0], st.score[1]]);

  // contagem regressiva (o servidor manda quanto falta quando o estado sai)
  useEffect(() => {
    if (st.phase === "countdown") countdownEnd.current = performance.now() + st.countdown;
    else if (st.phase !== "playing") countdownEnd.current = 0;
  }, [st.phase, st.round, st.countdown]);
  useEffect(() => {
    if (st.phase !== "countdown" && st.phase !== "playing") {
      setCount(null);
      return;
    }
    let shown: string | null | undefined;
    const tickId = window.setInterval(() => {
      const left = countdownEnd.current - performance.now();
      const next = countdownEnd.current && left > 0 ? String(Math.ceil(left / 1000)) : countdownEnd.current && left > -700 ? T.duel.go : null;
      if (next !== shown) {
        shown = next;
        setCount(next);
        if (next) sfx(next === T.duel.go ? "arcade-duel-go" : "arcade-duel-count", { volume: 0.5 });
      }
    }, 60);
    return () => window.clearInterval(tickId);
  }, [st.phase]);

  // aviso de ponto: compara o placar com o anterior
  useEffect(() => {
    const [a, b] = prevScore.current;
    prevScore.current = [st.score[0], st.score[1]];
    if (st.phase !== "playing" && st.phase !== "finished") return;
    const scorer: number = st.score[0] > a ? 0 : st.score[1] > b ? 1 : -1;
    if (scorer < 0) return;
    const pid = st.seats[scorer];
    const name = (pid && players[pid]?.name) || st.players[scorer] || view.seatNames[scorer]!;
    const mine = seatRef.current === scorer;
    setFlash({ text: view.goal ? (mine ? T.duel.youGoal : T.duel.goalOf(name)) : mine ? T.duel.youScored : T.duel.pointOf(name), key: performance.now() });
  }, [st.score[0], st.score[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  // laço de desenho + controle
  useEffect(() => {
    const c = canvas.current;
    const box = wrap.current;
    const ctx = c?.getContext("2d");
    if (!c || !box || !ctx) return;
    const pts = new Float64Array(view.game.npoints * 2);
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();
    let geom = { w: 0, h: 0, scale: 1, cx: 0, cy: 0, dpr: 1 };

    const fit = () => {
      const r = box.getBoundingClientRect();
      const aspect = view.hw / view.hl;
      let h = r.height;
      let w = h * aspect;
      if (w > r.width) {
        w = r.width;
        h = w / aspect;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.width = `${Math.floor(w)}px`;
      c.style.height = `${Math.floor(h)}px`;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      geom = { w: c.width, h: c.height, scale: (c.width / 2 / view.hw) * 0.985, cx: c.width / 2, cy: c.height / 2, dpr };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);

    const flip = () => seatRef.current === 1;
    const px = (x: number, z: number): [number, number] => {
      const f = flip() ? -1 : 1;
      return [geom.cx + x * f * geom.scale, geom.cy + z * f * geom.scale];
    };
    const toTable = (clientX: number, clientY: number) => {
      const r = c.getBoundingClientRect();
      const f = flip() ? -1 : 1;
      const x = (((clientX - r.left) * geom.dpr - geom.cx) / geom.scale) * f;
      const z = (((clientY - r.top) * geom.dpr - geom.cy) / geom.scale) * f;
      return { x, z };
    };
    const setTarget = (x: number, z: number) => {
      const s = seatRef.current;
      if (s < 0) return;
      const t = view.game.def.clamp(s, x, z);
      net.target.x = t.x;
      net.target.z = t.z;
      net.hasTarget = true;
    };

    const onMove = (e: PointerEvent) => {
      if (seatRef.current < 0) return;
      const p = toTable(e.clientX, e.clientY);
      setTarget(p.x, p.z);
    };
    const onDown = (e: PointerEvent) => {
      if (seatRef.current < 0) return;
      c.setPointerCapture(e.pointerId);
      onMove(e);
      if (view.action) net.target.a = 1;
    };
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerdown", onDown);

    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const inGame = () => {
      const s = stRef.current;
      return seatRef.current >= 0 && (s.phase === "playing" || s.phase === "countdown");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!inGame() || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code in MOVE || BLOCKED.has(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code in MOVE) keys.add(e.code);
        if (e.code === "Space" && !e.repeat && view.action) net.target.a = 1;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    // mesa parada: disco/bola no lugar de saída e controles em casa (criados uma vez)
    const idle = [view.game.def.create(0), view.game.def.create(1)];

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stRef.current;
      const seat = seatRef.current;
      // teclado: anda o alvo na direção da tela (para cima = rumo ao outro lado)
      if (seat >= 0 && keys.size) {
        let dx = 0;
        let dz = 0;
        for (const k of keys) {
          const m = MOVE[k];
          if (m) {
            dx += m[0];
            dz += m[1];
          }
        }
        if (dx || dz) {
          const f = flip() ? -1 : 1;
          const len = Math.hypot(dx, dz);
          if (!net.hasTarget) {
            const home = view.game.def.home(seat);
            net.target.x = home.x;
            net.target.z = home.z;
          }
          setTarget(net.target.x + ((dx / len) * KEY_SPEED * dt) * f, net.target.z + ((dz / len) * KEY_SPEED * dt) * f);
        }
      }
      const mine = seat >= 0 && (s.phase === "playing" || s.phase === "countdown");
      if (mine) net.advance(now, s.phase === "playing");
      let live = mine ? net.predicted(pts) : net.sample(now, pts);
      if (!live || s.phase === "waiting") {
        view.game.points(idle[s.serve === 1 ? 1 : 0]!, pts);
        live = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, geom.w, geom.h);
      view.draw(ctx, {
        pts,
        live,
        sim: mine ? net.predictedSim() : (net.latest()?.sim ?? null),
        seat,
        px,
        scale: geom.scale,
        w: geom.w,
        h: geom.h,
        now,
        target: mine && net.hasTarget ? { x: net.target.x, z: net.target.z } : null,
        state: s,
        dpr: geom.dpr,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [net, view]);

  const playingHere = seat >= 0 && (st.phase === "playing" || st.phase === "countdown");
  return (
    <div ref={wrap} className="relative grid min-h-[220px] flex-1 place-items-center">
      <canvas
        ref={canvas}
        className={clsx("touch-none select-none rounded-xl", playingHere ? "cursor-none" : "cursor-default")}
        role="img"
        aria-label={T.duel.tableLabel(view.title.toLowerCase())}
        data-duel-canvas={id}
      />
      <AnimatePresence>
        {count && (
          <motion.span
            key={count}
            initial={{ opacity: 0, scale: 1.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="font-display pointer-events-none absolute text-6xl font-black text-offwhite drop-shadow-[0_4px_18px_rgb(0_17_42/0.9)]"
            aria-live="assertive"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none absolute top-[28%] rounded-full bg-space/90 px-4 py-1.5 text-sm font-semibold text-offwhite ring-1 ring-offwhite/15"
            role="status"
          >
            {flash.text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Footer<S>({ id, st, seat, view }: { id: string; st: DuelState; seat: number; view: DuelView<S> }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [st.phase, st.round]);
  let content: ReactNode;
  if (seat < 0) {
    content = (
      <p className="flex items-center gap-2 text-xs text-slate">
        <Eye className="size-3.5 shrink-0" />
        {st.phase === "playing" || st.phase === "countdown" ? T.duel.spectating : T.duel.spectatingHint}
      </p>
    );
  } else if (st.phase === "playing" || st.phase === "countdown") {
    content = confirm ? (
      <div className="flex w-full items-center gap-2">
        <span className="mr-auto text-xs text-offwhite/90">{T.duel.resignConfirm}</span>
        <Ghost onClick={() => setConfirm(false)}>{T.cancel}</Ghost>
        <button type="button" onClick={() => sendAct(id, "resign")} className="rounded-lg bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite transition-colors hover:bg-danger">
          {T.duel.resignYes}
        </button>
      </div>
    ) : (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate">{view.hint}</span>
        <Ghost onClick={() => setConfirm(true)}>
          <Flag className="size-3.5" />
          {T.duel.resign}
        </Ghost>
      </div>
    );
  } else {
    content = (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate">{T.duel.waitingStart}</span>
        <Ghost onClick={() => leaveDuel(id)}>
          <LogOut className="size-3.5" />
          {T.duel.stand}
        </Ghost>
      </div>
    );
  }
  return (
    <motion.div className="flex min-h-9 items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      {content}
    </motion.div>
  );
}

/** Fim de partida. Vitória é um momento especial: o gradiente oficial da marca aparece aqui. */
function EndBanner<S>({ id, st, view, seat }: { id: string; st: DuelState; view: DuelView<S>; seat: number }) {
  const players = useApp((s) => s.players);
  const winner = st.winner;
  const loser = winner === null ? null : winner === 0 ? 1 : 0;
  const nameOf = (s: number) => st.players[s] ?? (st.seats[s] ? players[st.seats[s]!]?.name : null) ?? view.seatNames[s]!;
  const iWon = seat >= 0 && winner === seat;
  const iLost = seat >= 0 && loser === seat;
  const celebrate = winner !== null && !iLost;
  const title = iWon ? T.duel.youWon : iLost ? T.duel.youLost : winner !== null ? T.duel.won(nameOf(winner)) : T.duel.finished;
  const score = winner !== null ? T.duel.scoreLine(st.score[winner]!, st.score[loser!]!) : "";
  const reason = st.reason === "left" && loser !== null ? T.duel.reasonLeft(nameOf(loser)) : st.reason === "resign" && loser !== null ? T.duel.reasonResign(nameOf(loser)) : score;
  const other: number = seat >= 0 ? (seat === 0 ? 1 : 0) : -1;
  const otherHere = other >= 0 && st.seats[other] !== null;
  const otherName = other >= 0 && st.seats[other] ? (players[st.seats[other]!]?.name ?? st.names[other] ?? "") : "";
  const iAsked = seat >= 0 && st.rematch[seat];
  const theyAsked = other >= 0 && st.rematch[other];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
      className={clsx("relative shrink-0 overflow-hidden rounded-2xl p-3.5", celebrate ? "text-offwhite shadow-[0_18px_50px_-20px_rgb(236_92_42/0.55)]" : "bg-card/80 ring-1 ring-offwhite/10")}
      style={celebrate ? { background: "linear-gradient(125deg, #EC5C2A 0%, #C14F2C 14%, #432932 32%, #071734 52%, #1B4C72 74%, #368BBA 88%, #46AFE3 100%)" } : undefined}
      aria-live="assertive"
      data-end-banner
    >
      {celebrate && <img src="/brand/sparkle-white.svg" alt="" aria-hidden className="pointer-events-none absolute -right-5 -top-6 size-28 opacity-[0.13]" />}
      <div className="relative flex items-center gap-3">
        {celebrate && <img src="/brand/sparkle-white.svg" alt="" aria-hidden className="size-8 shrink-0 drop-shadow-[0_0_12px_rgb(255_255_255/0.45)]" />}
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold uppercase leading-tight tracking-[0.06em]">{title}</h3>
          {reason && <p className={clsx("mt-0.5 text-[13px]", celebrate ? "text-offwhite/85" : "text-slate")}>{reason}</p>}
        </div>
      </div>
      {seat >= 0 && (
        <div className="relative mt-3 flex flex-wrap items-center justify-end gap-2">
          {otherHere && iAsked && <span className="mr-auto text-xs text-offwhite/85">{T.duel.rematchWaiting(otherName)}</span>}
          {otherHere && theyAsked && !iAsked && <span className="mr-auto text-xs font-medium text-offwhite">{T.duel.rematchOffer(otherName)}</span>}
          {!otherHere && <span className="mr-auto text-xs text-offwhite/80">{T.duel.waitingOpponent}</span>}
          <button
            type="button"
            onClick={() => leaveDuel(id)}
            className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors", celebrate ? "bg-space/35 text-offwhite ring-1 ring-offwhite/25 hover:bg-space/55" : "text-offwhite/90 ring-1 ring-offwhite/15 hover:bg-offwhite/8")}
          >
            <LogOut className="size-3.5" />
            {T.duel.stand}
          </button>
          {otherHere &&
            (iAsked ? (
              <button type="button" onClick={() => sendAct(id, "rematch", { on: false })} className="rounded-lg bg-space/35 px-3 py-2 text-xs font-medium text-offwhite ring-1 ring-offwhite/25 hover:bg-space/55">
                {T.duel.rematchCancel}
              </button>
            ) : (
              <button type="button" onClick={() => sendAct(id, "rematch", { on: true })} className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite shadow-[0_6px_18px_-6px_rgb(238_92_41/0.8)] transition-colors hover:bg-[#ff6d39]">
                {theyAsked ? T.duel.rematchAccept : T.duel.rematch}
              </button>
            ))}
        </div>
      )}
    </motion.section>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-offwhite/85 ring-1 ring-offwhite/12 transition-colors hover:bg-offwhite/8 hover:text-offwhite">
      {children}
    </button>
  );
}
