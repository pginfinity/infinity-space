import { beforeEach, describe, expect, it } from "vitest";
import { buildStationMap, dist, type PainelState, type Vec2 } from "@infinity/world";
import type { Store } from "../../store.ts";
import type { ActivityHost } from "../types.ts";
import { PAINEL_POLL_MS, PainelActivity, supremacyFromEnv, type PainelOpts } from "./painel.ts";

const MAP = buildStationMap();
const PANEL = MAP.objects.find((o) => o.type === "lobby-panel")!;

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

/** Sala falsa só com o que o painel usa. */
function fakeHost() {
  const mem = new Map<string, unknown>();
  const pos = new Map<string, Vec2>();
  const names = new Map<string, string>();
  const h = {
    events: [] as Sent[],
    dirty: 0,
    mem,
    store: { get: <T>(k: string, f: T): T => (mem.has(k) ? (mem.get(k) as T) : f), set: <T>(k: string, v: T) => void mem.set(k, v) } as unknown as Store,
    changed: () => void h.dirty++,
    event: (_a: unknown, ev: string, data?: unknown, o?: { to?: Iterable<string> }) => void h.events.push({ ev, data, ...(o?.to ? { to: [...o.to] } : {}) }),
    playerName: (id: string) => names.get(id),
    objects: (type: string) => MAP.objects.filter((o) => o.type === type),
    near: (id: string, p: Vec2, r: number) => !!pos.get(id) && dist(pos.get(id)!, p) <= r,
    put: (id: string, name: string, p: Vec2) => void (pos.set(id, p), names.set(id, name)),
    last: (ev: string) => h.events.filter((e) => e.ev === ev).at(-1),
  };
  return h;
}

describe("painel do time", () => {
  let host: ReturnType<typeof fakeHost>;
  let now: number;
  let replies: unknown[];
  let urls: string[];
  const make = (opts: PainelOpts = {}) =>
    new PainelActivity(host as unknown as ActivityHost, {
      admin: (_id, name) => name === "Gestora",
      now: () => now,
      supremacy: { url: "http://sup", token: "t" },
      fetch: async (url, init) => {
        urls.push(`${url} ${init.headers["X-Service-Token"]}`);
        const r = replies.shift();
        if (r instanceof Error) throw r;
        return { ok: r !== 401, status: r === 401 ? 401 : 200, json: async () => r };
      },
      ...opts,
    });

  beforeEach(() => {
    host = fakeHost();
    now = Date.UTC(2026, 10, 20, 13); // 20/11 10:00 em São Paulo
    replies = [];
    urls = [];
    host.put("g", "Gestora", PANEL.interact!.point);
    host.put("a", "Ana", PANEL.interact!.point);
    host.put("longe", "Gestora", { x: 20, z: 20 });
  });

  it("só admin perto do painel edita; todo mundo lê", () => {
    const act = make();
    act.handle("a", "metas", { text: "Meta da Ana" });
    act.handle("longe", "metas", { text: "Meta de longe" });
    expect(act.snapshot().goals).toEqual([]);
    act.handle("g", "metas", { text: "- Fechar 3 contratos\nSubir o CRM" });
    act.handle("g", "aviso", { text: "Happy hour sexta" });
    const s: PainelState = act.snapshot();
    expect(s.goals).toEqual(["Fechar 3 contratos", "Subir o CRM"]);
    expect(s.notices).toMatchObject([{ text: "Happy hour sexta", by: "Gestora" }]);
    act.handle("g", "tirar-aviso", { id: s.notices[0]!.id });
    expect(act.snapshot().notices).toEqual([]);
    // Fica guardado: outro servidor sobe com o mesmo painel.
    expect(make().snapshot().goals).toEqual(["Fechar 3 contratos", "Subir o CRM"]);
  });

  it("a lista de aniversários inteira só vai para admin; o time vê os próximos 7 dias", () => {
    const act = make({ supremacy: null });
    act.handle("g", "aniversarios", { text: "Ana 20/11\nBruno 25/11\nCaio 10/12\nxx" });
    expect(host.last("salvo")).toEqual({ ev: "salvo", data: { bad: ["xx"] }, to: ["g"] });
    expect(act.snapshot().birthdays.map((b) => b.name)).toEqual(["Ana", "Bruno"]);
    act.handle("a", "abrir", {});
    expect(host.last("papel")).toEqual({ ev: "papel", data: { admin: false }, to: ["a"] });
    act.handle("g", "abrir", {});
    expect(host.last("papel")).toEqual({ ev: "papel", data: { admin: true, birthdays: "Ana 20/11\nBruno 25/11\nCaio 10/12" }, to: ["g"] });
    // Virou o dia: Ana sai, a lista anda sozinha.
    now += 24 * 3600_000;
    act.tick();
    expect(act.snapshot().birthdays.map((b) => b.name)).toEqual(["Bruno"]);
  });

  it("admin-dev só sem login", () => {
    const act = make();
    act.handle("a", "admin-dev", { on: true });
    act.handle("a", "metas", { text: "x" });
    expect(act.snapshot().goals).toEqual([]);
    const dev = make({ devAdmin: true });
    dev.handle("a", "admin-dev", { on: true });
    dev.handle("a", "metas", { text: "x" });
    expect(dev.snapshot().goals).toEqual(["x"]);
  });

  it("pergunta ao Supremacy os últimos 7 dias e solta confete quando um cliente sobe", async () => {
    const act = make();
    replies.push({ clientes: [{ client: "Cunha", deploys: 2 }] }, { clientes: [{ client: "Cunha", deploys: 3 }, { client: "Álamo", deploys: 1 }] }, 401, new Error("fora do ar"));
    await act.poll();
    expect(urls).toEqual(["http://sup/api/deploys/por-cliente?de=2026-11-14&ate=2026-11-20 t"]);
    expect(act.snapshot().deploys).toEqual([{ client: "Cunha", deploys: 2 }]);
    expect(host.last("subiu")).toBeUndefined();
    await act.poll();
    expect(host.events.filter((e) => e.ev === "subiu").map((e) => e.data)).toEqual([{ client: "Cunha" }, { client: "Álamo" }]);
    // Erro ou Supremacy fora do ar: fica o último número.
    await act.poll();
    await act.poll();
    expect(act.snapshot().deploys).toEqual([
      { client: "Cunha", deploys: 3 },
      { client: "Álamo", deploys: 1 },
    ]);
  });

  it("consulta no primeiro tique e depois a cada 2 minutos; sem env, nada", async () => {
    const act = make();
    replies.push({ clientes: [] }, { clientes: [] });
    act.tick();
    act.tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(urls).toHaveLength(1);
    now += PAINEL_POLL_MS;
    act.tick();
    expect(urls).toHaveLength(2);
    expect(make({ supremacy: null }).snapshot().deploys).toBeNull();
    expect(supremacyFromEnv({ SUPREMACY_URL: "https://sup/", SUPREMACY_SERVICE_TOKEN: " x " })).toEqual({ url: "https://sup", token: "x" });
    expect(supremacyFromEnv({ SUPREMACY_URL: "https://sup" })).toBeNull();
  });
});
