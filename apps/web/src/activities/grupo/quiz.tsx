import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Check, Mic2, Pencil, Play, SkipForward, Trophy, Users, X as XIcon } from "lucide-react";
import { QUIZ_COUNTS, QUIZ_ID, QUIZ_KIND, QUIZ_LETTERS, QUIZ_SECONDS, QUIZ_STAGE, QUIZ_ZONES, grupoPlaces, grupoRank, type MapObject, type QuizAnswered, type QuizBank, type QuizKey, type QuizState } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";
import { walkTo } from "../../engine/movement.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { ChipDock, FloatChip, GamePanelShell, GhostButton, Podium, PrimaryButton, Scoreboard, Seconds, Segmented, TimeBar, closePanel, openPanel, playSfx, selfZone, useLeft, usePanel, useSelfId, useSelfZone } from "./shared.tsx";
import { QuizEditor } from "./quizEditor.tsx";
import { OptionGlyph } from "./quizParts.tsx";
import { QuizScene } from "./quizScene.tsx";
import { quizNow, quizRole, quizScreenPos, quizSend, useQuiz, useQuizLocal } from "./quizStore.ts";
import { T } from "./strings.ts";

// ---- cliente --------------------------------------------------------------------------------

function goToLectern(o: MapObject): void {
  const it = o.interact!;
  const arrive = () => {
    // Em pé no púlpito, de frente para a plateia (a pose vai para o servidor no próximo envio).
    self.yaw = it.yaw;
    toast(T.quiz.onStage);
    quizSend("open");
    openPanel("quiz", QUIZ_ID);
  };
  if (Math.hypot(it.point.x - self.x, it.point.z - self.z) < 0.5) arrive();
  else walkTo(it.point, arrive);
}

export const quizClient: ActivityClient = {
  name: "grupo/quiz",
  kinds: [QUIZ_KIND],
  objects: ["lectern"],
  label: () => T.quiz.lecternLabel,
  use: goToLectern,
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    const s = quizNow();
    const role = quizRole(s, me);
    const mine = role !== null;
    const at = quizScreenPos();
    switch (e.ev) {
      case "key":
        useQuizLocal.setState({ key: e.data as QuizKey });
        break;
      case "answered": {
        const a = e.data as QuizAnswered;
        useQuizLocal.setState({ mine: { game: s?.game ?? 0, n: a.n, choice: a.choice } });
        break;
      }
      case "bank":
        useQuizLocal.setState({ bank: e.data as QuizBank, bankError: null });
        break;
      case "bankError":
        useQuizLocal.setState({ bankError: (e.data as { reason: string }).reason });
        break;
      case "start":
        useQuizLocal.setState((l) => ({ fxStart: l.fxStart + 1, mine: null, key: null }));
        playSfx("grupo-inicio", mine, at, { volume: 0.6 });
        break;
      case "reveal": {
        useQuizLocal.setState((l) => ({ fxReveal: l.fxReveal + 1 }));
        const correct = (e.data as { correct: number }).correct;
        const my = useQuizLocal.getState().mine;
        if (role === "player" && my && my.n === (e.data as { n: number }).n) playSfx(my.choice === correct ? "grupo-acerto" : "grupo-erro", true, at);
        else playSfx("grupo-revelar", mine, at, { volume: 0.55 });
        break;
      }
      case "final":
        useQuizLocal.setState((l) => ({ fxFinal: l.fxFinal + 1 }));
        playSfx("grupo-fanfarra", mine, at, { volume: 0.65 });
        break;
    }
  },
  Overlay: QuizOverlay,
  Scene: QuizScene,
};

// ---- camada de interface --------------------------------------------------------------------

