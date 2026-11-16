import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { DoorClosed, DoorOpen, Ear, Lock, StickyNote, Users, X } from "lucide-react";
import { DOOR_STATES, PORTAS, PORTAS_ID, type DoorState, type PortasState } from "@infinity/world";
import { sendAct, useAct } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { circleNow, doorOf, myCircle, nameOf, startWhisper, stopWhisper, usePortasUi, whisperCandidate, whisperReaches, zoneAt } from "./state.ts";
import { T } from "./strings.ts";

/**
 * Interface do pacote "portas":
 * - barra de privacidade no topo (porta da sala onde você está, ou a roda e o sussurro nas áreas abertas);
 * - cartões de quem bateu na porta ou pediu para entrar na roda;
 * - aviso de sussurro (seu e de quem sussurra para você).
 */
export function PortasOverlay() {
  return (
    <>
      <PrivacyBar />
      <Requests />
      <WhisperPill />
    </>
  );
}

// ---- o que a barra mostra (atualiza 4x por segundo, sem render se nada mudou) ----------------------

interface View {
  /** Sala com porta onde você está (e pode estar). */
  room: string | null;
  /** Numa área aberta: quem entraria na roda se você a fechasse. */
  circle: string[];
  /** Alguém perto o bastante para sussurrar. */
  whisper: { id: string; name: string } | null;
}

const EMPTY: View = { room: null, circle: [], whisper: null };

