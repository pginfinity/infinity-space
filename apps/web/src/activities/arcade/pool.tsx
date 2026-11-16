import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Eye, Flag, LoaderCircle, LogOut, X } from "lucide-react";
import { POOL, POOL_KIND, poolLeft, poolPockets, poolRack, poolSimulate, rtTableToWorld, type Lens, type MapObject, type PoolBalls, type PoolState, type Vec2 } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { sfx } from "../../audio/sfx.ts";
import { actState, sendAct, useAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { STATUS_COLOR } from "../../world/theme.ts";
import { requestDuelSeat, cancelDuelSeat, useDuelUi } from "./rt/ui.ts";
import { T as TT } from "./strings.ts";

/**
 * Sinuca: E na mesa abre o painel. Na sua vez, mire com o mouse (a linha mostra a primeira bola que a
 * branca vai tocar), segure para encher a força e solte. O servidor simula e devolve a tacada; todo
 * mundo anima a mesma conta, no painel e na mesa do mundo.
 */

const T = TT.pool;
const EASE = [0.16, 1, 0.3, 1] as const;

export const BALL_COLOR = ["#F2F0EF", "#F2B134", "#2B6FD9", "#E5484D", "#7B5CD6", "#EE5C29", "#2BC48A", "#8C2F39", "#14161C"];
const colorOf = (b: number) => BALL_COLOR[b === 0 ? 0 : b <= 8 ? b : b - 8]!;

/** Mesa vista pelo jogo: o lugar 0 fica no lado +z. */
const poolDef = { L: POOL.L, stand: POOL.STAND };

const usePoolUi = create<{ open: string | null }>(() => ({ open: null }));

// ---------------------------------------------------------------- animação das tacadas

interface Anim {
  shot: number;
  start: number;
  frames: Float32Array[];
  events: Array<{ t: number; kind: "clack" | "pocket" | "cue"; at: Vec2 }>;
  played: number;
  time: number;
}
const anims = new Map<string, Anim>();
/** Tacada que já estava feita quando esta janela viu a mesa pela primeira vez (essa não anima). */
const firstSeen = new Map<string, number>();

/** Prepara a animação da última tacada (refaz a simulação a partir de `before`). */
function animFor(id: string, st: PoolState): Anim | null {
  if (!firstSeen.has(id)) firstSeen.set(id, st.shot);
  const last = st.last;
  if (!last || st.shot <= firstSeen.get(id)!) return null;
  let a = anims.get(id);
  if (a && a.shot === st.shot) return a;
  const frames: Float32Array[] = [];
  const events: Anim["events"] = [{ t: 0, kind: "cue", at: { x: last.before[0]?.[0] ?? 0, z: last.before[0]?.[1] ?? 0 } }];
  let prevIn: Uint8Array | null = null;
  let touching = new Set<number>();
  const D = POOL.R * 2 * 1.04;
  poolSimulate(last.before, last.dir, last.power, (t, xs, zs, inside) => {
    const f = new Float32Array(48);
    for (let i = 0; i < 16; i++) {
      f[i * 3] = xs[i]!;
      f[i * 3 + 1] = zs[i]!;
      f[i * 3 + 2] = inside[i]!;
    }
    frames.push(f);
    if (prevIn) for (let i = 0; i < 16; i++) if (inside[i] && !prevIn[i]) events.push({ t, kind: "pocket", at: { x: xs[i]!, z: zs[i]! } });
    prevIn = inside.slice();
    const now = new Set<number>();
    for (let i = 0; i < 16; i++) {
      if (inside[i]) continue;
      for (let j = i + 1; j < 16; j++) {
        if (inside[j]) continue;
        const dx = xs[i]! - xs[j]!;
        const dz = zs[i]! - zs[j]!;
        if (dx * dx + dz * dz < D * D) {
          now.add(i * 16 + j);
          if (!touching.has(i * 16 + j) && events.length < 40) events.push({ t, kind: "clack", at: { x: xs[i]!, z: zs[i]! } });
        }
      }
    }
    touching = now;
  });
  a = { shot: st.shot, start: performance.now(), frames, events, played: 0, time: last.time };
  anims.set(id, a);
  return a;
}

/** Bolas na hora `now` (animando a tacada, ou paradas). `out[i*3..]` = x, z, encaçapada. Devolve se está animando. */
function ballsAt(id: string, st: PoolState, now: number, out: Float32Array, at?: Vec2): boolean {
  const a = animFor(id, st);
  if (a) {
    const t = (now - a.start) / 1000;
    const k = Math.floor(t * 60);
    if (k < a.frames.length) {
      out.set(a.frames[Math.max(0, k)]!);
      // sons do que já aconteceu (uma vez; quem toca é a mesa do mundo, que passa `at`)
      while (at && a.played < a.events.length && a.events[a.played]!.t <= t) playEvent(a.events[a.played++]!.kind, at);
      return true;
    }
  }
  writeBalls(st.balls, out);
  return false;
}

function writeBalls(balls: PoolBalls, out: Float32Array): void {
  for (let i = 0; i < 16; i++) {
    const p = balls[i];
    out[i * 3] = p?.[0] ?? 0;
    out[i * 3 + 1] = p?.[1] ?? 0;
    out[i * 3 + 2] = p ? 0 : 1;
  }
}

let lastClack = 0;
function playEvent(kind: "clack" | "pocket" | "cue", at: Vec2): void {
  const now = performance.now();
  if (kind === "clack") {
    if (now - lastClack < 40) return;
    lastClack = now;
    sfx("arcade-pool-clack", { at, range: 14, volume: 0.6 });
  } else if (kind === "pocket") sfx("arcade-pool-pocket", { at, range: 14, volume: 0.7 });
  else sfx("arcade-pool-cue", { at, range: 12, volume: 0.6 });
}

function tableOf(id: string): MapObject | undefined {
  return world().map.objects.find((o) => o.gameId === id && o.type === "pool");
}

// ---------------------------------------------------------------- cliente

let ends: DynamicTarget[] | null = null;
export const pool: ActivityClient = {
  name: "arcade/sinuca",
  kinds: [POOL_KIND],
  objects: ["pool"],
  label: () => T.play,
  use: (o) => {
    if (o.gameId) usePoolUi.setState({ open: o.gameId });
  },
  targets: () => {
    if (usePoolUi.getState().open) return [];
    if (!ends) {
      ends = [];
      for (const o of world().map.objects) {
        if (o.type !== "pool" || !o.gameId) continue;
        const id = o.gameId;
        for (const seat of [0, 1]) ends.push({ key: `${id}:${seat}`, point: rtTableToWorld(o, 0, (seat === 0 ? 1 : -1) * (POOL.L / 2 + POOL.STAND)), radius: 1.1, label: T.play, run: () => usePoolUi.setState({ open: id }) });
      }
    }
    return ends;
  },
  Overlay: PoolOverlay,
  Scene: PoolScene,
};

// ---------------------------------------------------------------- painel

function PoolOverlay() {
  const open = usePoolUi((s) => s.open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") usePoolUi.setState({ open: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>{open && <PoolPanel key={open} id={open} />}</AnimatePresence>
    </div>
  );
}

function PoolPanel({ id }: { id: string }) {
  const st = useAct<PoolState>(id);
  const selfId = useApp((s) => s.selfId);
  const seat = st && selfId ? st.seats.indexOf(selfId) : -1;
  return (
    <motion.aside
      role="dialog"
      aria-label={T.title}
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="glass pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex max-h-[calc(100dvh-72px)] flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-16 sm:h-[calc(100dvh-64px-84px)] sm:max-h-[860px] sm:w-[400px]"
      data-pool-panel={id}
    >
      <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
        <span className="mt-0.5 size-5 shrink-0 rounded-full ring-2 ring-offwhite/20" style={{ background: BALL_COLOR[8] }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold uppercase leading-tight tracking-[0.1em]">{T.title}</h2>
          {st && <Status st={st} seat={seat} />}
        </div>
        <button type="button" onClick={() => usePoolUi.setState({ open: null })} className="-mr-1.5 rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={TT.close} title={TT.close}>
          <X className="size-4" />
        </button>
      </header>
      {st ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3.5">
          <Seat id={id} st={st} seat={seat === 1 ? 0 : 1} me={seat} />
          <Felt id={id} st={st} seat={seat} />
          <Seat id={id} st={st} seat={seat === 1 ? 1 : 0} me={seat} />
          <Notice />
          <AnimatePresence mode="wait" initial={false}>
            {st.phase === "finished" ? <End key={`end-${st.round}`} id={id} st={st} seat={seat} /> : <Foot key="foot" id={id} st={st} seat={seat} />}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.aside>
  );
}

function Status({ st, seat }: { st: PoolState; seat: number }) {
  const players = useApp((s) => s.players);
  let text: ReactNode;
  if (st.phase === "playing") {
    const mine = seat >= 0 && st.turn === seat;
    const who = st.seats[st.turn] ? (players[st.seats[st.turn]!]?.name ?? st.names[st.turn]) : null;
    text = (
      <>
        <span className={clsx("inline-flex items-center gap-1.5", mine ? "font-medium text-signal" : "text-offwhite/80")}>
          <span className={clsx("size-1.5 rounded-full", mine ? "animate-pulse bg-signal" : "bg-offwhite/50")} />
          {mine ? T.yourTurn : T.turnOf(who ?? "")}
        </span>
        {st.last && <span className="text-slate">· {lastText(st, players)}</span>}
      </>
    );
  } else if (st.phase === "finished") text = <span className="text-offwhite/80">{TT.duel.finished}</span>;
  else text = <span className="text-slate">{st.seats.filter((s) => s === null).length === 1 ? TT.duel.waitingOne : TT.duel.waiting}</span>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" aria-live="polite">
      {text}
    </p>
  );
}

/** Resumo da última tacada (falta, bola encaçapada). */
function lastText(st: PoolState, players: Record<string, { name: string }>): string {
  const l = st.last!;
  const who = st.seats[l.by] ? (players[st.seats[l.by]!]?.name ?? st.names[l.by] ?? "") : (st.players[l.by] ?? "");
  if (l.foul) return T.foul[l.foul](who);
  const balls = l.pocketed.filter((b) => b !== 0);
  if (balls.length) return T.pocketed(who, balls);
  return T.nothing(who);
}

function Seat({ id, st, seat, me }: { id: string; st: PoolState; seat: number; me: number }) {
  const pid = st.seats[seat] ?? null;
  const player = useApp((s) => (pid ? s.players[pid] : undefined));
  const pending = useDuelUi((s) => s.pending);
  const walking = pending?.id === id && pending.seat === seat;
  const isMe = me === seat;
  const canSit = !pid && me < 0 && st.phase !== "playing";
  const name = pid ? (player?.name ?? st.names[seat] ?? "—") : st.phase === "finished" ? st.players[seat] : null;
  const group = st.groups[seat];
  const active = st.phase === "playing" && st.turn === seat;
  const free = st.seats.filter((s) => s === null).length;
  return (
    <div className={clsx("flex min-h-[46px] items-center gap-3 rounded-xl px-3 py-1.5 ring-1 transition-colors", active ? "bg-signal/10 ring-signal/45" : isMe ? "bg-offwhite/[0.06] ring-offwhite/14" : "bg-offwhite/[0.035] ring-offwhite/8")} data-seat={seat}>
      <GroupIcon group={group ?? null} />
      <div className="min-w-0 flex-1">
        {name ? (
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {pid && <span className="size-2 shrink-0 rounded-full" style={{ background: player ? STATUS_COLOR[player.status] : "#8A93A3" }} aria-hidden />}
            <span className="truncate">{name}</span>
            {isMe && <span className="shrink-0 text-xs font-normal text-slate">({TT.you})</span>}
          </p>
        ) : (
          <p className="text-sm text-slate">{TT.duel.emptySeat}</p>
        )}
        <p className="text-[11px] uppercase tracking-[0.12em] text-slate">{group ? T.groupLeft(T.group[group], poolLeft(st.balls, group)) : T.open}</p>
      </div>
      {canSit &&
        (walking ? (
          <button type="button" onClick={cancelDuelSeat} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-offwhite/80 ring-1 ring-offwhite/15 hover:bg-offwhite/8">
            <LoaderCircle className="size-3.5 animate-spin" />
            {TT.duel.walking}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const t = tableOf(id);
              if (t) requestDuelSeat(id, t, poolDef as never, seat);
            }}
            className={clsx("shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors", free === 1 ? "bg-orange text-offwhite hover:bg-orange/90" : "bg-offwhite/8 text-offwhite ring-1 ring-offwhite/15 hover:bg-signal hover:text-space hover:ring-signal")}
          >
            {T.sitSide(seat)}
          </button>
        ))}
      {active && <span className="shrink-0 rounded-full bg-signal/15 px-2.5 py-1 text-[11px] font-medium text-signal">{isMe ? T.yourTurn : T.turnShort}</span>}
    </div>
  );
}

