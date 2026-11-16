import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Ban, Check, Hand, Play, Plus, RotateCcw, Trophy, Users, X as XIcon } from "lucide-react";
import {
  STOP_CATEGORY_MAX,
  STOP_DEFAULT_CATEGORIES,
  STOP_ID,
  STOP_KIND,
  STOP_LETTERS,
  STOP_MAX_CATEGORIES,
  STOP_MIN_CATEGORIES,
  STOP_MIN_PLAYERS,
  STOP_ROUNDS,
  STOP_SECONDS,
  STOP_SUGGESTED_CATEGORIES,
  STOP_ZONE,
  grupoFold,
  grupoRank,
  stopFitsLetter,
  stopVoteKey,
  stopVotesNeeded,
  type MapObject,
  type StopState,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { useInteract } from "../../engine/interact.ts";
import { ChipDock, FloatChip, GamePanelShell, GhostButton, Podium, PrimaryButton, Scoreboard, Seconds, Segmented, TimeBar, closePanel, openPanel, playSfx, useLeft, usePanel, useSelfId, useSelfZone } from "./shared.tsx";
import { StopScene, stopBoardPos } from "./stopScene.tsx";
import { T } from "./strings.ts";

/**
 * Stop (Adedonha) no Café: entra pelo cavalete (E) ou pelo convite; letra sorteada, categorias,
 * STOP!, validação por voto e placar por rodada.
 */

const send = (op: string, data?: unknown) => sendAct(STOP_ID, op, data);
const useStop = () => useAct<StopState>(STOP_ID);

function joinStop(): void {
  send("join");
  openPanel("stop", STOP_ID);
  playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
}

function inStop(s: StopState | undefined, me: string | null): boolean {
  return !!s && !!me && s.players.some((p) => p.id === me && !p.away);
}

export const stopClient: ActivityClient = {
  name: "grupo/stop",
  kinds: [STOP_KIND],
  objects: ["stop-board"],
  label: () => {
    const s = actState<StopState>(STOP_ID);
    return inStop(s, useApp.getState().selfId) ? T.stop.chipBack : T.stop.action;
  },
  use: (_o: MapObject) => (inStop(actState<StopState>(STOP_ID), useApp.getState().selfId) ? openPanel("stop", STOP_ID) : joinStop()),
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    const mine = inStop(actState<StopState>(STOP_ID), me);
    const at = stopBoardPos();
    switch (e.ev) {
      case "spin":
        playSfx("stop-roleta", mine, at, { volume: 0.5 });
        break;
      case "go":
        playSfx("stop-largada", mine, at, { volume: 0.45 });
        break;
      case "stop":
        playSfx("stop-grito", mine, at, { volume: 0.6 });
        break;
      case "results":
        playSfx("grupo-revelar", mine, at, { volume: 0.4 });
        break;
      case "final":
        playSfx("grupo-fanfarra", mine, at, { volume: 0.55 });
        break;
    }
  },
  Overlay: StopOverlay,
  Scene: StopScene,
};

// ---- camada de interface --------------------------------------------------------------------

function StopOverlay() {
  const s = useStop();
  const panel = usePanel("stop");
  const me = useSelfId();
  const zone = useSelfZone();
  const atBoard = useInteract((i) => i.target?.object?.type === "stop-board");
  const mine = inStop(s, me);
  useDraftSync(s, me);

  let chip: ReactNode = null;
  if (!panel && s && s.phase !== "idle" && !atBoard) {
    if (mine)
      chip = (
        <FloatChip key="back" onClick={() => openPanel("stop", STOP_ID)} label={T.stop.chipBack}>
          <span className="grid size-7 place-items-center rounded-full bg-signal/15 font-display text-xs text-signal">{s.letter ?? "?"}</span>
          <span className="font-medium">{T.stop.chipBack}</span>
          {s.phase === "playing" && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}
        </FloatChip>
      );
    else if (zone === STOP_ZONE && s.phase !== "final")
      chip = (
        <FloatChip key="join" onClick={joinStop} label={T.stop.chipJoin}>
          <span className="grid size-7 place-items-center rounded-full bg-orange font-display text-xs text-offwhite">S</span>
          <span className="font-medium">{T.stop.chipJoin}</span>
          <span className="text-signal">· {T.stop.join}</span>
        </FloatChip>
      );
  }
  return (
    <>
      <AnimatePresence>{panel && <StopPanel key="stop-panel" />}</AnimatePresence>
      <ChipDock>
        <AnimatePresence>{chip}</AnimatePresence>
      </ChipDock>
    </>
  );
}

