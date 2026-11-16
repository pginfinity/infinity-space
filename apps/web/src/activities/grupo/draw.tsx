import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Brush, Check, Eraser, Pencil, Play, RotateCcw, SkipForward, Trash2, Users } from "lucide-react";
import {
  DRAW_COLORS,
  DRAW_ERASER,
  DRAW_GUESS_MAX,
  DRAW_H,
  DRAW_KIND,
  DRAW_MIN_PLAYERS,
  DRAW_ROUNDS,
  DRAW_SECONDS,
  DRAW_SIZES,
  DRAW_W,
  grupoRank,
  type DrawChoices,
  type DrawState,
  type DrawWord,
} from "@infinity/world";
import { actState, sendAct, useAct, useActs, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../../state/store.ts";
import { useInteract } from "../../engine/interact.ts";
import { ChipDock, FloatChip, GamePanelShell, GhostButton, Podium, PrimaryButton, Scoreboard, Seconds, Segmented, TimeBar, closePanel, openPanel, playSfx, useGrupoUi, useLeft, usePanel, useSelfId, useSelfZone } from "./shared.tsx";
import { StrokePainter, applyDrawEvent, board, drawBoards, ensureSynced, localUndo, strokeEnd, strokeMove, strokeStart, useDrawLocal } from "./drawStore.ts";
import { DrawScene } from "./drawScene.tsx";
import { T } from "./strings.ts";

/**
 * Desenhe e adivinhe nos quadros brancos (um jogo por quadro). Entrada: chegar perto do quadro e
 * apertar E, ou o chip de convite para quem está na sala.
 */

function joinBoard(id: string): void {
  sendAct(id, "join");
  openPanel("draw", id);
  playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
}

function inGame(s: DrawState | undefined, me: string | null): boolean {
  return !!s && !!me && s.players.some((p) => p.id === me && !p.away);
}

export const drawClient: ActivityClient = {
  name: "grupo/desenho",
  kinds: [DRAW_KIND],
  targets: () => {
    const me = useApp.getState().selfId;
    const out: DynamicTarget[] = [];
    for (const b of drawBoards()) {
      const s = actState<DrawState>(b.id);
      if (!s) continue;
      const mine = inGame(s, me);
      out.push({
        key: b.id,
        point: b.front,
        radius: 2.2,
        priority: 1,
        label: mine ? T.draw.chipBack : s.phase === "idle" ? T.draw.action : T.draw.actionJoin,
        run: () => (mine ? openPanel("draw", b.id) : joinBoard(b.id)),
      });
    }
    return out;
  },
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    const mineEv = !!e.from && e.from === me;
    const s = actState<DrawState>(e.id);
    const playing = inGame(s, me);
    const at = drawBoards().find((b) => b.id === e.id)?.front;
    switch (e.ev) {
      case "begin":
      case "pts":
      case "undo":
      case "clear":
      case "canvas":
        applyDrawEvent(e.id, e.ev, e.data, mineEv);
        break;
      case "choices":
        useDrawLocal.setState({ choices: { ...(e.data as DrawChoices), id: e.id } });
        break;
      case "word":
        useDrawLocal.setState({ word: { ...(e.data as DrawWord), id: e.id }, choices: null });
        break;
      case "close":
        useDrawLocal.setState({ close: { id: e.id, text: (e.data as { text: string }).text, key: Date.now() } });
        playSfx("desenho-quase", true, undefined, { volume: 0.5 });
        break;
      case "turn": {
        const d = e.data as { drawer: string };
        if (d.drawer === me) {
          playSfx("desenho-vez", true, undefined, { volume: 0.6 });
          // Abre o painel de quem vai desenhar, se estiver fechado.
          if (useGrupoUi.getState().panel?.id !== e.id) openPanel("draw", e.id);
        }
        break;
      }
      case "correct":
        if (playing) playSfx(e.data && (e.data as { id: string }).id === me ? "grupo-acerto" : "desenho-acerto", true, at, { volume: 0.55 });
        break;
      case "turnEnd":
        if (playing) playSfx("grupo-revelar", true, at, { volume: 0.4 });
        break;
      case "final":
        useDrawLocal.setState((l) => ({ fxFinal: { ...l.fxFinal, [e.id]: (l.fxFinal[e.id] ?? 0) + 1 } }));
        playSfx("grupo-fanfarra", playing, at, { volume: 0.55 });
        break;
    }
  },
  Overlay: DrawOverlay,
  Scene: DrawScene,
};

