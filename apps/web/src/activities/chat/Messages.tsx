import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, RotateCcw, X } from "lucide-react";
import { clsx } from "clsx";
import { chatKey, chatMentionsName, chatSameGroup, chatTokens, type AvatarLook, type ChatMsg } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { serverNow } from "../../net/session.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import { discardPending, isMine, myName, retryPending, type Pending } from "./store.ts";
import { dayKey, dayLabel, fullTimeOf, safeHref, timeOf } from "./util.ts";
import { T } from "./strings.ts";

/**
 * Lista de mensagens de um canal: separadas por dia, agrupadas quando a mesma pessoa escreve em
 * seguida, com horário em cada mensagem, links clicáveis, menções destacadas e uma linha "Novas"
 * onde começam as que você ainda não tinha lido. Acompanha o fim da lista se você já está lá.
 */

interface Props {
  label: string;
  msgs: readonly ChatMsg[];
  pending: readonly Pending[];
  /** Último id lido quando o canal abriu (para a linha "Novas"). */
  readAt: number;
  empty: ReactNode;
  loading?: boolean;
  /** Suas mensagens no Perto: quantas pessoas leram. */
  heard?: Record<number, number>;
  /** Quem é você (nas conversas diretas, pelo lado da conversa). */
  mine?: (m: ChatMsg) => boolean;
}

/** Nomes conhecidos (online e autores) e o visual de quem está online, por chave. */
function usePeople(msgs: readonly ChatMsg[]): { names: string[]; looks: Map<string, AvatarLook> } {
  const players = useApp((s) => s.players);
  const looks = useMemo(() => {
    const m = new Map<string, AvatarLook>();
    for (const p of Object.values(players)) m.set(chatKey(p.name), p.look);
    return m;
  }, [players]);
  // A lista de nomes só muda de identidade quando muda de conteúdo (as linhas são memorizadas).
  const joined = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of Object.values(players)) names.set(chatKey(p.name), p.name);
    for (const m of msgs) if (!names.has(m.fromKey)) names.set(m.fromKey, m.name);
    return [...names.values()].join("\u0001");
  }, [players, msgs]);
  const names = useMemo(() => (joined ? joined.split("\u0001") : []), [joined]);
  return { names, looks };
}

export function Messages({ label, msgs, pending, readAt, empty, loading, heard, mine = isMine }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [below, setBelow] = useState(false);
  const { names, looks } = usePeople(msgs);
  const me = myName();
  const now = serverNow();

  // Linha "Novas": antes da primeira mensagem de outra pessoa depois do que você tinha lido ao abrir.
  // Calculada uma vez, quando o conteúdo aparece: o que chega com o canal aberto já está sendo lido.
  const frozen = useRef<number | null>(null);
  if (frozen.current === null && !loading) frozen.current = msgs.find((m) => m.id > readAt && !mine(m))?.id ?? -1;
  const firstNew = frozen.current ?? -1;

  const toBottom = (smooth = false) => {
    const el = box.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setBelow(false);
  };

  // Conteúdo apareceu (uma vez): vai para a linha "Novas", se estiver longe, ou para o fim.
  const positioned = useRef(false);
  const skipNext = useRef(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || loading || positioned.current) return;
    positioned.current = true;
    skipNext.current = true;
    const mark = el.querySelector<HTMLElement>("[data-new-divider]");
    if (mark && mark.offsetTop > el.clientHeight * 0.5) el.scrollTop = mark.offsetTop - 48;
    else el.scrollTop = el.scrollHeight;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, [loading]);

  // Chegou mensagem: acompanha se você está no fim (ou se a mensagem é sua); senão, mostra o atalho.
  const lastId = msgs.at(-1)?.id ?? 0;
  const lastMine = msgs.length ? mine(msgs.at(-1)!) : false;
  useLayoutEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (!positioned.current) return;
    if (atBottom.current || lastMine) toBottom();
    else setBelow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, pending.length]);
  // O pulo acima vale só para o mesmo quadro em que o conteúdo foi posicionado.
  useLayoutEffect(() => {
    skipNext.current = false;
  });

  // A janela mudou de tamanho (teclado do celular abriu): continua no fim.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottom.current = bottom;
    if (bottom && below) setBelow(false);
  };

  const rows: ReactNode[] = [];
  let prev: ChatMsg | undefined;
  for (const m of msgs) {
    const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
    if (newDay) rows.push(<DayRule key={`d${m.id}`} label={dayLabel(m.at, now, T.today, T.yesterday)} />);
    const divider = m.id === firstNew;
    if (divider) rows.push(<NewRule key={`n${m.id}`} />);
    const head = newDay || divider || !chatSameGroup(prev, m);
    rows.push(<Row key={m.id} m={m} head={head} names={names} look={looks.get(m.fromKey)} me={me} mine={mine(m)} unheard={heard?.[m.id] === 0} />);
    prev = m;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={box} onScroll={onScroll} className="h-full select-text overflow-y-auto overscroll-contain py-2" role="log" aria-live="polite" aria-relevant="additions" aria-label={label}>
        {loading && !msgs.length ? (
          <p className="px-4 py-6 text-center text-xs text-slate">{T.loading}</p>
        ) : !msgs.length && !pending.length ? (
          <div className="px-5 py-8 text-center text-xs leading-relaxed text-slate">{empty}</div>
        ) : null}
        {rows}
        {pending.map((p, i) => (
          <PendingRow key={p.cid} p={p} head={i === 0 && !(prev && mine(prev) && p.at - prev.at < 300_000)} look={looks.get(chatKey(me))} me={me} />
        ))}
      </div>
      {below && (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-offwhite/12 bg-card px-3 py-1.5 text-xs font-medium text-offwhite shadow-lg hover:border-signal/60"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {T.jump}
        </button>
      )}
    </div>
  );
}

function DayRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-1 pt-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-offwhite/8" />
      <span className="text-[11px] font-medium text-slate">{label}</span>
      <span className="h-px flex-1 bg-offwhite/8" />
    </div>
  );
}

function NewRule() {
  return (
    <div data-new-divider className="flex items-center gap-2 px-4 py-1" role="separator" aria-label={T.newDivider}>
      <span className="h-px flex-1 bg-signal/50" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">{T.newDivider}</span>
    </div>
  );
}

/** Retrato: o avatar de quem está online; senão, a inicial. */
function Face({ look, name }: { look: AvatarLook | undefined; name: string }) {
  if (look) return <AvatarFace look={look} size={28} className="rounded-full" />;
  return (
    <span className="grid size-7 place-items-center rounded-full bg-card-2 font-display text-[11px] font-bold text-offwhite/80" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

const Row = memo(function Row({ m, head, names, look, me, mine, unheard }: { m: ChatMsg; head: boolean; names: string[]; look: AvatarLook | undefined; me: string; mine: boolean; unheard: boolean }) {
  const mentioned = !mine && chatMentionsName(m.text, me);
  const iso = new Date(m.at).toISOString();
  return (
    <div
      data-chat-msg={m.id}
      className={clsx("group flex gap-2.5 px-3", head ? "mt-1.5 pt-1" : "", mentioned ? "bg-orange/[0.08] shadow-[inset_2px_0_0_var(--color-orange)]" : "hover:bg-offwhite/[0.03]")}
    >
      <div className="w-7 shrink-0">
        {head ? (
          <Face look={look} name={m.name} />
        ) : (
          <time dateTime={iso} title={fullTimeOf(m.at)} className="block pt-[3px] text-right text-[10px] tabular-nums leading-[18px] text-slate/45 group-hover:text-slate">
            {timeOf(m.at)}
          </time>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        {head ? (
          <p className="flex items-baseline gap-2 leading-tight">
            <span className="truncate text-[13px] font-semibold text-offwhite">{m.name}</span>
            {mine && <span className="text-[11px] text-slate">({T.you})</span>}
            <time dateTime={iso} title={fullTimeOf(m.at)} className="shrink-0 text-[11px] tabular-nums text-slate">
              {timeOf(m.at)}
            </time>
          </p>
        ) : (
          <span className="sr-only">{m.name}, {timeOf(m.at)}: </span>
        )}
        <p className="whitespace-pre-wrap text-[13.5px] leading-[1.45] text-offwhite/90 [overflow-wrap:anywhere]">
          <MsgText text={m.text} names={names} me={me} />
        </p>
        {unheard && <p className="mt-0.5 text-[11px] text-slate">{T.near.unheard}</p>}
      </div>
    </div>
  );
});

function PendingRow({ p, head, look, me }: { p: Pending; head: boolean; look: AvatarLook | undefined; me: string }) {
  return (
    <div className={clsx("flex gap-2.5 px-3", head && "mt-1.5 pt-1")} aria-busy={!p.failed}>
      <div className="w-7 shrink-0">{head && <Face look={look} name={me} />}</div>
      <div className="min-w-0 flex-1 pb-0.5">
        {head && (
          <p className="flex items-baseline gap-2 leading-tight">
            <span className="truncate text-[13px] font-semibold text-offwhite">{me}</span>
            <span className="text-[11px] text-slate">({T.you})</span>
          </p>
        )}
        <p className={clsx("whitespace-pre-wrap text-[13.5px] leading-[1.45] [overflow-wrap:anywhere]", p.failed ? "text-offwhite/60" : "text-offwhite/50")}>{p.text}</p>
        {p.failed ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" role="alert">
            <span className="text-danger">{T.failed[p.failed] ?? T.failed.offline}</span>
            <button type="button" onClick={() => retryPending(p.cid)} className="inline-flex items-center gap-1 rounded px-1 text-offwhite/80 hover:text-offwhite">
              <RotateCcw className="size-3" aria-hidden />
              {T.retry}
            </button>
            <button type="button" onClick={() => discardPending(p.cid)} className="inline-flex items-center gap-1 rounded px-1 text-slate hover:text-offwhite">
              <X className="size-3" aria-hidden />
              {T.discard}
            </button>
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-slate/70">{T.sending}</p>
        )}
      </div>
    </div>
  );
}

/** Texto com links (só http/https, nova aba, sem referrer) e menções destacadas. Nunca HTML vindo de fora. */
export function MsgText({ text, names, me }: { text: string; names: string[]; me: string }) {
  const meKey = chatKey(me);
  const toks = useMemo(() => chatTokens(text, names), [text, names]);
  return (
    <>
      {toks.map((t, i) => {
        if (t.t === "text") return <Fragment key={i}>{t.s}</Fragment>;
        if (t.t === "link") {
          const href = safeHref(t.href);
          if (!href) return <Fragment key={i}>{t.s}</Fragment>;
          return (
            <a key={i} href={href} target="_blank" rel="noreferrer" className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal">
              {t.s}
            </a>
          );
        }
        const self = t.key === meKey;
        return (
          <span key={i} className={clsx("rounded px-0.5", self ? "bg-orange/20 font-semibold text-orange" : "bg-signal/10 font-medium text-signal")}>
            {t.s}
          </span>
        );
      })}
    </>
  );
}