// ---- respostas (rascunho local, enviado aos poucos) -----------------------------------------

/** Rascunho da rodada atual: fica fora do painel para não perder nada ao fechar e reabrir. */
let draft: { key: string; answers: string[] } = { key: "", answers: [] };
let draftTimer = 0;

function draftKey(s: StopState): string {
  return `${s.game}:${s.round}:${s.letter}`;
}

function getDraft(s: StopState): string[] {
  const key = draftKey(s);
  if (draft.key !== key) draft = { key, answers: s.categories.map(() => "") };
  return draft.answers;
}

function setDraftAnswer(s: StopState, i: number, v: string): void {
  const a = getDraft(s);
  a[i] = v;
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => send("draft", { answers: a }), 500);
}

/** Quando a rodada para (STOP ou tempo), manda o rascunho final na hora. */
function useDraftSync(s: StopState | undefined, me: string | null) {
  const phase = s?.phase;
  useEffect(() => {
    if (!s || phase !== "stopping" || !inStop(s, me)) return;
    window.clearTimeout(draftTimer);
    send("draft", { answers: getDraft(s) });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---- painel ---------------------------------------------------------------------------------

function StopPanel() {
  const s = useStop();
  const me = useSelfId();
  if (!s) return null;
  const mine = inStop(s, me);
  const sub = (
    <>
      <span>{T.stop.sub}</span>
      {s.phase !== "idle" && s.phase !== "lobby" && s.phase !== "final" && <span>· {T.stop.round(s.round, s.rounds)}</span>}
      {s.phase !== "idle" && (
        <span className="inline-flex items-center gap-1">
          · <Users className="size-3" aria-hidden /> {s.players.filter((p) => !p.away).length}
        </span>
      )}
    </>
  );
  return (
    <GamePanelShell title={T.stop.title} sub={sub} icon={<span className="font-display text-sm">S</span>} medium onClose={closePanel}>
      {!mine ? <Outside s={s} /> : s.phase === "lobby" ? <Lobby s={s} me={me!} /> : s.phase === "spin" ? <Spin s={s} /> : s.phase === "playing" || s.phase === "stopping" ? <Playing s={s} me={me!} /> : s.phase === "review" ? <Review s={s} me={me!} /> : s.phase === "results" ? <Results s={s} me={me!} /> : s.phase === "final" ? <Final s={s} me={me!} /> : null}
    </GamePanelShell>
  );
}

function Outside({ s }: { s: StopState }) {
  const zone = useSelfZone();
  return (
    <>
      <p className="text-[13px] leading-snug text-offwhite/85">{T.stop.rules}</p>
      {zone === STOP_ZONE ? (
        s.phase !== "final" && (
          <PrimaryButton onClick={joinStop} className="self-start">
            {T.stop.action}
          </PrimaryButton>
        )
      ) : (
        <p className="text-xs text-slate">{T.stop.lobbyHint}</p>
      )}
      {s.players.length > 0 && <Scoreboard rows={s.players} me={null} />}
    </>
  );
}

function Lobby({ s, me }: { s: StopState; me: string }) {
  const owner = s.owner === me;
  const n = s.players.filter((p) => !p.away).length;
  return (
    <>
      <p className="text-[13px] leading-snug text-offwhite/85">{T.stop.rules}</p>
      <Categories s={s} editable={owner} />
      <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-3 ring-1 ring-offwhite/8">
        <Segmented label={T.stop.seconds} value={s.seconds} options={STOP_SECONDS} disabled={!owner} onChange={(v) => send("config", { seconds: v })} format={(v) => `${v}s`} />
        <Segmented label={T.stop.rounds} value={s.rounds} options={STOP_ROUNDS} disabled={!owner} onChange={(v) => send("config", { rounds: v })} />
      </section>
      <section className="flex flex-col gap-1.5">
        <span className="label-caps">{T.players(n)}</span>
        <ul className="flex flex-wrap gap-1.5">
          {s.players
            .filter((p) => !p.away)
            .map((p) => (
              <li key={p.id} className={clsx("rounded-full px-2.5 py-1 text-xs ring-1", p.id === me ? "bg-signal/15 ring-signal/40" : "bg-offwhite/[0.06] ring-offwhite/10")}>
                {p.name}
              </li>
            ))}
        </ul>
        <p className="text-xs text-slate">{T.stop.lobbyHint}</p>
      </section>
      <div className="flex items-center gap-2">
        <GhostButton
          onClick={() => {
            send("leave");
            closePanel();
          }}
        >
          {T.leave}
        </GhostButton>
        {owner && (
          <PrimaryButton className="ml-auto" onClick={() => send("start")} disabled={n < STOP_MIN_PLAYERS}>
            <Play className="size-4" />
            {T.stop.start}
          </PrimaryButton>
        )}
      </div>
      {owner && n < STOP_MIN_PLAYERS && <p className="-mt-1 text-right text-[11px] text-slate">{T.stop.needPlayers}</p>}
    </>
  );
}

/** Categorias da partida: quem abriu a mesa tira, adiciona (sugestões ou nova) e volta ao padrão. */
function Categories({ s, editable }: { s: StopState; editable: boolean }) {
  const [custom, setCustom] = useState("");
  const set = (cats: string[]) => send("config", { categories: cats });
  const suggestions = [...STOP_DEFAULT_CATEGORIES, ...STOP_SUGGESTED_CATEGORIES].filter((c) => !s.categories.some((x) => grupoFold(x) === grupoFold(c)));
  const full = s.categories.length >= STOP_MAX_CATEGORIES;
  return (
    <section className="flex flex-col gap-1.5" aria-label={T.stop.categories}>
      <div className="flex items-center justify-between">
        <span className="label-caps">
          {T.stop.categories} · {s.categories.length}
        </span>
        {editable && (
          <button type="button" onClick={() => set([...STOP_DEFAULT_CATEGORIES])} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
            <RotateCcw className="size-3" />
            {T.stop.resetCategories}
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {s.categories.map((c) => (
          <li key={c} className="inline-flex items-center gap-1 rounded-full bg-offwhite/[0.07] py-1 pl-2.5 pr-1.5 text-xs ring-1 ring-offwhite/12">
            {c}
            {editable && s.categories.length > STOP_MIN_CATEGORIES && (
              <button type="button" onClick={() => set(s.categories.filter((x) => x !== c))} aria-label={T.stop.removeCategory(c)} className="grid size-4 place-items-center rounded-full text-slate hover:bg-offwhite/15 hover:text-offwhite">
                <XIcon className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && !full && (
        <div className="flex flex-col gap-1.5">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 10).map((c) => (
                <button key={c} type="button" onClick={() => set([...s.categories, c])} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] text-slate ring-1 ring-dashed ring-offwhite/15 hover:text-offwhite hover:ring-offwhite/35">
                  <Plus className="size-3" />
                  {c}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const t = custom.trim();
              if (t.length < 2) return;
              set([...s.categories, t]);
              setCustom("");
            }}
          >
            <input
              value={custom}
              maxLength={STOP_CATEGORY_MAX}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={T.stop.customCategory}
              aria-label={T.stop.customCategory}
              className="min-w-0 flex-1 rounded-lg border border-offwhite/10 bg-deep px-2.5 py-1.5 text-sm placeholder:text-slate/70 focus:border-signal focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-offwhite/10 px-3 py-1.5 text-xs font-medium ring-1 ring-offwhite/15 hover:bg-offwhite/15">
              {T.stop.addCategory}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

// ---- roleta ---------------------------------------------------------------------------------

function Spin({ s }: { s: StopState }) {
  const left = useLeft(s);
  const [shown, setShown] = useState("?");
  useEffect(() => {
    let alive = true;
    let delay = 50;
    let t = 0;
    const tick = () => {
      if (!alive) return;
      const remaining = Math.max(0, s.left - (performance.now() - start));
      if (remaining < 350) {
        setShown(s.letter ?? "?");
        return;
      }
      setShown(STOP_LETTERS[Math.floor(Math.random() * STOP_LETTERS.length)]!);
      delay *= 1.12;
      t = window.setTimeout(tick, delay);
    };
    const start = performance.now();
    tick();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [s.letter, s.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = left < 350;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <span className="label-caps">{done ? T.stop.letter : T.stop.drawing}</span>
      <motion.div
        key={done ? "done" : "spin"}
        initial={done ? { scale: 1.25, rotate: -6 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 14 }}
        className={clsx("grid size-28 place-items-center rounded-3xl font-display text-6xl font-black ring-2", done ? "bg-orange text-offwhite ring-orange" : "bg-offwhite/[0.06] text-offwhite ring-offwhite/15")}
        aria-live="polite"
        aria-label={done ? `${T.stop.letter} ${s.letter}` : T.stop.drawing}
        data-stop-letter={done ? s.letter : undefined}
      >
        {shown}
      </motion.div>
      <p className="text-xs text-slate">{T.stop.round(s.round, s.rounds)}</p>
    </div>
  );
}

// ---- rodada ---------------------------------------------------------------------------------

function Playing({ s, me }: { s: StopState; me: string }) {
  const left = useLeft(s);
  const letter = s.letter ?? "";
  const [, force] = useState(0);
  const answers = getDraft(s);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const stopBtn = useRef<HTMLButtonElement>(null);
  const stopping = s.phase === "stopping";
  const filled = answers.filter((a) => a.trim().length > 0).length;
  const all = filled === s.categories.length;

  useEffect(() => {
    if (s.phase === "playing") inputs.current[answers.findIndex((a) => !a.trim())]?.focus({ preventScroll: true });
  }, [s.phase, s.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = s.players.filter((p) => p.id !== me && !p.away);
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-offwhite font-display text-3xl font-black text-space" aria-label={`${T.stop.letter} ${letter}`}>
          {letter}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate">{T.stop.filled(filled, s.categories.length)}</span>
            {!stopping && <Seconds left={left} className="text-sm" />}
          </div>
          <TimeBar left={stopping ? 0 : left} total={s.duration} className="mt-1.5" />
          {others.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Progresso">
              {others.map((p) => (
                <li key={p.id} className="rounded-full bg-offwhite/[0.05] px-2 py-0.5 text-[11px] text-offwhite/75 ring-1 ring-offwhite/8">
                  {p.name} <span className="tabular-nums text-slate">{T.stop.filled(p.filled, s.categories.length)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <form
        className="relative grid grid-cols-1 gap-1.5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {s.categories.map((c, i) => {
          const v = answers[i] ?? "";
          const bad = v.trim().length > 0 && !stopFitsLetter(v, letter);
          return (
            <label key={c} className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate">{c}</span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={v}
                disabled={stopping}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setDraftAnswer(s, i, e.target.value);
                  force((n) => n + 1);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const next = inputs.current[i + 1];
                  if (next) next.focus();
                  else stopBtn.current?.focus();
                }}
                aria-invalid={bad}
                aria-describedby={bad ? `stop-bad-${i}` : undefined}
                placeholder={`${letter}…`}
                data-stop-input={i}
                className={clsx("rounded-lg border bg-deep px-2.5 py-1.5 text-sm placeholder:text-slate/50 focus:outline-none disabled:opacity-60", bad ? "border-warn focus:border-warn" : "border-offwhite/10 focus:border-signal")}
              />
              {bad && (
                <span id={`stop-bad-${i}`} className="text-[10px] text-warn">
                  {T.stop.notLetter(letter)}
                </span>
              )}
            </label>
          );
        })}
        <AnimatePresence>
          {stopping && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center rounded-xl bg-space/80 backdrop-blur-[2px]" role="status">
              <div className="flex flex-col items-center gap-1 text-center">
                <motion.span initial={{ rotate: -8, scale: 1.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 12 }} className="font-display text-4xl font-black text-orange">
                  {T.stop.stop}
                </motion.span>
                <span className="text-sm text-offwhite/90">{s.stoppedBy ? T.stop.stopped(s.stoppedBy) : T.stop.timeUp}</span>
                <span className="text-xs text-slate">{T.stop.collecting}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
      {!stopping && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate">{all ? "" : T.stop.stopHint}</span>
          <button
            ref={stopBtn}
            type="button"
            disabled={!all}
            onClick={() => {
              window.clearTimeout(draftTimer);
              send("stop", { answers });
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-orange px-6 py-3 font-display text-lg font-black tracking-[0.08em] text-offwhite shadow-[0_10px_28px_-10px_rgb(238_92_41/0.9)] transition-[filter,opacity,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            <Hand className="size-5" />
            {T.stop.stop}
          </button>
        </div>
      )}
    </>
  );
}

// ---- validação ------------------------------------------------------------------------------

function Review({ s, me }: { s: StopState; me: string }) {
  const left = useLeft(s);
  const letter = s.letter ?? "";
  const ids = s.players.filter((p) => s.answers?.[p.id]).map((p) => p.id);
  const need = stopVotesNeeded(ids.length);
  const meP = s.players.find((p) => p.id === me);
  const ready = s.players.filter((p) => !p.away && p.ready).length;
  const total = s.players.filter((p) => !p.away).length;
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-offwhite/[0.08] font-display text-2xl font-black">{letter}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold uppercase tracking-[0.08em]">{T.stop.review}</span>
            <Seconds left={left} className="text-sm" />
          </div>
          <p className="text-[11px] leading-snug text-slate">{T.stop.reviewHint}</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {s.categories.map((c, ci) => (
          <li key={c} className="rounded-xl bg-offwhite/[0.03] p-2.5 ring-1 ring-offwhite/8">
            <p className="label-caps mb-1.5">{c}</p>
            <ul className="flex flex-col gap-1">
              {ids.map((pid) => {
                const p = s.players.find((x) => x.id === pid)!;
                const a = s.answers![pid]![ci] ?? "";
                const fits = stopFitsLetter(a, letter);
                const voters = s.votes[stopVoteKey(pid, ci)] ?? [];
                const annulled = fits && voters.length >= need;
                const iVoted = voters.includes(me);
                const own = pid === me;
                return (
                  <li key={pid} className="flex items-center gap-2 text-sm" data-stop-answer={`${p.name}:${ci}`}>
                    <span className={clsx("w-20 shrink-0 truncate text-xs", own ? "text-signal" : "text-slate")}>{p.name}</span>
                    <span className={clsx("min-w-0 flex-1 truncate", !a ? "text-slate" : !fits || annulled ? "text-slate line-through decoration-danger/70" : "text-offwhite")}>{a || T.stop.empty}</span>
                    {a && !fits && <span className="shrink-0 text-[10px] text-danger/90">{T.stop.invalid}</span>}
                    {fits && (annulled || voters.length > 0) && (
                      <span className={clsx("shrink-0 text-[10px] tabular-nums", annulled ? "text-danger" : "text-slate")}>{annulled ? T.stop.annulled : T.stop.votes(voters.length, need)}</span>
                    )}
                    {fits && !own && (
                      <button
                        type="button"
                        aria-pressed={iVoted}
                        aria-label={`${T.stop.annul}: ${a} (${p.name})`}
                        onClick={() => send("vote", { player: pid, cat: ci, on: !iVoted })}
                        className={clsx("grid size-7 shrink-0 place-items-center rounded-lg ring-1 transition-colors", iVoted ? "bg-danger/20 text-danger ring-danger/50" : "text-slate ring-offwhite/12 hover:bg-offwhite/8 hover:text-offwhite")}
                        title={T.stop.annul}
                      >
                        <Ban className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate" aria-live="polite">
          {T.stop.readyCount(ready, total)}
        </span>
        {meP?.ready ? (
          <GhostButton className="ml-auto" onClick={() => send("ready", { on: false })} pressed>
            <Check className="size-3.5" />
            {T.stop.readyWait}
          </GhostButton>
        ) : (
          <PrimaryButton className="ml-auto" onClick={() => send("ready", { on: true })}>
            <Check className="size-4" />
            {T.stop.ready}
          </PrimaryButton>
        )}
      </div>
    </>
  );
}

// ---- resultado ------------------------------------------------------------------------------

function Results({ s, me }: { s: StopState; me: string }) {
  const ranked = useMemo(() => [...s.players].filter((p) => s.points?.[p.id]).sort((a, b) => b.gain - a.gain), [s.players, s.points]);
  const last = s.round >= s.rounds;
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-bold uppercase tracking-[0.08em]">{T.stop.results}</span>
        <span className="text-[11px] text-slate">{T.stop.legend}</span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-space/95 py-1.5 pr-2 text-left text-[11px] font-medium text-slate">{s.letter}</th>
              {ranked.map((p) => (
                <th key={p.id} scope="col" className={clsx("px-2 py-1.5 text-left text-xs font-semibold", p.id === me ? "text-signal" : "text-offwhite")}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.categories.map((c, ci) => (
              <tr key={c}>
                <th scope="row" className="sticky left-0 z-10 max-w-28 truncate border-t border-offwhite/6 bg-space/95 py-1.5 pr-2 text-left text-[11px] font-normal text-slate">
                  {c}
                </th>
                {ranked.map((p) => {
                  const pts = s.points?.[p.id]?.[ci] ?? 0;
                  const a = s.answers?.[p.id]?.[ci] ?? "";
                  return (
                    <td key={p.id} className="border-t border-offwhite/6 px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={clsx("max-w-28 truncate text-xs", pts === 0 ? "text-slate line-through decoration-slate/50" : "text-offwhite/90")}>{a || T.stop.empty}</span>
                        <span className={clsx("ml-auto rounded-md px-1.5 py-0.5 font-display text-[10px] tabular-nums", pts === 10 ? "bg-ok/15 text-ok" : pts === 5 ? "bg-sky/15 text-sky" : "text-slate/70")}>{pts}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-t border-offwhite/15 bg-space/95 py-1.5 pr-2 text-left text-[11px] font-medium text-offwhite">
                {T.stop.roundPts}
              </th>
              {ranked.map((p) => (
                <td key={p.id} className="border-t border-offwhite/15 px-2 py-1.5 font-display text-sm tabular-nums text-ok">
                  +{p.gain}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-space/95 py-1 pr-2 text-left text-[11px] font-medium text-offwhite">
                {T.stop.total}
              </th>
              {ranked.map((p) => (
                <td key={p.id} className="px-2 py-1 font-display text-sm tabular-nums">
                  {p.score}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <PrimaryButton onClick={() => send("next")}>
          {last ? <Trophy className="size-4" /> : <Play className="size-4" />}
          {last ? T.stop.toFinal : T.stop.nextRound}
        </PrimaryButton>
      </div>
    </>
  );
}

function Final({ s, me }: { s: StopState; me: string }) {
  const top = grupoRank(s.players)[0];
  return (
    <>
      <Podium rows={s.players} me={me} title={top && top.score > 0 ? T.stop.winner(top.name) : T.stop.final} />
      <Scoreboard rows={s.players} me={me} />
      <div className="flex items-center justify-end gap-2">
        <GhostButton
          onClick={() => {
            send("leave");
            closePanel();
          }}
        >
          {T.leave}
        </GhostButton>
        <PrimaryButton onClick={() => send("again")}>{T.playAgain}</PrimaryButton>
      </div>
    </>
  );
}