// ---- camada de interface --------------------------------------------------------------------

function DrawOverlay() {
  const panel = usePanel("draw");
  const me = useSelfId();
  const zone = useSelfZone();
  // Assina só as atividades de desenho (re-renderiza quando alguma delas muda).
  useActs(useShallow((s) => drawBoards().map((b) => s.acts[b.id]?.state)));
  // Perto do quadro, o botão de interação (E) já oferece a mesma coisa: sem chip repetido.
  const atBoard = useInteract((s) => (s.target?.key.startsWith("dyn:desenho-") ? s.target.key.slice(4) : null));

  let chip: ReactNode = null;
  if (!panel) {
    for (const b of drawBoards()) {
      const s = actState<DrawState>(b.id);
      if (!s || s.phase === "idle" || atBoard === b.id) continue;
      if (inGame(s, me)) {
        chip = (
          <FloatChip key={`back-${b.id}`} onClick={() => openPanel("draw", b.id)} label={T.draw.chipBack}>
            <span className="grid size-7 place-items-center rounded-full bg-signal/15 text-signal">
              <Brush className="size-3.5" />
            </span>
            <span className="font-medium">{T.draw.chipBack}</span>
            {s.drawer === me && s.phase !== "turnEnd" && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}
          </FloatChip>
        );
        break;
      }
      if (zone === s.zone && s.phase !== "final") {
        chip = (
          <FloatChip key={`join-${b.id}`} onClick={() => joinBoard(b.id)} label={T.draw.actionJoin}>
            <span className="grid size-7 place-items-center rounded-full bg-orange text-offwhite">
              <Brush className="size-3.5" />
            </span>
            <span className="font-medium">{T.draw.chipJoin(s.zoneName)}</span>
            <span className="text-signal">· {T.draw.join}</span>
          </FloatChip>
        );
      }
    }
  }
  return (
    <>
      <AnimatePresence>{panel && <DrawPanel key={panel.id} id={panel.id} />}</AnimatePresence>
      <ChipDock>
        <AnimatePresence>{chip}</AnimatePresence>
      </ChipDock>
    </>
  );
}

// ---- painel ---------------------------------------------------------------------------------

function DrawPanel({ id }: { id: string }) {
  const s = useAct<DrawState>(id);
  const me = useSelfId();
  useEffect(() => ensureSynced(id), [id, s?.canvas, s?.phase]);
  if (!s) return null;
  const mine = inGame(s, me);
  const sub = (
    <>
      <span>{s.zoneName}</span>
      {s.phase !== "idle" && s.phase !== "lobby" && s.phase !== "final" && <span>· {T.draw.round(Math.min(s.round, s.rounds), s.rounds)}</span>}
      <span className="inline-flex items-center gap-1">
        · <Users className="size-3" aria-hidden /> {s.players.filter((p) => !p.away).length}
      </span>
    </>
  );
  return (
    <GamePanelShell title={T.draw.title} sub={sub} icon={<Brush className="size-4" />} wide onClose={closePanel}>
      {!mine && s.phase !== "idle" ? (
        <NotJoined id={id} s={s} />
      ) : s.phase === "idle" ? (
        <NotJoined id={id} s={s} />
      ) : s.phase === "lobby" ? (
        <Lobby id={id} s={s} me={me!} />
      ) : (
        <Game id={id} s={s} me={me!} />
      )}
    </GamePanelShell>
  );
}

