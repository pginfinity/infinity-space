import type { Emote, HeldItem, MapDef, MapObject, NavGrid, ObjectType, Vec2, Zone, ZoneIndex } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";
import type { Store } from "../../store.ts";

/** Anfitrião falso para os testes do pacote arcade: posições na mão, eventos gravados, sem paredes. */
export class FakeHost implements ActivityHost {
  readonly map = { objects: [] } as unknown as MapDef;
  readonly nav = {} as NavGrid;
  readonly zones = { zoneAt: () => undefined } as unknown as ZoneIndex;
  readonly saved = new Map<string, unknown>();
  readonly store = {
    get: <T,>(k: string, fallback: T): T => (this.saved.has(k) ? (this.saved.get(k) as T) : fallback),
    set: <T,>(k: string, v: T) => void this.saved.set(k, v),
  } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  events: Array<{ ev: string; data: unknown; to?: string[]; from?: string }> = [];
  changes = 0;
  emotes: Array<[string, Emote]> = [];
  held = new Map<string, HeldItem | null>();
  objs: MapObject[] = [];

  add(id: string, name: string, p: Vec2): void {
    this.names.set(id, name);
    this.pos.set(id, p);
  }
  changed(_a: Activity): void {
    this.changes++;
  }
  event(_a: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string>; from?: string }): void {
    this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}), ...(opts?.from ? { from: opts.from } : {}) });
  }
  players(): string[] {
    return [...this.pos.keys()];
  }
  playerName(id: string): string | undefined {
    return this.names.get(id);
  }
  playerPos(id: string): Vec2 | undefined {
    return this.pos.get(id);
  }
  playerZone(_id: string): Zone | undefined {
    return undefined;
  }
  emote(id: string, e: Emote): void {
    this.emotes.push([id, e]);
  }
  setHeld(id: string, item: HeldItem | null): void {
    this.held.set(id, item);
  }
  objects(type: ObjectType): MapObject[] {
    return this.objs.filter((o) => o.type === type);
  }
  /** Nos testes ninguém está sentado em outro jogo. */
  claimSeat(): string | null {
    return null;
  }
  notify(): void {}
  near(id: string, p: Vec2, range: number): boolean {
    const q = this.pos.get(id);
    return !!q && Math.hypot(q.x - p.x, q.z - p.z) <= range;
  }
  /** Eventos com esse nome. */
  of<T = unknown>(ev: string): T[] {
    return this.events.filter((e) => e.ev === ev).map((e) => e.data as T);
  }
}