function GroupIcon({ group }: { group: PoolState["groups"][number] }) {
  const c = group === "listradas" ? "#2B6FD9" : "#F2B134";
  return (
    <svg viewBox="0 0 20 20" className={clsx("size-5 shrink-0", !group && "opacity-45")} aria-hidden>
      {group === "listradas" ? (
        <>
          <circle cx="10" cy="10" r="9" fill="#F2F0EF" />
          <rect x="1" y="6" width="18" height="8" fill={c} />
        </>
      ) : (
        <circle cx="10" cy="10" r="9" fill={group ? c : "#8A93A3"} />
      )}
      <circle cx="10" cy="10" r="3.4" fill="#F2F0EF" />
    </svg>
  );
}

function Notice() {
  const notice = useDuelUi((s) => s.notice);
  if (!notice) return null;
  return <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{notice}</p>;
}

/** O feltro: canvas fora do React (60 fps), com a mira de quem está na vez. */
function Felt({ id, st, seat }: { id: string; st: PoolState; seat: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stRef = useRef(st);
  stRef.current = st;
  const seatRef = useRef(seat);
  seatRef.current = seat;

  useEffect(() => {
    const c = canvas.current;
    const box = wrap.current;
    const ctx = c?.getContext("2d");
    if (!c || !box || !ctx) return;
    const HW = POOL.HW + 0.09;
    const HL = POOL.HL + 0.09;
    let g = { w: 0, h: 0, k: 1, cx: 0, cy: 0, dpr: 1 };
    const fit = () => {
      const r = box.getBoundingClientRect();
      let h = r.height;
      let w = (h * HW) / HL;
      if (w > r.width) {
        w = r.width;
        h = (w * HL) / HW;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.width = `${Math.floor(w)}px`;
      c.style.height = `${Math.floor(h)}px`;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      g = { w: c.width, h: c.height, k: c.width / 2 / HW, cx: c.width / 2, cy: c.height / 2, dpr };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    const f = () => (seatRef.current === 1 ? -1 : 1);
    const px = (x: number, z: number): [number, number] => [g.cx + x * f() * g.k, g.cy + z * f() * g.k];
    const toTable = (cx: number, cy: number): Vec2 => {
      const r = c.getBoundingClientRect();
      return { x: (((cx - r.left) * g.dpr - g.cx) / g.k) * f(), z: (((cy - r.top) * g.dpr - g.cy) / g.k) * f() };
    };

    const balls = new Float32Array(48);
    let aimDir: Vec2 = { x: 0, z: -1 };
    let charging = false;
    let chargeAt = 0;
    let turn = 0;
    const power = () => {
      if (!charging) return 0;
      const k = ((performance.now() - chargeAt) / 1300) % 2;
      return 0.05 + 0.95 * (k < 1 ? k : 2 - k);
    };
    const myTurn = () => {
      const s = stRef.current;
      return s.phase === "playing" && seatRef.current >= 0 && s.turn === seatRef.current;
    };
    let animating = false;
    const shoot = () => {
      if (!charging) return;
      const p = power();
      charging = false;
      if (!myTurn() || animating) return;
      sendAct(id, "shoot", { dir: aimDir, power: p });
    };
    const onMove = (e: PointerEvent) => {
      if (!myTurn()) return;
      const p = toTable(e.clientX, e.clientY);
      const cue = stRef.current.balls[0];
      if (!cue) return;
      const dx = p.x - cue[0];
      const dz = p.z - cue[1];
      if (Math.hypot(dx, dz) > 0.02) aimDir = { x: dx / Math.hypot(dx, dz), z: dz / Math.hypot(dx, dz) };
    };
    const onDown = (e: PointerEvent) => {
      if (!myTurn() || animating || e.button !== 0) return;
      c.setPointerCapture(e.pointerId);
      onMove(e);
      charging = true;
      chargeAt = performance.now();
    };
    const onUp = () => shoot();
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn()) return;
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        turn = e.code === "ArrowLeft" ? -1 : 1;
      } else if (e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && !charging && !animating) {
          charging = true;
          chargeAt = performance.now();
        }
      } else if (["KeyE", "KeyF", "KeyQ", "KeyR", "ArrowUp", "ArrowDown"].includes(e.code)) e.stopImmediatePropagation();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") shoot();
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") turn = 0;
    };
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let last = performance.now();
    const pockets = poolPockets();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stRef.current;
      if (turn) {
        const a = Math.atan2(aimDir.x, aimDir.z) - turn * f() * dt * (charging ? 0.25 : 0.9);
        aimDir = { x: Math.sin(a), z: Math.cos(a) };
      }
      animating = ballsAt(id, s, now, balls);
      const { k, dpr } = g;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      // tabelas de madeira e feltro
      const [ax, ay] = px(-HW, -HL);
      const [bx, by] = px(HW, HL);
      ctx.fillStyle = "#5E3D27";
      ctx.beginPath();
      ctx.roundRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), 0.06 * k);
      ctx.fill();
      const [fx, fy] = px(-POOL.HW, -POOL.HL);
      const [gx, gy] = px(POOL.HW, POOL.HL);
      const felt = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, Math.max(g.w, g.h) * 0.7);
      felt.addColorStop(0, "#14457A");
      felt.addColorStop(1, "#0A2A52");
      ctx.fillStyle = felt;
      ctx.fillRect(Math.min(fx, gx), Math.min(fy, gy), Math.abs(gx - fx), Math.abs(gy - fy));
      // marcas: linha da cabeceira e diamantes
      ctx.strokeStyle = "rgba(242, 240, 239, 0.12)";
      ctx.lineWidth = Math.max(1, dpr);
      const [l0x, l0y] = px(-POOL.HW, POOL.HL / 2);
      const [l1x, l1y] = px(POOL.HW, POOL.HL / 2);
      ctx.beginPath();
      ctx.moveTo(l0x, l0y);
      ctx.lineTo(l1x, l1y);
      ctx.stroke();
      ctx.fillStyle = "#ECE6DF";
      // diamantes: três por meia tabela comprida, três em cada cabeceira
      for (const s of [-1, 1]) {
        for (const kz of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
          const [dx, dy] = px(s * (POOL.HW + 0.045), kz * POOL.HL);
          ctx.fillRect(dx - 1.5 * dpr, dy - 1.5 * dpr, 3 * dpr, 3 * dpr);
        }
        for (const kx of [-0.5, 0, 0.5]) {
          const [dx, dy] = px(kx * POOL.HW, s * (POOL.HL + 0.045));
          ctx.fillRect(dx - 1.5 * dpr, dy - 1.5 * dpr, 3 * dpr, 3 * dpr);
        }
      }
      // caçapas
      for (let i = 0; i < pockets.length; i++) {
        const [cx, cy] = px(pockets[i]!.x, pockets[i]!.z);
        ctx.fillStyle = "#020B18";
        ctx.beginPath();
        ctx.arc(cx, cy, (i < 4 ? POOL.POCKET_CORNER : POOL.POCKET_SIDE) * k, 0, Math.PI * 2);
        ctx.fill();
      }
      // mira (só na minha vez, com as bolas paradas)
      const cue = s.balls[0];
      if (myTurn() && !animating && cue) {
        drawAim(ctx, px, k, dpr, cue, aimDir, s.balls, charging ? power() : 0);
      }
      // bolas
      for (let i = 0; i < 16; i++) {
        if (balls[i * 3 + 2]) continue;
        const [x, y] = px(balls[i * 3]!, balls[i * 3 + 1]!);
        drawBall(ctx, i, x, y, POOL.R * k, dpr);
      }
      if (charging) {
        // barra de força ao lado
        const p = power();
        ctx.fillStyle = "rgba(2, 11, 24, 0.7)";
        ctx.fillRect(g.w - 14 * dpr, g.h * 0.2, 8 * dpr, g.h * 0.6);
        ctx.fillStyle = p > 0.85 ? "#EE5C29" : "#00B7FF";
        ctx.fillRect(g.w - 14 * dpr, g.h * 0.8 - g.h * 0.6 * p, 8 * dpr, g.h * 0.6 * p);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [id]);

  const mine = seat >= 0 && st.phase === "playing" && st.turn === seat;
  return (
    <div ref={wrap} className="relative grid min-h-[220px] flex-1 place-items-center">
      <canvas ref={canvas} className={clsx("touch-none select-none rounded-xl", mine ? "cursor-crosshair" : "cursor-default")} role="img" aria-label={T.tableLabel} data-pool-canvas={id} />
    </div>
  );
}

