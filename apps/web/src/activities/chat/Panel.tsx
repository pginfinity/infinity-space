import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type Ref, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Ear, X } from "lucide-react";
import { clsx } from "clsx";
import { chatHearers, chatKey, chatPreview, type AvatarLook, type ChatHearer } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { serverNow } from "../../net/session.ts";
import { remoteIds, sampleRemote, self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { placeName } from "../../world/zoneLabel.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import { Composer, type ComposerHandle } from "./Composer.tsx";
import { Messages } from "./Messages.tsx";
import { closeConv, isMineDm, myKey, openConv, sendMessage, setChatOpen, setTab, unreadOf, useChat, type ChatTab, type Conv } from "./store.ts";
import { focusSoon, whenShort } from "./util.ts";
import { T } from "./strings.ts";

/**
 * Painel do chat, no lado direito (no padrão do painel Pessoas): abas Geral, Perto e Conversas.
 * No celular ocupa a tela e sobe junto com o teclado virtual.
 */

export function ChatPanel() {
  const open = useChat((s) => s.open);
  return <AnimatePresence>{open && <PanelBody />}</AnimatePresence>;
}

/** Altura do teclado virtual (celular): o painel termina acima dele. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Só no celular (tela cheia): no computador, o zoom de pinça também encolhe a área visível.
    const update = () => setInset(window.innerWidth < 640 ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

const TABS: ChatTab[] = ["geral", "perto", "dm"];

function PanelBody() {
  const tab = useChat((s) => s.tab);
  const peer = useChat((s) => s.peer);
  const geralN = useChat((s) => unreadOf(s).geral);
  const pertoN = useChat((s) => unreadOf(s).perto);
  const dmN = useChat((s) => unreadOf(s).dm);
  const root = useRef<HTMLElement>(null);
  const kb = useKeyboardInset();

  const close = () => {
    const inside = root.current?.contains(document.activeElement);
    setChatOpen(false);
    if (inside) document.querySelector<HTMLElement>("[data-chat-dock]")?.focus();
  };

  // Esc fecha (a lista de nomes do campo, quando aberta, segura o Esc antes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]!);
    requestAnimationFrame(() => document.getElementById(`chat-tab-${TABS[next]}`)?.focus());
  };

  const counts: Record<ChatTab, { n: number; strong: boolean }> = {
    geral: { n: geralN, strong: false },
    perto: { n: pertoN, strong: false },
    dm: { n: dmN, strong: true },
  };

  return (
    <motion.aside
      ref={root}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-modal="false"
      aria-label={T.title}
      data-chat-panel
      style={kb > 0 ? { bottom: kb } : undefined}
      className={clsx(
        "glass pointer-events-auto absolute z-20 flex flex-col overflow-hidden bg-space/[0.94]",
        // Celular: tela cheia (respeitando entalhe e barra de gestos). Telas maiores: painel à direita.
        "inset-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
        "sm:inset-auto sm:bottom-24 sm:right-3 sm:top-16 sm:w-[min(380px,calc(100vw-24px))] sm:rounded-[var(--radius-panel)] sm:pb-0 sm:pt-0",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{T.title}</h2>
        <button type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close} title={T.close}>
          <X className="size-4" />
        </button>
      </header>
      <div role="tablist" aria-label={T.title} className="flex gap-1 border-b border-offwhite/8 px-3" onKeyDown={onTabKey}>
        {TABS.map((t) => {
          const on = tab === t;
          const c = counts[t];
          return (
            <button
              key={t}
              id={`chat-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="chat-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t)}
              className={clsx(
                "relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1.5 text-[13px] font-medium",
                on ? "border-offwhite text-offwhite" : "border-transparent text-slate hover:text-offwhite",
              )}
            >
              {T.tabs[t]}
              {c.n > 0 && !on && (
                <span
                  className={clsx(
                    "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-none",
                    c.strong ? "bg-offwhite text-space" : "bg-offwhite/15 text-offwhite",
                  )}
                  aria-label={T.convs.unread(c.n)}
                >
                  {c.n > 99 ? "99+" : c.n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div id="chat-tabpanel" role="tabpanel" aria-labelledby={`chat-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === "geral" && <ChannelView key="geral" ch="geral" />}
        {tab === "perto" && <ChannelView key="perto" ch="perto" />}
        {tab === "dm" && (peer ? <DmView key={peer} peer={peer} /> : <ConvList />)}
      </div>
    </motion.aside>
  );
}

// ---- Geral e Perto ---------------------------------------------------------------------------

/**
 * Foca o campo ao abrir o canal (depois da tecla que abriu o painel). No celular não: o teclado
 * virtual cobriria as mensagens antes de a pessoa decidir escrever.
 */
function focusComposerSoon(ref: RefObject<ComposerHandle | null>): () => void {
  if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return () => undefined;
  const id = window.setTimeout(() => ref.current?.focus(), 40);
  return () => window.clearTimeout(id);
}

function ChannelView({ ch }: { ch: "geral" | "perto" }) {
  const msgs = useChat((s) => s[ch]);
  const loaded = useChat((s) => (ch === "geral" ? s.geralLoaded : true));
  const allPending = useChat((s) => s.pending);
  const pending = useMemo(() => allPending.filter((p) => p.ch === ch), [allPending, ch]);
  const heard = useChat((s) => s.heard);
  // Linha "Novas": o que estava lido quando o conteúdo do canal apareceu (o Geral pode chegar depois).
  const readAtRef = useRef<number | null>(null);
  if (readAtRef.current === null && loaded) readAtRef.current = useChat.getState().read[ch];
  const readAt = readAtRef.current ?? 0;
  const composer = useRef<ComposerHandle>(null);
  useEffect(() => focusComposerSoon(composer), []);

  return (
    <>
      {ch === "perto" ? <NearStrip /> : <p className="border-b border-offwhite/6 px-4 py-2 text-[11px] text-slate">{T.tabHint.geral}</p>}
      <Messages
        label={T.tabs[ch]}
        msgs={msgs}
        pending={pending}
        readAt={readAt}
        loading={!loaded}
        heard={ch === "perto" ? heard : undefined}
        empty={ch === "geral" ? T.empty.geral : T.empty.perto}
      />
      <Composer ref={composer} slot={ch} placeholder={T.placeholder[ch]} onSend={(text) => sendMessage(ch, text)} />
    </>
  );
}

/** Quem lê o Perto agora (mesma regra da voz), atualizado a cada segundo. */
function NearStrip() {
  const players = useApp((s) => s.players);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let lastKey = "";
    const update = () => {
      const w = world();
      const pos = { x: self.x, z: self.z };
      const others: ChatHearer[] = [];
      for (const id of remoteIds()) {
        const p = sampleRemote(id);
        if (p) others.push({ id, pos: { x: p.x, z: p.z }, zone: w.zones.zoneAt(p) });
      }
      const list = chatHearers(w.map.walls, { pos, zone: w.zones.zoneAt(pos) }, others).sort();
      const key = list.join(",");
      if (key !== lastKey) {
        lastKey = key;
        setIds(list);
      }
    };
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, []);
  const people = ids.map((id) => players[id]).filter((p) => !!p);
  return (
    <div className="flex items-center gap-2 border-b border-offwhite/6 px-4 py-2" role="status" aria-live="polite" data-chat-near>
      <Ear className="size-3.5 shrink-0 text-signal" aria-hidden />
      {people.length ? (
        <>
          <span className="flex shrink-0 -space-x-1.5">
            {people.slice(0, 5).map((p) => (
              <AvatarFace key={p.id} look={p.look} size={20} className="rounded-full ring-2 ring-space" />
            ))}
          </span>
          <p className="min-w-0 truncate text-[11px] text-offwhite/85">
            <span className="text-slate">{T.near.label}: </span>
            {T.near.people(people.map((p) => p.name))}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-slate">{T.near.nobody}</p>
      )}
    </div>
  );
}

