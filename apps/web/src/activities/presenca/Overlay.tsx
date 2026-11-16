import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Footprints, Route, Sparkles, Users } from "lucide-react";
import type { ChamadoInvite, SeguirAsk } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import {
  acceptCall,
  acceptFollow,
  cancelCall,
  cancelFollowAsk,
  declineCall,
  declineFollow,
  dismissFollower,
  requestTeleport,
  stopFollowing,
  stopTravel,
} from "../../presence/actions.ts";
import { usePresence, type Timed, type Travel } from "../../presence/store.ts";
import { T } from "../../presence/strings.ts";
import { Countdown, Kbd, cardMotion, chipMotion, useKey } from "../../presence/ui.tsx";

/**
 * Interface da presença por cima do mundo:
 * - embaixo, no meio (onde ficam os convites): chamados e pedidos para seguir recebidos, e o
 *   "indo até" com o teleporte;
 * - no alto, à esquerda (embaixo do status): o que está valendo agora (chamando, seguindo,
 *   sendo seguido), sempre com um jeito de parar.
 */
export function PresenceOverlay() {
  const callsIn = usePresence((s) => s.callsIn);
  const followIn = usePresence((s) => s.followIn);
  const travel = usePresence((s) => s.travel);
  useTabTitle(callsIn);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+178px)] flex flex-col items-center gap-2 px-3">
        <AnimatePresence>
          {callsIn.map((c, i) => (
            <IncomingCall key={`c-${c.from}-${c.start}`} call={c} hotkey={i === callsIn.length - 1} />
          ))}
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

const primary = "flex shrink-0 items-center gap-1.5 rounded-xl bg-orange py-1.5 pl-1.5 pr-3 text-sm font-semibold text-offwhite transition hover:brightness-110";
const primaryPlain = "shrink-0 rounded-xl bg-orange px-3 py-1.5 text-sm font-semibold text-offwhite transition hover:brightness-110";
const ghost = "shrink-0 rounded-xl px-2.5 py-1.5 text-xs text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite";

function IncomingCall({ call, hotkey }: { call: ChamadoInvite & Timed; hotkey: boolean }) {
  useKey("KeyI", () => acceptCall(call), hotkey);
  return (
    <RequestCard
      id={call.from}
      label={T.call.incoming(call.name)}
      title={
        <>
          <span className="font-semibold">{call.name}</span> está te chamando
        </>
      }
      sub={call.place ? T.call.where(call.place) : undefined}
      start={call.start}
      ms={call.ms}
    >
      <button type="button" onClick={() => acceptCall(call)} className={hotkey ? primary : primaryPlain}>
        {hotkey && <Kbd light>I</Kbd>}
        {T.call.go}
      </button>
      <button type="button" onClick={() => declineCall(call)} className={ghost}>
        {T.call.notNow}
      </button>
    </RequestCard>
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
  useKey("Escape", stopFollowing, !!following);
  return (
    <div className="pointer-events-none absolute left-3 top-[100px] flex max-w-[calc(100vw-24px)] flex-col items-start gap-1.5">
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
      </AnimatePresence>
    </div>
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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}
