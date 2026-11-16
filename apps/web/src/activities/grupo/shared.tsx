import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { create } from "zustand";
import { grupoPlaces, grupoRank } from "@infinity/world";
import { useActs } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { sfx, type SfxOptions } from "../../audio/sfx.ts";
import { T } from "./strings.ts";

/**
 * Peças compartilhadas pelos jogos de grupo: painel aberto, relógio das fases, zona onde você está,
 * casca do painel, placar e comemoração.
 */

// ---- painel aberto (um por vez) -------------------------------------------------------------

export type GrupoGame = "quiz" | "draw" | "stop";

interface GrupoUi {
  panel: { game: GrupoGame; id: string; view?: string } | null;
}
export const useGrupoUi = create<GrupoUi>(() => ({ panel: null }));

export function openPanel(game: GrupoGame, id: string, view?: string): void {
  useGrupoUi.setState({ panel: { game, id, ...(view ? { view } : {}) } });
}
export function closePanel(): void {
  useGrupoUi.setState({ panel: null });
}
export function usePanel(game: GrupoGame): { id: string; view?: string } | null {
  return useGrupoUi((s) => (s.panel?.game === game ? s.panel : null));
}

// ---- relógio --------------------------------------------------------------------------------

/**
 * O servidor manda "quanto falta" (`left`, em ms) junto com cada estado. Guardamos quando cada
 * estado chegou para transformar isso num prazo local, sem depender do relógio do servidor.
 */
const arrived = new WeakMap<object, number>();
useActs.subscribe((s, prev) => {
  const now = performance.now();
  for (const id in s.acts) {
    const st = s.acts[id]?.state;
    if (st && typeof st === "object" && st !== prev.acts[id]?.state) arrived.set(st, now);
  }
});

/** Prazo local (performance.now) de um estado com `left`. */
export function deadlineOf(state: { left: number } | undefined): number {
  if (!state) return 0;
  let at = arrived.get(state);
  if (at === undefined) {
    at = performance.now();
    arrived.set(state, at);
  }
  return at + state.left;
}

/** Milissegundos que faltam (atualiza ~5x por segundo enquanto corre). */
export function useLeft(state: { left: number } | undefined): number {
  const deadline = deadlineOf(state);
  const [left, setLeft] = useState(() => Math.max(0, deadline - performance.now()));
  useEffect(() => {
    const update = () => setLeft(Math.max(0, deadline - performance.now()));
    update();
    if (deadline <= performance.now()) return;
    const t = window.setInterval(update, 200);
    return () => window.clearInterval(t);
  }, [deadline]);
  return left;
}

// ---- onde estou -----------------------------------------------------------------------------

/** Id da zona onde a pessoa está (consultado 3x por segundo; só re-renderiza quando muda). */
export function useSelfZone(): string | null {
  const [zone, setZone] = useState<string | null>(() => world().zones.zoneAt(self)?.id ?? null);
  useEffect(() => {
    const t = window.setInterval(() => setZone(world().zones.zoneAt(self)?.id ?? null), 330);
    return () => window.clearInterval(t);
  }, []);
  return zone;
}

export function selfZone(): string | null {
  return world().zones.zoneAt(self)?.id ?? null;
}

export function useSelfId(): string | null {
  return useApp((s) => s.selfId);
}

/** Toca um som: perto se você participa; senão, vindo de `at` (some com a distância). */
export function playSfx(name: string, mine: boolean, at: SfxOptions["at"], opts: SfxOptions = {}): void {
  sfx(name, mine ? opts : { ...opts, at, range: opts.range ?? 16 });
}

// ---- casca do painel ------------------------------------------------------------------------

const EASE = [0.16, 1, 0.3, 1] as const;