/** Linha da mira até a primeira bola (bola fantasma onde a branca encosta) e o taco recuando com a força. */
function drawAim(ctx: CanvasRenderingContext2D, px: (x: number, z: number) => [number, number], k: number, dpr: number, cue: [number, number], dir: Vec2, balls: PoolBalls, power: number): void {
  const R = POOL.R;
  let tHit = Infinity;
  let target = -1;
  for (let i = 1; i < 16; i++) {
    const b = balls[i];
    if (!b) continue;
    const ox = b[0] - cue[0];
    const oz = b[1] - cue[1];
    const along = ox * dir.x + oz * dir.z;
    if (along <= 0) continue;
    const perp2 = ox * ox + oz * oz - along * along;
    const r2 = 4 * R * R;
    if (perp2 > r2) continue;
    const t = along - Math.sqrt(r2 - perp2);
    if (t < tHit) {
      tHit = t;
      target = i;
    }
  }
  // sem bola no caminho: até a tabela
  if (target < 0) {
    const tx = dir.x > 0 ? (POOL.HW - R - cue[0]) / dir.x : dir.x < 0 ? (-POOL.HW + R - cue[0]) / dir.x : Infinity;
    const tz = dir.z > 0 ? (POOL.HL - R - cue[1]) / dir.z : dir.z < 0 ? (-POOL.HL + R - cue[1]) / dir.z : Infinity;
    tHit = Math.min(tx, tz);
  }
  const gx = cue[0] + dir.x * tHit;
  const gz = cue[1] + dir.z * tHit;
  const [sx, sy] = px(cue[0], cue[1]);
  const [ex, ey] = px(gx, gz);
  ctx.strokeStyle = "rgba(242, 240, 239, 0.55)";
  ctx.lineWidth = Math.max(1, 1.2 * dpr);
  ctx.setLineDash([5 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(242, 240, 239, 0.7)";
  ctx.beginPath();
  ctx.arc(ex, ey, R * k, 0, Math.PI * 2);
  ctx.stroke();
  if (target >= 0) {
    // para onde a bola alvo vai
    const b = balls[target]!;
    const nx = (b[0] - gx) / (2 * R);
    const nz = (b[1] - gz) / (2 * R);
    const [bx, by] = px(b[0], b[1]);
    const [tx2, ty2] = px(b[0] + nx * 0.22, b[1] + nz * 0.22);
    ctx.strokeStyle = "rgba(0, 183, 255, 0.8)";
    ctx.lineWidth = Math.max(1, 1.6 * dpr);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
  }
  // taco
  const back = 0.04 + power * 0.18;
  const [c0x, c0y] = px(cue[0] - dir.x * (R + back), cue[1] - dir.z * (R + back));
  const [c1x, c1y] = px(cue[0] - dir.x * (R + back + 0.9), cue[1] - dir.z * (R + back + 0.9));
  ctx.lineCap = "round";
  ctx.strokeStyle = "#D9B98C";
  ctx.lineWidth = 5 * dpr;
  ctx.beginPath();
  ctx.moveTo(c0x, c0y);
  ctx.lineTo(c1x, c1y);
  ctx.stroke();
  ctx.strokeStyle = "#00B7FF";
  ctx.lineWidth = 5 * dpr;
  ctx.beginPath();
  ctx.moveTo(c0x, c0y);
  ctx.lineTo(c0x + (c1x - c0x) * 0.02, c0y + (c1y - c0y) * 0.02);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawBall(ctx: CanvasRenderingContext2D, b: number, x: number, y: number, r: number, dpr: number): void {
  const stripe = b >= 9;
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.arc(x + 1.2 * dpr, y + 1.6 * dpr, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = stripe ? "#F2F0EF" : colorOf(b);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (stripe) {
    ctx.fillStyle = colorOf(b);
    ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (b > 0 && r > 5 * dpr) {
    ctx.fillStyle = "#F2F0EF";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14161C";
    ctx.font = `700 ${Math.round(r * 0.62)}px Geist, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b), x, y + r * 0.04);
  }
}

function Foot({ id, st, seat }: { id: string; st: PoolState; seat: number }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [st.phase, st.round]);
  let content: ReactNode;
  if (seat < 0)
    content = (
      <p className="flex items-center gap-2 text-xs text-slate">
        <Eye className="size-3.5 shrink-0" />
        {st.phase === "playing" ? TT.duel.spectating : TT.duel.spectatingHint}
      </p>
    );
  else if (st.phase === "playing")
    content = confirm ? (
      <div className="flex w-full items-center gap-2">
        <span className="mr-auto text-xs text-offwhite/90">{TT.duel.resignConfirm}</span>
        <Ghost onClick={() => setConfirm(false)}>{TT.cancel}</Ghost>
        <button type="button" onClick={() => sendAct(id, "resign")} className="rounded-lg bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger">
          {TT.duel.resignYes}
        </button>
      </div>
    ) : (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate">{T.hint}</span>
        <Ghost onClick={() => setConfirm(true)}>
          <Flag className="size-3.5" />
          {TT.duel.resign}
        </Ghost>
      </div>
    );
  else
    content = (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate">{TT.duel.waitingStart}</span>
        <Ghost onClick={() => sendAct(id, "stand")}>
          <LogOut className="size-3.5" />
          {TT.duel.stand}
        </Ghost>
      </div>
    );
  return <div className="flex min-h-9 items-center">{content}</div>;
}

function End({ id, st, seat }: { id: string; st: PoolState; seat: number }) {
  const players = useApp((s) => s.players);
  const w = st.winner;
  const l = w === null ? null : w === 0 ? 1 : 0;
  const nameOf = (s: number) => st.players[s] ?? (st.seats[s] ? players[st.seats[s]!]?.name : null) ?? "";
  const iWon = seat >= 0 && w === seat;
  const iLost = seat >= 0 && l === seat;
  const celebrate = w !== null && !iLost;
  const title = iWon ? TT.duel.youWon : iLost ? TT.duel.youLost : w !== null ? TT.duel.won(nameOf(w)) : TT.duel.finished;
  const reason = st.reason && w !== null && l !== null ? (T.reason[st.reason]?.(nameOf(w), nameOf(l)) ?? "") : "";
  const other: number = seat >= 0 ? (seat === 0 ? 1 : 0) : -1;
  const otherHere = other >= 0 && !!st.seats[other];
  const iAsked = seat >= 0 && st.rematch[seat];
  const theyAsked = other >= 0 && st.rematch[other];
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.2 }}
      className={clsx("relative shrink-0 overflow-hidden rounded-2xl p-3.5", celebrate ? "text-offwhite" : "bg-card/80 ring-1 ring-offwhite/10")}
      style={celebrate ? { background: "linear-gradient(125deg, #EC5C2A 0%, #C14F2C 14%, #432932 32%, #071734 52%, #1B4C72 74%, #368BBA 88%, #46AFE3 100%)" } : undefined}
      aria-live="assertive"
    >
      <div className="relative flex items-center gap-3">
        {celebrate && <img src="/brand/sparkle-white.svg" alt="" aria-hidden className="size-8 shrink-0" />}
        <div>
          <h3 className="font-display text-lg font-bold uppercase leading-tight tracking-[0.06em]">{title}</h3>
          {reason && <p className={clsx("mt-0.5 text-[13px]", celebrate ? "text-offwhite/85" : "text-slate")}>{reason}</p>}
        </div>
      </div>
      {seat >= 0 && (
        <div className="relative mt-3 flex flex-wrap items-center justify-end gap-2">
          {otherHere && theyAsked && !iAsked && <span className="mr-auto text-xs font-medium">{TT.duel.rematchOffer(nameOf(other))}</span>}
          <button type="button" onClick={() => sendAct(id, "stand")} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-offwhite/20 hover:bg-offwhite/10">
            <LogOut className="size-3.5" />
            {TT.duel.stand}
          </button>
          {otherHere && (
            <button type="button" onClick={() => sendAct(id, "rematch", { on: !iAsked })} className={clsx("rounded-lg px-4 py-2 text-xs font-semibold", iAsked ? "bg-space/35 ring-1 ring-offwhite/25" : "bg-orange text-offwhite hover:bg-[#ff6d39]")}>
              {iAsked ? TT.duel.rematchCancel : theyAsked ? TT.duel.rematchAccept : TT.duel.rematch}
            </button>
          )}
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

// ---------------------------------------------------------------- mesa no mundo

const FELT_Y = 0.8;

function PoolScene({ lens }: { lens: Lens }) {
  const tables = useMemo(() => world().map.objects.filter((o) => o.type === "pool" && o.gameId), []);
  return (
    <>
      {tables.map((t) => (
        <PoolTable key={t.id} table={t} lens={lens} />
      ))}
    </>
  );
}

function PoolTable({ table, lens }: { table: MapObject; lens: Lens }) {
  const id = table.gameId!;
  const built = useMemo(() => {
    const geo = new THREE.SphereGeometry(POOL.R, 14, 10);
    const band = new THREE.CylinderGeometry(POOL.R * 1.02, POOL.R * 1.02, POOL.R * 1.05, 14, 1, true);
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const bandMat = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const balls = new THREE.InstancedMesh(geo, mat, 16);
    const bands = new THREE.InstancedMesh(band, bandMat, 7);
    const c = new THREE.Color();
    for (let i = 0; i < 16; i++) balls.setColorAt(i, c.set(i >= 9 ? "#F2F0EF" : colorOf(i)));
    for (let i = 0; i < 7; i++) bands.setColorAt(i, c.set(colorOf(i + 9)));
    balls.frustumCulled = false;
    bands.frustumCulled = false;
    const root = new THREE.Group();
    root.name = `arcade:sinuca:${id}`;
    root.add(balls, bands);
    return { root, balls, bands, owned: [geo, band, mat, bandMat] };
  }, [id]);
  useEffect(() => () => built.owned.forEach((x) => x.dispose()), [built]);

  const buf = useMemo(() => new Float32Array(48), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const rot = useMemo(() => {
    const t = Math.PI - table.rot;
    return { c: Math.cos(t), s: Math.sin(t) };
  }, [table.rot]);
  useFrame(() => {
    const st = actState<PoolState>(id);
    if (st) ballsAt(id, st, performance.now(), buf, table.pos);
    else writeBalls(rack, buf);
    const big = lens === "2d" ? 1.5 : 1.1;
    let bi = 0;
    for (let i = 0; i < 16; i++) {
      const x = buf[i * 3]!;
      const z = buf[i * 3 + 1]!;
      const gone = buf[i * 3 + 2]! > 0;
      tmp.position.set(table.pos.x + x * rot.c + z * rot.s, FELT_Y + POOL.R * big, table.pos.z - x * rot.s + z * rot.c);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(gone ? 0 : big);
      tmp.updateMatrix();
      built.balls.setMatrixAt(i, tmp.matrix);
      if (i >= 9) {
        tmp.rotation.set(Math.PI / 2, 0, (i * 0.7) % Math.PI);
        tmp.updateMatrix();
        built.bands.setMatrixAt(bi++, tmp.matrix);
      }
    }
    built.balls.instanceMatrix.needsUpdate = true;
    built.bands.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={built.root} />;
}

const rack = poolRack();
