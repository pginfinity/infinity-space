import { beforeEach, describe, expect, it } from "vitest";
import { MEGAFONE_MAX_MS, MEGAFONE_TEXT } from "@infinity/world";
import type { ActivityHost } from "../types.ts";
import { MegafoneActivity } from "./megafone.ts";

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

describe("megafone", () => {
  let events: Sent[];
  let dirty: number;
  let now: number;
  const names: Record<string, string> = { g: "Gestora", h: "Helena", a: "Ana" };
  const host = {
    changed: () => void dirty++,
    event: (_a: unknown, ev: string, data?: unknown, o?: { to?: Iterable<string> }) => void events.push({ ev, data, ...(o?.to ? { to: [...o.to] } : {}) }),
    playerName: (id: string) => names[id],
  } as unknown as ActivityHost;
  const make = (devAdmin = false) => new MegafoneActivity(host, { admin: (_id, name) => name === "Gestora" || name === "Helena", devAdmin, now: () => now });

  beforeEach(() => {
    events = [];
    dirty = 0;
    now = 1_000;
  });

  it("só admin fala; um por vez; desliga ao parar, ao sair ou depois de 5 minutos", () => {
    const m = make();
    m.handle("a", "falar", { on: true });
    expect(m.snapshot().speaker).toBeNull();
    m.handle("g", "falar", { on: true });
    expect(m.snapshot().speaker).toEqual({ id: "g", name: "Gestora", since: 1_000 });
    m.handle("h", "falar", { on: true });
    expect(events).toEqual([{ ev: "ocupado", data: { name: "Gestora" }, to: ["h"] }]);
    m.handle("h", "falar", { on: false });
    expect(m.snapshot().speaker?.id).toBe("g");
    m.handle("g", "falar", { on: false });
    expect(m.snapshot().speaker).toBeNull();

    m.handle("h", "falar", { on: true });
    m.leave("h");
    expect(m.snapshot().speaker).toBeNull();

    m.handle("g", "falar", { on: true });
    now += MEGAFONE_MAX_MS - 1;
    m.tick();
    expect(m.snapshot().speaker?.id).toBe("g");
    now += 1;
    m.tick();
    expect(m.snapshot().speaker).toBeNull();
    expect(dirty).toBe(6);
  });

  it("aviso escrito vai para todos, limpo e cortado; vazio ou de quem não é admin, nada", () => {
    const m = make();
    m.handle("a", "escrever", { text: "oi" });
    m.handle("g", "escrever", { text: "   " });
    m.handle("g", "escrever", { text: `Reunião geral\u0007 às 15h ${"x".repeat(400)}` });
    expect(events).toHaveLength(1);
    const d = events[0]!.data as { text: string; by: string };
    expect(events[0]!.to).toBeUndefined();
    expect(d.by).toBe("Gestora");
    expect(d.text).toMatch(/^Reunião geral às 15h x+$/);
    expect(d.text.length).toBe(MEGAFONE_TEXT);
  });

  it("admin-dev só sem login", () => {
    const m = make();
    m.handle("a", "admin-dev", { on: true });
    m.handle("a", "falar", { on: true });
    expect(m.snapshot().speaker).toBeNull();
    const dev = make(true);
    dev.handle("a", "admin-dev", { on: true });
    dev.handle("a", "falar", { on: true });
    expect(dev.snapshot().speaker?.name).toBe("Ana");
  });
});
