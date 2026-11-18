import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { CHAT_TEXT_MAX, chatKey, chatMentionQuery } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import { myKey, setDraft, useChat } from "./store.ts";
import { interceptChat } from "./intercept.ts";
import { T } from "./strings.ts";

/**
 * Campo de mensagem: Enter envia, Shift+Enter quebra a linha, cresce até 6 linhas, guarda o
 * rascunho por canal e sugere nomes ao digitar "@" (setas para escolher, Enter ou Tab para usar).
 */

export interface ComposerHandle {
  focus(): void;
}

interface Props {
  /** Canal do rascunho ("geral", "perto", "dm:<chave>"). */
  slot: string;
  placeholder: string;
  onSend(text: string): void;
}

const COUNT_FROM = 800;

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ slot, placeholder, onSend }, ref) {
  const value = useChat((s) => s.drafts[slot] ?? "");
  const players = useApp((s) => s.players);
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus({ preventScroll: true }) }), []);

  // Pessoas online para mencionar (menos você).
  const people = useMemo(() => {
    const me = myKey();
    const seen = new Set<string>();
    return Object.values(players)
      .filter((p) => {
        const k = chatKey(p.name);
        if (k === me || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [players]);

  const query = useMemo(() => chatMentionQuery(value, caret, people.map((p) => p.name)), [value, caret, people]);
  const options = useMemo(() => {
    if (!query || query.start === dismissed) return [];
    const q = query.query.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(` ${q}`)).slice(0, 6);
  }, [query, people, dismissed]);
  const showList = options.length > 0;
  const idx = Math.min(active, Math.max(0, options.length - 1));

  // Cresce com o texto até ~6 linhas.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [value]);

  const set = (text: string) => setDraft(slot, text);
  const syncCaret = () => setCaret(area.current?.selectionStart ?? 0);

  const pick = (name: string) => {
    if (!query) return;
    const before = value.slice(0, query.start);
    const after = value.slice(caret);
    const insert = `@${name} `;
    set(before + insert + after.replace(/^ /, ""));
    const pos = before.length + insert.length;
    setActive(0);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    // Frases que ficam só aqui (pacote easter): limpa o campo e não envia nada.
    if (!interceptChat(text)) onSend(value);
    set("");
    setDismissed(null);
    setCaret(0);
  };

  return (
    <div className="relative border-t border-offwhite/8 p-2.5">
      {showList && (
        <ul
          id={`chat-mention-${slot}`}
          role="listbox"
          aria-label={T.mentionList}
          className="absolute bottom-full left-2.5 right-2.5 mb-1 overflow-hidden rounded-xl border border-offwhite/10 bg-space p-1 shadow-2xl"
        >
          {options.map((p, i) => (
            <li
              key={p.id}
              id={`chat-mention-${slot}-${i}`}
              role="option"
              aria-selected={i === idx}
              onPointerDown={(e) => {
                e.preventDefault();
                pick(p.name);
              }}
              onPointerEnter={() => setActive(i)}
              className={clsx("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm", i === idx ? "bg-offwhite/10 text-offwhite" : "text-offwhite/85")}
            >
              <AvatarFace look={p.look} size={22} className="shrink-0 rounded-full" />
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-offwhite/10 bg-deep/70 py-1 pl-3 pr-1 focus-within:border-signal/70">
        <textarea
          ref={area}
          value={value}
          rows={1}
          maxLength={CHAT_TEXT_MAX}
          enterKeyHint="send"
          placeholder={placeholder}
          aria-label={T.composer}
          aria-describedby={`chat-hint-${slot}`}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? `chat-mention-${slot}` : undefined}
          aria-activedescendant={showList ? `chat-mention-${slot}-${idx}` : undefined}
          onChange={(e) => {
            set(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setActive(0);
          }}
          onSelect={syncCaret}
          onClick={syncCaret}
          onKeyDown={(e) => {
            if (showList) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                setActive((idx + d + options.length) % options.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(options[idx]!.name);
                return;
              }
              if (e.key === "Escape") {
                // Fecha só a lista de nomes (o painel fica aberto).
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setDismissed(query?.start ?? null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[148px] min-h-[34px] flex-1 resize-none bg-transparent py-[7px] text-base leading-[1.4] text-offwhite placeholder:text-slate/70 focus:outline-none sm:text-[13.5px]"
        />
        <button
          type="button"
          onClick={() => {
            submit();
            area.current?.focus();
          }}
          disabled={!value.trim()}
          aria-label={T.send}
          title={T.send}
          className={clsx(
            "mb-0.5 grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
            value.trim() ? "bg-signal text-space hover:brightness-110" : "text-slate/60",
          )}
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      <p id={`chat-hint-${slot}`} className="mt-1 flex justify-between gap-2 px-1 text-[10.5px] text-slate/70">
        <span className="hidden sm:inline">{T.newline}</span>
        {value.length >= COUNT_FROM && (
          <span className={clsx("ml-auto tabular-nums", value.length >= CHAT_TEXT_MAX ? "text-warn" : "")}>{T.count(value.length, CHAT_TEXT_MAX)}</span>
        )}
      </p>
    </div>
  );
});
