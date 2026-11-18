import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAT_DM_KEEP,
  CHAT_GENERAL_KEEP,
  CHAT_TEXT_MAX,
  NavGrid,
  ZoneIndex,
  buildStationMap,
  chatHash,
  chatPair,
  dist,
  type ChatConvsEvent,
  type ChatDmEvent,
  type ChatFailEvent,
  type ChatHistEvent,
  type ChatMsg,
  type ChatNearEvent,
  type Emote,
  type MapDef,
  type Vec2,
} from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { ChatActivity } from "./chat.ts";

const MAP: MapDef = buildStationMap();

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
  from?: string;
}

/** Sala falsa com o mapa de verdade (zonas e paredes), eventos gravados e armazenamento em memória. */
class FakeHost implements ActivityHost {
  readonly map = MAP;
  readonly nav = NavGrid.fromMap(MAP);
  readonly zones = new ZoneIndex(MAP.zones);
  readonly mem = new Map<string, unknown>();
  readonly store = {
    get: <T>(k: string, f: T): T => (this.mem.has(k) ? (this.mem.get(k) as T) : f),
    set: <T>(k: string, v: T): void => void this.mem.set(k, structuredClone(v)),
  } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  events: Sent[] = [];
  changed(_a: Activity): void {}
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
  playerZone(id: string) {
    const p = this.pos.get(id);
    return p ? this.zones.zoneAt(p) : undefined;
  }
  emote(_id: string, _e: Emote): void {}
  setHeld(): void {}
  objects() {
    return [];
  }
  claimSeat(): string | null {
    return null;
  }
  notify(): void {}
  near(id: string, p: Vec2, range: number): boolean {
    const at = this.pos.get(id);
    return !!at && dist(at, p) <= range;
  }
  put(id: string, name: string, p: Vec2): void {
    this.pos.set(id, p);
    this.names.set(id, name);
  }
  drop(id: string): void {
    this.pos.delete(id);
    this.names.delete(id);
  }
  of(ev: string): Sent[] {
    return this.events.filter((e) => e.ev === ev);
  }
}