/** Painel de jogo à esquerda (folha de baixo no celular). Esc fecha (sem sair do jogo). */
export function GamePanelShell({ title, sub, icon, wide, medium, onClose, children, footer, label }: { title: string; sub?: ReactNode; icon?: ReactNode; wide?: boolean; medium?: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      // Esc num campo de texto do painel só tira o foco; Esc de novo fecha.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && ref.current?.contains(el)) {
        el.blur();
        return;
      }
      // Um diálogo aberto dentro do painel (confirmação) fecha antes.
      if (ref.current?.querySelector("[data-grupo-modal]")) return;
      onClose();
    };
    // Captura: roda antes dos atalhos do mundo.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <motion.aside
      ref={ref}
      role="dialog"
      aria-label={label ?? title}
      data-grupo-panel
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.26, ease: EASE }}
      className={clsx(
        "glass pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite",
        "inset-x-2 bottom-2 max-h-[calc(100dvh-72px)]",
        "sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-16 sm:max-h-[calc(100dvh-64px-84px)]",
        wide ? "sm:w-[min(920px,calc(100vw-24px))]" : medium ? "sm:w-[min(580px,calc(100vw-24px))]" : "sm:w-[430px]",
      )}
    >
      <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
        {icon && <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-offwhite/[0.06] text-offwhite ring-1 ring-offwhite/10">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold uppercase leading-tight tracking-[0.1em]">{title}</h2>
          {sub && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-slate" aria-live="polite">
              {sub}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="-mr-1.5 rounded-lg p-2 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close} title={T.closeHint}>
          <X className="size-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-offwhite/8 px-4 py-3">{footer}</div>}
    </motion.aside>
  );
}

// ---- botões ---------------------------------------------------------------------------------