function NotJoined({ id, s }: { id: string; s: DrawState }) {
  const zone = useSelfZone();
  const here = zone === s.zone;
  return (
    <div className="flex flex-col gap-3 sm:max-w-md">
      <p className="text-[13px] leading-snug text-offwhite/85">{T.draw.rules}</p>
      {here ? (
        <PrimaryButton onClick={() => joinBoard(id)} className="self-start">
          {T.draw.actionJoin}
        </PrimaryButton>
      ) : (
        <p className="text-xs text-slate">{T.draw.lobbyHint}</p>
      )}
      {s.players.length > 0 && <Scoreboard rows={s.players} me={null} limit={8} />}
    </div>
  );
}

function Lobby({ id, s, me }: { id: string; s: DrawState; me: string }) {
  const owner = s.owner === me;
  const n = s.players.filter((p) => !p.away).length;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-offwhite/85">{T.draw.rules}</p>
        <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-3 ring-1 ring-offwhite/8">
          <Segmented label={T.draw.rounds} value={s.rounds} options={DRAW_ROUNDS} disabled={!owner} onChange={(v) => sendAct(id, "config", { rounds: v })} />
          <Segmented label={T.draw.seconds} value={s.seconds} options={DRAW_SECONDS} disabled={!owner} onChange={(v) => sendAct(id, "config", { seconds: v })} format={(v) => `${v}s`} />
        </section>
        <p className="text-xs text-slate">{T.draw.lobbyHint}</p>
        <div className="flex items-center gap-2">
          <GhostButton
            onClick={() => {
              sendAct(id, "leave");
              closePanel();
            }}
          >
            {T.leave}
          </GhostButton>
          {owner && (
            <PrimaryButton className="ml-auto" onClick={() => sendAct(id, "start")} disabled={n < DRAW_MIN_PLAYERS}>
              <Play className="size-4" />
              {T.draw.start}
            </PrimaryButton>
          )}
        </div>
        {owner && n < DRAW_MIN_PLAYERS && <p className="-mt-1 text-right text-[11px] text-slate">{T.draw.needPlayers}</p>}
      </div>
      <PlayersList s={s} me={me} />
    </div>
  );
}

function PlayersList({ s, me }: { s: DrawState; me: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <span className="label-caps">{T.players(s.players.filter((p) => !p.away).length)}</span>
      <Scoreboard
        rows={s.players.map((p) => ({
          ...p,
          tag:
            s.phase === "final" || s.phase === "lobby" ? undefined : p.id === s.drawer ? (
              <Pencil className="size-3.5 shrink-0 text-signal" aria-label={T.draw.drawer} />
            ) : p.guessed ? (
              <Check className="size-3.5 shrink-0 text-ok" aria-label={T.draw.guessed} />
            ) : undefined,
        }))}
        me={me}
        showGain={s.phase === "turnEnd"}
      />
    </section>
  );
}

// ---- partida --------------------------------------------------------------------------------

function Game({ id, s, me }: { id: string; s: DrawState; me: string }) {
  const left = useLeft(s);
  const drawer = s.players.find((p) => p.id === s.drawer);
  const iDraw = s.drawer === me;
  const word = useDrawLocal((l) => (l.word && l.word.id === id && l.word.turn === s.turn ? l.word : null));

  if (s.phase === "final") return <Final id={id} s={s} me={me} />;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-h-9 items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {s.phase === "choosing" ? (
              <p className="truncate text-sm text-offwhite/85">{iDraw ? T.draw.youDraw : T.draw.choosing(drawer?.name ?? "")}</p>
            ) : s.phase === "turnEnd" ? (
              <p className="truncate text-sm">
                <span className="text-slate">{T.draw.wordWas} </span>
                <span className="font-display font-bold uppercase tracking-[0.08em] text-offwhite">{s.word}</span>
              </p>
            ) : iDraw && word ? (
              <p className="truncate text-sm" data-draw-word={word.word}>
                <span className="text-slate">{T.draw.drawThis} </span>
                <span className="font-display text-base font-bold uppercase tracking-[0.08em] text-orange">{word.word}</span>
                <span className="ml-2 text-[11px] text-slate">
                  {T.draw.level[word.level]} · {T.draw.mult[word.level]}
                </span>
              </p>
            ) : (
              <Hint s={s} />
            )}
          </div>
          {(s.phase === "drawing" || s.phase === "choosing") && <Seconds left={left} className="text-sm" />}
        </div>
        <TimeBar left={left} total={s.duration} />
        <CanvasArea id={id} s={s} iDraw={iDraw && s.phase === "drawing"} />
        {iDraw && s.phase === "drawing" && <Toolbar id={id} />}
      </div>
      <div className="flex min-h-0 flex-col gap-3">
        <PlayersList s={s} me={me} />
        <Feed id={id} s={s} me={me} />
      </div>
    </div>
  );
}

