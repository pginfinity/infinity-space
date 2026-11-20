import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Packr } from "msgpackr";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONVITE_ID, CONVITE_MAX_LINKS, CONVITE_TTL_MS, DEFAULT_LOOK, PROTOCOL_VERSION, ZoneIndex, buildStationMap, type ConviteState, type ServerMsg, type Vec2 } from "@infinity/world";
import type { Store } from "./store.ts";
import type { ActivityHost } from "./activities/types.ts";
import type { OfficeRoom } from "./room.ts";
import { ConviteActivity } from "./convite.ts";

const MAP = buildStationMap();
const ZONES = new ZoneIndex(MAP.zones);
const ECLIPSE = { x: -20, z: -1 };
const CORREDOR = { x: 0, z: -5.5 };

function fakeHost() {
  const mem = new Map<string, unknown>();
  const pos = new Map<string, Vec2>();
  const h = {
    events: [] as { ev: string; data: unknown; to?: string[] }[],
    notes: [] as string[],
    store: { get: <T>(k: string, f: T): T => (mem.has(k) ? (mem.get(k) as T) : f), set: <T>(k: string, v: T) => void mem.set(k, v) } as unknown as Store,
    changed: () => {},
    notify: (_id: string, text: string) => void h.notes.push(text),
    event: (_a: unknown, ev: string, data?: unknown, o?: { to?: Iterable<string> }) => void h.events.push({ ev, data, ...(o?.to ? { to: [...o.to] } : {}) }),
    playerZone: (id: string) => (pos.has(id) ? ZONES.zoneAt(pos.get(id)!) : undefined),
    put: (id: string, p: Vec2) => void pos.set(id, p),
    mem,
  };
  return h;
}

describe("convite de cliente (atividade)", () => {
  let host: ReturnType<typeof fakeHost>;
  let now: number;
  let room: { admit: string[]; refuse: string[] };
  let act: ConviteActivity;
  const token = () => (host.events.filter((e) => e.ev === "link").at(-1)?.data as { token: string } | undefined)?.token;

  beforeEach(() => {
    host = fakeHost();
    now = 1_000_000;
    room = { admit: [], refuse: [] };
    act = new ConviteActivity(host as unknown as ActivityHost, { admit: (p) => void room.admit.push(p), refuse: (p) => void room.refuse.push(p) }, () => now);
    host.put("ana", ECLIPSE);
    host.put("caio", CORREDOR);
  });

  it("só quem está numa sala de reunião cria o link; o link vai só para quem pediu e vale 24 h", () => {
    act.handle("caio", "criar", {});
    expect(token()).toBeUndefined();
    act.handle("ana", "criar", {});
    const ev = host.events.at(-1)!;
    expect(ev).toMatchObject({ ev: "link", to: ["ana"], data: { sala: "Sala Eclipse", exp: now + CONVITE_TTL_MS } });
    const t = token()!;
    expect(act.groupOf(t)).toBe("eclipse");
    expect(act.groupOf("outro")).toBeNull();
    expect(act.groupOf("__proto__")).toBeNull();
    // Na pasta de dados fica só o hash do código.
    expect(JSON.stringify(host.mem.get("convites"))).not.toContain(t);
    now += CONVITE_TTL_MS;
    expect(act.groupOf(t)).toBeNull();
  });

  it("tem teto de links no ar", () => {
    for (let i = 0; i < CONVITE_MAX_LINKS + 1; i++) act.handle("ana", "criar", {});
    expect(host.events.filter((e) => e.ev === "link")).toHaveLength(CONVITE_MAX_LINKS);
    expect(host.notes).toHaveLength(1);
  });

  it("só quem está na sala do convite deixa entrar ou recusa", () => {
    act.ask({ pid: "p1", name: "Cliente", group: "eclipse" });
    act.ask({ pid: "p2", name: "Outro", group: "eclipse" });
    expect((act.snapshot() as ConviteState).pedidos.map((p) => p.pid)).toEqual(["p1", "p2"]);
    act.handle("caio", "admitir", { pid: "p1" });
    act.handle("ana", "admitir", { pid: "nada" });
    expect(room.admit).toEqual([]);
    act.handle("ana", "admitir", { pid: "p1" });
    act.handle("ana", "recusar", { pid: "p2" });
    act.handle("ana", "admitir", { pid: "p2" });
    expect(room).toEqual({ admit: ["p1"], refuse: ["p2"] });
    expect((act.snapshot() as ConviteState).pedidos).toEqual([]);
    act.ask({ pid: "p3", name: "Desistiu", group: "eclipse" });
    act.drop("p3");
    expect((act.snapshot() as ConviteState).pedidos).toEqual([]);
  });
});

const packr = new Packr({ useRecords: false });