describe("chat no servidor", () => {
  let host: FakeHost;
  let now: number;
  let chat: ChatActivity;
  beforeEach(() => {
    host = new FakeHost();
    now = 1_800_000_000_000;
    chat = new ChatActivity(host, () => now);
    // Ana e Bruno conversando no átrio; Carla longe, no Dev Lab.
    host.put("a", "Ana", { x: 1, z: 2 });
    host.put("b", "Bruno", { x: 3, z: 2 });
    host.put("c", "Carla", { x: -20, z: -12 });
  });

  it("snapshot mínimo: nada de histórico para todos", () => {
    chat.handle("a", "send", { ch: "geral", text: "bom dia" });
    expect(chat.snapshot()).toBeNull();
  });

  it("Geral vai para todos, guardado e limpo no servidor", () => {
    chat.handle("a", "send", { ch: "geral", text: "  bom dia\u0000 time  ", cid: "c-1" });
    const ev = host.of("msg").at(-1)!;
    expect(ev.to).toBeUndefined();
    const m = (ev.data as { m: ChatMsg }).m;
    expect(m).toMatchObject({ text: "bom dia  time", name: "Ana", fromKey: "ana", from: "a", cid: "c-1", at: now });
    // Guardado sem o id do cliente.
    const saved = host.mem.get("chat/geral") as ChatMsg[];
    expect(saved).toHaveLength(1);
    expect(saved[0]!.cid).toBeUndefined();
  });

  it("corta em 1000, recusa vazio e tipos estranhos", () => {
    chat.handle("a", "send", { ch: "geral", text: "x".repeat(5000) });
    expect((host.of("msg").at(-1)!.data as { m: ChatMsg }).m.text).toHaveLength(CHAT_TEXT_MAX);
    chat.handle("a", "send", { ch: "geral", text: "   ", cid: "vazio" });
    expect(host.of("fail").at(-1)).toMatchObject({ to: ["a"], data: { cid: "vazio", reason: "empty" } });
    chat.handle("a", "send", { ch: "geral", text: { evil: 1 } });
    chat.handle("a", "send", { ch: "sala-secreta", text: "oi" });
    chat.handle("a", "send", null);
    chat.handle("zz", "send", { ch: "geral", text: "fantasma" });
    expect(host.of("msg")).toHaveLength(1);
  });

  it("no máximo 5 mensagens por segundo por pessoa", () => {
    for (let i = 0; i < 7; i++) chat.handle("a", "send", { ch: "geral", text: `m${i}`, cid: `k${i}` });
    expect(host.of("msg")).toHaveLength(5);
    expect(host.of("fail").map((e) => (e.data as ChatFailEvent).reason)).toEqual(["rate", "rate"]);
    // Bruno tem o próprio limite.
    chat.handle("b", "send", { ch: "geral", text: "eu posso" });
    expect(host.of("msg")).toHaveLength(6);
    now += 1000;
    chat.handle("a", "send", { ch: "geral", text: "de novo" });
    expect(host.of("msg")).toHaveLength(7);
  });

  it("guarda as últimas 300 do Geral, com ids crescentes, e manda o histórico só a quem pede", () => {
    for (let i = 0; i < CHAT_GENERAL_KEEP + 20; i++) {
      now += 300;
      chat.handle(i % 2 ? "a" : "b", "send", { ch: "geral", text: `m${i}` });
    }
    host.events = [];
    chat.handle("c", "hist", { ch: "geral" });
    const h = host.of("hist")[0]!;
    expect(h.to).toEqual(["c"]);
    const msgs = (h.data as ChatHistEvent).msgs;
    expect(msgs).toHaveLength(CHAT_GENERAL_KEEP);
    expect(msgs.at(-1)!.text).toBe(`m${CHAT_GENERAL_KEEP + 19}`);
    for (let i = 1; i < msgs.length; i++) expect(msgs[i]!.id).toBeGreaterThan(msgs[i - 1]!.id);
  });

  it("o histórico do Geral volta depois de reiniciar o servidor", () => {
    chat.handle("a", "send", { ch: "geral", text: "antes" });
    const again = new ChatActivity(host, () => now);
    host.events = [];
    again.handle("b", "hist", { ch: "geral" });
    expect((host.of("hist")[0]!.data as ChatHistEvent).msgs.map((m) => m.text)).toEqual(["antes"]);
    // E o próximo id continua crescendo.
    again.handle("b", "send", { ch: "geral", text: "depois" });
    const prev = (host.mem.get("chat/geral") as ChatMsg[])[0]!.id;
    expect((host.of("msg")[0]!.data as { m: ChatMsg }).m.id).toBeGreaterThan(prev);
  });

  it("Perto: só quem ouve agora pela regra da voz; quem escreveu sabe quantos leram", () => {
    chat.handle("a", "send", { ch: "perto", text: "café?" });
    const evs = host.of("near");
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ to: ["b"], from: "a" });
    expect((evs[0]!.data as ChatNearEvent).heard).toBeUndefined();
    expect(evs[1]).toMatchObject({ to: ["a"], data: { heard: 1 } });
    // Nada guardado.
    expect([...host.mem.keys()].some((k) => k.includes("perto"))).toBe(false);
  });

  it("Perto respeita sala fechada", () => {
    host.put("a", "Ana", { x: -21, z: -1 }); // Sala Eclipse
    host.put("b", "Bruno", { x: -15, z: -1 }); // Marketing, do outro lado da parede
    host.put("c", "Carla", { x: -24.5, z: 1.5 }); // também na Eclipse, a 4,6 m
    chat.handle("a", "send", { ch: "perto", text: "reunião começando" });
    expect(host.of("near")[0]!.to).toEqual(["c"]);
    host.events = [];
    chat.handle("b", "send", { ch: "perto", text: "alguém aí?" });
    expect(host.of("near")[0]!.to).toEqual([]);
    expect(host.of("near")[1]).toMatchObject({ to: ["b"], data: { heard: 0 } });
  });

  it("Perto usa a regra completa da sala quando ela existe (roda fechada, sussurro)", () => {
    // A sala diz que só a Carla ouve a Ana agora (ex.: as duas numa roda fechada).
    (host as unknown as { hearers: (id: string) => string[] }).hearers = (id) => (id === "a" ? ["c"] : []);
    host.put("c", "Carla", { x: 1, z: 0 });
    chat.handle("a", "send", { ch: "perto", text: "só entre nós" });
    expect(host.of("near")[0]!.to).toEqual(["c"]);
    expect(host.of("near")[1]).toMatchObject({ to: ["a"], data: { heard: 1 } });
  });

  it("conversa direta: só as duas pessoas recebem, e fica guardada pelo nome", () => {
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "segredo", cid: "d1" });
    const dms = host.of("dm");
    expect(dms).toHaveLength(2);
    expect(dms[0]).toMatchObject({ to: ["a"], data: { with: "bruno", withName: "Bruno" } });
    expect(dms[1]).toMatchObject({ to: ["b"], data: { with: "ana", withName: "Ana" } });
    expect(dms.flatMap((e) => e.to)).not.toContain("c");
    expect(host.of("msg")).toHaveLength(0);
    const saved = host.mem.get(`chat/dm/${chatHash(chatPair("ana", "bruno"))}`) as { msgs: ChatMsg[] };
    expect(saved.msgs.map((m) => m.text)).toEqual(["segredo"]);
  });

  it("a conversa segue a pessoa entre conexões (nome como chave) e em várias abas", () => {
    chat.handle("a", "send", { ch: "dm", to: "Bruno", text: "oi" });
    // Bruno reconecta (id novo) e abre também no celular.
    host.drop("b");
    host.put("b2", "bruno", { x: 3, z: 2 });
    host.put("b3", "Bruno ", { x: 5, z: 5 });
    host.events = [];
    chat.handle("b2", "hist", { ch: "dm", with: "ana" });
    expect((host.of("hist")[0]!.data as ChatHistEvent).msgs.map((m) => m.text)).toEqual(["oi"]);
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "voltou?" });
    expect(host.of("dm").find((e) => (e.data as ChatDmEvent).with === "ana")!.to).toEqual(["b2", "b3"]);
  });

  it("ninguém lê conversa dos outros", () => {
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "só nosso" });
    host.events = [];
    // Carla pede "com bruno": o par dela é carla+bruno, que não existe.
    chat.handle("c", "hist", { ch: "dm", with: "bruno" });
    expect((host.of("hist")[0]!.data as ChatHistEvent).msgs).toEqual([]);
    chat.handle("c", "convs", {});
    expect((host.of("convs")[0]!.data as ChatConvsEvent).list).toEqual([]);
  });

  it("não conversa consigo mesmo nem com quem não conhece", () => {
    chat.handle("a", "send", { ch: "dm", to: "ANA", text: "eu", cid: "s" });
    expect(host.of("fail").at(-1)!.data).toEqual({ cid: "s", reason: "self" });
    chat.handle("a", "send", { ch: "dm", to: "Zé Ninguém", text: "oi", cid: "u" });
    expect(host.of("fail").at(-1)!.data).toEqual({ cid: "u", reason: "unknown" });
    // Quem já conversou pode mandar mesmo com a pessoa fora do escritório.
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "oi" });
    host.drop("b");
    host.events = [];
    now += 2000;
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "quando voltar, me chama" });
    expect(host.of("dm")).toHaveLength(1);
    expect(host.of("fail")).toHaveLength(0);
  });

  it("lista de conversas com a última mensagem e não lidas desde o que o cliente já leu", () => {
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "1" });
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "2" });
    chat.handle("b", "send", { ch: "dm", to: "ana", text: "resposta" });
    chat.handle("c", "send", { ch: "dm", to: "bruno", text: "da carla" });
    host.events = [];
    chat.handle("b", "convs", {});
    const list = (host.of("convs")[0]!.data as ChatConvsEvent).list;
    expect(list.map((c) => [c.key, c.name, c.last?.text, c.unread])).toEqual([
      ["carla", "Carla", "da carla", 1],
      ["ana", "Ana", "resposta", 2],
    ]);
    const firstFromAna = (host.mem.get(`chat/dm/${chatHash(chatPair("ana", "bruno"))}`) as { msgs: ChatMsg[] }).msgs[0]!.id;
    host.events = [];
    chat.handle("b", "convs", { since: { ana: firstFromAna, carla: "x" } });
    const l2 = (host.of("convs")[0]!.data as ChatConvsEvent).list;
    expect(l2.find((c) => c.key === "ana")!.unread).toBe(1);
    expect(l2.find((c) => c.key === "carla")!.unread).toBe(1);
  });

  it("guarda as últimas 200 de cada conversa", () => {
    for (let i = 0; i < CHAT_DM_KEEP + 5; i++) {
      now += 250;
      chat.handle("a", "send", { ch: "dm", to: "bruno", text: `m${i}` });
    }
    host.events = [];
    chat.handle("b", "hist", { ch: "dm", with: "ana" });
    const msgs = (host.of("hist")[0]!.data as ChatHistEvent).msgs;
    expect(msgs).toHaveLength(CHAT_DM_KEEP);
    expect(msgs[0]!.text).toBe("m5");
  });

  it("limita pedidos de histórico", () => {
    for (let i = 0; i < 20; i++) chat.handle("a", "hist", { ch: "geral" });
    expect(host.of("hist").length).toBe(12);
  });

  it("nada de métrica por pessoa: o que fica guardado é só conteúdo", () => {
    chat.handle("a", "send", { ch: "geral", text: "oi" });
    chat.handle("a", "send", { ch: "dm", to: "bruno", text: "oi" });
    const idx = JSON.stringify(host.mem.get("chat/conversas"));
    expect(idx).not.toMatch(/count|seen|visto|online/i);
  });
});
