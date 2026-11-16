import {
  COPA_DELIVER_RANGE,
  COPA_ID,
  COPA_KIND,
  COPA_RANGE,
  COPA_STATIONS,
  COPA_STATION_TYPES,
  copaCount,
  copaCountsFor,
  copaEmptyCounts,
  copaServes,
  copaStationPoint,
  vivoDay,
  type CopaBusy,
  type CopaItem,
  type CopaServed,
  type CopaState,
  type CopaStationType,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "vivo/copa";

interface Station {
  type: CopaStationType;
  point: Vec2;
}

/**
 * Copa: a pessoa pede (café, chá, água, suco, pipoca) perto da estação; o servidor confere a distância,
 * marca a estação como ocupada durante o preparo e, no fim, confere de novo e põe o item na mão.
 * Guarda só o contador do dia do time inteiro (nada por pessoa).
 *
 * Operações: `order` `{ station: idDoObjeto, item }`.
 * Eventos: `start` e `served` `CopaServed` (todos, para som e efeito), `refuse` `{ reason, name? }` (só quem pediu).
 */
export class CopaActivity implements Activity {
  readonly id = COPA_ID;
  readonly kind = COPA_KIND;
  private readonly stations = new Map<string, Station>();
  private day: string;
  private counts: Record<CopaItem, number>;
  private busy: Record<string, CopaBusy> = {};

  constructor(private readonly host: ActivityHost) {
    for (const type of COPA_STATION_TYPES) for (const o of host.objects(type)) this.stations.set(o.id, { type, point: copaStationPoint(o) });
    const saved = host.store.get<Pick<CopaState, "day" | "counts">>(KEY, { day: "", counts: copaEmptyCounts() });
    this.day = vivoDay(Date.now());
    this.counts = copaCountsFor(saved, this.day);
  }

  snapshot(): CopaState {
    return { day: this.day, counts: this.counts, busy: this.busy, now: Date.now() };
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "order") return;
    const d = (data ?? {}) as { station?: unknown; item?: unknown };
    if (typeof d.station !== "string") return;
    const st = this.stations.get(d.station);
    if (!st || !copaServes(st.type, d.item)) return;
    const item = d.item;
    if (!this.host.near(from, st.point, COPA_RANGE)) {
      this.host.event(this, "refuse", { reason: "far" }, { to: [from] });
      return;
    }
    // Um pedido por vez em cada estação, e uma estação por vez para cada pessoa.
    const cur = this.busy[d.station];
    if (cur) {
      if (cur.id !== from) this.host.event(this, "refuse", { reason: "busy", name: cur.name }, { to: [from] });
      return;
    }
    for (const b of Object.values(this.busy)) if (b.id === from) return;
    const now = Date.now();
    const name = this.host.playerName(from) ?? "Alguém";
    this.busy = { ...this.busy, [d.station]: { id: from, name, item, at: now, until: now + COPA_STATIONS[st.type].prepMs } };
    this.host.changed(this);
    this.host.event(this, "start", { station: d.station, item, name } satisfies CopaServed, { from });
  }

  tick(): void {
    const now = Date.now();
    // O dia virou: zera o contador (o quadro da copa recomeça).
    const day = vivoDay(now);
    if (day !== this.day) {
      this.day = day;
      this.counts = copaCountsFor({ day: "", counts: this.counts }, day);
      this.host.changed(this);
    }
    for (const [station, b] of Object.entries(this.busy)) {
      if (now < b.until) continue;
      this.finish(station, b, now);
    }
  }

  leave(id: string): void {
    for (const [station, b] of Object.entries(this.busy)) if (b.id === id) this.drop(station);
  }

  private finish(station: string, b: CopaBusy, now: number): void {
    this.drop(station);
    const st = this.stations.get(station);
    if (!st) return;
    if (!this.host.near(b.id, st.point, COPA_DELIVER_RANGE)) {
      this.host.event(this, "refuse", { reason: "away" }, { to: [b.id] });
      return;
    }
    this.host.setHeld(b.id, b.item);
    const next = copaCount({ day: this.day, counts: this.counts }, b.item, now);
    this.day = next.day;
    this.counts = next.counts;
    this.host.store.set(KEY, { day: this.day, counts: this.counts });
    this.host.event(this, "served", { station, item: b.item, name: b.name } satisfies CopaServed, { from: b.id });
  }

  private drop(station: string): void {
    const { [station]: _gone, ...rest } = this.busy;
    this.busy = rest;
    this.host.changed(this);
  }
}