export function PrimaryButton({ children, onClick, disabled, className, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange px-4 py-2.5 text-sm font-semibold text-offwhite shadow-[0_6px_18px_-8px_rgb(238_92_41/0.8)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, className, label, pressed }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; label?: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-offwhite/85 ring-1 ring-offwhite/12 transition-colors hover:bg-offwhite/8 hover:text-offwhite disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Escolha entre poucas opções (tempo, rodadas). */
export function Segmented<V extends string | number>({ label, value, options, onChange, disabled, format }: { label: string; value: V; options: readonly V[]; onChange: (v: V) => void; disabled?: boolean; format?: (v: V) => string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate">{label}</span>
      <div className="flex rounded-xl bg-offwhite/[0.05] p-0.5 ring-1 ring-offwhite/10" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={clsx(
              "min-w-11 rounded-[10px] px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed",
              o === value ? "bg-offwhite text-space" : "text-offwhite/75 hover:bg-offwhite/8 hover:text-offwhite disabled:hover:bg-transparent",
            )}
          >
            {format ? format(o) : String(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- tempo ----------------------------------------------------------------------------------

/** Barra de tempo que encolhe e fica de alerta nos últimos segundos. */
export function TimeBar({ left, total, className }: { left: number; total: number; className?: string }) {
  const f = total > 0 ? Math.min(1, left / total) : 0;
  const hurry = left < 5000;
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-offwhite/10", className)} role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(total / 1000)} aria-valuenow={Math.ceil(left / 1000)} aria-label={T.timeLeft}>
      <div className={clsx("h-full origin-left rounded-full transition-transform duration-200 ease-linear", hurry ? "bg-warn" : "bg-signal")} style={{ transform: `scaleX(${f})` }} />
    </div>
  );
}

export function Seconds({ left, className }: { left: number; className?: string }) {
  const s = Math.ceil(left / 1000);
  return (
    <span className={clsx("tabular-nums", s <= 5 ? "text-warn" : "text-offwhite", className)}>
      <span className="font-display">{s}</span>
      <span className="ml-px text-[0.85em] font-medium">s</span>
    </span>
  );
}

// ---- placar ---------------------------------------------------------------------------------

export interface ScoreRow {
  id: string;
  name: string;
  score: number;
  gain?: number;
  away?: boolean;
  tag?: ReactNode;
}

/** Placar ordenado, com posição (empates dividem), destaque para você e ganho da rodada. */
export function Scoreboard({ rows, me, limit, showGain }: { rows: readonly ScoreRow[]; me: string | null; limit?: number; showGain?: boolean }) {
  const ranked = grupoRank(rows);
  const places = grupoPlaces(ranked.map((r) => r.score));
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const myIdx = me ? ranked.findIndex((r) => r.id === me) : -1;
  return (
    <ol className="flex flex-col gap-1" aria-label={T.scoreboard}>
      {shown.map((r, i) => (
        <ScoreLine key={r.id} r={r} place={places[i]!} mine={r.id === me} showGain={showGain} />
      ))}
      {limit && myIdx >= limit && <ScoreLine r={ranked[myIdx]!} place={places[myIdx]!} mine showGain={showGain} gap />}
    </ol>
  );
}

function ScoreLine({ r, place, mine, showGain, gap }: { r: ScoreRow; place: number; mine: boolean; showGain?: boolean; gap?: boolean }) {
  return (
    <motion.li layout="position" className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm", mine ? "bg-signal/10 ring-1 ring-signal/35" : "bg-offwhite/[0.035]", gap && "mt-1.5", r.away && "opacity-50")}>
      <span className={clsx("w-5 shrink-0 text-center font-display text-xs tabular-nums", place === 1 ? "text-offwhite" : "text-slate")}>{place}º</span>
      <span className="min-w-0 flex-1 truncate">
        {r.name}
        {mine && <span className="ml-1 text-xs text-slate">({T.you})</span>}
        {r.away && <span className="ml-1 text-xs text-slate">· {T.away}</span>}
      </span>
      {r.tag}
      {showGain && !!r.gain && <span className="shrink-0 text-xs font-medium tabular-nums text-ok">+{r.gain}</span>}
      <span className="w-14 shrink-0 text-right font-display text-sm tabular-nums">{r.score}</span>
    </motion.li>
  );
}

// ---- comemoração ----------------------------------------------------------------------------

/** Pódio dos três primeiros: um momento especial (o gradiente da marca aparece aqui). */
export function Podium({ rows, me, title }: { rows: readonly ScoreRow[]; me: string | null; title: string }) {
  const ranked = grupoRank(rows).slice(0, 3);
  const places = grupoPlaces(ranked.map((r) => r.score));
  const order = [1, 0, 2].filter((i) => ranked[i]);
  const heights = ["h-20", "h-14", "h-10"];
  const iWon = !!me && ranked[0]?.id === me && ranked[0].score > 0;
  return (
    <section
      className="relative overflow-hidden rounded-2xl p-4 text-offwhite shadow-[0_18px_50px_-20px_rgb(236_92_42/0.55)]"
      style={{ background: "linear-gradient(125deg, #EC5C2A 0%, #C14F2C 14%, #432932 32%, #071734 52%, #1B4C72 74%, #368BBA 88%, #46AFE3 100%)" }}
      aria-live="polite"
      data-podium
    >
      <motion.img
        src="/brand/sparkle-white.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-5 -top-6 size-28 opacity-[0.13]"
        initial={{ rotate: -25, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
      />
      <div className="relative flex items-center gap-2.5">
        <motion.img src="/brand/sparkle-white.svg" alt="" aria-hidden className="size-7 shrink-0 drop-shadow-[0_0_12px_rgb(255_255_255/0.45)]" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.25 }} />
        <h3 className="font-display text-base font-bold uppercase leading-tight tracking-[0.06em]">{iWon ? T.youWon : title}</h3>
      </div>
      <div className="relative mt-4 flex items-end justify-center gap-2">
        {order.map((i, k) => {
          const r = ranked[i]!;
          return (
            <motion.div key={r.id} className="flex w-[30%] min-w-0 flex-col items-center" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.35 + (2 - k) * 0.15 }}>
              <span className="w-full truncate text-center text-sm font-semibold">{r.name}</span>
              <span className="mb-1 font-display text-xs tabular-nums text-offwhite/85">{r.score}</span>
              <div className={clsx("grid w-full place-items-center rounded-t-lg bg-space/35 ring-1 ring-offwhite/25", heights[places[i]! - 1] ?? "h-10")}>
                <span className="font-display text-lg font-black">{places[i]}º</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/** Chip flutuante (convite para entrar, voltar ao jogo). */
export function FloatChip({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="glass pointer-events-auto flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-sm text-offwhite transition-colors hover:border-signal/60"
    >
      {children}
    </motion.button>
  );
}

/** Onde os chips ficam: centro, acima do botão de interação. */
export function ChipDock({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+120px)] z-20 flex flex-col items-center gap-2 px-3">{children}</div>;
}
