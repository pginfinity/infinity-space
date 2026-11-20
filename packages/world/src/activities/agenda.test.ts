import { describe, expect, it } from "vitest";
import { AGENDA_JOIN_AFTER_MS, AGENDA_JOIN_BEFORE_MS, agendaBooking, agendaBookings, agendaFromGoogle, agendaJoinable, agendaNow, agendaRoom, buildStationMap, type AgendaEvent, type GoogleEvent } from "../index.ts";

const zones = buildStationMap().zones;
const T0 = Date.parse("2026-11-20T14:00:00-03:00");
const H = 60 * 60_000;
const ev = (p: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: "e1",
  summary: "Planejamento",
  start: { dateTime: "2026-11-20T14:00:00-03:00" },
  end: { dateTime: "2026-11-20T15:00:00-03:00" },
  ...p,
});

describe("agenda: sala citada no evento", () => {
  it("acha a sala pelo nome, sem acento e sem o 'Sala'", () => {
    expect(agendaRoom("Sala Eclipse", zones)?.id).toBe("eclipse");
    expect(agendaRoom("na eclipse, 2º andar", zones)?.id).toBe("eclipse");
    expect(agendaRoom("Suíte 2", zones)?.id).toBe("diretoria-2");
    expect(agendaRoom("AUDITORIO", zones)?.id).toBe("auditorio");
  });

  it("sala aberta, palavra parecida ou texto vazio não reservam", () => {
    expect(agendaRoom("Café & Copa", zones)).toBeUndefined();
    expect(agendaRoom("eclipses solares", zones)).toBeUndefined();
    expect(agendaRoom("", zones)).toBeUndefined();
  });
});

describe("agenda: eventos do Google", () => {
  it("guarda horário, sala (local antes do título) e o Meet", () => {
    const [e] = agendaFromGoogle([ev({ location: "Suíte 1", summary: "Revisão na Eclipse", hangoutLink: "https://meet.google.com/abc-defg-hij" })], zones);
    expect(e).toEqual({ id: "e1", title: "Revisão na Eclipse", start: T0, end: T0 + H, zone: "diretoria-1", meet: "https://meet.google.com/abc-defg-hij" });
  });

  it("deixa de fora dia inteiro, cancelado, livre, recusado, foco e link que não é https", () => {
    const list = agendaFromGoogle(
      [
        ev({ id: "dia", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } }),
        ev({ id: "cancelado", status: "cancelled" }),
        ev({ id: "livre", transparency: "transparent" }),
        ev({ id: "recusado", attendees: [{ self: true, responseStatus: "declined" }] }),
        ev({ id: "foco", eventType: "focusTime" }),
        ev({ id: "ok", attendees: [{ self: true, responseStatus: "accepted" }], conferenceData: { entryPoints: [{ entryPointType: "video", uri: "javascript:alert(1)" }] } }),
      ],
      zones,
    );
    expect(list.map((e) => e.id)).toEqual(["ok"]);
    expect(list[0]!.meet).toBeUndefined();
  });

  it("reservas: sem título, uma por evento mesmo em várias agendas, só as que não acabaram", () => {
    const a: AgendaEvent = { id: "x", title: "Segredo", start: T0, end: T0 + H, zone: "eclipse" };
    const old: AgendaEvent = { id: "y", title: "Antes", start: T0 - 2 * H, end: T0 - H, zone: "eclipse" };
    const rooms = agendaBookings(
      [
        { name: "Ana", events: [a, old] },
        { name: "Bruno", events: [{ ...a }, { id: "z", title: "Sem sala", start: T0, end: T0 + H }] },
      ],
      T0 - 10 * 60_000,
    );
    expect(rooms).toEqual([{ zone: "eclipse", start: T0, end: T0 + H, by: "Ana" }]);
    expect(agendaBooking(rooms, "eclipse", T0 + H / 2)?.by).toBe("Ana");
    expect(agendaBooking(rooms, "eclipse", T0 + H)).toBeUndefined();
    expect(agendaBooking(rooms, "auditorio", T0)).toBeUndefined();
  });
});

describe("agenda: agora e Entrar", () => {
  const meet: AgendaEvent = { id: "m", title: "Call", start: T0, end: T0 + H, meet: "https://meet.google.com/x" };
  const plain: AgendaEvent = { id: "p", title: "Bloqueio", start: T0, end: T0 + 30 * 60_000 };

  it("em reunião: o evento em andamento que termina primeiro", () => {
    expect(agendaNow([meet, plain], T0 + 60_000)?.id).toBe("p");
    expect(agendaNow([meet, plain], T0 + 40 * 60_000)?.id).toBe("m");
    expect(agendaNow([meet], T0 - 1)).toBeUndefined();
    expect(agendaNow([meet], T0 + H)).toBeUndefined();
  });

  it("Entrar só com sala ou Meet, de pouco antes a pouco depois do início", () => {
    expect(agendaJoinable([plain, meet], T0 - AGENDA_JOIN_BEFORE_MS)?.id).toBe("m");
    expect(agendaJoinable([meet], T0 - AGENDA_JOIN_BEFORE_MS - 1)).toBeUndefined();
    expect(agendaJoinable([meet], T0 + AGENDA_JOIN_AFTER_MS)).toBeUndefined();
    expect(agendaJoinable([{ ...meet, end: T0 + 5 * 60_000 }], T0 + 5 * 60_000)).toBeUndefined();
  });
});
