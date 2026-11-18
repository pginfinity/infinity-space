import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { LogOut, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { FOCO_ID, focoCount, focoNow, focoSeatOf, type FocoPhase, type FocoState, type FocoVoteOp } from "@infinity/world";
import { sendAct, useAct } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { InStack } from "../../ui/HudStack.tsx";
import { useApp } from "../../state/store.ts";
import { serverNow } from "../../net/session.ts";
import { autoFocus, leaveTable, leftTable } from "./mesa.ts";
import { T } from "./strings.ts";

/**
 * Chip da mesa de foco, só para quem está sentado: tempo que falta, fase, progresso e os botões de
 * propor pausa, retomar e reiniciar (valem quando todos concordam) e sair. Toca um som suave e avisa
 * na troca de fase; liga e desliga o status "Foco" automático.
 */

export const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Cor de cada fase (o laranja fica para o "Concordar", o único destaque do chip). */
export const PHASE_COLOR: Record<FocoPhase | "paused", string> = { focus: "#00B7FF", short: "#2BC48A", long: "#46AFE3", paused: "#8A93A3" };

export function FocoHud() {
  const state = useAct<FocoState>(FOCO_ID);
  const me = useApp((s) => s.selfId);
  const seated = !!state && !!me && focoSeatOf(state, me) >= 0;
  // Saiu da mesa: devolve o status de antes.
  useEffect(() => {
    if (!seated) leftTable();
  }, [seated]);
  if (!state || !me || !seated) return null;
  return (
    <InStack side="top-left" order={2}>
      <FocoChip state={state} me={me} />
    </InStack>
  );
}

function FocoChip({ state, me }: { state: FocoState; me: string }) {
  const clock = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<FocoPhase | "paused">("focus");
  const last = useRef<{ index: number; paused: boolean; startAt: number | null } | null>(null);
  const paused = state.pausedAt !== null;
  const total = focoCount(state);

  useEffect(() => {
    const draw = () => {
      const ph = focoNow(state, serverNow());
      if (!ph) return;
      if (clock.current) clock.current.textContent = fmt(ph.left);
      if (bar.current) bar.current.style.transform = `scaleX(${ph.progress})`;
      setLabel(paused ? T.paused : T.phaseLong(ph.phase, ph.round));
      setPhase(paused ? "paused" : ph.phase);
      // Status "Foco" só enquanto a fase é de foco e o relógio anda.
      autoFocus(ph.phase === "focus" && !paused);
      // Troca de fase, pausa, retomada ou reinício: som suave e um aviso (não na primeira vez).
      const prev = last.current;
      last.current = { index: ph.index, paused, startAt: state.startAt };
      if (!prev) return;
      if (prev.paused !== paused) {
        toast(paused ? T.toast.paused : T.toast.resumed);
        return;
      }
      // Reiniciar põe o relógio no zero (pular fase nos testes também mexe no início, mas para a frente).
      if (prev.startAt !== state.startAt && ph.index === 0 && ph.progress < 0.02) {
        toast(T.toast.restarted);
        return;
      }
      if (prev.index !== ph.index && !paused) {
        if (ph.phase === "focus") sfx("foco-volta", { volume: 0.4 });
        else sfx("daily-tempo", { volume: 0.35 });
        toast(T.toast[ph.phase], 5000);
      }
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, [state, paused]);

  const vote = state.vote;
  const agreed = !!vote?.ids.includes(me);
  const solo = total === 1;
  const ask = (op: FocoVoteOp) => sendAct(FOCO_ID, "vote", { op });
  const color = PHASE_COLOR[phase];

  return (
    <section aria-label={T.title} className="glass pointer-events-auto w-[300px] max-w-full rounded-2xl px-3 pb-2.5 pt-2">
      <div className="flex items-center gap-2">
        <Timer className="size-4 shrink-0" style={{ color }} aria-hidden />
        <span ref={clock} className="w-[54px] shrink-0 font-display text-[17px] font-bold tabular-nums tracking-[0.02em]" aria-live="off" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs text-offwhite/85" data-foco-phase>
          {label}
        </span>
        <IconButton
          label={paused ? T.resume : T.pause}
          hint={solo ? undefined : T.agreeHint}
          onClick={() => ask(paused ? "resume" : "pause")}
          pressed={vote?.op === (paused ? "resume" : "pause") && agreed}
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </IconButton>
        <IconButton label={T.restart} hint={solo ? undefined : T.agreeHint} onClick={() => ask("restart")} pressed={vote?.op === "restart" && agreed}>
          <RotateCcw className="size-3.5" />
        </IconButton>
        <IconButton label={T.leave} onClick={leaveTable}>
          <LogOut className="size-3.5" />
        </IconButton>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-offwhite/10" aria-hidden>
        <div ref={bar} className="h-full origin-left rounded-full transition-transform duration-500" style={{ transform: "scaleX(0)", background: color }} />
      </div>
      <p className="mt-1 text-[11px] text-slate">
        {T.title} · {T.people(total)}
      </p>
      {vote && (
        <div className="mt-2 flex items-center gap-2 border-t border-offwhite/8 pt-2" role="status">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-offwhite/85">{T.vote(vote.op, vote.ids.length, total)}</p>
          {agreed ? (
            <button type="button" onClick={() => sendAct(FOCO_ID, "unvote")} className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-slate hover:bg-offwhite/8 hover:text-offwhite">
              {T.withdraw}
            </button>
          ) : (
            <button type="button" onClick={() => ask(vote.op)} className="shrink-0 rounded-lg bg-orange px-2.5 py-1 text-[11px] font-semibold text-offwhite hover:brightness-110">
              {T.agree}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function IconButton({ label, hint, onClick, pressed, children }: { label: string; hint?: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={hint ? `${label} · ${hint}` : label}
      className={clsx("grid size-7 shrink-0 place-items-center rounded-lg text-offwhite/80 transition-colors hover:bg-offwhite/10 hover:text-offwhite", pressed && "bg-offwhite/12 text-offwhite")}
    >
      {children}
    </button>
  );
}
