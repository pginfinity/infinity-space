import { describe, expect, it } from "vitest";
import type { DailyState, Zone } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";
import { DailyActivity } from "./index.ts";

const DEV = { id: "dev", name: "Dev Lab", kind: "open", team: "Desenvolvimento", polygon: [] } as unknown as Zone;
const CORR = { id: "corredor", name: "Corredor", kind: "open", polygon: [] } as unknown as Zone;

/** Sala de mentira: pessoas, onde cada uma está e os eventos enviados. */
function setup() {
  const where = new Map<string, Zone>();
  const names = new Map<string, string>();
  const events: Array<{ ev: string; to?: string[] }> = [];
  const host = {
    players: () => [...where.keys()],
    playerName: (id: string) => names.get(id),
    playerZone: (id: string) => where.get(id),
    changed: () => undefined,
    event: (_a: Activity, ev: string, _d: unknown, o?: { to?: Iterable<string> }) => events.push({ ev, to: o?.to ? [...o.to] : undefined }),
  } as unknown as ActivityHost;
  const act = new DailyActivity(host);
  const put = (id: string, name: string, z: Zone) => {
    where.set(id, z);
    names.set(id, name);
  };
  const room = () => (act.snapshot() as DailyState).rooms["dev"];
  return { act, put, where, events, room };
}

describe("daily", () => {
  it("começa com quem está na sala e só vale em sala de time ou de reunião", () => {
    const { act, put, room } = setup();
    put("a", "Ana", DEV);
    put("b", "Bruno", DEV);
    put("c", "Caio", CORR);
    act.handle("c", "start", {});
    expect((act.snapshot() as DailyState).rooms).toEqual({});
    act.handle("a", "start", { turn: 120 });
    expect(room()!.order.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(room()!.turn).toBe(120);
  });

  it("só quem fala ou quem começou passa a vez; no fim, encerra e avisa a sala", () => {
    const { act, put, room, events } = setup();
    put("a", "Ana", DEV);
    put("b", "Bruno", DEV);
    put("c", "Caio", DEV);
    act.handle("a", "start", {});
    const order = room()!.order.map((p) => p.id);
    const notSpeakerNorStarter = order.find((id, i) => i !== 0 && id !== "a")!;
    act.handle(notSpeakerNorStarter, "next", undefined);
    expect(room()!.current).toBe(0);
    act.handle(order[0]!, "next", undefined);
    expect(room()!.current).toBe(1);
    act.handle("a", "next", undefined); // quem começou também pode
    expect(room()!.current).toBe(2);
    act.handle(order[2]!, "next", undefined);
    expect(room()).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ ev: "done" });
    expect(events.at(-1)!.to!.sort()).toEqual(["a", "b", "c"]);
  });

  it("quem chega depois entra no fim; quem sai do escritório deixa a roda", () => {
    const { act, put, room } = setup();
    put("a", "Ana", DEV);
    put("b", "Bruno", DEV);
    act.handle("a", "start", {});
    put("d", "Duda", DEV);
    act.handle("d", "join", undefined);
    expect(room()!.order.at(-1)!.id).toBe("d");
    const speaker = room()!.order[0]!.id;
    act.leave(speaker);
    expect(room()!.order.some((p) => p.id === speaker)).toBe(false);
    expect(room()!.current).toBe(0);
  });

  it("sala vazia encerra sozinha, sem comemoração", () => {
    const { act, put, where, room, events } = setup();
    put("a", "Ana", DEV);
    act.handle("a", "start", {});
    where.set("a", CORR);
    act.tick();
    expect(room()).toBeUndefined();
    expect(events.length).toBe(0);
  });
});
