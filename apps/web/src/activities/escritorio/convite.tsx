import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Check, Copy, UserPlus, X } from "lucide-react";
import { CONVITE_ID, CONVITE_KIND, CONVITE_PARAM, recGroup, recordable, type Zone } from "@infinity/world";
import { sendAct, type ActivityClient } from "../registry.ts";
import { InStack } from "../../ui/HudStack.tsx";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { T } from "./strings.ts";

/**
 * Convidar cliente para a reunião: quem está numa sala de reunião gera um link e manda para quem é de
 * fora. O pedido de entrada aparece como cartão para quem está na sala (pacote portas, junto das batidas).
 */

interface Link {
  token: string;
  exp: number;
  sala: string;
}

const useConviteUi = create<{ link: Link | null }>(() => ({ link: null }));

export const convite: ActivityClient = {
  name: "escritorio/convite",
  kinds: [CONVITE_KIND],
  onEvent: (e) => {
    if (e.ev === "link") useConviteUi.setState({ link: e.data as Link });
  },
  Overlay: ConviteOverlay,
};

function useMyGroup(): string | null {
  const [zone, setZone] = useState<Zone | undefined>(undefined);
  useEffect(() => {
    const id = window.setInterval(() => {
      const z = world().zones.zoneAt({ x: self.x, z: self.z });
      setZone((prev) => (prev?.id === z?.id ? prev : z));
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return recordable(zone) ? recGroup(zone!) : null;
}

function ConviteOverlay() {
  const group = useMyGroup();
  const link = useConviteUi((s) => s.link);
  // Saiu da sala: o cartão do link fecha (o link continua valendo para a sala dele).
  useEffect(() => useConviteUi.setState({ link: null }), [group]);
  if (!group) return null;

  return (
    <InStack side="top-left" order={1}>
      {link ? (
        <LinkCard link={link} />
      ) : (
        <button
          type="button"
          onClick={() => sendAct(CONVITE_ID, "criar")}
          className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs text-offwhite/90 hover:text-offwhite"
        >
          <UserPlus className="size-3.5 text-signal" aria-hidden />
          {T.convite.action}
        </button>
      )}
    </InStack>
  );
}

function LinkCard({ link }: { link: Link }) {
  const url = `${location.origin}${import.meta.env.BASE_URL}?${CONVITE_PARAM}=${encodeURIComponent(link.token)}`;
  const until = new Date(link.exp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      // Sem permissão de área de transferência: deixa o link selecionado para Ctrl+C.
      () => input.current?.select(),
    );

  return (
    <div role="dialog" aria-label={T.convite.title(link.sala)} className="pointer-events-auto w-[min(340px,calc(100vw-24px))] rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{T.convite.title(link.sala)}</p>
        <button type="button" onClick={() => useConviteUi.setState({ link: null })} className="-m-1 rounded-lg p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.convite.close} title={T.convite.close}>
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate">{T.convite.hint}</p>
      <div className="mt-2.5 flex gap-1.5">
        <input
          ref={input}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={T.convite.linkLabel}
          className="min-w-0 flex-1 rounded-lg border border-offwhite/10 bg-offwhite/5 px-2 py-1.5 text-xs text-offwhite/90"
        />
        <button type="button" onClick={() => void copy()} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-offwhite px-3 py-1.5 text-xs font-semibold text-space hover:brightness-95">
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? T.convite.copied : T.convite.copy}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate">{T.convite.until(until)}</p>
    </div>
  );
}
