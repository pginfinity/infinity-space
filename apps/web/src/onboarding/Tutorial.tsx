import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Check, ChevronDown, DoorOpen, X } from "lucide-react";
import { ORBI_ID } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { setMic, useMedia } from "../media/rtc.ts";
import { setChatOpen } from "../activities/chat/store.ts";
import { sendAct } from "../activities/registry.ts";
import { doEmote } from "../engine/emotes.ts";
import { toast } from "../ui/toasts.ts";
import { InStack } from "../ui/HudStack.tsx";
import { OrbiFace } from "./OrbiFace.tsx";
import { Kbd } from "./Shortcuts.tsx";
import { useTourWatch } from "./watch.ts";
import { beginSteps, closeTour, openShortcuts, pauseTour, resumeTour, saved, selectStep, setMinimized, skipStep, startTour, STEP_LIST, TOUCH, useTour } from "./store.ts";
import { currentStep, doneCount, shouldAutoStart, stepBeside, STEP_KEYS, STEP_TARGET, type StepKey } from "./steps.ts";

/**
 * Primeiros passos: o Orbi se apresenta na primeira entrada (dá para dizer "agora não") e leva a pessoa
 * para a sala de treino, o mesmo escritório numa sala à parte, onde ninguém do escritório vê nem ouve.
 * Lá ela pratica de verdade (andar, falar com quem está perto, chat, emotes, sentar, foco, chamar,
 * compartilhar tela, jogos, 2D/3D) e cada passo se marca sozinho. Dá para pular, voltar a um passo,
 * minimizar e retomar depois (tecla ?, busca Ctrl+K, ajustes ou menu Mais).
 */

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Atalho de desenvolvimento (?nome=) entra direto e sem tutorial, a menos que peça com &tutorial=1. */
const QUERY = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const DEV_SHORTCUT = import.meta.env.DEV && QUERY.has("nome");
const FORCE = QUERY.get("tutorial") === "1";

const cardMotion = {
  initial: { opacity: 0, y: -8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { type: "spring", stiffness: 420, damping: 30 },
} as const;

export function Tutorial() {
  const phase = useTour((s) => s.phase);
  const minimized = useTour((s) => s.minimized);
  const done = useTour((s) => s.done);
  const training = useTour((s) => s.training);
  const selected = useTour((s) => s.selected);
  const conn = useApp((s) => s.conn);
  const selfId = useApp((s) => s.selfId);
  const ready = conn === "open" && !!selfId;
  const current = currentStep(STEP_LIST, done);
  const shown = selected ?? current;

  // Primeira entrada (ou voltou no meio): abre quando o mundo está pronto, uma vez por visita.
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || opened.current) return;
    if (FORCE || shouldAutoStart(saved, DEV_SHORTCUT)) {
      // Só conta como aberto quando abrir de fato (se a conexão cair antes, tenta de novo ao voltar).
      const id = window.setTimeout(() => {
        opened.current = true;
        startTour();
      }, 1200);
      return () => window.clearTimeout(id);
    }
    opened.current = true;
    if (saved.phase === "steps" && !DEV_SHORTCUT) resumeTour();
  }, [ready]);

  // Chegou na sala de treino: o Orbi vem dar boas-vindas.
  useEffect(() => {
    if (training && ready) sendAct(ORBI_ID, "welcome");
  }, [training, ready]);

  // Os passos só se marcam na sala de treino, com ela já aberta (a posição de partida é a de lá).
  useTourWatch(phase === "steps" && training && ready);

  // Destaque do controle do passo da vez (regras em styles.css, por `data-tour` no <html>).
  const target = phase === "steps" && !minimized && training && shown ? STEP_TARGET[shown] : undefined;
  useEffect(() => {
    if (!target) return;
    document.documentElement.dataset.tour = target;
    return () => {
      delete document.documentElement.dataset.tour;
    };
  }, [target]);

  return (
    <>
      <AnimatePresence>{training && <TrainingBanner key="treino" finished={phase !== "steps"} />}</AnimatePresence>
      <InStack side="top-left" order={3} className="w-[min(340px,calc(100vw-24px))]">
        <AnimatePresence mode="wait">
          {phase === "intro" && <Intro key="intro" />}
          {phase === "steps" && !minimized && <Steps key="steps" shown={shown} current={current} done={done} />}
          {phase === "steps" && minimized && <Pill key="pill" count={doneCount(STEP_LIST, done)} />}
          {phase === "done" && <Done key="done" training={training} />}
        </AnimatePresence>
      </InStack>
    </>
  );
}

