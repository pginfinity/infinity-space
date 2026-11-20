import { useEffect, useRef, useState, type FormEvent } from "react";
import { create } from "zustand";
import { Bot, SendHorizontal, X } from "lucide-react";
import { ORBI_ASK_ID, ORBI_ASK_KIND, ORBI_ASK_MAX } from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { InStack } from "../../ui/HudStack.tsx";
import { toast } from "../../ui/toasts.ts";
import { T } from "./strings.ts";

/**
 * Perguntas ao Orbi (IA): "onde está a Ana?", "o que foi decidido na daily?". A caixa abre pela busca
 * (Ctrl+K) ou pelo balão de quando o Orbi segue a pessoa. Só existe se o servidor tem a chave da IA.
 * As perguntas ficam só nesta aba (somem ao recarregar).
 */

interface Item {
  q: string;
  /** null enquanto espera a resposta. */
  text: string | null;
}

const useAsk = create<{ open: boolean; items: Item[] }>(() => ({ open: false, items: [] }));
/** Sem resposta neste tempo (servidor reiniciou, rede caiu): libera a caixa. */
const WAIT_MS = 75_000;
let waitTimer = 0;

/** A última pergunta em espera recebe a resposta (ou entra uma nova, se não houver). */
function settle(items: Item[], q: string, text: string): Item[] {
  const i = items.findLastIndex((x) => x.text === null);
  if (i < 0) return [...items, { q, text }].slice(-6);
  return items.map((x, j) => (j === i ? { ...x, text } : x));
}

export function orbiAskOn(): boolean {
  return !!actState(ORBI_ASK_ID);
}

export function openOrbiAsk(): void {
  if (!orbiAskOn()) return void toast(T.orbi.askOff);
  useAsk.setState({ open: true });
}

export const orbiAskClient: ActivityClient = {
  name: "vivo/orbi-ia",
  kinds: [ORBI_ASK_KIND],
  onEvent: (e) => {
    if (e.ev !== "answer") return;
    const { q, text } = e.data as { q: string; text: string };
    window.clearTimeout(waitTimer);
    useAsk.setState((s) => ({ items: settle(s.items, q, text) }));
  },
  Overlay: OrbiAskOverlay,
};

function OrbiAskOverlay() {
  const on = !!useAct(ORBI_ASK_ID);
  const open = useAsk((s) => s.open);
  const items = useAsk((s) => s.items);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLLIElement>(null);
  const waiting = items.at(-1)?.text === null;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // Chaves: o Chrome novo devolve uma Promise do scrollIntoView, e o React a trataria como limpeza.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items]);
  if (!on || !open) return null;

  const close = () => useAsk.setState({ open: false });
  const send = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v || waiting) return;
    sendAct(ORBI_ASK_ID, "ask", { q: v });
    setQ("");
    // O botão fica desabilitado na espera; o foco fica no campo para o Esc continuar fechando.
    input.current?.focus();
    useAsk.setState((s) => ({ items: [...s.items, { q: v, text: null }].slice(-6) }));
    window.clearTimeout(waitTimer);
    waitTimer = window.setTimeout(() => useAsk.setState((s) => ({ items: settle(s.items, v, T.orbi.askNoAnswer) })), WAIT_MS);
  };

  return (
    <InStack side="bottom-left" order={3}>
      <div
        role="dialog"
        aria-label={T.orbi.askTitle}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className="pointer-events-auto flex w-[min(360px,calc(100vw-24px))] flex-col rounded-2xl border border-offwhite/10 bg-space p-3 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-card text-sky" aria-hidden>
            <Bot className="size-4" />
          </span>
          <p className="flex-1 text-sm font-medium">{T.orbi.askTitle}</p>
          <button type="button" onClick={close} className="-m-1 rounded-lg p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.orbi.askClose} title={T.orbi.askClose}>
            <X className="size-3.5" />
          </button>
        </div>
        {items.length ? (
          <ol className="mt-2.5 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1 text-sm" aria-live="polite">
            {items.map((it, i) => (
              <li key={i} ref={i === items.length - 1 ? end : undefined} className="flex flex-col gap-1">
                <p className="self-end rounded-xl bg-offwhite/8 px-2.5 py-1.5 text-offwhite/90">{it.q}</p>
                <p className={it.text === null ? "text-slate" : "text-offwhite"}>{it.text ?? T.orbi.askThinking}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-slate">{T.orbi.askHint}</p>
        )}
        <form onSubmit={send} className="mt-2.5 flex gap-1.5">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={ORBI_ASK_MAX}
            placeholder={T.orbi.askPlaceholder}
            aria-label={T.orbi.askLabel}
            className="min-w-0 flex-1 rounded-lg border border-offwhite/10 bg-offwhite/5 px-2.5 py-1.5 text-sm text-offwhite placeholder:text-slate"
          />
          <button
            type="submit"
            disabled={waiting || !q.trim()}
            aria-label={T.orbi.askSend}
            title={T.orbi.askSend}
            className="grid shrink-0 place-items-center rounded-lg bg-offwhite px-3 text-space hover:brightness-95 disabled:opacity-40"
          >
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </InStack>
  );
}
