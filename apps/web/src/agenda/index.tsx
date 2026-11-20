import { useEffect, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock } from "lucide-react";
import { AGENDA_API, agendaJoinable, agendaNow, type AgendaEvent, type AgendaView } from "@infinity/world";
import { useAuth } from "../net/auth.ts";
import { sendInfo } from "../net/session.ts";
import { useApp } from "../state/store.ts";
import { self } from "../world/registry.ts";
import { world } from "../world/world.ts";
import { goToRoom } from "../presence/actions.ts";
import { notifyDesktop } from "../ui/DesktopNotify.tsx";
import { InStack } from "../ui/HudStack.tsx";
import { toast } from "../ui/toasts.ts";

/**
 * Google Agenda no escritório (só com login e com o app do Google configurado no servidor):
 * - durante um evento, o balão da pessoa mostra "Em reunião até HH:MM" (se ela não tiver outro);
 * - na hora do evento, um cartão com Entrar: vai até a sala citada no evento ou abre o Meet;
 * - as reservas de sala aparecem na TV da sala (ver scene/ScreenTVs.tsx).
 * O título do evento só aparece para a própria pessoa.
 */

export const useAgenda = create<AgendaView>(() => ({ configured: false, connected: false, events: [], rooms: [] }));

const POLL_MS = 60_000;
const TICK_MS = 15_000;
const CLOCK = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const T = {
  note: (end: string) => `📅 Em reunião até ${end}`,
  at: (time: string) => `Reunião às ${time}`,
  now: "Reunião agora",
  viaMeet: "Pelo Google Meet",
  meet: "Abrir o Meet",
  go: "Entrar",
  notNow: "Agora não",
  desktop: (title: string, time: string) => `${title}, às ${time}`,
  back: { conectada: "Google Agenda conectada.", cancelada: "A Google Agenda não foi conectada.", erro: "Não deu para conectar a Google Agenda. Tente de novo." } as Record<string, string>,
};

async function load(): Promise<void> {
  try {
    const r = await fetch(AGENDA_API, { credentials: "same-origin" });
    if (r.ok) useAgenda.setState((await r.json()) as AgendaView);
  } catch {
    /* sem rede: tenta no próximo ciclo */
  }
}

/** Vai para o Google autorizar; ele volta em /api/agenda/volta. */
export const connectAgenda = (): void => location.assign(`${AGENDA_API}/conectar`);

export async function disconnectAgenda(): Promise<void> {
  const r = await fetch(`${AGENDA_API}/desconectar`, { method: "POST", credentials: "same-origin" }).catch(() => null);
  if (r?.ok) useAgenda.setState((await r.json()) as AgendaView);
}

// Volta do Google (?agenda=conectada): lido uma vez ao carregar e tirado do endereço.
let back = new URLSearchParams(location.search).get("agenda");
if (back) {
  const u = new URL(location.href);
  u.searchParams.delete("agenda");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

/** Balão posto pela agenda; null quando a pessoa escolheu o dela (aí a agenda não mexe). */
let autoNote: string | null = null;

function syncNote(events: readonly AgendaEvent[], now: number): void {
  const s = useApp.getState();
  if (!s.selfId) return;
  const note = s.players[s.selfId]?.note ?? "";
  if (autoNote && note && note !== autoNote) autoNote = null;
  const e = agendaNow(events, now);
  const want = e ? T.note(CLOCK.format(e.end)) : "";
  if (want && (!note || autoNote)) {
    if (note !== want) sendInfo({ note: want });
    autoNote = want;
  } else if (!want && autoNote) {
    if (note === autoNote) sendInfo({ note: "" });
    autoNote = null;
  }
}

/** Busca a agenda, cuida do balão e mostra o cartão de Entrar na hora do evento. */
export function AgendaCard() {
  // Sem login (desenvolvimento) o servidor responde "sem agenda"; com login, só depois de entrar.
  const ready = useAuth((s) => s.status === "in" || s.status === "off");
  const configured = useAgenda((s) => s.configured);
  const events = useAgenda((s) => s.events);
  // Entrou (ou reconectou): o balão vai já, sem esperar o próximo ciclo.
  const selfId = useApp((s) => s.selfId);
  const [now, setNow] = useState(Date.now);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!ready) return;
    if (back) {
      toast(T.back[back] ?? T.back.erro!);
      back = null;
    }
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      syncNote(events, t);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [events, selfId]);

  const e = configured ? agendaJoinable(events, now) : undefined;
  const zone = e?.zone ? world().map.zones.find((z) => z.id === e.zone) : undefined;
  // Já dentro da sala do evento: não há o que entrar (a não ser no Meet, quando não há sala).
  const inside = !!zone && world().zones.zoneAt({ x: self.x, z: self.z })?.id === zone.id;
  const show = e && !dismissed.includes(e.id) && !inside ? e : undefined;
  useEffect(() => {
    if (show) notifyDesktop(`agenda:${show.id}`, T.desktop(show.title, CLOCK.format(show.start)));
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = () => show && setDismissed((d) => [...d, show.id]);
  const openMeet = () => {
    if (show?.meet) window.open(show.meet, "_blank", "noopener");
    done();
  };
  const enter = () => {
    if (zone) goToRoom(zone);
    else return openMeet();
    done();
  };

  return (
    <InStack side="top-left" order={1}>
      <AnimatePresence>
        {show && (
          <motion.div
            role="dialog"
            aria-labelledby="agenda-entrar"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pointer-events-auto w-80 max-w-full rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl"
          >
            <p id="agenda-entrar" className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="size-4 shrink-0 text-slate" />
              {now >= show.start ? T.now : T.at(CLOCK.format(show.start))}
            </p>
            <p className="mt-1.5 truncate text-sm">{show.title}</p>
            <p className="mt-0.5 text-xs text-slate">{zone ? zone.name : T.viaMeet}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={done} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                {T.notNow}
              </button>
              {zone && show.meet && (
                <button type="button" onClick={openMeet} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                  {T.meet}
                </button>
              )}
              <button type="button" onClick={enter} className="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-offwhite transition hover:brightness-110">
                {T.go}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </InStack>
  );
}
