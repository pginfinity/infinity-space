import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { CAB_GAMES, CAB_ID, CAB_ORDER, cabFmt, cabGameOfVariant, type CabGameId, type CabState, type MapObject } from "@infinity/world";
import { useApp } from "../../../state/store.ts";
import { world } from "../../../world/world.ts";
import { sfx } from "../../../audio/sfx.ts";
import { actState, sendAct, useAct } from "../../registry.ts";
import { PX, SCREEN_H, SCREEN_W, pad, pixelText } from "./pixel.ts";
import { Faxina } from "./faxina.ts";
import { Cometa } from "./cometa.ts";
import { Estilhaco } from "./estilhaco.ts";
import { CAB_DT, NO_INPUT, type CabGame, type CabInput } from "./types.ts";
import { openBoard, openCabinet, useCabUi } from "./store.ts";
import { T } from "../strings.ts";

const EASE = [0.16, 1, 0.3, 1] as const;

export const GAME_COLOR: Record<CabGameId, string> = { faxina: PX.orange, cometa: PX.sky, estilhaco: PX.violet };

export function makeGame(id: CabGameId, seed: number): CabGame {
  if (id === "faxina") return new Faxina(seed);
  if (id === "cometa") return new Cometa(seed);
  return new Estilhaco(seed);
}

export function machineObj(id: string): MapObject | undefined {
  return world().map.objects.find((o) => o.id === id);
}

/** Painéis dos fliperamas: a máquina aberta e o placar de recordes. */
export function CabinetOverlay() {
  const open = useCabUi((s) => s.open);
  const board = useCabUi((s) => s.board);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>{open && <CabinetPanel key={open} machine={open} />}</AnimatePresence>
      <AnimatePresence>{board && <RecordsPanel />}</AnimatePresence>
    </div>
  );
}

type Mode = "attract" | "starting" | "playing" | "paused" | "over";