function QuizOverlay() {
  const s = useQuiz();
  const panel = usePanel("quiz");
  const me = useSelfId();
  const zone = useSelfZone();
  const role = quizRole(s, me);
  useTicks(s, role);
  useAnswerKeys(s, role, !!panel);

  const inAud = !!zone && QUIZ_ZONES.includes(zone);
  let chip: ReactNode = null;
  if (!panel && s) {
    if (role) {
      chip = (
        <FloatChip key="back" onClick={() => openPanel("quiz", QUIZ_ID)} label={role === "host" ? T.quiz.chipHost : T.quiz.chipBack}>
          <span className="grid size-7 place-items-center rounded-full bg-signal/15 text-signal">{role === "host" ? <Mic2 className="size-3.5" /> : <Trophy className="size-3.5" />}</span>
          <span className="font-medium">{role === "host" ? T.quiz.chipHost : T.quiz.chipBack}</span>
          {s.phase === "question" && role === "player" && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}
        </FloatChip>
      );
    } else if (s.phase !== "idle" && inAud) {
      chip = (
        <FloatChip
          key="join"
          onClick={() => {
            quizSend("join");
            openPanel("quiz", QUIZ_ID);
            playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
          }}
          label={T.quiz.join}
        >
          <span className="grid size-7 place-items-center rounded-full bg-orange text-offwhite">
            <Trophy className="size-3.5" />
          </span>
          <span className="font-medium">{T.quiz.chipJoin}</span>
          <span className="text-signal">· {T.quiz.join}</span>
        </FloatChip>
      );
    } else if (s.phase === "idle" && zone === QUIZ_STAGE) {
      chip = (
        <FloatChip
          key="present"
          onClick={() => {
            quizSend("open");
            openPanel("quiz", QUIZ_ID);
          }}
          label={T.quiz.present}
        >
          <span className="grid size-7 place-items-center rounded-full bg-signal/15 text-signal">
            <Mic2 className="size-3.5" />
          </span>
          <span className="font-medium">{T.quiz.present}</span>
        </FloatChip>
      );
    }
  }

  return (
    <>
      <AnimatePresence>{panel && <QuizPanel key="quiz-panel" view={panel.view} />}</AnimatePresence>
      <ChipDock>
        <AnimatePresence>{chip}</AnimatePresence>
      </ChipDock>
    </>
  );
}

/** Tique nos últimos 5 segundos de cada pergunta (para quem joga ou apresenta). */
function useTicks(s: QuizState | undefined, role: string | null) {
  const left = useLeft(s?.phase === "question" ? s : undefined);
  const sec = Math.ceil(left / 1000);
  const last = useRef(-1);
  useEffect(() => {
    if (!role || s?.phase !== "question" || sec > 5 || sec <= 0 || sec === last.current) return;
    last.current = sec;
    playSfx("grupo-tique", true, undefined, { volume: 0.35 });
  }, [sec, role, s?.phase]);
}