/** WebSocket de mentira: guarda o que o servidor manda, já decodificado. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  got: ServerMsg[] = [];
  closedWith?: number;
  send(data: Buffer): void {
    this.got.push(packr.unpack(data) as ServerMsg);
  }
  close(code?: number): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.closedWith = code;
    this.emit("close");
  }
  terminate(): void {
    this.close(1006);
  }
  ping(): void {}
  say(msg: object): void {
    this.emit("message", packr.pack(msg), true);
  }
  last<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.got.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

describe("convidado na sala", () => {
  const dir = mkdtempSync(join(tmpdir(), "space-convite-"));
  let room: OfficeRoom;
  const tick = () => (room as unknown as { tick(): void }).tick();
  const hello = (name: string, at?: Vec2) => ({ t: "hello", v: PROTOCOL_VERSION, name, look: DEFAULT_LOOK, lens: "2d", ...(at ? { at } : {}) });
  const enter = (name: string, at: Vec2) => {
    const s = new FakeSocket();
    room.accept(s as never);
    s.say(hello(name, at));
    return { s, id: s.last("welcome")!.you };
  };

  beforeAll(async () => {
    // DATA_DIR é lido quando store.ts carrega: muda antes de importar a sala.
    process.env.DATA_DIR = dir;
    const { OfficeRoom } = await import("./room.ts");
    room = new OfficeRoom();
    room.store.readOnly = true;
    await room.init();
  });
  afterAll(() => {
    room.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("espera na porta, entra com o sim de quem está na sala e só recebe o que é da reunião", () => {
    const ana = enter("Ana", ECLIPSE);
    const caio = enter("Caio", CORREDOR);
    expect(room.membersIn("eclipse")).toEqual([ana.id]);

    ana.s.say({ t: "act", id: CONVITE_ID, op: "criar" });
    const link = ana.s.got.find((m) => m.t === "actev" && m.ev === "link") as { data: { token: string } } | undefined;
    expect(caio.s.got.some((m) => m.t === "actev" && m.ev === "link")).toBe(false);
    const group = room.guestGroup(link!.data.token);
    expect(group).toBe("eclipse");

    const g = new FakeSocket();
    room.accept(g as never, undefined, group!);
    g.say(hello("Cliente", CORREDOR));
    expect(g.last("convidado")).toEqual({ t: "convidado", estado: "aguardando", sala: "Sala Eclipse" });
    tick();
    const pedidos = () => (caio.s.got.filter((m) => m.t === "act" && m.act.id === CONVITE_ID).at(-1) as { act: { state: ConviteState } } | undefined)?.act.state.pedidos;
    const [pedido] = pedidos()!;
    expect(pedido).toMatchObject({ name: "Cliente", group: "eclipse" });

    // Quem está fora da sala não deixa entrar.
    caio.s.say({ t: "act", id: CONVITE_ID, op: "admitir", data: { pid: pedido!.pid } });
    expect(g.last("convidado")?.estado).toBe("aguardando");
    ana.s.say({ t: "act", id: CONVITE_ID, op: "admitir", data: { pid: pedido!.pid } });
    expect(g.last("convidado")).toEqual({ t: "convidado", estado: "dentro", sala: "Sala Eclipse", pessoas: [{ id: ana.id, name: "Ana" }] });
    expect(pedidos()).toEqual([]);
    const joined = ana.s.last("join")!.player;
    expect(joined.name).toBe("Cliente (convidado)");
    // Entra na sala do convite (não onde o cliente pediu) e não sai dela.
    expect(room.membersIn("eclipse").sort()).toEqual([ana.id, joined.id].sort());
    g.say({ t: "pose", x: CORREDOR.x, z: CORREDOR.z, yaw: 0, anim: 0 });
    g.say({ t: "act", id: CONVITE_ID, op: "criar" });
    g.say({ t: "chat", text: "oi" });
    g.say({ t: "info", patch: { name: "Chefe", mic: true } });
    expect(room.membersIn("eclipse")).toContain(joined.id);
    expect(ana.s.last("info")).toEqual({ t: "info", id: joined.id, patch: { mic: true } });

    // Movimento, chat e atividades do escritório não chegam ao convidado.
    caio.s.say({ t: "pose", x: CORREDOR.x + 0.5, z: CORREDOR.z, yaw: 0, anim: 0 });
    caio.s.say({ t: "emote", e: "wave" });
    tick();
    const tipos = new Set(g.got.map((m) => m.t));
    expect([...tipos].every((t) => ["convidado", "audience", "rtc", "pong", "error"].includes(t))).toBe(true);
    expect(JSON.stringify(g.got)).not.toContain("Caio");

    // Ana sai: a lista do convidado atualiza.
    ana.s.close(1000);
    tick();
    tick();
    tick();
    expect(g.last("convidado")?.pessoas).toEqual([]);
  });

  it("recusado: avisa e fecha; link inválido não entra", () => {
    const bia = enter("Bia", ECLIPSE);
    bia.s.say({ t: "act", id: CONVITE_ID, op: "criar" });
    const g = new FakeSocket();
    room.accept(g as never, undefined, "eclipse");
    g.say(hello("Visita"));
    tick();
    const st = bia.s.got.filter((m) => m.t === "act" && m.act.id === CONVITE_ID).at(-1) as { act: { state: ConviteState } };
    bia.s.say({ t: "act", id: CONVITE_ID, op: "recusar", data: { pid: st.act.state.pedidos.at(-1)!.pid } });
    expect(g.last("convidado")?.estado).toBe("recusado");
    expect(g.closedWith).toBe(4003);
    expect(room.guestGroup("inventado")).toBeNull();
    bia.s.close(1000);
  });
});
