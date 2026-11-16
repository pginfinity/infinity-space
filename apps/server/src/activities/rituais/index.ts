import { DAILY_ID, DAILY_KIND, DAILY_TURNS, dailyAllowed, dailyShuffle, type DailyRoom, type DailyState } from "@infinity/world";
import type { Activity, ActivityFactory, ActivityHost } from "../types.ts";

/**
 * Daily (uma por sala). Operações (todas valem para a sala onde a pessoa está):
 * - `start` { turn?: segundos }: começa com quem está na sala, em ordem sorteada;
 * - `next`: passa a vez (quem fala agora ou quem começou);
 * - `join`: quem chegou depois entra no fim da roda;
 * - `end`: encerra.
 * Evento `done` { room } para quem estava na sala quando terminou.
 */
export class DailyActivity implements Activity {
  readonly id = DAILY_ID;
  readonly kind = DAILY_KIND;
  private state: DailyState = { rooms: {} };

  constructor(private readonly host: ActivityHost) {}

  snapshot(): DailyState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    const zone = this.host.playerZone(from);
    if (!dailyAllowed(zone)) return;
    const room = this.state.rooms[zone.id];
    const name = this.host.playerName(from) ?? "Alguém";
    if (op === "start" && !room) {
      const want = (data as { turn?: unknown } | undefined)?.turn;
      const turn = DAILY_TURNS.includes(want as (typeof DAILY_TURNS)[number]) ? (want as number) : 90;
      const people = this.inRoom(zone.id);
      if (!people.length) return;
      this.set(zone.id, { zone: zone.id, room: zone.name, order: dailyShuffle(people), current: 0, turn, turnAt: Date.now(), by: name });
    } else if (op === "next" && room) {
      const speaker = room.order[room.current];
      if (speaker?.id !== from && room.by !== name) return;
      this.advance(zone.id, room);
    } else if (op === "join" && room && !room.order.some((p) => p.id === from)) {
      this.set(zone.id, { ...room, order: [...room.order, { id: from, name }] });
    } else if (op === "end" && room) {
      this.finish(zone.id, room);
    }
  }

  tick(): void {
    // Sala vazia: a daily acaba sozinha.
    for (const [zone, room] of Object.entries(this.state.rooms)) if (!this.inRoom(zone).length) this.finish(zone, room, false);
  }

  leave(id: string): void {
    // Quem sai do escritório deixa a roda (se era a vez dele, passa para o próximo).
    for (const [zone, room] of Object.entries(this.state.rooms)) {
      const i = room.order.findIndex((p) => p.id === id);
      if (i < 0) continue;
      const order = room.order.filter((p) => p.id !== id);
      if (!order.length) {
        this.finish(zone, room, false);
        continue;
      }
      const current = i < room.current ? room.current - 1 : Math.min(room.current, order.length - 1);
      this.set(zone, { ...room, order, current, turnAt: i === room.current ? Date.now() : room.turnAt });
    }
  }

  private advance(zone: string, room: DailyRoom): void {
    if (room.current + 1 >= room.order.length) return this.finish(zone, room);
    this.set(zone, { ...room, current: room.current + 1, turnAt: Date.now() });
  }

  private finish(zone: string, room: DailyRoom, celebrate = true): void {
    const rooms = { ...this.state.rooms };
    delete rooms[zone];
    this.state = { rooms };
    this.host.changed(this);
    if (celebrate) this.host.event(this, "done", { room: room.room }, { to: this.inRoom(zone).map((p) => p.id) });
  }

  private set(zone: string, room: DailyRoom): void {
    this.state = { rooms: { ...this.state.rooms, [zone]: room } };
    this.host.changed(this);
  }

  private inRoom(zone: string): Array<{ id: string; name: string }> {
    return this.host
      .players()
      .filter((id) => this.host.playerZone(id)?.id === zone)
      .map((id) => ({ id, name: this.host.playerName(id) ?? "Alguém" }));
  }
}

/** Pacote "rituais": rituais do time (daily). */
const create: ActivityFactory = (host) => [new DailyActivity(host)];
export default create;