/** Teclas 1 a 4 respondem (só com o painel aberto e durante a pergunta). */
function useAnswerKeys(s: QuizState | undefined, role: string | null, open: boolean) {
  useEffect(() => {
    if (!open || role !== "player" || s?.phase !== "question" || !s.question) return;
    const n = s.question.n;
    const game = s.game;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (!m || e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopPropagation();
      e.preventDefault();
      answer(game, n, Number(m[1]) - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, role, s?.phase, s?.question?.n, s?.game]);
}

function answer(game: number, n: number, choice: number): void {
  const cur = useQuizLocal.getState().mine;
  if (cur && cur.game === game && cur.n === n) return;
  useQuizLocal.setState({ mine: { game, n, choice } });
  quizSend("answer", { n, choice });
}

// ---- painel ---------------------------------------------------------------------------------

function QuizPanel({ view }: { view?: string }) {
  const s = useQuiz();
  const me = useSelfId();
  const role = quizRole(s, me);
  if (view === "editor") return <QuizEditor />;
  const sub = s ? <PhaseLine s={s} role={role} /> : null;
  return (
    <GamePanelShell title={T.quiz.title} sub={sub} icon={<Trophy className="size-4" />} onClose={closePanel}>
      {!s ? null : role === "host" ? <HostView s={s} /> : role === "player" ? <PlayerView s={s} me={me!} /> : <OutsideView s={s} me={me} />}
    </GamePanelShell>
  );
}

function PhaseLine({ s, role }: { s: QuizState; role: string | null }) {
  const active = s.players.filter((p) => !p.away).length;
  return (
    <>
      {s.host && <span className="inline-flex items-center gap-1.5">{role === "host" ? T.quiz.youHost : T.quiz.host(s.host.name)}</span>}
      {s.pack && s.phase !== "idle" && <span>· {s.pack.title}</span>}
      {s.phase !== "idle" && (
        <span className="inline-flex items-center gap-1">
          · <Users className="size-3" aria-hidden /> {active}
        </span>
      )}
    </>
  );
}

// ---- apresentador ---------------------------------------------------------------------------

function HostView({ s }: { s: QuizState }) {
  switch (s.phase) {
    case "lobby":
      return <HostLobby s={s} />;
    case "ready":
    case "question":
      return <HostQuestion s={s} />;
    case "reveal":
      return <HostReveal s={s} />;
    case "final":
      return <FinalView s={s} host />;
    default:
      return null;
  }
}

function HostLobby({ s }: { s: QuizState }) {
  const pack = s.packs.find((p) => p.id === s.pack?.id);
  const players = s.players.filter((p) => !p.away);
  const can = players.length > 0 && (pack?.count ?? 0) > 0;
  return (
    <>
      <p className="text-[13px] leading-snug text-offwhite/80">{T.quiz.rules}</p>
      <section className="flex flex-col gap-1.5" aria-label={T.quiz.pack}>
        <div className="flex items-center justify-between">
          <span className="label-caps">{T.quiz.pack}</span>
          <button type="button" onClick={() => openPanel("quiz", QUIZ_ID, "editor")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-signal hover:bg-signal/10">
            <Pencil className="size-3" />
            {T.quiz.editBank}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={T.quiz.pack}>
          {s.packs.map((p) => {
            const on = p.id === s.pack?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => quizSend("config", { pack: p.id })}
                className={clsx("flex min-h-[52px] flex-col items-start justify-center rounded-xl px-3 py-2 text-left ring-1 transition-colors", on ? "bg-signal/12 ring-signal/50" : "bg-offwhite/[0.035] ring-offwhite/8 hover:bg-offwhite/[0.07]")}
              >
                <span className="w-full truncate text-sm font-medium">{p.title}</span>
                <span className={clsx("text-[11px]", p.count === 0 ? "text-warn" : "text-slate")}>{T.quiz.packCount(p.count)}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-3 ring-1 ring-offwhite/8">
        <Segmented label={T.quiz.seconds} value={s.seconds} options={QUIZ_SECONDS} onChange={(v) => quizSend("config", { seconds: v })} format={(v) => `${v}s`} />
        <Segmented label={T.quiz.count} value={s.count} options={QUIZ_COUNTS} onChange={(v) => quizSend("config", { count: v })} format={(v) => (v === 0 ? T.quiz.all : String(v))} />
      </section>
      <section className="flex flex-col gap-1.5">
        <span className="label-caps">{T.quiz.lobbyPlayers(players.length)}</span>
        {players.length === 0 ? (
          <p className="rounded-xl bg-offwhite/[0.03] px-3 py-3 text-xs text-slate ring-1 ring-offwhite/8">{T.quiz.joinHint}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {players.map((p) => (
              <motion.li key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full bg-offwhite/[0.06] px-2.5 py-1 text-xs ring-1 ring-offwhite/10">
                {p.name}
              </motion.li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-1 flex items-center gap-2">
        <GhostButton onClick={() => quizSend("end")}>{T.closeRoom}</GhostButton>
        <div className="ml-auto flex flex-col items-end gap-1">
          <PrimaryButton onClick={() => quizSend("start")} disabled={!can}>
            <Play className="size-4" />
            {T.quiz.start}
          </PrimaryButton>
        </div>
      </div>
      {!can && <p className="-mt-1 text-right text-[11px] text-slate">{players.length === 0 ? T.quiz.startNeedPlayers : T.quiz.startNeedQuestions}</p>}
    </>
  );
}

function HostQuestion({ s }: { s: QuizState }) {
  const key = useQuizLocal((l) => l.key);
  const left = useLeft(s);
  const q = s.question!;
  const correct = key && key.n === q.n ? key.correct : null;
  const active = s.players.filter((p) => !p.away).length;
  return (
    <>
      <QuestionHead s={s} left={left} />
      {s.phase === "question" && (
        <ul className="flex flex-col gap-1.5">
          {q.options.map((o, i) => (
            <li key={i} className={clsx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ring-1", i === correct ? "bg-ok/10 ring-ok/45" : "bg-offwhite/[0.035] ring-offwhite/8")}>
              <OptionGlyph i={i} className="size-4 shrink-0" />
              <span className="w-4 shrink-0 font-display text-xs text-slate">{QUIZ_LETTERS[i]}</span>
              <span className="min-w-0 flex-1">{o}</span>
              {i === correct && <Check className="size-4 shrink-0 text-ok" aria-label={T.quiz.correct} />}
            </li>
          ))}
        </ul>
      )}
      {s.phase === "question" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate" aria-live="polite">
            {T.quiz.answeredCount(s.answered, active)}
          </span>
          <PrimaryButton className="ml-auto" onClick={() => quizSend("reveal")}>
            {T.quiz.reveal}
          </PrimaryButton>
        </div>
      )}
      <EndGame />
    </>
  );
}

function HostReveal({ s }: { s: QuizState }) {
  const me = useSelfId();
  const last = s.question && s.question.n >= s.question.total;
  return (
    <>
      <RevealBlock s={s} />
      <section className="flex flex-col gap-1.5">
        <span className="label-caps">{T.scoreboard}</span>
        <Scoreboard rows={s.players} me={me} limit={6} showGain />
      </section>
      <div className="flex items-center gap-2">
        <EndGame inline />
        <PrimaryButton className="ml-auto" onClick={() => quizSend("next")}>
          {last ? <Trophy className="size-4" /> : <SkipForward className="size-4" />}
          {last ? T.quiz.toFinal : T.quiz.next}
        </PrimaryButton>
      </div>
    </>
  );
}

function EndGame({ inline }: { inline?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <div className={clsx("flex items-center gap-2", !inline && "mt-1")} data-grupo-modal>
        <span className="mr-auto text-xs text-offwhite/90">{T.quiz.endConfirm}</span>
        <GhostButton onClick={() => setConfirm(false)}>{T.cancel}</GhostButton>
        <button type="button" onClick={() => quizSend("end")} className="rounded-xl bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger">
          {T.finish}
        </button>
      </div>
    );
  return (
    <div className={clsx(!inline && "mt-1 flex")}>
      <GhostButton onClick={() => setConfirm(true)}>{T.quiz.endGame}</GhostButton>
    </div>
  );
}

// ---- jogador --------------------------------------------------------------------------------

function PlayerView({ s, me }: { s: QuizState; me: string }) {
  switch (s.phase) {
    case "lobby":
      return (
        <>
          <section className="rounded-2xl bg-signal/[0.08] p-4 ring-1 ring-signal/30">
            <p className="font-display text-sm font-bold uppercase tracking-[0.08em] text-signal">{T.quiz.joined}</p>
            <p className="mt-1 text-[13px] text-offwhite/85">{T.quiz.waitStart}</p>
            <p className="mt-2 text-xs text-slate">{T.quiz.rules}</p>
          </section>
          <section className="flex flex-col gap-1.5">
            <span className="label-caps">{T.quiz.lobbyPlayers(s.players.filter((p) => !p.away).length)}</span>
            <ul className="flex flex-wrap gap-1.5">
              {s.players
                .filter((p) => !p.away)
                .map((p) => (
                  <li key={p.id} className={clsx("rounded-full px-2.5 py-1 text-xs ring-1", p.id === me ? "bg-signal/15 ring-signal/40" : "bg-offwhite/[0.06] ring-offwhite/10")}>
                    {p.name}
                  </li>
                ))}
            </ul>
          </section>
          <LeaveQuiz />
        </>
      );
    case "ready":
    case "question":
      return <PlayerQuestion s={s} />;
    case "reveal":
      return <PlayerReveal s={s} me={me} />;
    case "final":
      return <FinalView s={s} />;
    default:
      return null;
  }
}

function LeaveQuiz() {
  return (
    <div className="mt-1 flex justify-end">
      <GhostButton
        onClick={() => {
          quizSend("leave");
          closePanel();
        }}
      >
        {T.quiz.leave}
      </GhostButton>
    </div>
  );
}

function QuestionHead({ s, left }: { s: QuizState; left: number }) {
  const q = s.question!;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-caps">{T.quiz.question(q.n, q.total)}</span>
        {s.phase === "question" ? <Seconds left={left} className="text-sm" /> : <span className="text-xs text-slate">{T.quiz.getReady}</span>}
      </div>
      <TimeBar left={left} total={s.duration} />
      <motion.h3 key={`${s.game}-${q.n}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[17px] font-semibold leading-snug text-offwhite" aria-live="polite">
        {q.text}
      </motion.h3>
    </section>
  );
}

function PlayerQuestion({ s }: { s: QuizState }) {
  const left = useLeft(s);
  const mine = useQuizLocal((l) => l.mine);
  const q = s.question!;
  const chosen = mine && mine.game === s.game && mine.n === q.n ? mine.choice : null;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (s.phase === "question" && chosen === null) first.current?.focus({ preventScroll: true });
  }, [s.phase, q.n, chosen]);
  return (
    <>
      <QuestionHead s={s} left={left} />
      {s.phase === "question" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={T.quiz.choose}>
          {q.options.map((o, i) => {
            const picked = chosen === i;
            const dim = chosen !== null && !picked;
            return (
              <motion.button
                key={`${q.n}-${i}`}
                ref={i === 0 ? first : undefined}
                type="button"
                disabled={chosen !== null}
                onClick={() => answer(s.game, q.n, i)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: dim ? 0.4 : 1, y: 0, scale: picked ? 1.02 : 1 }}
                transition={{ duration: 0.2, delay: chosen === null ? i * 0.04 : 0 }}
                className={clsx(
                  "flex min-h-[64px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 transition-colors disabled:cursor-default",
                  picked ? "bg-orange/15 ring-2 ring-orange" : "bg-offwhite/[0.05] ring-offwhite/12 hover:bg-offwhite/[0.09] hover:ring-offwhite/25",
                )}
                aria-pressed={picked}
                aria-keyshortcuts={String(i + 1)}
                data-quiz-option={i}
              >
                <OptionGlyph i={i} className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 leading-snug">{o}</span>
                <kbd className="hidden shrink-0 rounded-md bg-offwhite/8 px-1.5 py-0.5 font-display text-[10px] text-slate sm:block">{i + 1}</kbd>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="grid h-24 place-items-center rounded-xl bg-offwhite/[0.03] ring-1 ring-offwhite/8">
          <motion.span className="font-display text-3xl font-black tabular-nums text-offwhite" key={Math.ceil(left / 1000)} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            {Math.max(1, Math.ceil(left / 1000))}
          </motion.span>
        </div>
      )}
      {chosen !== null && s.phase === "question" && (
        <p className="text-center text-xs text-slate" role="status">
          {T.quiz.sent}
        </p>
      )}
    </>
  );
}

function PlayerReveal({ s, me }: { s: QuizState; me: string }) {
  const mine = useQuizLocal((l) => l.mine);
  const q = s.question!;
  const r = s.reveal!;
  const p = s.players.find((x) => x.id === me);
  const chosen = mine && mine.game === s.game && mine.n === q.n ? mine.choice : null;
  const right = chosen === r.correct;
  const ranked = grupoRank(s.players);
  const places = grupoPlaces(ranked.map((x) => x.score));
  const myPlace = places[ranked.findIndex((x) => x.id === me)] ?? 0;
  return (
    <>
      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className={clsx("flex items-center gap-3 rounded-2xl p-4 ring-1", right ? "bg-ok/12 ring-ok/45" : "bg-offwhite/[0.04] ring-offwhite/10")}
        role="status"
        data-quiz-result={right ? "right" : "wrong"}
      >
        <span className={clsx("grid size-11 shrink-0 place-items-center rounded-full", right ? "bg-ok text-space" : "bg-offwhite/10 text-offwhite/80")}>{right ? <Check className="size-6" /> : <XIcon className="size-6" />}</span>
        <div className="min-w-0">
          <p className="font-display text-base font-bold uppercase tracking-[0.06em]">{right ? T.quiz.right : chosen === null ? T.quiz.missed : T.quiz.wrong}</p>
          {right ? <p className="text-sm font-medium tabular-nums text-ok">{T.quiz.gained(p?.gain ?? 0)}</p> : <p className="text-[13px] text-offwhite/80">{T.quiz.correctWas(QUIZ_LETTERS[r.correct]!, q.options[r.correct] ?? "")}</p>}
          {p && p.streak >= 2 && <p className="text-[11px] text-slate">{T.quiz.streak(p.streak)}</p>}
        </div>
      </motion.section>
      <RevealBlock s={s} compact />
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="label-caps">{T.scoreboard}</span>
          {myPlace > 0 && <span className="text-xs text-offwhite/80">{T.quiz.yourPlace(myPlace, ranked.length)}</span>}
        </div>
        <Scoreboard rows={s.players} me={me} limit={5} showGain />
      </section>
    </>
  );
}

/** Distribuição das respostas com a certa em destaque. */
function RevealBlock({ s, compact }: { s: QuizState; compact?: boolean }) {
  const q = s.question!;
  const r = s.reveal!;
  const total = Math.max(1, r.counts.reduce((a, b) => a + b, 0));
  return (
    <section className="flex flex-col gap-1.5" aria-label={T.quiz.correctWas(QUIZ_LETTERS[r.correct]!, q.options[r.correct] ?? "")}>
      {!compact && <h3 className="text-[15px] font-semibold leading-snug">{q.text}</h3>}
      <ul className="flex flex-col gap-1">
        {q.options.map((o, i) => {
          const ok = i === r.correct;
          const n = r.counts[i] ?? 0;
          return (
            <li key={i} className={clsx("relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-sm ring-1", ok ? "ring-ok/50" : "opacity-70 ring-offwhite/8")}>
              <motion.span className={clsx("absolute inset-y-0 left-0", ok ? "bg-ok/15" : "bg-offwhite/[0.05]")} initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              <OptionGlyph i={i} className="relative size-4 shrink-0" />
              <span className="relative min-w-0 flex-1 truncate">{o}</span>
              {ok && <Check className="relative size-4 shrink-0 text-ok" />}
              <span className="relative w-6 shrink-0 text-right font-display text-xs tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- fim e quem está de fora ----------------------------------------------------------------

function FinalView({ s, host }: { s: QuizState; host?: boolean }) {
  const me = useSelfId();
  const ranked = grupoRank(s.players);
  const winner = ranked[0] && ranked[0].score > 0 ? ranked[0].name : null;
  const total = s.question?.total;
  return (
    <>
      {ranked.length > 0 ? <Podium rows={s.players} me={me} title={winner ? T.quiz.winner(winner) : T.quiz.noWinner} /> : <p className="text-sm text-slate">{T.quiz.noWinner}</p>}
      <section className="flex flex-col gap-1.5">
        <span className="label-caps">{T.quiz.final}</span>
        <Scoreboard rows={s.players.map((p) => ({ ...p, tag: total ? <span className="shrink-0 text-[11px] text-slate">{T.quiz.hits(p.hits, total)}</span> : undefined }))} me={me} />
      </section>
      {host ? (
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={() => quizSend("end")}>{T.closeRoom}</GhostButton>
          <PrimaryButton
            onClick={() => {
              quizSend("end");
              window.setTimeout(() => quizSend("open"), 150);
            }}
          >
            {T.quiz.newQuiz}
          </PrimaryButton>
        </div>
      ) : (
        <div className="flex justify-end">
          <GhostButton onClick={closePanel}>{T.close}</GhostButton>
        </div>
      )}
    </>
  );
}

function OutsideView({ s, me }: { s: QuizState; me: string | null }) {
  const zone = useSelfZone();
  const inAud = !!zone && QUIZ_ZONES.includes(zone);
  if (s.phase === "idle") {
    return (
      <>
        <p className="text-[13px] text-offwhite/85">{T.quiz.rules}</p>
        {selfZone() === QUIZ_STAGE ? (
          <PrimaryButton onClick={() => quizSend("open")}>
            <Mic2 className="size-4" />
            {T.quiz.present}
          </PrimaryButton>
        ) : (
          <p className="text-xs text-slate">{T.quiz.stageToPresent}</p>
        )}
      </>
    );
  }
  const hostAway = !!s.host && !useApp.getState().players[s.host.id];
  return (
    <>
      {s.host && <p className="text-[13px] text-offwhite/85">{hostAway ? T.quiz.hostTakeover : T.quiz.notHost(s.host.name)}</p>}
      {hostAway && zone === QUIZ_STAGE && (
        <PrimaryButton onClick={() => quizSend("open")}>
          <Mic2 className="size-4" />
          {T.quiz.present}
        </PrimaryButton>
      )}
      {s.phase !== "final" && inAud && (
        <PrimaryButton
          onClick={() => {
            quizSend("join");
            playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
          }}
        >
          {T.quiz.join}
        </PrimaryButton>
      )}
      {s.players.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="label-caps">{T.scoreboard}</span>
          <Scoreboard rows={s.players} me={me} limit={8} />
        </section>
      )}
    </>
  );
}
