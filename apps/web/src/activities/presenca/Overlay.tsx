import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Footprints, MessageCircle, Route, Sparkles, Users, X } from "lucide-react";
import type { ChamadoInvite, SeguirAsk } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { sfx } from "../../audio/sfx.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import { InStack } from "../../ui/HudStack.tsx";
import {
  acceptCall,
  acceptFollow,
  answerInChat,
  callHere,
  callPerson,
  cancelCall,
  cancelFollowAsk,
  declineCall,
  forgetCall,
  declineFollow,
  dismissFollower,
  requestTeleport,
  stopFollowing,
  stopTravel,
} from "../../presence/actions.ts";
import { usePresence, type Timed, type Travel } from "../../presence/store.ts";
import { T } from "../../presence/strings.ts";
import { Countdown, Kbd, cardMotion, chipMotion, useKey } from "../../presence/ui.tsx";
import { callsQuiet } from "./events.ts";

/**
 * Interface da presença por cima do mundo:
 * - chamado recebido: toma a tela até a pessoa escolher (ou o pedido expirar);
 * - embaixo, no meio (onde ficam os convites): pedidos para seguir recebidos e o "indo até" com o teleporte;
 * - no alto, à esquerda (embaixo do status): o que está valendo agora (chamando, seguindo,
 *   sendo seguido), sempre com um jeito de parar.
 */
export function PresenceOverlay() {
  const callsIn = usePresence((s) => s.callsIn);
  const followIn = usePresence((s) => s.followIn);
  const travel = usePresence((s) => s.travel);
  const call = callsIn.at(-1);
  useTabTitle(callsIn);
  return (
    <>
      <AnimatePresence>{call && <CallTakeover key={`c-${call.from}-${call.start}`} call={call} more={callsIn.length - 1} />}</AnimatePresence>
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+178px)] flex flex-col items-center gap-2 px-3">
        <AnimatePresence>
          {followIn.map((a) => (
            <FollowRequest key={`f-${a.from}-${a.start}`} ask={a} />
          ))}
          {travel && <TravelChip key={`t-${travel.from}`} travel={travel} />}
        </AnimatePresence>
      </div>
      <StateChips />
    </>
  );
}

/** Aba em segundo plano: o título avisa do chamado. */
function useTabTitle(callsIn: ChamadoInvite[]): void {
  const last = callsIn.at(-1);
  useEffect(() => {
    if (!last) return;
    const original = document.title;
    const apply = () => {
      document.title = document.hidden ? T.call.tabTitle(last.name) : original;
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      document.title = original;
    };
  }, [last]);
}

function Face({ id, size = 34 }: { id: string; size?: number }) {
  const look = useApp((s) => s.players[id]?.look);
  if (!look) return <span className="shrink-0 rounded-full bg-card" style={{ width: size, height: size }} />;
  return <AvatarFace look={look} size={size} className="shrink-0 rounded-full" />;
}

const ghost = "shrink-0 rounded-xl px-2.5 py-1.5 text-xs text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite";

const secondary = "flex items-center justify-center gap-1.5 rounded-xl bg-offwhite/10 px-3 py-2.5 text-sm font-medium text-offwhite transition hover:bg-offwhite/16";

/**
 * Chamado recebido: a tela inteira avisa, com o rosto de quem chamou. Fecha só por uma escolha
 * (ou quando o pedido expira): vou aí, chama aqui, agora não (com recado rápido) ou responder no chat.
 */