function useView(): View {
  const [view, setView] = useState<View>(EMPTY);
  const key = useRef("");
  useEffect(() => {
    const read = () => {
      const zone = zoneAt(self);
      const door = doorOf(zone?.id);
      const room = door ? door.zoneId : null;
      const open = zone?.kind === "open";
      const circle = open ? circleNow() : [];
      const w = whisperCandidate();
      const next: View = { room, circle, whisper: w ? { id: w.id, name: nameOf(w.id) } : null };
      const k = `${room}|${circle.join(",")}|${next.whisper?.id ?? ""}|${next.whisper?.name ?? ""}`;
      if (k !== key.current) {
        key.current = k;
        setView(next);
      }
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, []);
  return view;
}

// ---- barra de privacidade -----------------------------------------------------------------------

function PrivacyBar() {
  const state = useAct<PortasState>(PORTAS_ID);
  const selfId = useApp((s) => s.selfId);
  const view = useView();
  const circle = selfId ? state?.circles.find((c) => c.members.includes(selfId)) : undefined;

  let content: ReactNode = null;
  if (view.room && state?.doors[view.room]) content = <DoorControls zone={view.room} state={state} whisper={view.whisper} />;
  else if (circle) content = <CircleControls members={circle.members.filter((m) => m !== selfId)} />;
  else if (view.circle.length || view.whisper) content = <OpenControls circle={view.circle} whisper={view.whisper} />;

  return (
    <div className="pointer-events-none absolute right-3 top-[60px] z-10 flex justify-end md:left-1/2 md:right-auto md:top-3 md:-translate-x-1/2">
      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={view.room ? `porta-${view.room}` : circle ? "roda" : "aberto"}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STATE_ICON: Record<DoorState, typeof DoorOpen> = { open: DoorOpen, closed: DoorClosed, locked: Lock };

function DoorControls({ zone, state, whisper }: { zone: string; state: PortasState; whisper: View["whisper"] }) {
  const door = state.doors[zone]!;
  const [editing, setEditing] = useState(false);
  const set = (s: DoorState) => sendAct(PORTAS_ID, "porta", { zone, state: s });
  return (
    <div className="glass flex flex-col items-stretch gap-1.5 rounded-2xl p-1.5" data-portas="porta">
      <div className="flex items-center gap-1.5">
        <span className="label-caps hidden pl-1.5 sm:inline">{T.door.title}</span>
        <div
          role="radiogroup"
          aria-label={T.door.groupLabel}
          className="flex rounded-xl bg-deep/60 p-0.5"
          onKeyDown={(e) => {
            // Setas trocam o estado, como num grupo de rádio.
            const i = DOOR_STATES.indexOf(door.state);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              const next = DOOR_STATES[(i + (e.key === "ArrowRight" ? 1 : DOOR_STATES.length - 1)) % DOOR_STATES.length]!;
              set(next);
              window.setTimeout(() => (document.querySelector(`[data-porta-estado="${next}"]`) as HTMLElement | null)?.focus(), 0);
            }
          }}
        >
          {DOOR_STATES.map((s) => {
            const Icon = STATE_ICON[s];
            const on = door.state === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-porta-estado={s}
                title={T.door.hints[s]}
                onClick={() => set(s)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors",
                  on ? (s === "locked" ? "bg-orange text-offwhite" : s === "closed" ? "bg-signal text-space" : "bg-offwhite/15 text-offwhite") : "text-slate hover:text-offwhite",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {T.door.states[s]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={T.door.noteLabel}
          title={T.door.noteLabel}
          className={clsx(
            "flex h-8 max-w-[180px] items-center gap-1.5 rounded-xl px-2.5 text-xs transition-colors",
            editing || door.note ? "bg-offwhite/12 text-offwhite" : "text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite",
          )}
        >
          <StickyNote className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{door.note || T.door.note}</span>
        </button>
        {whisper && (
          <>
            <span className="h-5 w-px bg-offwhite/12" aria-hidden />
            <WhisperButton name={whisper.name} />
          </>
        )}
      </div>
      <AnimatePresence>{editing && <NoteEditor zone={zone} note={door.note} onClose={() => setEditing(false)} />}</AnimatePresence>
    </div>
  );
}

function NoteEditor({ zone, note, onClose }: { zone: string; note: string; onClose: () => void }) {
  const [text, setText] = useState(note);
  const input = useRef<HTMLInputElement>(null);
  // Foca depois da tecla que abriu (senão a letra entra no campo).
  useEffect(() => {
    const id = window.setTimeout(() => input.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);
  const save = (value: string) => {
    sendAct(PORTAS_ID, "bilhete", { zone, text: value });
    onClose();
  };
  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-1.5 overflow-hidden px-0.5 pb-0.5"
      onSubmit={(e) => {
        e.preventDefault();
        save(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        e.stopPropagation();
      }}
    >
      <input
        ref={input}
        value={text}
        maxLength={PORTAS.noteMax}
        onChange={(e) => setText(e.target.value)}
        placeholder={T.door.notePlaceholder}
        aria-label={T.door.noteLabel}
        className="h-8 min-w-0 flex-1 rounded-lg border border-offwhite/10 bg-deep px-2.5 text-xs text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
      />
      {note && (
        <button type="button" onClick={() => save("")} className="h-8 rounded-lg px-2 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
          {T.door.noteClear}
        </button>
      )}
      <button type="submit" className="h-8 rounded-lg bg-offwhite/12 px-3 text-xs font-semibold text-offwhite hover:bg-offwhite/20">
        {T.door.noteSave}
      </button>
    </motion.form>
  );
}

function CircleControls({ members }: { members: string[] }) {
  return (
    <div className="glass flex items-center gap-2 rounded-full py-1 pl-3 pr-1" role="status" data-portas="roda">
      <Lock className="size-3.5 text-signal" aria-hidden />
      <span className="max-w-[46vw] truncate text-xs text-offwhite">{T.circle.closed(members.map(nameOf))}</span>
      <button type="button" onClick={() => sendAct(PORTAS_ID, "roda-abrir")} className="rounded-full bg-offwhite/10 px-3 py-1.5 text-xs font-medium text-offwhite hover:bg-offwhite/20">
        {T.circle.openBtn}
      </button>
    </div>
  );
}

function OpenControls({ circle, whisper }: { circle: string[]; whisper: View["whisper"] }) {
  return (
    <div className="glass flex items-center gap-1 rounded-full p-1" data-portas="aberto">
      {circle.length > 0 && (
        <button
          type="button"
          onClick={() => sendAct(PORTAS_ID, "roda", { with: circle })}
          title={T.circle.closeHint}
          className="flex max-w-[46vw] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-offwhite/90 hover:bg-offwhite/8 hover:text-offwhite"
        >
          <Users className="size-3.5 shrink-0 text-slate" aria-hidden />
          <span className="truncate">{T.circle.close(circle.map(nameOf))}</span>
        </button>
      )}
      {whisper && <WhisperButton name={whisper.name} />}
    </div>
  );
}

/**
 * Ao segurar pelo botão: solta onde quer que o dedo, o mouse ou a tecla seja solto (o botão pode
 * sumir no meio, se a pessoa se afastar, e o sussurro não pode ficar preso).
 */
function holdWhisper(): void {
  if (!startWhisper()) return;
  const end = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== " " && e.key !== "Enter") return;
    stopWhisper();
    for (const t of ["pointerup", "pointercancel", "keyup", "blur"]) window.removeEventListener(t, end);
  };
  for (const t of ["pointerup", "pointercancel", "keyup", "blur"]) window.addEventListener(t, end);
}

/** Segurar para sussurrar (mouse, toque, espaço ou Enter); a tecla B faz o mesmo. */
function WhisperButton({ name }: { name: string }) {
  const active = usePortasUi((s) => !!s.whisper);
  return (
    <button
      type="button"
      aria-pressed={active}
      title={T.whisper.holdHint}
      onPointerDown={(e) => {
        e.preventDefault();
        holdWhisper();
      }}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          holdWhisper();
        }
      }}
      onClick={(e) => e.preventDefault()}
      className={clsx(
        "flex max-w-[46vw] touch-none select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
        active ? "bg-signal text-space" : "text-offwhite/90 hover:bg-offwhite/8 hover:text-offwhite",
      )}
    >
      <kbd className={clsx("grid size-5 place-items-center rounded-md font-display text-[10px] font-bold", active ? "bg-space/20" : "bg-offwhite/12")}>{T.whisperKey}</kbd>
      <span className="truncate">{T.whisper.hold(name)}</span>
    </button>
  );
}

// ---- pedidos: alguém bateu, alguém quer entrar na roda ---------------------------------------------

interface Ask {
  key: string;
  icon: typeof DoorClosed;
  title: string;
  yes: () => void;
  no: () => void;
}

function Requests() {
  const state = useAct<PortasState>(PORTAS_ID);
  const selfId = useApp((s) => s.selfId);
  const [zone, setZone] = useState<string | undefined>(undefined);
  useEffect(() => {
    const id = window.setInterval(() => setZone(zoneAt(self)?.id), 250);
    return () => window.clearInterval(id);
  }, []);

  const asks: Ask[] = [];
  if (state && selfId) {
    const d = zone ? state.doors[zone] : undefined;
    if (zone && d && d.state !== "open" && d.admitted.includes(selfId)) {
      for (const k of d.knocks) {
        asks.push({
          key: `porta-${zone}-${k.id}`,
          icon: DoorClosed,
          title: T.door.knockFrom(k.name),
          yes: () => sendAct(PORTAS_ID, "atender", { zone, who: k.id, ok: true }),
          no: () => sendAct(PORTAS_ID, "atender", { zone, who: k.id, ok: false }),
        });
      }
    }
    const c = myCircle(state);
    for (const a of c?.asks ?? []) {
      asks.push({
        key: `roda-${c!.id}-${a.id}`,
        icon: Users,
        title: T.circle.askFrom(a.name),
        yes: () => sendAct(PORTAS_ID, "roda-atender", { circle: c!.id, who: a.id, ok: true }),
        no: () => sendAct(PORTAS_ID, "roda-atender", { circle: c!.id, who: a.id, ok: false }),
      });
    }
  }

  return (
    <div className="pointer-events-none absolute right-3 top-[112px] z-30 flex w-[min(320px,calc(100vw-24px))] flex-col gap-2 md:top-16" aria-live="polite">
      <AnimatePresence initial={false}>
        {asks.map((a) => (
          <motion.div
            key={a.key}
            layout
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="alertdialog"
            aria-label={a.title}
            className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-offwhite/10 bg-space p-2.5 shadow-2xl"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-offwhite/8">
                <a.icon className="size-4 text-signal" aria-hidden />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-snug text-offwhite">{a.title}</p>
            </div>
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={a.no} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                {T.door.notNowBtn}
              </button>
              <button type="button" onClick={a.yes} className="rounded-lg bg-offwhite px-3 py-1.5 text-xs font-semibold text-space hover:brightness-95">
                {T.door.letInBtn}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---- sussurro -----------------------------------------------------------------------------------

function WhisperPill() {
  const whisper = usePortasUi((s) => s.whisper);
  const incoming = usePortasUi((s) => s.incoming);
  const [reaches, setReaches] = useState(true);
  useEffect(() => {
    if (!whisper) return;
    const read = () => setReaches(whisperReaches(whisper.to));
    read();
    const id = window.setInterval(read, 200);
    return () => window.clearInterval(id);
  }, [whisper]);

  const from = Object.entries(incoming);
  const lines: { key: string; text: string; warn?: boolean }[] = [];
  if (whisper) lines.push({ key: `eu-${whisper.to}`, text: reaches ? T.whisper.to(whisper.name) : T.whisper.away(whisper.name), warn: !reaches });
  for (const [id, name] of from) lines.push({ key: `de-${id}`, text: T.whisper.from(name) });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+120px)] flex flex-col items-center gap-1.5" aria-live="polite">
      <AnimatePresence>
        {lines.map((l) => (
          <motion.div
            key={l.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            role="status"
            data-portas="sussurro"
            className={clsx("glass flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs", l.warn ? "text-warn" : "text-offwhite")}
          >
            {l.warn ? <X className="size-3.5" aria-hidden /> : <Ear className="size-3.5 text-signal" aria-hidden />}
            {l.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