/** Faixa no alto enquanto a pessoa treina: onde ela está e o caminho de volta. */
function TrainingBanner({ finished }: { finished: boolean }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none absolute inset-x-0 top-[68px] z-20 flex justify-center px-3"
    >
      <div role="status" className="glass pointer-events-auto flex max-w-full items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-sm text-offwhite">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-signal">{t("tour.training")}</span>
          <span className="hidden text-offwhite/75 md:inline"> · {t("tour.trainingHint")}</span>
        </span>
        <button
          type="button"
          onClick={finished ? closeTour : pauseTour}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-offwhite/10 px-3 py-1 font-medium transition-colors hover:bg-offwhite/16"
        >
          <DoorOpen className="size-4" aria-hidden />
          {t("tour.backToOffice")}
        </button>
      </div>
    </motion.div>
  );
}

function Card({ children, label }: { children: ReactNode; label: string }) {
  return (
    <motion.section {...cardMotion} aria-label={label} className="glass pointer-events-auto rounded-[var(--radius-panel)] p-3.5 text-offwhite">
      {children}
    </motion.section>
  );
}

function Intro() {
  const { t } = useTranslation();
  const name = useApp((s) => s.profile.name).split(" ")[0] ?? "";
  const later = () => {
    closeTour();
    toast(t(TOUCH ? "tour.laterToastTouch" : "tour.laterToast"), 5200);
  };
  return (
    <Card label={t("tour.title")}>
      <div className="flex gap-3">
        <OrbiFace size={56} className="shrink-0" />
        <div className="min-w-0 pt-0.5">
          <p className="label-caps">{t("tour.orbi")}</p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-snug">{t("tour.hello", { name })}</h2>
          <p className="mt-1 text-sm leading-relaxed text-offwhite/75">{t("tour.helloBody")}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <button type="button" onClick={later} className="rounded-xl px-3 py-2 text-sm text-offwhite/75 transition-colors hover:bg-offwhite/8 hover:text-offwhite">
          {t("tour.later")}
        </button>
        <button type="button" onClick={beginSteps} className="rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite transition-[filter] hover:brightness-110">
          {t("tour.start")}
        </button>
      </div>
    </Card>
  );
}

/** Clicar num passo da lista também faz a ação, quando dá (para quem prefere o mouse ou usa leitor de tela). */
function assist(key: StepKey): (() => void) | undefined {
  switch (key) {
    case "mic":
      return useMedia.getState().status === "on" ? () => void setMic(true) : undefined;
    case "chat":
      return () => setChatOpen(true);
    case "emote":
      return () => doEmote("wave");
    case "status":
      return () => window.dispatchEvent(new Event("infinity:settings"));
    case "chamar":
      return () => useApp.getState().togglePeople(true);
    case "jogo":
      return () => window.dispatchEvent(new Event("infinity:map"));
    case "lente":
      return () => {
        const s = useApp.getState();
        s.setLens(s.lens === "2d" ? "3d" : "2d");
      };
    default:
      return undefined;
  }
}

function keysOf(key: StepKey): string[] {
  const keys = STEP_KEYS[key] ?? [];
  return MAC ? keys.map((k) => (k === "Ctrl" ? "⌘" : k)) : keys;
}