function CallTakeover({ call, more }: { call: ChamadoInvite & Timed; more: number }) {
  useKey("KeyI", () => acceptCall(call));
  // Aba em segundo plano: a tela tomada não aparece ali, então o toque se repete.
  useEffect(() => {
    const t = window.setInterval(() => document.hidden && sfx("presenca-chamado", { volume: 0.45 }), 6000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-space/80 p-4 backdrop-blur-md"
    >
      <motion.div
        {...cardMotion}
        role="alertdialog"
        aria-modal="true"
        aria-label={T.call.incoming(call.name)}
        className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-offwhite/10 bg-deep/95 px-5 pb-6 pt-8 text-center shadow-2xl"
      >
        <span className="relative grid place-items-center">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-signal"
            animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
          <Face id={call.from} size={112} />
        </span>
        <h2 className="mt-5 text-xl text-offwhite">
          <span className="font-semibold">{call.name}</span> está te chamando
        </h2>
        {call.place && <p className="mt-1 text-sm text-slate">{T.call.where(call.place)}</p>}
        {more > 0 && <p className="mt-1 text-xs text-slate">{T.call.more(more)}</p>}
        <div className="mt-6 grid w-full grid-cols-2 gap-2">
          <button type="button" autoFocus onClick={() => acceptCall(call)} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-orange px-3 py-3 text-base font-semibold text-offwhite transition hover:brightness-110">
            <Kbd light>I</Kbd>
            {T.call.go}
          </button>
          <button type="button" onClick={() => callHere(call)} className={secondary}>
            <BellRing className="size-4 text-signal" aria-hidden />
            {T.call.here}
          </button>
          <button type="button" onClick={() => answerInChat(call)} className={secondary}>
            <MessageCircle className="size-4 text-signal" aria-hidden />
            {T.call.chat}
          </button>
          <button type="button" onClick={() => declineCall(call)} className="col-span-2 rounded-xl px-3 py-2 text-sm text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
            {T.call.notNow}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate">{T.call.quickLabel}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {T.call.quick.map((q) => (
            <button key={q} type="button" onClick={() => declineCall(call, q)} className="rounded-full border border-offwhite/12 px-3 py-1.5 text-xs text-offwhite/85 transition-colors hover:border-offwhite/30 hover:text-offwhite">
              {q}
            </button>
          ))}
        </div>
        <Countdown start={call.start} ms={call.ms} />
      </motion.div>
    </motion.div>
  );
}

function FollowRequest({ ask }: { ask: SeguirAsk & Timed }) {
  return (
    <RequestCard
      id={ask.from}
      label={T.follow.incoming(ask.name)}
      title={
        <>
          <span className="font-semibold">{ask.name}</span> quer te seguir
        </>
      }
      sub={T.follow.hint}
      start={ask.start}
      ms={ask.ms}
    >
      <button type="button" onClick={() => acceptFollow(ask)} className="shrink-0 rounded-xl bg-offwhite/12 px-3 py-1.5 text-sm font-semibold text-offwhite transition hover:bg-offwhite/20">
        {T.follow.allow}
      </button>
      <button type="button" onClick={() => declineFollow(ask)} className={ghost}>
        {T.follow.notNow}
      </button>
    </RequestCard>
  );
}

