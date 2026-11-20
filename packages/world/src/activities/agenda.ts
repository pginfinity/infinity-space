import type { Zone } from "../map/types.ts";

/**
 * Google Agenda de quem conectou a própria agenda (opcional, cada pessoa decide).
 * O título do evento só volta para a própria pessoa; o time vê só o balão "Em reunião" e, quando o
 * evento cita uma sala do Space no local ou no título, a reserva dela (quem e o horário) na TV da sala.
 */

export const AGENDA_API = "/api/agenda";
/** O "Entrar" aparece este tempo antes do início… */
export const AGENDA_JOIN_BEFORE_MS = 2 * 60_000;
/** …e some este tempo depois (ou no fim do evento, o que vier antes). */
export const AGENDA_JOIN_AFTER_MS = 10 * 60_000;

export interface AgendaEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  /** Sala do Space citada no local ou no título. */
  zone?: string;
  /** Link da videochamada do evento (Meet). */
  meet?: string;
}

/** Reserva de uma sala, vista por todos: sem o título do evento. */
export interface RoomBooking {
  zone: string;
  start: number;
  end: number;
  by: string;
}

export interface AgendaView {
  /** O servidor tem o app do Google configurado (e a pessoa está logada). */
  configured: boolean;
  connected: boolean;
  events: AgendaEvent[];
  rooms: RoomBooking[];
}

/** Evento da Calendar API (só os campos usados). */
export interface GoogleEvent {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  transparency?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

const BOOKABLE: ReadonlySet<Zone["kind"]> = new Set(["meeting", "office", "auditorium"]);

const words = (s: string) => ` ${s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Sala do Space citada num texto: "Sala Eclipse", "eclipse", "Suíte 2", "auditorio". */
export function agendaRoom(text: string, zones: readonly Zone[]): Zone | undefined {
  const t = words(text);
  return zones.find((z) => BOOKABLE.has(z.kind) && t.includes(words(z.name).replace(/^ sala /, " ")));
}

/** Eventos que ocupam a pessoa: com hora marcada, não cancelados, não "livre" e não recusados. */
export function agendaFromGoogle(items: readonly GoogleEvent[], zones: readonly Zone[]): AgendaEvent[] {
  const out: AgendaEvent[] = [];
  for (const e of items) {
    // Dia inteiro (feriado, aniversário), foco, fora do escritório e local de trabalho não são reunião.
    if (!e.id || !e.start?.dateTime || !e.end?.dateTime) continue;
    if (e.status === "cancelled" || e.transparency === "transparent") continue;
    if (e.eventType && e.eventType !== "default") continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const start = Date.parse(e.start.dateTime);
    const end = Date.parse(e.end.dateTime);
    if (!(end > start)) continue;
    const zone = agendaRoom(e.location ?? "", zones) ?? agendaRoom(e.summary ?? "", zones);
    const link = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
    out.push({
      id: e.id,
      title: (e.summary ?? "").trim().slice(0, 120) || "Sem título",
      start,
      end,
      ...(zone && { zone: zone.id }),
      // O link é aberto pelo navegador: só https.
      ...(link && /^https:\/\//.test(link) && { meet: link }),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Reservas de sala a partir das agendas de cada pessoa. O mesmo evento em várias agendas conta uma vez. */
export function agendaBookings(people: ReadonlyArray<{ name: string; events: readonly AgendaEvent[] }>, now: number): RoomBooking[] {
  const seen = new Map<string, RoomBooking>();
  for (const p of people)
    for (const e of p.events) {
      if (!e.zone || e.end <= now) continue;
      const key = `${e.zone}|${e.start}|${e.end}`;
      if (!seen.has(key)) seen.set(key, { zone: e.zone, start: e.start, end: e.end, by: p.name });
    }
  return [...seen.values()].sort((a, b) => a.start - b.start);
}

/** Evento acontecendo agora (o que termina primeiro, se houver dois). */
export function agendaNow(events: readonly AgendaEvent[], now: number): AgendaEvent | undefined {
  let best: AgendaEvent | undefined;
  for (const e of events) if (e.start <= now && now < e.end && (!best || e.end < best.end)) best = e;
  return best;
}

/** Evento com o "Entrar" à mostra: tem sala ou videochamada, de pouco antes até pouco depois do início. */
export function agendaJoinable(events: readonly AgendaEvent[], now: number): AgendaEvent | undefined {
  return events.find((e) => (e.zone || e.meet) && now >= e.start - AGENDA_JOIN_BEFORE_MS && now < Math.min(e.end, e.start + AGENDA_JOIN_AFTER_MS));
}

/** A reserva em andamento da sala, ou a próxima. */
export function agendaBooking(rooms: readonly RoomBooking[], zone: string, now: number): RoomBooking | undefined {
  let best: RoomBooking | undefined;
  for (const b of rooms) if (b.zone === zone && b.end > now && (!best || b.start < best.start)) best = b;
  return best;
}