// ---- Conversas -------------------------------------------------------------------------------

/** Visual e sessões online de cada pessoa, pela chave. */
function useOnline(): Map<string, { look: AvatarLook; ids: string[]; name: string }> {
  const players = useApp((s) => s.players);
  return useMemo(() => {
    const m = new Map<string, { look: AvatarLook; ids: string[]; name: string }>();
    for (const p of Object.values(players)) {
      const k = chatKey(p.name);
      const cur = m.get(k);
      if (cur) cur.ids.push(p.id);
      else m.set(k, { look: p.look, ids: [p.id], name: p.name });
    }
    return m;
  }, [players]);
}

function Face({ look, name, size = 32 }: { look: AvatarLook | undefined; name: string; size?: number }) {
  if (look) return <AvatarFace look={look} size={size} className="shrink-0 rounded-full" />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-card-2 font-display text-xs font-bold text-offwhite/80" style={{ width: size, height: size }} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function ConvList() {
  const convs = useChat((s) => s.convs);
  const online = useOnline();
  const me = myKey();
  const list = useMemo(() => Object.values(convs).sort((a, b) => (b.last?.id ?? Infinity) - (a.last?.id ?? Infinity)), [convs]);
  const others = useMemo(
    () =>
      [...online.entries()]
        .filter(([k]) => k !== me && !convs[k])
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [online, convs, me],
  );
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => focusSoon(first.current), []);
  const now = serverNow();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
      {list.length === 0 && <p className="px-3 py-3 text-xs text-slate">{T.empty.convs}</p>}
      <ul aria-label={T.convs.title}>
        {list.map((c, i) => (
          <li key={c.key}>
            <ConvItem c={c} look={online.get(c.key)?.look} isOnline={online.has(c.key)} now={now} btnRef={i === 0 ? first : undefined} />
          </li>
        ))}
      </ul>
      <p className="label-caps mt-3 px-3 pb-1">{T.convs.start}</p>
      {others.length === 0 && <p className="px-3 py-1 text-xs text-slate">{T.convs.nobodyOnline}</p>}
      <ul aria-label={T.convs.start}>
        {others.map((p, i) => (
          <li key={p.key}>
            <button
              ref={list.length === 0 && i === 0 ? first : undefined}
              type="button"
              onClick={() => openConv(p.key, p.name)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-offwhite/5"
            >
              <Face look={p.look} name={p.name} size={26} />
              <span className="truncate text-sm">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConvItem({ c, look, isOnline, now, btnRef }: { c: Conv; look: AvatarLook | undefined; isOnline: boolean; now: number; btnRef?: Ref<HTMLButtonElement> }) {
  const last = c.last;
  const preview = last ? `${isMineDm(last, c.key) ? T.convs.you : ""}${chatPreview(last.text, 80)}` : "";
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => openConv(c.key, c.name)}
      aria-label={`${c.name}${c.unread ? `, ${T.convs.unread(c.unread)}` : ""}`}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-offwhite/5"
    >
      <span className="relative">
        <Face look={look} name={c.name} />
        {isOnline && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-space" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={clsx("truncate text-sm", c.unread ? "font-semibold text-offwhite" : "font-medium text-offwhite/90")}>{c.name}</span>
          {last && <span className="shrink-0 text-[11px] tabular-nums text-slate">{whenShort(last.at, now, T.yesterday)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={clsx("truncate text-xs", c.unread ? "text-offwhite/85" : "text-slate")}>{preview}</span>
          {c.unread > 0 && (
            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-offwhite px-1 text-[10px] font-bold tabular-nums leading-none text-space" aria-hidden>
              {c.unread > 99 ? "99+" : c.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function DmView({ peer }: { peer: string }) {
  const conv = useChat((s) => s.convs[peer]);
  const allPending = useChat((s) => s.pending);
  const pending = useMemo(() => allPending.filter((p) => p.ch === "dm" && chatKey(p.to ?? "") === peer), [allPending, peer]);
  const online = useOnline();
  const who = online.get(peer);
  const name = who?.name ?? conv?.name ?? peer;
  const [readAt] = useState(() => useChat.getState().read.dm[peer] ?? 0);
  const composer = useRef<ComposerHandle>(null);
  useEffect(() => focusComposerSoon(composer), []);
  const where = who ? sampleRemote(who.ids[0]!) : null;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-offwhite/6 px-2 py-2">
        <button type="button" onClick={closeConv} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.convs.back} title={T.convs.back}>
          <ArrowLeft className="size-4" />
        </button>
        <span className="relative">
          <Face look={who?.look} name={name} size={28} />
          {who && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-space" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[11px] text-slate">{who ? `${T.convs.online}${where ? ` · ${placeName(where)}` : ""}` : T.convs.offline}</p>
        </div>
      </div>
      {who && who.ids.length > 1 && <p className="border-b border-offwhite/6 bg-warn/10 px-4 py-1.5 text-[11px] text-warn">{T.convs.homonyms(who.ids.length)}</p>}
      <Messages
        label={T.message(name)}
        msgs={conv?.msgs ?? []}
        pending={pending}
        readAt={readAt}
        loading={!!conv && !conv.loaded}
        mine={(m) => isMineDm(m, peer)}
        empty={T.empty.dm(name)}
      />
      <Composer ref={composer} slot={`dm:${peer}`} placeholder={T.placeholder.dm(name)} onSend={(text) => sendMessage("dm", text, peer)} />
    </>
  );
}
