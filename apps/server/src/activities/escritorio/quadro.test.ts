import { beforeEach, describe, expect, it } from "vitest";
import { QUADRO_ELEMENT_BYTES, ZoneIndex, buildStationMap, quadroClean, type QuadroState, type Vec2 } from "@infinity/world";
import type { Store } from "../../store.ts";
import type { ActivityHost } from "../types.ts";
import { QuadroActivity } from "./quadro.ts";

const MAP = buildStationMap();
const ZONES = new ZoneIndex(MAP.zones);
const ECLIPSE = { x: -22, z: -1 };
const CORREDOR = { x: 0, z: -5.5 };
const PALCO = { x: 24.5, z: 17 };
const PLATEIA = { x: 11.6, z: 20 };

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

function fakeHost() {
  const mem = new Map<string, unknown>();
  const pos = new Map<string, Vec2>();
  const h = {
    events: [] as Sent[],
    mem,
    store: { get: <T>(k: string, f: T): T => (mem.has(k) ? (mem.get(k) as T) : f), set: <T>(k: string, v: T) => void mem.set(k, v) } as unknown as Store,
    changed: () => {},
    event: (_a: unknown, ev: string, data?: unknown, o?: { to?: Iterable<string> }) => void h.events.push({ ev, data, ...(o?.to ? { to: [...o.to] } : {}) }),
    playerZone: (id: string) => (pos.has(id) ? ZONES.zoneAt(pos.get(id)!) : undefined),
    put: (id: string, p: Vec2) => void pos.set(id, p),
    last: (ev: string) => h.events.filter((e) => e.ev === ev).at(-1),
  };
  return h;
}

const el = (id: string, version: number, extra: Record<string, unknown> = {}) => ({ id, version, versionNonce: 10, type: "rectangle", x: 0, y: 0, ...extra });

describe("quadro branco das salas", () => {
  let host: ReturnType<typeof fakeHost>;
  let act: QuadroActivity;
  beforeEach(() => {
    host = fakeHost();
    act = new QuadroActivity(host as unknown as ActivityHost);
    host.put("ana", ECLIPSE);
    host.put("bia", ECLIPSE);
    host.put("caio", CORREDOR);
  });

  it("só quem está na sala abre e desenha; o desenho vai para os outros da sala", () => {
    act.handle("caio", "abrir", {});
    expect(host.last("cena")).toBeUndefined();
    act.handle("ana", "abrir", {});
    act.handle("bia", "abrir", {});
    expect(host.last("cena")).toEqual({ ev: "cena", data: { group: "eclipse", elements: [] }, to: ["bia"] });
    expect((act.snapshot() as QuadroState).open).toEqual({ eclipse: 2 });

    act.handle("ana", "mudar", { elements: [el("r1", 1), { id: "x", version: 1, versionNonce: 1, type: "image" }, el("../mal", 1)] });
    expect(host.last("mudou")).toEqual({ ev: "mudou", data: { elements: [el("r1", 1, { link: null })] }, to: ["bia"] });
    // Versão velha ou igual com nonce maior não volta atrás.
    act.handle("bia", "mudar", { elements: [el("r1", 1, { versionNonce: 99 })] });
    expect(host.events.filter((e) => e.ev === "mudou")).toHaveLength(1);
    act.handle("bia", "mudar", { elements: [el("r1", 2, { link: "javascript:alert(1)" })] });
    expect(host.last("mudou")).toEqual({ ev: "mudou", data: { elements: [el("r1", 2, { link: null })] }, to: ["ana"] });

    // Saiu da sala com o quadro aberto: não desenha mais.
    host.put("bia", CORREDOR);
    act.handle("bia", "mudar", { elements: [el("r2", 1)] });
    expect(host.events.filter((e) => e.ev === "mudou")).toHaveLength(2);
    act.handle("bia", "fechar", {});
    expect((act.snapshot() as QuadroState).open).toEqual({ eclipse: 1 });

    // Fica guardado: quem abre depois (ou outro servidor) recebe o desenho.
    expect(new QuadroActivity(host as unknown as ActivityHost).snapshot().open).toEqual({});
    const again = new QuadroActivity(host as unknown as ActivityHost);
    again.handle("ana", "abrir", {});
    expect((host.last("cena")!.data as { elements: unknown[] }).elements).toEqual([el("r1", 2, { link: null })]);
  });

  it("auditório e palco dividem o quadro; limites de tamanho", () => {
    host.put("ana", PLATEIA);
    host.put("bia", PALCO);
    act.handle("ana", "abrir", {});
    act.handle("bia", "abrir", {});
    act.handle("bia", "mudar", { elements: [el("p1", 1)] });
    expect(host.last("mudou")?.to).toEqual(["ana"]);
    expect(quadroClean(el("grande", 1, { points: "x".repeat(QUADRO_ELEMENT_BYTES) }))).toBeNull();
    expect(quadroClean(el("link", 1, { link: "https://ai-infinity.io" }))?.el.link).toBe("https://ai-infinity.io");
    act.leave("ana");
    expect((act.snapshot() as QuadroState).open).toEqual({ [host.playerZone("bia")!.group]: 1 });
  });
});