/** Cartão de pedido: numa linha só no computador; no celular os botões descem para a segunda linha. */
function RequestCard({ id, label, title, sub, start, ms, children }: { id: string; label: string; title: ReactNode; sub?: string; start: number; ms: number; children: ReactNode }) {
  return (
    <motion.div
      {...cardMotion}
      layout
      className="glass pointer-events-auto relative flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-2xl p-2.5"
      role="alertdialog"
      aria-label={label}
    >
      <div className="flex min-w-0 flex-1 basis-[180px] items-center gap-3">
        <Face id={id} />
        <div className="min-w-0">
          <p className="truncate text-sm text-offwhite">{title}</p>
          {sub && <p className="truncate text-[11px] text-slate">{sub}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
      <Countdown start={start} ms={ms} />
    </motion.div>
  );
}

function TravelChip({ travel }: { travel: Travel }) {
  const far = Number.isFinite(travel.meters) ? T.call.far(travel.meters) : null;
  return (
    <motion.div
      {...cardMotion}
      layout
      className="glass pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-2.5 rounded-2xl py-1.5 pl-3 pr-1.5 text-sm text-offwhite"
      role="status"
    >
      <Footprints className="size-4 shrink-0 text-signal" aria-hidden />
      <span className="truncate">
        {T.call.goingTo(travel.name)}
        {far && <span className="text-slate"> · {far}</span>}
      </span>
      {travel.canTeleport && (
        <button
          type="button"
          onClick={requestTeleport}
          disabled={travel.warping}
          title={T.call.teleportHint(travel.name)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-orange px-3 py-1.5 text-sm font-semibold text-offwhite transition hover:brightness-110 disabled:opacity-60"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {T.call.teleport}
        </button>
      )}
      <button type="button" onClick={stopTravel} className={ghost}>
        {T.stop}
      </button>
    </motion.div>
  );
}

/** O que está valendo agora, embaixo do status (canto superior esquerdo). */
function StateChips() {
  const callOut = usePresence((s) => s.callOut);
  const followOut = usePresence((s) => s.followOut);
  const following = usePresence((s) => s.following);
  const followers = usePresence((s) => s.followers);
  const names = Object.values(followers);
  const missed = usePresence((s) => s.missedCalls);
  const quiet = useQuiet(missed.length > 0);
  useKey("Escape", stopFollowing, !!following);
  return (
    <InStack side="top-left" order={0}>
    <div className="pointer-events-none flex max-w-[calc(100vw-24px)] flex-col items-start gap-1.5 empty:hidden">
      <AnimatePresence>
        {callOut && (
          <Chip key={`co-${callOut.to}-${callOut.start}`} icon={<BellRing className="size-3.5 text-signal" aria-hidden />} text={T.call.calling(callOut.name)} action={T.cancel} onAction={cancelCall}>
            <Countdown start={callOut.start} ms={callOut.ms} />
          </Chip>
        )}
        {followOut && (
          <Chip key={`fo-${followOut.to}-${followOut.start}`} icon={<Route className="size-3.5 text-signal" aria-hidden />} text={T.follow.asking(followOut.name)} action={T.cancel} onAction={cancelFollowAsk}>
            <Countdown start={followOut.start} ms={followOut.ms} />
          </Chip>
        )}
        {following && (
          <Chip
            key={`fw-${following.leader}`}
            icon={<Route className="size-3.5 text-signal" aria-hidden />}
            text={following.waiting ? T.follow.waiting(following.name) : T.follow.following(following.name)}
            hint={following.waiting ? undefined : T.follow.escHint}
            action={T.stop}
            onAction={stopFollowing}
          />
        )}
        {names.length > 0 && (
          <Chip key="fb" icon={<Users className="size-3.5 text-signal" aria-hidden />} text={T.follow.followedBy(joinNames(names), names.length)} action={T.stop} onAction={() => dismissFollower()} />
        )}
        {/* Lembrete discreto de quem chamou em Foco ou Não perturbe: só aparece depois de sair do modo. */}
        {!quiet &&
          missed.map((m) => (
            <Chip
              key={`mc-${m.from}`}
              icon={<BellRing className="size-3.5 text-slate" aria-hidden />}
              text={T.call.missed(m.name)}
              hint={T.call.missedHint}
              action={T.call.callBack}
              onAction={() => {
                forgetCall(m.from);
                callPerson(m.from);
              }}
            >
              <button type="button" onClick={() => forgetCall(m.from)} aria-label={T.call.dismiss} title={T.call.dismiss} className="grid size-6 shrink-0 place-items-center rounded-full text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
                <X className="size-3.5" />
              </button>
            </Chip>
          ))}
      </AnimatePresence>
    </div>
    </InStack>
  );
}

function Chip({ icon, text, hint, action, onAction, children }: { icon: ReactNode; text: string; hint?: string; action: string; onAction: () => void; children?: ReactNode }) {
  return (
    <motion.div {...chipMotion} layout className="glass pointer-events-auto relative flex max-w-full items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs text-offwhite/90" role="status">
      {icon}
      <span className="truncate">
        {text}
        {hint && <span className="hidden text-slate sm:inline"> · {hint}</span>}
      </span>
      <button type="button" onClick={onAction} className="shrink-0 rounded-full px-2.5 py-1 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
        {action}
      </button>
      {children}
    </motion.div>
  );
}

/** Em Foco ou Não perturbe agora? A posição não passa pelo React: confere a cada segundo enquanto houver lembrete. */
function useQuiet(active: boolean): boolean {
  const [quiet, setQuiet] = useState(callsQuiet);
  useEffect(() => {
    if (!active) return;
    setQuiet(callsQuiet());
    const t = window.setInterval(() => setQuiet(callsQuiet()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return quiet;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}