function Steps({ shown, current, done }: { shown: StepKey | null; current: StepKey | null; done: StepKey[] }) {
  const { t } = useTranslation();
  const count = doneCount(STEP_LIST, done);
  const say = shown ? t(TOUCH ? `tour.steps.${shown}.sayTouch` : `tour.steps.${shown}.say`, { defaultValue: t(`tour.steps.${shown}.say`) }) : "";
  const prev = shown ? stepBeside(STEP_LIST, shown, -1) : null;
  const next = shown ? stepBeside(STEP_LIST, shown, 1) : null;
  const navBtn = "rounded-md px-1.5 py-0.5 text-xs text-slate transition-colors hover:text-offwhite disabled:opacity-40 disabled:hover:text-slate";
  return (
    <Card label={t("tour.title")}>
      <header className="flex items-center gap-2.5">
        <OrbiFace size={36} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="label-caps">{t("tour.title")}</p>
          <p className="text-xs tabular-nums text-slate">{t("tour.progress", { done: count, total: STEP_LIST.length })}</p>
        </div>
        <button type="button" onClick={() => setMinimized(true)} aria-label={t("tour.minimize")} title={t("tour.minimize")} className="grid size-8 place-items-center rounded-lg text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
          <ChevronDown className="size-4" />
        </button>
        <button type="button" onClick={closeTour} aria-label={t("tour.skipAll")} title={t("tour.skipAll")} className="grid size-8 place-items-center rounded-lg text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-4" />
        </button>
      </header>

      {/* A fala do Orbi sobre o passo escolhido (ou o da vez), com voltar, pular e seguir. */}
      {shown && (
        <div className="relative mt-2.5 rounded-xl bg-card/80 px-3 py-2.5">
          <span className="absolute -top-1.5 left-4 size-3 rotate-45 bg-card/80" aria-hidden />
          <p className="relative text-[13px] leading-relaxed text-offwhite/90" aria-live="polite">
            {say}
          </p>
          <div className="relative mt-1.5 flex items-center justify-between">
            <button type="button" onClick={() => selectStep(prev)} disabled={!prev} className={navBtn}>
              {t("tour.back")}
            </button>
            {done.includes(shown) ? (
              <button type="button" onClick={() => selectStep(next ?? current)} className={navBtn}>
                {t("tour.next")}
              </button>
            ) : (
              <button type="button" onClick={() => skipStep(shown)} className={navBtn}>
                {t("tour.skipStep")}
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-2 space-y-0.5">
        {STEP_LIST.map((key) => {
          const isDone = done.includes(key);
          const isShown = key === shown;
          const run = !isDone ? assist(key) : undefined;
          const keys = TOUCH ? [] : keysOf(key);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  selectStep(key);
                  run?.();
                }}
                aria-current={isShown ? "step" : undefined}
                className={clsx("flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-offwhite/6", isShown && "bg-offwhite/5")}
              >
                <span
                  className={clsx(
                    "grid size-5 shrink-0 place-items-center rounded-full",
                    isDone ? "bg-signal text-space" : isShown ? "ring-2 ring-signal" : "ring-1 ring-offwhite/25",
                  )}
                  aria-hidden
                >
                  {isDone && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={clsx("min-w-0 flex-1 truncate text-left text-[13px]", isShown ? "font-medium text-offwhite" : isDone ? "text-slate" : "text-offwhite/80")}>
                  {TOUCH ? t(`tour.steps.${key}.labelTouch`, { defaultValue: t(`tour.steps.${key}.label`) }) : t(`tour.steps.${key}.label`)}
                  {isDone && <span className="sr-only"> · {t("tour.stepDone")}</span>}
                </span>
                {keys.length > 0 && (
                  <span className={clsx("flex shrink-0 gap-0.5", isDone && "opacity-50")}>
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-offwhite/8" role="progressbar" aria-valuemin={0} aria-valuemax={STEP_LIST.length} aria-valuenow={count} aria-label={t("tour.title")}>
        <motion.div className="h-full rounded-full bg-signal" initial={false} animate={{ width: `${(count / STEP_LIST.length) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
      </div>
    </Card>
  );
}

function Pill({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <motion.button
      {...cardMotion}
      type="button"
      onClick={() => setMinimized(false)}
      aria-label={t("tour.expand")}
      className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm text-offwhite transition-colors hover:border-offwhite/25"
    >
      <OrbiFace size={28} still />
      <span>{t("tour.title")}</span>
      <span className="tabular-nums text-slate">
        {count}/{STEP_LIST.length}
      </span>
    </motion.button>
  );
}

function Done({ training }: { training: boolean }) {
  const { t } = useTranslation();
  // Fora do treino, some sozinho depois de um tempo; no treino, espera a pessoa escolher voltar.
  useEffect(() => {
    if (training) return;
    const id = window.setTimeout(closeTour, 20_000);
    return () => window.clearTimeout(id);
  }, [training]);
  return (
    <Card label={t("tour.title")}>
      <div className="flex gap-3">
        <OrbiFace size={56} happy className="shrink-0" />
        <div className="min-w-0 pt-0.5">
          <p className="label-caps flex items-center gap-1.5">
            <img src="/brand/sparkle.svg" alt="" width={12} height={12} />
            {t("tour.welcome")}
          </p>
          <h2 className="mt-0.5 text-[15px] font-semibold leading-snug">{t("tour.doneTitle")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-offwhite/75">{t(TOUCH ? "tour.doneBodyTouch" : "tour.doneBody")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        {!TOUCH && (
          <button
            type="button"
            onClick={() => {
              closeTour();
              openShortcuts();
            }}
            className="rounded-xl px-3 py-2 text-sm text-offwhite/80 transition-colors hover:bg-offwhite/8 hover:text-offwhite"
          >
            {t("tour.seeShortcuts")} <Kbd>?</Kbd>
          </button>
        )}
        {training ? (
          <button type="button" onClick={closeTour} className="rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite transition-[filter] hover:brightness-110">
            {t("tour.backToOffice")}
          </button>
        ) : (
          <button type="button" onClick={closeTour} className="rounded-xl bg-offwhite/10 px-4 py-2 text-sm font-medium text-offwhite transition-colors hover:bg-offwhite/16">
            {t("tour.close")}
          </button>
        )}
      </div>
    </Card>
  );
}