/** A máquina: tela de fliperama (canvas a 60 passos por segundo, fora do React) e a lateral com ranking. */
function CabinetPanel({ machine }: { machine: string }) {
  const obj = useMemo(() => machineObj(machine), [machine]);
  const game = cabGameOfVariant(obj?.variant);
  const info = CAB_GAMES[game];
  const st = useAct<CabState>(CAB_ID);
  const me = useApp((s) => (s.selfId ? s.players[s.selfId]?.name : undefined)) ?? useApp.getState().profile.name;
  const board = st?.boards[game] ?? [];
  const mine = board.find((e) => e.name.trim().toLowerCase() === me.trim().toLowerCase());
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("attract");
  const [scale, setScale] = useState(2);
  const ctl = useRef({ start: () => {}, pause: () => {}, close: () => {} });

  // maior escala inteira que cabe na tela (pixels nítidos)
  useEffect(() => {
    const fit = () => {
      const h = window.innerHeight - 64 - 100;
      const w = window.innerWidth - (window.innerWidth >= 900 ? 330 : 40);
      setScale(Math.max(1, Math.min(3, Math.floor(Math.min(h / SCREEN_H, w / SCREEN_W)))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    const keys = new Set<string>();
    const input: CabInput = { ...NO_INPUT };
    let edges = { fire: false, left: false, right: false };
    let m: Mode = "attract";
    let g: CabGame | null = null;
    let demo: CabGame = makeGame(game, 7);
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let startedAt = 0;
    let msg: { text: string; until: number } | null = null;
    let sentScore = false;

    const set = (next: Mode) => {
      m = next;
      setMode(next);
    };
    const start = () => {
      if (m === "starting" || m === "playing") return;
      useCabUi.setState({ run: null, result: null });
      sentScore = false;
      set("starting");
      startedAt = performance.now();
      sendAct(CAB_ID, "start", { machine });
      sfx("cab-start", { volume: 0.5 });
    };
    const pause = () => {
      if (m === "playing") set("paused");
      else if (m === "paused") set("playing");
    };
    const close = () => {
      if (m === "playing" || m === "paused" || m === "starting") sendAct(CAB_ID, "quit");
      openCabinet(null);
    };
    ctl.current = { start, pause, close };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // botões da lateral continuam funcionando com Enter
      if (t?.tagName === "BUTTON" && (e.code === "Enter" || e.code === "Space") && t.closest("[data-cab-side]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space"].includes(e.code)) return;
      keys.add(e.code);
      if (e.code === "Escape") {
        if (m === "playing") set("paused");
        else close();
        return;
      }
      if (e.code === "KeyP") return pause();
      if ((e.code === "Space" || e.code === "Enter") && (m === "attract" || m === "over")) return start();
      if (e.code === "Space" && !e.repeat) edges.fire = true;
      if ((e.code === "ArrowLeft" || e.code === "KeyA") && !e.repeat) edges.left = true;
      if ((e.code === "ArrowRight" || e.code === "KeyD") && !e.repeat) edges.right = true;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => {
      keys.clear();
      if (m === "playing") set("paused");
    };
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      input.mouseX = ((e.clientX - r.left) / r.width) * SCREEN_W;
    };
    const onLeave = () => (input.mouseX = null);
    const onDown = () => {
      if (m === "attract" || m === "over") start();
      else edges.fire = true;
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerleave", onLeave);
    c.addEventListener("pointerdown", onDown);

    const unsub = useCabUi.subscribe((s, prev) => {
      if (s.run && s.run !== prev.run && s.run.machine === machine && m === "starting") {
        g = makeGame(game, Math.floor(Math.random() * 1e9));
        acc = 0;
        set("playing");
      }
      if (s.busy && s.busy !== prev.busy && s.busy.machine === machine) {
        msg = { text: T.cab.busy(s.busy.name.toUpperCase()), until: performance.now() + 2500 };
        if (m === "starting") set("attract");
      }
      if (s.result && s.result !== prev.result) sfx(s.result.record ? "cab-record" : s.result.personalBest ? "cab-level" : "cab-over", { volume: 0.6 });
    });

    const play = (list: string[]) => {
      for (const name of new Set(list)) sfx(name, { volume: 0.45 });
      list.length = 0;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      input.left = keys.has("ArrowLeft") || keys.has("KeyA");
      input.right = keys.has("ArrowRight") || keys.has("KeyD");
      input.up = keys.has("ArrowUp") || keys.has("KeyW");
      input.down = keys.has("ArrowDown") || keys.has("KeyS");
      input.fire = keys.has("Space");
      if (m === "starting" && now - startedAt > 3000) {
        msg = { text: T.cab.noLink, until: now + 2500 };
        set("attract");
      }
      if (m === "playing" && g) {
        acc += dt;
        while (acc >= CAB_DT) {
          acc -= CAB_DT;
          input.firePressed = edges.fire;
          input.leftPressed = edges.left;
          input.rightPressed = edges.right;
          edges = { fire: false, left: false, right: false };
          g.step(input);
          if (g.over) break;
        }
        play(g.sounds);
        if (g.over && !sentScore) {
          sentScore = true;
          const run = useCabUi.getState().run;
          if (run) sendAct(CAB_ID, "score", { token: run.token, score: g.score });
          set("over");
        }
      } else if (m === "attract" || m === "starting") {
        // demonstração: o jogo se mexe sozinho atrás do título (sem som)
        acc += dt;
        while (acc >= CAB_DT) {
          acc -= CAB_DT;
          demo.step(demoInput(demo));
        }
        demo.sounds.length = 0;
        if (demo.over) demo = makeGame(game, Math.floor(now));
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (m === "attract" || m === "starting") {
        demo.draw(ctx, t);
        attract(ctx, t, game, m === "starting");
      } else if (g) {
        g.draw(ctx, t);
        if (m === "paused") {
          dim(ctx);
          pixelText(ctx, T.cab.paused, SCREEN_W / 2, 110, { color: PX.white, scale: 2, align: "center", shadow: PX.black });
          pixelText(ctx, T.cab.pausedHint, SCREEN_W / 2, 136, { color: PX.sky, align: "center" });
        } else if (m === "over") gameOver(ctx, t, g, useCabUi.getState().result);
      }
      if (msg && now < msg.until) {
        ctx.fillStyle = PX.black;
        ctx.fillRect(0, 226, SCREEN_W, 14);
        pixelText(ctx, msg.text, SCREEN_W / 2, 229, { color: PX.gold, align: "center" });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    frame.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerleave", onLeave);
      c.removeEventListener("pointerdown", onDown);
      if (m === "playing" || m === "paused" || m === "starting") sendAct(CAB_ID, "quit");
    };
  }, [game, machine]);

  return (
    <motion.div
      role="dialog"
      aria-label={info.name}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="pointer-events-auto absolute left-1/2 top-[calc(50%+6px)] flex max-h-[calc(100dvh-80px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 md:flex-row"
      data-cabinet={machine}
    >
      {/* gabinete: moldura escura com letreiro, como uma máquina de verdade */}
      <div ref={frame} tabIndex={-1} className="flex flex-col items-center rounded-[22px] bg-[#0b0f1a] p-3 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ring-1 ring-offwhite/10 outline-none">
        <div className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5" style={{ background: `linear-gradient(180deg, ${GAME_COLOR[game]}33, transparent)` }}>
          <span className="font-display text-sm font-bold uppercase tracking-[0.2em]" style={{ color: GAME_COLOR[game] }}>
            {info.name}
          </span>
        </div>
        <canvas
          ref={canvas}
          width={SCREEN_W}
          height={SCREEN_H}
          className="block rounded-md bg-deep"
          style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, imageRendering: "pixelated" }}
          role="img"
          aria-label={T.cab.screen(info.name)}
          data-cab-screen={game}
        />
      </div>

      <aside className="glass flex w-full flex-col gap-3 overflow-y-auto rounded-[var(--radius-panel)] p-4 text-offwhite md:w-[290px]" data-cab-side>
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.1em]">{info.name}</h2>
            <p className="mt-1 text-[13px] leading-snug text-slate">{info.pitch}</p>
          </div>
          <button type="button" onClick={() => ctl.current.close()} className="-mr-1.5 -mt-1 rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close} title={T.close}>
            <X className="size-4" />
          </button>
        </header>

        <section aria-label={T.cab.controls}>
          <p className="label-caps mb-1.5">{T.cab.controls}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            {(T.cab.keys[game] ?? []).map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded-md bg-offwhite/8 px-1.5 py-0.5 font-sans text-[11px] text-offwhite ring-1 ring-offwhite/12">{k}</kbd>
                </dt>
                <dd className="text-offwhite/80">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label={T.cab.ranking} className="min-h-0">
          <p className="label-caps mb-1.5">{T.cab.ranking}</p>
          <Ranking entries={board} me={me} />
          <p className="mt-2 text-xs text-slate">{mine ? T.cab.yourBest(cabFmt(mine.score)) : T.cab.noBest}</p>
        </section>

        <div className="mt-auto flex gap-2 pt-1">
          {mode === "playing" || mode === "paused" ? (
            <button type="button" onClick={() => ctl.current.pause()} className="flex-1 rounded-xl bg-offwhite/8 px-3 py-2.5 text-sm font-semibold ring-1 ring-offwhite/15 hover:bg-offwhite/12">
              {mode === "paused" ? T.cab.resume : T.cab.pause} <span className="text-xs font-normal text-slate">(P)</span>
            </button>
          ) : (
            <button type="button" onClick={() => ctl.current.start()} disabled={mode === "starting"} className="flex-1 rounded-xl bg-orange px-3 py-2.5 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-60">
              {mode === "over" ? T.cab.again : T.cab.start} <span className="text-xs font-normal text-offwhite/80">(Espaço)</span>
            </button>
          )}
          <button type="button" onClick={() => ctl.current.close()} className="rounded-xl px-3 py-2.5 text-sm text-slate ring-1 ring-offwhite/12 hover:bg-offwhite/8 hover:text-offwhite">
            {T.cab.leave}
          </button>
        </div>
      </aside>
    </motion.div>
  );
}

function Ranking({ entries, me }: { entries: CabState["boards"][CabGameId]; me: string }) {
  if (!entries.length) return <p className="text-[13px] text-slate">{T.cab.empty}</p>;
  return (
    <ol className="space-y-0.5 text-[13px] tabular-nums">
      {entries.map((e, i) => {
        const isMe = e.name.trim().toLowerCase() === me.trim().toLowerCase();
        return (
          <li key={`${e.name}-${e.at}`} className={clsx("flex items-center gap-2 rounded-md px-1.5 py-0.5", isMe && "bg-signal/12 text-signal")}>
            <span className={clsx("w-5 text-right text-xs", i === 0 ? "font-bold text-offwhite" : "text-slate")}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="font-semibold">{cabFmt(e.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Placar de recordes do Arcade: os três rankings. */
function RecordsPanel() {
  const st = useAct<CabState>(CAB_ID);
  const me = useApp((s) => (s.selfId ? s.players[s.selfId]?.name : undefined)) ?? "";
  const [tab, setTab] = useState<CabGameId>("faxina");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openBoard(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <motion.aside
      role="dialog"
      aria-label={T.cab.records}
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="glass pointer-events-auto absolute inset-x-2 bottom-2 flex flex-col gap-3 rounded-[var(--radius-panel)] p-4 text-offwhite sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-16 sm:w-[360px]"
    >
      <header className="flex items-center gap-2">
        <h2 className="font-display flex-1 text-[15px] font-bold uppercase tracking-[0.1em]">{T.cab.records}</h2>
        <button type="button" onClick={() => openBoard(false)} className="-mr-1.5 rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close} title={T.close}>
          <X className="size-4" />
        </button>
      </header>
      <div role="tablist" aria-label={T.cab.records} className="flex gap-1 rounded-xl bg-offwhite/[0.04] p-1">
        {CAB_ORDER.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={tab === g}
            onClick={() => setTab(g)}
            className={clsx("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", tab === g ? "bg-offwhite/12 text-offwhite" : "text-slate hover:text-offwhite")}
          >
            {CAB_GAMES[g].name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={CAB_GAMES[tab].name}>
        <Ranking entries={st?.boards[tab] ?? []} me={me} />
      </div>
    </motion.aside>
  );
}

// ---------------------------------------------------------------- telas desenhadas no canvas

function dim(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(2, 11, 24, 0.68)";
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

/** Tela de espera: título, recordes e o convite para jogar. */
function attract(ctx: CanvasRenderingContext2D, t: number, game: CabGameId, starting: boolean): void {
  dim(ctx);
  const st = actState<CabState>(CAB_ID);
  const info = CAB_GAMES[game];
  const color = GAME_COLOR[game];
  const words = info.name.toUpperCase().split(" ");
  words.forEach((w, i) => pixelText(ctx, w, SCREEN_W / 2, 34 + i * 22, { color, scale: 2, align: "center", shadow: PX.black }));
  const y0 = 34 + words.length * 22 + 14;
  pixelText(ctx, T.cab.attractTop, SCREEN_W / 2, y0, { color: PX.sky, align: "center" });
  const board = st?.boards[game] ?? [];
  if (!board.length) pixelText(ctx, T.cab.attractEmpty, SCREEN_W / 2, y0 + 16, { color: PX.slate, align: "center" });
  board.slice(0, 5).forEach((e, i) => {
    const y = y0 + 16 + i * 12;
    const c = i === 0 ? PX.gold : PX.white;
    pixelText(ctx, `${i + 1}`, 34, y, { color: c });
    pixelText(ctx, e.name.slice(0, 10), 50, y, { color: c });
    pixelText(ctx, pad(e.score), SCREEN_W - 34, y, { color: c, align: "right" });
  });
  if (Math.floor(t * 2) % 2 === 0 || starting) pixelText(ctx, starting ? T.cab.connecting : T.cab.pressStart, SCREEN_W / 2, 208, { color: PX.white, align: "center", shadow: PX.black });
}

function gameOver(ctx: CanvasRenderingContext2D, t: number, g: CabGame, result: ReturnType<typeof useCabUi.getState>["result"]): void {
  dim(ctx);
  pixelText(ctx, T.cab.over, SCREEN_W / 2, 70, { color: PX.white, scale: 2, align: "center", shadow: PX.black });
  pixelText(ctx, pad(g.score), SCREEN_W / 2, 100, { color: GAME_COLOR[g.id], scale: 2, align: "center", shadow: PX.black });
  let line = T.cab.sending;
  let color: string = PX.slate;
  if (result) {
    if (result.rejected) line = T.cab.recRejected;
    else if (result.record) {
      line = T.cab.rec1;
      color = Math.floor(t * 6) % 2 ? PX.gold : PX.white;
    } else if (result.rank) {
      line = T.cab.recRank(result.rank);
      color = PX.gold;
    } else if (result.personalBest) {
      line = T.cab.recPersonal;
      color = PX.sky;
    } else line = T.cab.recNone;
  }
  pixelText(ctx, line, SCREEN_W / 2, 132, { color, align: "center" });
  if (result?.rank && result.personalBest && !result.record) pixelText(ctx, T.cab.recPersonal, SCREEN_W / 2, 146, { color: PX.sky, align: "center" });
  if (Math.floor(t * 2) % 2 === 0) pixelText(ctx, T.cab.againHint, SCREEN_W / 2, 196, { color: PX.white, align: "center" });
}

/** Piloto automático da demonstração na tela de espera. */
function demoInput(g: CabGame): CabInput {
  const i: CabInput = { ...NO_INPUT };
  if (g instanceof Estilhaco) {
    const b = g.balls[0];
    i.mouseX = b ? b.x : SCREEN_W / 2;
    i.firePressed = !!b?.stuck;
  } else if (g instanceof Faxina) {
    const target = g.debris.reduce<{ x: number; y: number } | null>((best, d) => (!best || d.y > best.y ? d : best), null);
    if (target) {
      i.left = target.x < g.ship.x - 3;
      i.right = target.x > g.ship.x + 3;
    }
    i.fire = true;
  } else if (g instanceof Cometa) {
    // vira para não sair da grade nem bater
    const head = g.body[0]!;
    if (head.r >= 6 && g.dir === 1) i.rightPressed = true;
    if (head.r <= 1 && g.dir === 3) i.leftPressed = true;
  }
  return i;
}
