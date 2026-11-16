import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import {
  Armchair,
  Box,
  Cat,
  Coffee,
  Flower2,
  Footprints,
  Globe,
  Headphones,
  Image,
  LampDesk,
  Library,
  Mail,
  Map as MapIcon,
  PersonStanding,
  Pin,
  Rocket,
  Sprout,
  StickyNote,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { MESAS_ITEMS, MESAS_ITEMS_MAX, MESAS_NOTE_MAX, MESAS_NOTE_RANGE, mesasKey, mesasLabel, vivoDay, type MesasDesk, type MesasItem, type MesasNote } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { serverNow } from "../../net/session.ts";
import { self } from "../../world/registry.ts";
import {
  act,
  deskById,
  desks,
  freeDesks,
  markSeen,
  myDesk,
  myFixed,
  openPanel,
  ownerOf,
  unread,
  useMesas,
  useMesasState,
  useMyKey,
} from "./state.ts";
import { focusSoon, goSit, selfNear, useEscape } from "./shared.ts";
import { T } from "./strings.ts";
import { InStack } from "../../ui/HudStack.tsx";

/** Ícone de cada objeto pessoal no painel. */
export const ITEM_ICON: Record<MesasItem, LucideIcon> = {
  caneca: Coffee,
  vasinho: Flower2,
  cacto: Sprout,
  "porta-retrato": Image,
  boneco: PersonStanding,
  fones: Headphones,
  livros: Library,
  cubo: Box,
  luminaria: LampDesk,
  globo: Globe,
  foguete: Rocket,
  gatinho: Cat,
};

const PANEL = "glass pointer-events-auto absolute z-20 flex flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite";
const motionProps = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

/** Relógio de parede para "há 3 min" (atualiza a cada 30 s). */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function Header({ icon: Icon, title, sub, onClose }: { icon: LucideIcon; title: string; sub?: ReactNode; onClose: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-offwhite/8 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-slate" aria-hidden />
        <div className="min-w-0">
          <h2 className="truncate font-display text-sm font-medium uppercase tracking-[0.1em]">{title}</h2>
          {sub && <p className="truncate text-[11px] text-slate">{sub}</p>}
        </div>
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite focus-visible:outline-2 focus-visible:outline-signal" aria-label={T.close}>
        <X className="size-4" />
      </button>
    </header>
  );
}

function Section({ title, aside, children, label }: { title: string; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="border-b border-offwhite/8 px-4 py-3 last:border-b-0" aria-label={label ?? title}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="label-caps">{title}</h3>
        {aside && <span className="text-[11px] tabular-nums text-slate">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const btnQuiet =
  "inline-flex items-center gap-1.5 rounded-lg bg-offwhite/8 px-2.5 py-1.5 text-xs font-medium text-offwhite/90 transition-colors hover:bg-offwhite/14 focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-40";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange px-4 py-1.5 text-sm font-semibold text-offwhite transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offwhite disabled:opacity-40";

function NoteItem({ note, now, who, onRemove, removeLabel, fresh }: { note: MesasNote; now: number; who: string; onRemove: () => void; removeLabel: string; fresh?: boolean }) {
  return (
    <li className="flex gap-2.5 rounded-xl bg-deep/50 p-2.5" data-recado={note.id}>
      <span className={clsx("mt-0.5 w-1 shrink-0 self-stretch rounded-full", fresh ? "bg-signal" : "bg-offwhite/15")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-sm leading-snug">{note.text}</p>
        <p className="mt-1 text-[11px] text-slate">
          {who} · {T.timeAgo(note.at, now)}
        </p>
      </div>
      <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="self-start rounded-md p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite focus-visible:outline-2 focus-visible:outline-signal">
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

// ---- painel "Minha mesa" ------------------------------------------------------------------

export function DeskPanel() {
  const s = useMesasState();
  const key = useMyKey();
  const priv = useMesas((u) => u.priv);
  useMesas((u) => u.seen); // relê os "vistos" quando mudam
  const now = useNow();
  const close = () => useMesas.setState({ panel: false });
  useEscape(close);
  const box = useRef<HTMLElement>(null);
  useEffect(() => focusSoon(box.current), []);

  const desk = myDesk(s, key);
  const fixed = myFixed(s, key);
  const checkedIn = !!desk && desk.id !== fixed?.id;
  const items = (key && s?.items[key]) || [];
  const inbox = priv?.inbox ?? [];
  const fresh = useMemo(() => new Set(unread(inbox).map((n) => n.id)), [inbox]);
  const last = deskById(priv?.last);
  const lastFree = !!last && !ownerOf(s, last.id);
  const free = freeDesks(s).length;

  // Recados abertos no painel contam como lidos.
  useEffect(() => {
    if (inbox.length) markSeen(inbox);
  }, [inbox]);

  const toggle = (it: MesasItem) => {
    const next = items.includes(it) ? items.filter((x) => x !== it) : [...items, it].slice(0, MESAS_ITEMS_MAX);
    act.items(next);
  };

  return (
    <motion.aside
      {...motionProps}
      ref={box}
      tabIndex={-1}
      className={clsx(PANEL, "right-2 top-16 max-h-[calc(100dvh-160px)] w-[min(380px,calc(100vw-16px))] outline-none sm:right-3 sm:max-h-[calc(100dvh-292px)]")}
      role="dialog"
      aria-label={T.panel.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <Header icon={Armchair} title={T.panel.title} sub={desk ? mesasLabel(desk) : T.panel.none} onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-offwhite/8 px-4 py-3" aria-label="Situação da mesa">
          {desk ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mesasLabel(desk)}</p>
                <p className="text-[11px] text-slate">{checkedIn ? T.panel.until : T.panel.fixed}</p>
                {checkedIn && fixed && <p className="mt-0.5 truncate text-[11px] text-slate">{T.panel.fixedToo(mesasLabel(fixed))}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button type="button" className={btnQuiet} onClick={() => goSit(desk)}>
                  <Footprints className="size-3.5" aria-hidden />
                  {T.panel.go}
                </button>
                {checkedIn && (
                  <button type="button" className={btnQuiet} onClick={act.checkout}>
                    {T.panel.release}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[13px] leading-snug text-offwhite/85">{T.panel.noneHint}</p>
              {last && lastFree && (
                <button type="button" className={clsx(btnPrimary, "w-full")} onClick={() => act.checkinLast(last.id)}>
                  {T.panel.last(mesasLabel(last))}
                </button>
              )}
              {last && !lastFree && <p className="text-[11px] text-slate">{T.panel.lastBusy(mesasLabel(last))}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate">{T.panel.free(free)}</span>
                <button
                  type="button"
                  className={btnQuiet}
                  onClick={() => {
                    close();
                    window.dispatchEvent(new Event("infinity:map"));
                  }}
                >
                  <MapIcon className="size-3.5" aria-hidden />
                  {T.panel.seeMap}
                </button>
              </div>
            </div>
          )}
        </section>

        <Section title={T.panel.items} aside={T.panel.itemsCount(items.length, MESAS_ITEMS_MAX)}>
          <p className="mb-2 text-[11px] text-slate">{T.panel.itemsHint}</p>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={T.panel.items}>
            {MESAS_ITEMS.map((it) => {
              const Icon = ITEM_ICON[it];
              const on = items.includes(it);
              const full = !on && items.length >= MESAS_ITEMS_MAX;
              return (
                <button
                  key={it}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggle(it)}
                  className={clsx(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-signal",
                    on ? "bg-signal/15 text-offwhite ring-1 ring-signal/70" : "bg-offwhite/5 text-offwhite/80 hover:bg-offwhite/10",
                    full && "cursor-not-allowed opacity-35 hover:bg-offwhite/5",
                  )}
                >
                  <Icon className={clsx("size-4", on ? "text-signal" : "text-slate")} aria-hidden />
                  <span className="text-center">{T.item(it)}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title={T.panel.notes} aside={inbox.length ? String(inbox.length) : undefined}>
          {inbox.length === 0 ? (
            <p className="py-1 text-xs text-slate">{T.panel.notesEmpty}</p>
          ) : (
            <ul className="space-y-1.5" aria-label={T.panel.notes}>
              {[...inbox].reverse().map((n) => (
                <NoteItem key={n.id} note={n} now={now} who={n.fromName} fresh={fresh.has(n.id)} removeLabel={T.panel.remove} onRemove={() => act.removeNote(n.id)} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate/80">{T.panel.notesPrivate}</p>
        </Section>

        {priv?.admin && <AdminSection />}
      </div>
    </motion.aside>
  );
}

/** Admin: lista e marca mesas fixas. */
function AdminSection({ initial }: { initial?: string }) {
  const s = useMesasState();
  const players = useApp((st) => st.players);
  const all = desks();
  const [desk, setDesk] = useState(initial ?? all[0]?.id ?? "");
  const [name, setName] = useState("");
  const fixed = Object.entries(s?.fixed ?? {})
    .map(([id, n]) => ({ d: deskById(id), n }))
    .filter((x): x is { d: MesasDesk; n: string } => !!x.d);
  const names = useMemo(() => [...new Set(Object.values(players).map((p) => p.name))].sort(), [players]);
  const save = () => {
    if (!desk || !name.trim()) return;
    act.fix(desk, name.trim());
    setName("");
  };
  return (
    <Section title={T.panel.admin} label={T.panel.admin}>
      <p className="mb-2 text-[11px] text-slate">{T.panel.adminHint}</p>
      <form
        className="grid grid-cols-[1fr_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="sr-only" htmlFor="mesas-admin-mesa">
          {T.panel.adminDesk}
        </label>
        <select
          id="mesas-admin-mesa"
          value={desk}
          onChange={(e) => setDesk(e.target.value)}
          className="col-span-2 rounded-lg border border-offwhite/10 bg-deep/70 px-2 py-1.5 text-xs text-offwhite focus:border-signal focus:outline-none"
        >
          {all.map((d) => (
            <option key={d.id} value={d.id}>
              {mesasLabel(d)}
              {s?.fixed[d.id] ? ` · ${s.fixed[d.id]}` : ""}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="mesas-admin-nome">
          {T.panel.adminName}
        </label>
        <input
          id="mesas-admin-nome"
          list="mesas-admin-nomes"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          placeholder={T.panel.adminName}
          className="min-w-0 rounded-lg border border-offwhite/10 bg-deep/70 px-2 py-1.5 text-xs text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
        />
        <datalist id="mesas-admin-nomes">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="submit" className={btnQuiet} disabled={!name.trim()}>
          <Pin className="size-3.5" aria-hidden />
          {T.panel.adminSave}
        </button>
      </form>
      {fixed.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate">{T.panel.adminEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1" aria-label={T.panel.admin}>
          {fixed.map(({ d, n }) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-deep/40 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate">
                <span className="font-medium">{n}</span> <span className="text-slate">· {mesasLabel(d)}</span>
              </span>
              <button type="button" onClick={() => act.fix(d.id, "")} aria-label={T.panel.adminRemove(mesasLabel(d))} title={T.panel.adminRemove(mesasLabel(d))} className="rounded-md p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite focus-visible:outline-2 focus-visible:outline-signal">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---- cartão na mesa de outra pessoa -------------------------------------------------------

export function NoteCard({ deskId }: { deskId: string }) {
  const s = useMesasState();
  const key = useMyKey();
  const priv = useMesas((u) => u.priv);
  const now = useNow();
  const desk = deskById(deskId);
  const owner = ownerOf(s, deskId);
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const close = () => useMesas.setState({ card: null });
  useEscape(close);
  useEffect(() => focusSoon(area.current), []);
  // Recado aceito: limpa o campo.
  useEffect(() => {
    const ok = () => setText("");
    window.addEventListener("mesas:recado-ok", ok);
    return () => window.removeEventListener("mesas:recado-ok", ok);
  }, []);
  // Longe da mesa (ou a mesa ficou livre / virou sua), o cartão fecha.
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = deskById(deskId);
      if (!d || (!selfNear(d.pos, MESAS_NOTE_RANGE + 0.8) && !selfNear(d.seat, MESAS_NOTE_RANGE + 0.8))) close();
    }, 500);
    return () => window.clearInterval(id);
  }, [deskId]);
  useEffect(() => {
    if (!owner || (key && mesasKey(owner.name) === key)) close();
  }, [owner, key]);
  if (!desk || !owner) return null;

  const toKey = mesasKey(owner.name);
  const mine = (priv?.sent ?? []).filter((n) => n.to === toKey);
  const send = () => {
    if (text.trim()) act.note(deskId, text);
  };

  return (
    <motion.aside
      {...motionProps}
      className={clsx(PANEL, "right-2 top-16 max-h-[calc(100dvh-160px)] w-[min(360px,calc(100vw-16px))] sm:right-3")}
      role="dialog"
      aria-label={T.card.title(owner.name)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <Header icon={StickyNote} title={T.card.title(owner.name)} sub={`${mesasLabel(desk)} · ${owner.fixed ? T.card.fixed : T.card.busy}`} onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          className="px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="mesas-recado" className="label-caps">
            {T.card.compose(owner.name)}
          </label>
          <textarea
            id="mesas-recado"
            ref={area}
            value={text}
            rows={3}
            maxLength={MESAS_NOTE_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={T.card.placeholder}
            className="mt-1.5 w-full resize-none rounded-xl border border-offwhite/10 bg-cream px-3 py-2 text-sm text-space placeholder:text-space/45 focus:border-signal focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate">{T.card.privacy(owner.name)}</p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] tabular-nums text-slate">
                {text.length}/{MESAS_NOTE_MAX}
              </span>
              <button type="submit" disabled={!text.trim()} className={btnPrimary}>
                {T.card.send}
              </button>
            </div>
          </div>
        </form>
        {mine.length > 0 && (
          <Section title={T.card.mine}>
            <ul className="space-y-1.5" aria-label={T.card.mine}>
              {[...mine].reverse().map((n) => (
                <NoteItem key={n.id} note={n} now={now} who={`Para ${n.toName}`} removeLabel={T.card.removeMine} onRemove={() => act.removeNote(n.id)} />
              ))}
            </ul>
          </Section>
        )}
      </div>
    </motion.aside>
  );
}

// ---- cartão de recados ao chegar na própria mesa -------------------------------------------

export function WelcomeCard() {
  const priv = useMesas((u) => u.priv);
  const now = useNow();
  const inbox = priv?.inbox ?? [];
  // Mostra os novos (no momento em que o cartão abriu) e os que chegarem com ele aberto.
  const [shown] = useState(() => unreadIds(inbox));
  const fresh = unreadIds(inbox);
  const list = inbox.filter((n) => shown.has(n.id) || fresh.has(n.id));
  const close = () => {
    markSeen(inbox);
    useMesas.setState({ welcome: false });
  };
  useEscape(close);
  useEffect(() => {
    if (priv && list.length === 0) useMesas.setState({ welcome: false });
  }, [priv, list.length]);
  if (!list.length) return null;
  return (
    <motion.aside
      {...motionProps}
      className={clsx(PANEL, "right-2 top-16 max-h-[calc(100dvh-160px)] w-[min(360px,calc(100vw-16px))] sm:right-3")}
      role="dialog"
      aria-label={T.welcome.title(list.length)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <Header icon={Mail} title={T.welcome.title(list.length)} onClose={close} />
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3" aria-label={T.welcome.title(list.length)}>
        {[...list].reverse().map((n) => (
          <NoteItem key={n.id} note={n} now={now} who={n.fromName} fresh removeLabel={T.panel.remove} onRemove={() => act.removeNote(n.id)} />
        ))}
      </ul>
      <footer className="flex items-center justify-end gap-2 border-t border-offwhite/8 px-4 py-2.5">
        <button
          type="button"
          className={btnQuiet}
          onClick={() => {
            markSeen(inbox);
            openPanel();
          }}
        >
          {T.welcome.open}
        </button>
        <button type="button" className={btnQuiet} onClick={close}>
          {T.welcome.ok}
        </button>
      </footer>
    </motion.aside>
  );
}

function unreadIds(inbox: readonly MesasNote[]): Set<string> {
  return new Set(unread(inbox).map((n) => n.id));
}

// ---- atalho: check-in na última mesa ------------------------------------------------------

const ARRIVAL_KEY = "infinity-space:mesas:chegada";

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(ARRIVAL_KEY) === vivoDay(serverNow());
  } catch {
    return false;
  }
}

function dismissToday(): void {
  try {
    localStorage.setItem(ARRIVAL_KEY, vivoDay(serverNow()));
  } catch {
    /* segue sem lembrar */
  }
}

/**
 * Ao entrar sem mesa hoje: se a última mesa usada está livre, oferece o check-in nela (e anda até lá).
 * Aparece uma vez por dia neste navegador; some sozinho depois de um tempo.
 */
export function ArrivalChip() {
  const s = useMesasState();
  const key = useMyKey();
  const priv = useMesas((u) => u.priv);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(dismissedToday);
  useEffect(() => {
    const a = window.setTimeout(() => setReady(true), 2500);
    const b = window.setTimeout(() => setGone(true), 45_000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  const last = deskById(priv?.last);
  const show = ready && !gone && !!s && !!last && !myDesk(s, key) && !ownerOf(s, last.id);
  // Já sentado na última mesa: o E resolve.
  const atLast = !!last && Math.hypot(self.x - last.seat.x, self.z - last.seat.z) < 1.2;
  return (
    <InStack side="bottom-left" order={2}>
    <AnimatePresence>
      {show && last && !atLast && (
        <motion.div
          key="chegada"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="glass pointer-events-auto flex w-[min(360px,calc(100vw-24px))] items-center gap-2.5 rounded-2xl py-2 pl-3 pr-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <Armchair className="size-4 shrink-0 text-slate" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] leading-snug">{T.arrival.text(mesasLabel(last))}</p>
          <button
            type="button"
            className="shrink-0 rounded-xl bg-orange px-3 py-1.5 text-xs font-semibold text-offwhite hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offwhite"
            onClick={() => {
              dismissToday();
              setGone(true);
              act.checkinLast(last.id);
            }}
          >
            {T.arrival.go}
          </button>
          <button
            type="button"
            aria-label={T.arrival.dismiss}
            title={T.arrival.dismiss}
            className="shrink-0 rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-offwhite focus-visible:outline-2 focus-visible:outline-signal"
            onClick={() => {
              dismissToday();
              setGone(true);
            }}
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
    </InStack>
  );
}

/** Painéis do pacote (um por vez). */
export function MesasPanels() {
  const panel = useMesas((u) => u.panel);
  const card = useMesas((u) => u.card);
  const welcome = useMesas((u) => u.welcome);
  return (
    <AnimatePresence>
      {panel && <DeskPanel key="painel" />}
      {!panel && card && <NoteCard key={`cartao-${card}`} deskId={card} />}
      {!panel && !card && welcome && <WelcomeCard key="chegada" />}
    </AnimatePresence>
  );
}
