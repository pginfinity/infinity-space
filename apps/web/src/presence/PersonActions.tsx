import type { ReactNode } from "react";
import { clsx } from "clsx";
import { BellRing, Footprints, Route } from "lucide-react";
import { askFollow, callPerson, goToPerson, stopFollowing } from "./actions.ts";
import { usePresence } from "./store.ts";
import { T } from "./strings.ts";

/**
 * "Ir até", "Chamar" e "Seguir" de uma pessoa no painel Pessoas, num grupo compacto de ícones
 * (com nome acessível e dica). O painel já se redesenha a cada segundo, o que basta para a
 * contagem do intervalo entre chamados.
 */
export function PersonActions({ id, name, canGo }: { id: string; name: string; canGo: boolean }) {
  const callOut = usePresence((s) => s.callOut);
  const blockedUntil = usePresence((s) => s.callBlockedUntil);
  const following = usePresence((s) => s.following);
  const followOut = usePresence((s) => s.followOut);
  const wait = Math.max(0, blockedUntil - performance.now());
  const calling = callOut?.to === id;
  const isLeader = following?.leader === id;
  const asking = followOut?.to === id;
  const callLabel = calling ? T.call.calling(name) : wait > 0 ? T.call.wait(wait) : T.call.actionOf(name);
  const followLabel = isLeader ? T.follow.stopOf(name) : asking ? T.follow.asking(name) : T.follow.actionOf(name);
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label={name}>
      <IconButton label={T.person.goTo(name)} disabled={!canGo} onClick={() => goToPerson(id)}>
        <Footprints className="size-4" />
      </IconButton>
      <IconButton label={callLabel} disabled={calling || wait > 0} active={calling} onClick={() => callPerson(id)}>
        <BellRing className="size-4" />
        {wait > 0 && !calling && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-card px-1 text-[9px] font-semibold tabular-nums text-slate">{Math.ceil(wait / 1000)}</span>}
      </IconButton>
      <IconButton label={followLabel} disabled={asking} active={isLeader || asking} pressed={isLeader} onClick={() => (isLeader ? stopFollowing() : askFollow(id))}>
        <Route className="size-4" />
      </IconButton>
    </div>
  );
}

function IconButton({ label, onClick, disabled, active, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={clsx(
        "relative grid size-8 place-items-center rounded-lg transition-colors hover:bg-offwhite/8 disabled:cursor-default disabled:hover:bg-transparent",
        active ? "text-signal" : "text-slate hover:text-offwhite",
        disabled && !active && "opacity-45",
      )}
    >
      {children}
    </button>
  );
}