/** Dica para quem chuta: tracinhos com as letras reveladas. */
function Hint({ s }: { s: DrawState }) {
  const letters = [...s.hint].filter((c) => c !== " " && c !== "-").length;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-label={`${T.draw.hint(letters)}: ${s.hint.replace(/_/g, " _ ")}`}>
      <span className="font-display text-lg tracking-[0.32em] text-offwhite" aria-hidden>
        {s.hint}
      </span>
      <span className="text-[11px] text-slate">
        {T.draw.hint(letters)}
        {s.level ? ` · ${T.draw.level[s.level]}` : ""}
      </span>
    </p>
  );
}

/** Quadro de desenho: o canvas, as escolhas de palavra e os avisos por cima. */
function CanvasArea({ id, s, iDraw }: { id: string; s: DrawState; iDraw: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const choices = useDrawLocal((l) => (l.choices && l.choices.id === id && l.choices.turn === s.turn ? l.choices : null));
  const me = useSelfId();

  // Tamanho em pixels reais do aparelho, acompanhando a largura do painel.
  useEffect(() => {
    const c = ref.current;
    const w = wrap.current;
    if (!c || !w) return;
    const painter = new StrokePainter(c);
    let raf = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(w.clientWidth * dpr);
      const height = Math.round((width * DRAW_H) / DRAW_W);
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
        painter.paint(board(id), true);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(w);
    resize();
    const loop = () => {
      painter.paint(board(id));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      strokeEnd();
    };
  }, [id]);

  const toLogical = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * DRAW_W, y: ((e.clientY - r.top) / r.height) * DRAW_H };
  };
  const drawer = s.players.find((p) => p.id === s.drawer);
  const guessers = s.players.filter((p) => p.id !== s.drawer && !p.away);
  const gainers = guessers.filter((p) => p.guessed);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-xl bg-white ring-1 ring-offwhite/15" style={{ aspectRatio: `${DRAW_W} / ${DRAW_H}` }}>
      <canvas
        ref={ref}
        className={clsx("absolute inset-0 size-full touch-none", iDraw ? "cursor-crosshair" : "cursor-default")}
        aria-label={T.draw.canvasLabel}
        role="img"
        data-draw-canvas
        onPointerDown={(e) => {
          if (!iDraw || e.button !== 0) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const p = toLogical(e);
          strokeStart(id, p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!iDraw || !(e.buttons & 1)) return;
          // Eventos agrupados pelo navegador: usa todos para o traço sair liso.
          const list = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
          const r = ref.current!.getBoundingClientRect();
          for (const ev of list) strokeMove(((ev.clientX - r.left) / r.width) * DRAW_W, ((ev.clientY - r.top) / r.height) * DRAW_H);
        }}
        onPointerUp={strokeEnd}
        onPointerCancel={strokeEnd}
      />
      <AnimatePresence>
        {s.phase === "choosing" && (
          <motion.div key="choosing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.15 } }} className="absolute inset-0 grid place-items-center bg-space/90 p-4">
            {s.drawer === me && choices ? (
              <div className="flex w-full max-w-xl flex-col items-center gap-3">
                <p className="font-display text-sm font-bold uppercase tracking-[0.1em] text-offwhite">{T.draw.chooseTitle}</p>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                  {choices.options.map((o, i) => (
                    <motion.button
                      key={o.word}
                      type="button"
                      autoFocus={i === 0}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => sendAct(id, "choose", { i })}
                      className="flex flex-col items-center gap-1 rounded-xl bg-offwhite/[0.06] px-3 py-3 ring-1 ring-offwhite/15 transition-colors hover:bg-offwhite/[0.12] hover:ring-signal/60"
                      data-draw-choice={i}
                    >
                      <span className="text-base font-semibold capitalize">{o.word}</span>
                      <span className="text-[11px] text-slate">
                        {T.draw.level[o.level]} · {T.draw.mult[o.level]}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-offwhite/90">
                <Pencil className="size-4 animate-pulse text-signal" />
                {T.draw.choosing(drawer?.name ?? "")}
              </p>
            )}
          </motion.div>
        )}
        {s.phase === "turnEnd" && (
          <motion.div key="end" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-space/95 to-space/40 px-4 pb-4 pt-8 text-center">
            <p className="text-xs text-slate">{T.draw.wordWas}</p>
            <p className="font-display text-2xl font-black uppercase tracking-[0.08em] text-offwhite">{s.word}</p>
            <p className="text-xs text-offwhite/80">{gainers.length === 0 ? T.draw.nobody : gainers.map((p) => p.name).join(", ")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Ferramentas de quem desenha: cores, espessuras, desfazer, limpar, pular. */
function Toolbar({ id }: { id: string }) {
  const color = useDrawLocal((l) => l.color);
  const size = useDrawLocal((l) => l.size);
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={T.draw.tools}>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={T.draw.colorGroup}>
        {DRAW_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === i}
            aria-label={i === DRAW_ERASER ? T.draw.eraser : T.draw.color(T.draw.colorNames[i] ?? String(i + 1))}
            title={i === DRAW_ERASER ? T.draw.eraser : (T.draw.colorNames[i] ?? "")}
            onClick={() => useDrawLocal.setState({ color: i })}
            className={clsx("grid size-7 place-items-center rounded-full ring-2 transition-transform", color === i ? "scale-110 ring-offwhite" : "ring-transparent hover:scale-105")}
            style={{ background: i === DRAW_ERASER ? "transparent" : c }}
          >
            {i === DRAW_ERASER && <Eraser className="size-4 text-offwhite" />}
            {i !== DRAW_ERASER && <span className="size-full rounded-full ring-1 ring-inset ring-black/20" />}
          </button>
        ))}
      </div>
      <span className="h-6 w-px bg-offwhite/12" aria-hidden />
      <div className="flex gap-1" role="radiogroup" aria-label={T.draw.sizeGroup}>
        {DRAW_SIZES.map((w, i) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={size === i}
            aria-label={T.draw.size(i + 1)}
            onClick={() => useDrawLocal.setState({ size: i })}
            className={clsx("grid size-8 place-items-center rounded-lg ring-1 transition-colors", size === i ? "bg-offwhite/15 ring-offwhite/60" : "ring-offwhite/10 hover:bg-offwhite/8")}
          >
            <span className="rounded-full bg-offwhite" style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-1">
        <GhostButton onClick={() => localUndo(id)} label={T.draw.undo}>
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{T.draw.undo}</span>
        </GhostButton>
        <GhostButton onClick={() => sendAct(id, "clear")} label={T.draw.clear}>
          <Trash2 className="size-3.5" />
          <span className="hidden sm:inline">{T.draw.clear}</span>
        </GhostButton>
        <GhostButton onClick={() => sendAct(id, "skip")} label={T.draw.skip}>
          <SkipForward className="size-3.5" />
          <span className="hidden sm:inline">{T.draw.skip}</span>
        </GhostButton>
      </div>
    </div>
  );
}

/** Feed de chutes e o campo para chutar. */
function Feed({ id, s, me }: { id: string; s: DrawState; me: string }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const close = useDrawLocal((l) => (l.close && l.close.id === id ? l.close : null));
  const [showClose, setShowClose] = useState(false);
  const p = s.players.find((x) => x.id === me);
  const canGuess = s.phase === "drawing" && s.drawer !== me && !!p && !p.guessed;

  useEffect(() => {
    if (!close) return;
    setShowClose(true);
    const t = window.setTimeout(() => setShowClose(false), 2200);
    return () => window.clearTimeout(t);
  }, [close]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [s.feed.length, s.feed]);
  useEffect(() => {
    if (canGuess) input.current?.focus({ preventScroll: true });
  }, [canGuess, s.turn]);

  const submit = useCallback(() => {
    const t = text.trim().slice(0, DRAW_GUESS_MAX);
    if (!t) return;
    sendAct(id, "guess", { text: t });
    setText("");
  }, [id, text]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <ol ref={list} className="flex max-h-48 min-h-24 flex-col gap-0.5 overflow-y-auto rounded-xl bg-deep/60 p-2 text-[13px] ring-1 ring-offwhite/8 sm:max-h-56" aria-live="polite" aria-label={T.draw.feed}>
        {s.feed.map((f, i) => (
          <li key={`${s.game}-${i}-${f.name}-${f.text ?? ""}`} className={clsx("leading-snug", f.k === "correct" ? "font-medium text-ok" : f.k === "info" ? "text-slate" : "text-offwhite/85")}>
            {f.k === "correct" ? (
              T.draw.gotIt(f.name)
            ) : f.k === "info" ? (
              f.text === "entrou" ? T.draw.joined(f.name) : T.draw.left(f.name)
            ) : (
              <>
                <span className="font-medium text-offwhite">{f.name}:</span> {f.text}
              </>
            )}
          </li>
        ))}
      </ol>
      {s.phase === "drawing" && s.drawer !== me && (
        <>
          {p?.guessed ? (
            <p className="flex items-center gap-1.5 rounded-xl bg-ok/10 px-3 py-2 text-sm font-medium text-ok ring-1 ring-ok/30" role="status">
              <Check className="size-4" />
              {T.draw.youGot}
            </p>
          ) : (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={input}
                value={text}
                maxLength={DRAW_GUESS_MAX}
                onChange={(e) => setText(e.target.value)}
                placeholder={T.draw.guessPlaceholder}
                aria-label={T.draw.guessLabel}
                autoComplete="off"
                className={clsx("min-w-0 flex-1 rounded-xl border bg-deep px-3 py-2 text-sm placeholder:text-slate/70 focus:outline-none", showClose ? "border-warn" : "border-offwhite/10 focus:border-signal")}
              />
              <button type="submit" className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90">
                {T.draw.send}
              </button>
            </form>
          )}
          <AnimatePresence>
            {showClose && close && (
              <motion.p key={close.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-warn" role="status">
                “{close.text}”: {T.draw.close}
              </motion.p>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}

function Final({ id, s, me }: { id: string; s: DrawState; me: string }) {
  const ranked = grupoRank(s.players);
  const winner = ranked[0] && ranked[0].score > 0 ? ranked[0].name : null;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-3">
        <Podium rows={s.players} me={me} title={winner ? T.draw.winner(winner) : T.draw.final} />
        <div className="flex items-center justify-end gap-2">
          <GhostButton
            onClick={() => {
              sendAct(id, "leave");
              closePanel();
            }}
          >
            {T.leave}
          </GhostButton>
          <PrimaryButton onClick={() => sendAct(id, "again")}>{T.playAgain}</PrimaryButton>
        </div>
      </div>
      <PlayersList s={s} me={me} />
    </div>
  );
}
