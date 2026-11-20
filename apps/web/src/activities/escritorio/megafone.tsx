import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Megaphone, X } from "lucide-react";
import { MEGAFONE_ID, MEGAFONE_KIND, MEGAFONE_TEXT, type MegafoneAviso, type MegafoneState } from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { callsQuiet } from "../presenca/events.ts";
import { setMegaphone, setMic } from "../../media/rtc.ts";
import { useApp } from "../../state/store.ts";
import { notifyDesktop } from "../../ui/DesktopNotify.tsx";
import { InStack } from "../../ui/HudStack.tsx";
import { toast } from "../../ui/toasts.ts";
import { focusSoon, useEscape } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Megafone do gestor: o admin abre pela lista de pessoas. Escrito: um cartão na tela de todos (e o
 * aviso do computador). Falado: enquanto ligado, a voz dele chega a todas as áreas, no centro (sem
 * direção). Em Foco a voz do megafone não chega; o cartão escrito, sim.
 */

interface Card extends MegafoneAviso {
  key: number;
}
const useMegafoneUi = create<{ open: boolean; cards: Card[] }>(() => ({ open: false, cards: [] }));
let seq = 0;

/** Desenvolvimento sem login: ?admin=1 libera o megafone nesta conexão (o servidor só aceita sem login). */
export const DEV_ADMIN = import.meta.env.DEV && new URLSearchParams(location.search).get("admin") === "1";

export function openMegafone(): void {
  useApp.getState().togglePeople(false);
  useMegafoneUi.setState({ open: true });
  if (DEV_ADMIN) sendAct(MEGAFONE_ID, "admin-dev", { on: true });
}

function talk(on: boolean): void {
  sendAct(MEGAFONE_ID, "falar", { on });
  if (on) void setMic(true);
}

setMegaphone(() => {
  const id = actState<MegafoneState>(MEGAFONE_ID)?.speaker?.id ?? null;
  return id && !callsQuiet() ? id : null;
});

export const megafone: ActivityClient = {
  name: "escritorio/megafone",
  kinds: [MEGAFONE_KIND],
  onEvent: (e) => {
    if (e.ev === "aviso") {
      const a = e.data as MegafoneAviso;
      useMegafoneUi.setState((s) => ({ cards: [...s.cards.slice(-2), { ...a, key: ++seq }] }));
      notifyDesktop("megafone", `📣 ${a.by}: ${a.text}`);
    }
    if (e.ev === "ocupado") toast(T.megafone.busy((e.data as { name: string }).name), 5000);
  },
  Overlay: MegafoneOverlay,
};

const cardMotion = { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } };

function MegafoneOverlay() {
  const open = useMegafoneUi((s) => s.open);
  const cards = useMegafoneUi((s) => s.cards);
  const speaker = useAct<MegafoneState>(MEGAFONE_ID)?.speaker ?? null;
  const mine = useApp((s) => !!speaker && speaker.id === s.selfId);
  // Desligou (parou, passou do tempo): avisa quem estava falando.
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !mine) toast(T.megafone.off, 4500);
    was.current = mine;
  }, [mine]);
  const dismiss = (key: number) => useMegafoneUi.setState((s) => ({ cards: s.cards.filter((c) => c.key !== key) }));

  return (
    <>
      <AnimatePresence>{open && <MegafoneDialog speaker={speaker} mine={mine} />}</AnimatePresence>
      <InStack side="top-left" order={-1}>
        <div className="pointer-events-none flex w-[min(340px,calc(100vw-24px))] flex-col items-start gap-2 empty:hidden" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {speaker && (
              <motion.div key={`s-${speaker.id}`} {...cardMotion} className="glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs text-offwhite/90">
                <Megaphone className="size-3.5 shrink-0 text-orange" aria-hidden />
                <span className="truncate py-1">{mine ? T.megafone.youSpeaking : T.megafone.speaking(speaker.name)}</span>
                {mine && (
                  <button type="button" onClick={() => talk(false)} className="shrink-0 rounded-full px-2.5 py-1 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
                    {T.megafone.stop}
                  </button>
                )}
              </motion.div>
            )}
            {cards.map((c) => (
              <motion.div key={c.key} {...cardMotion} className="glass pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border-l-2 border-l-orange py-2.5 pl-3.5 pr-1.5">
                <Megaphone className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{T.megafone.from(c.by)}</p>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{c.text}</p>
                </div>
                <button type="button" onClick={() => dismiss(c.key)} aria-label={T.megafone.dismiss} title={T.megafone.dismiss} className="grid size-7 shrink-0 place-items-center rounded-full text-slate hover:bg-offwhite/8 hover:text-offwhite">
                  <X className="size-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </InStack>
    </>
  );
}

const fieldCls = "w-full resize-none rounded-xl border border-offwhite/10 bg-offwhite/5 px-3 py-2 text-sm text-offwhite placeholder:text-slate focus:border-signal focus:outline-none";

function MegafoneDialog({ speaker, mine }: { speaker: MegafoneState["speaker"]; mine: boolean }) {
  const [text, setText] = useState("");
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => useMegafoneUi.setState({ open: false });
  useEffect(() => focusSoon(closeBtn.current), []);
  useEscape(close);
  const busy = speaker && !mine ? speaker.name : null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute right-3 top-16 z-20 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)]"
      role="dialog"
      aria-label={T.megafone.title}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Megaphone className="size-4 text-orange" aria-hidden />
          <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{T.megafone.title}</h2>
        </div>
        <button ref={closeBtn} type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close}>
          <X className="size-4" />
        </button>
      </header>
      <div className="space-y-4 px-5 py-4">
        <p className="text-xs text-slate">{T.megafone.hint}</p>
        <form
          aria-label={T.megafone.written}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            sendAct(MEGAFONE_ID, "escrever", { text });
            setText("");
          }}
        >
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{T.megafone.written}</h3>
          <textarea aria-label={T.megafone.written} value={text} rows={3} maxLength={MEGAFONE_TEXT} onChange={(e) => setText(e.target.value)} placeholder={T.megafone.placeholder} className={fieldCls} />
          <button type="submit" disabled={!text.trim()} className="mt-2 rounded-xl bg-orange px-3 py-1.5 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-40">
            {T.megafone.send}
          </button>
        </form>
        <section aria-label={T.megafone.spoken}>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{T.megafone.spoken}</h3>
          <button
            type="button"
            aria-pressed={mine}
            disabled={!!busy}
            onClick={() => talk(!mine)}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${mine ? "bg-offwhite/10 text-offwhite hover:bg-offwhite/15" : "bg-orange text-offwhite hover:brightness-110"}`}
          >
            <Megaphone className="size-4" aria-hidden />
            {mine ? T.megafone.stop : T.megafone.talk}
          </button>
          <p className="mt-1.5 text-xs text-slate">{busy ? T.megafone.busy(busy) : T.megafone.talkHint}</p>
        </section>
      </div>
    </motion.aside>
  );
}
