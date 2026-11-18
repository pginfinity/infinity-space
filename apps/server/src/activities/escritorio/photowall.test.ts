import { existsSync, mkdtempSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  NavGrid,
  PHOTOWALL_MAX,
  PHOTOWALL_MAX_BYTES,
  PHOTOWALL_RATE,
  PHOTOWALL_TICKET_MS,
  ZoneIndex,
  buildStationMap,
  dist,
  photoWallFile,
  type Emote,
  type MapDef,
  type PhotoWallState,
  type Vec2,
} from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { PhotoActivity } from "./photo.ts";
import { PhotoWallActivity } from "./photowall.ts";
import { PHOTOWALL_TICKET_HEADER, photoWallRoutes } from "./photowall-http.ts";

const MAP: MapDef = buildStationMap();
const WALL = MAP.objects.find((o) => o.type === "photo-wall")!;
const SPOT = WALL.interact!.point;
const FAR: Vec2 = { x: 0, z: 0 };

/** Sala falsa com o mapa de verdade (o mural da copa), armazenamento em memória e e-mails. */
class FakeHost implements ActivityHost {
  readonly map = MAP;
  readonly nav = NavGrid.fromMap(MAP);
  readonly zones = new ZoneIndex(MAP.zones);
  readonly mem = new Map<string, unknown>();
  readonly store = {
    get: <T>(k: string, f: T): T => (this.mem.has(k) ? (this.mem.get(k) as T) : f),
    set: <T>(k: string, v: T): void => void this.mem.set(k, v),
  } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  emails = new Map<string, string>();
  events: Array<{ ev: string; data: unknown; to?: string[] }> = [];
  dirty = 0;
  changed(_a: Activity): void {
    this.dirty++;
  }
  event(_a: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string> }): void {
    this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) });
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
  playerEmail(id: string): string | undefined {
    return this.emails.get(id);
  }
  emote(_id: string, _e: Emote): void {}
  setHeld(): void {}
  objects(type: string) {
    return MAP.objects.filter((o) => o.type === type);
  }
  claimSeat(): string | null {
    return null;
  }
  notify(): void {}
  near(id: string, p: Vec2, range: number): boolean {
    const at = this.pos.get(id);
    return !!at && dist(at, p) <= range;
  }
  put(id: string, name: string, p: Vec2, email?: string): void {
    this.pos.set(id, p);
    this.names.set(id, name);
    if (email) this.emails.set(id, email);
  }
}

/** Começo de um JPEG (SOI, APP0 JFIF, SOF0) com o tamanho dado, e um corpo de `pad` bytes. */
function jpeg(w = 1280, h = 1071, pad = 2000): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0x00, 0x0c, ...new Array<number>(pad).fill(0x55), 0xff, 0xd9]);
}

function setup(opts: { now?: () => number } = {}) {
  const host = new FakeHost();
  const dir = mkdtempSync(join(tmpdir(), "infinity-mural-fotos-"));
  const wall = new PhotoWallActivity(host, { dir, now: opts.now });
  return { host, dir, wall };
}

/** Um disparo da cabine com essas pessoas: id → bilhete. */
function shoot(wall: PhotoWallActivity, ids: string[], shot = `s${Math.random().toString(36).slice(2, 8)}`) {
  return { shot, tickets: wall.issue(shot, ids) };
}

describe("mural de fotos: bilhetes e envio", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
    t.host.put("a", "Ana", SPOT);
    t.host.put("b", "Bruno", SPOT);
  });

  it("aceita um JPEG de verdade com o bilhete, guarda no disco e avisa quem saiu na foto", () => {
    const { shot, tickets } = shoot(t.wall, ["a", "b"]);
    const r = t.wall.upload(tickets.get("a"), jpeg());
    expect(r.ok).toBe(true);
    const photos = t.wall.snapshot().photos;
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ type: "jpeg", w: 1280, h: 1071, names: ["Ana", "Bruno"] });
    // Quem enviou não fica guardado: só data, tamanho e os nomes da moldura.
    expect(Object.keys(photos[0]!).sort()).toEqual(["at", "h", "id", "names", "type", "w"]);
    expect(readdirSync(t.dir)).toEqual([photoWallFile(photos[0]!)]);
    expect(t.host.events.at(-1)).toEqual({ ev: "posted", data: { shot }, to: ["a", "b"] });
    expect(t.host.dirty).toBeGreaterThan(0);
  });

  it("uma foto por disparo: o bilhete do outro responde que já está no mural", () => {
    const { tickets } = shoot(t.wall, ["a", "b"]);
    expect(t.wall.upload(tickets.get("a"), jpeg()).ok).toBe(true);
    expect(t.wall.ticketOwner(tickets.get("b"))?.posted).toBe(true);
    expect(t.wall.upload(tickets.get("b"), jpeg())).toEqual({ ok: false, error: "ja-no-mural" });
    expect(t.wall.snapshot().photos).toHaveLength(1);
  });

  it("recusa bilhete inventado, vencido ou de outra conta", () => {
    let now = 1_000_000;
    const s = setup({ now: () => now });
    s.host.put("a", "Ana", SPOT, "ana@empresa.com");
    s.host.put("b", "Bruno", SPOT, "bruno@empresa.com");
    expect(s.wall.upload("inventado", jpeg())).toEqual({ ok: false, error: "bilhete" });
    expect(s.wall.upload(undefined, jpeg())).toEqual({ ok: false, error: "bilhete" });
    const { tickets } = shoot(s.wall, ["a"]);
    // Com login: a sessão do pedido precisa ser da mesma conta que recebeu o bilhete.
    expect(s.wall.upload(tickets.get("a"), jpeg(), "bruno@empresa.com")).toEqual({ ok: false, error: "bilhete" });
    now += PHOTOWALL_TICKET_MS + 1;
    expect(s.wall.upload(tickets.get("a"), jpeg(), "ana@empresa.com")).toEqual({ ok: false, error: "bilhete" });
    const again = shoot(s.wall, ["a"]);
    expect(s.wall.upload(again.tickets.get("a"), jpeg(), "ana@empresa.com").ok).toBe(true);
  });

  it("confere o tipo pelos bytes e o tamanho em pixels", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const a = shoot(t.wall, ["a"]);
    expect(t.wall.upload(a.tickets.get("a"), svg)).toEqual({ ok: false, error: "tipo" });
    expect(t.wall.upload(a.tickets.get("a"), jpeg(9000, 9000))).toEqual({ ok: false, error: "tamanho" });
    expect(t.wall.upload(a.tickets.get("a"), jpeg(16, 16))).toEqual({ ok: false, error: "tamanho" });
    expect(readdirSync(t.dir)).toEqual([]);
    // Recusado não gasta o bilhete.
    expect(t.wall.upload(a.tickets.get("a"), jpeg()).ok).toBe(true);
  });

  it(`guarda no máximo ${PHOTOWALL_MAX}: as mais antigas saem do mural e do disco`, () => {
    for (let i = 0; i < PHOTOWALL_MAX + 3; i++) expect(t.wall.upload(shoot(t.wall, ["a"]).tickets.get("a"), jpeg()).ok).toBe(true);
    const photos = t.wall.snapshot().photos;
    expect(photos).toHaveLength(PHOTOWALL_MAX);
    expect(readdirSync(t.dir).sort()).toEqual(photos.map(photoWallFile).sort());
  });

  it("serve só as fotos que estão no mural (nada de caminho de fora)", () => {
    expect(t.wall.upload(shoot(t.wall, ["a"]).tickets.get("a"), jpeg()).ok).toBe(true);
    const p = t.wall.snapshot().photos[0]!;
    expect(t.wall.file(photoWallFile(p))?.path).toBe(join(t.dir, photoWallFile(p)));
    expect(t.wall.file("../escritorio/mural.json")).toBeNull();
    expect(t.wall.file(`${p.id}.png`)).toBeNull();
    expect(t.wall.file("naoexiste123.jpg")).toBeNull();
  });
});

describe("mural de fotos: tirar do mural", () => {
  it("qualquer pessoa perto tira; de longe, não", () => {
    const t = setup();
    t.host.put("a", "Ana", SPOT);
    t.host.put("c", "Caio", FAR);
    t.host.put("d", "Duda", { x: SPOT.x + 1.5, z: SPOT.z + 1.5 });
    expect(t.wall.upload(shoot(t.wall, ["a"]).tickets.get("a"), jpeg()).ok).toBe(true);
    const p = t.wall.snapshot().photos[0]!;
    t.wall.handle("c", "remove", { id: p.id });
    expect(t.wall.snapshot().photos).toHaveLength(1);
    // Duda não saiu na foto, mas está perto: pode tirar.
    t.wall.handle("d", "remove", { id: p.id });
    expect(t.wall.snapshot().photos).toHaveLength(0);
    expect(existsSync(join(t.dir, photoWallFile(p)))).toBe(false);
    expect(t.wall.file(photoWallFile(p))).toBeNull();
  });

  it("ignora pedidos malformados", () => {
    const t = setup();
    t.host.put("a", "Ana", SPOT);
    expect(t.wall.upload(shoot(t.wall, ["a"]).tickets.get("a"), jpeg()).ok).toBe(true);
    const before = t.host.dirty;
    t.wall.handle("a", "remove", null);
    t.wall.handle("a", "remove", { id: 42 });
    t.wall.handle("a", "apagar-tudo", {});
    t.wall.handle("a", "remove", { id: "naoexiste" });
    expect(t.wall.snapshot().photos).toHaveLength(1);
    expect(t.host.dirty).toBe(before);
  });

  it("na partida, a lista fica só com o que existe no disco e o disco só com a lista", () => {
    const t = setup();
    t.host.put("a", "Ana", SPOT);
    for (let i = 0; i < 2; i++) expect(t.wall.upload(shoot(t.wall, ["a"]).tickets.get("a"), jpeg()).ok).toBe(true);
    const [first, second] = t.wall.snapshot().photos;
    // Some um arquivo da lista e aparece um órfão (gravado antes de uma queda, sem a lista).
    writeFileSync(join(t.dir, "orfao12345.jpg"), jpeg());
    unlinkSync(join(t.dir, photoWallFile(first!)));
    const again = new PhotoWallActivity(t.host, { dir: t.dir });
    expect(again.snapshot().photos.map((p) => p.id)).toEqual([second!.id]);
    expect(readdirSync(t.dir)).toEqual([photoWallFile(second!)]);
  });
});

describe("cabine: bilhete só para quem saiu na foto", () => {
  it("o disparo leva o id e cada pessoa da foto recebe o próprio bilhete", () => {
    const host = new FakeHost();
    const backdrop = MAP.objects.find((o) => o.type === "backdrop")!;
    const tripod = MAP.objects.find((o) => o.type === "camera-tripod")!;
    host.put("a", "Ana", { x: backdrop.pos.x, z: backdrop.pos.z + 1.4 });
    host.put("b", "Bruno", { x: tripod.pos.x + 0.5, z: tripod.pos.z });
    host.put("c", "Caio", FAR);
    const wall = new PhotoWallActivity(host, { dir: null });
    let now = 0;
    const booth = new PhotoActivity(host, () => now, wall);
    booth.handle("b", "start");
    now += 10_000;
    booth.tick();
    const shot = host.events.find((e) => e.ev === "shot")!.data as { ids: string[]; shot: string };
    expect(shot.ids.sort()).toEqual(["a", "b"]);
    expect(shot.shot).toMatch(/^[0-9a-f]{12}$/);
    const tickets = host.events.filter((e) => e.ev === "ticket");
    expect(tickets.map((e) => e.to)).toEqual([["a"], ["b"]]);
    const first = tickets[0]!.data as { shot: string; ticket: string };
    expect(first.shot).toBe(shot.shot);
    expect(wall.ticketOwner(first.ticket)?.id).toBe("a");
    expect(new Set(tickets.map((e) => (e.data as { ticket: string }).ticket)).size).toBe(2);
  });
});

describe("mural de fotos: HTTP", () => {
  const ORIGIN = "http://localhost:5173";

  function http(authRequired: boolean) {
    const t = setup();
    t.host.put("a", "Ana", SPOT, authRequired ? "ana@empresa.com" : undefined);
    const sessions: Record<string, string> = { "sessao-ana": "ana@empresa.com", "sessao-bruno": "bruno@empresa.com" };
    const app = photoWallRoutes({
      wall: () => t.wall,
      sessionEmail: (c) => sessions[c.req.header("cookie") ?? ""],
      authRequired,
    });
    const post = (ticket: string | undefined, body: Uint8Array, headers: Record<string, string> = {}) =>
      app.request("/", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "image/jpeg", ...(ticket ? { [PHOTOWALL_TICKET_HEADER]: ticket } : {}), ...headers }, body });
    return { ...t, app, post };
  }

  it("login desligado (desenvolvimento): vale o bilhete; a imagem volta com cache privado", async () => {
    const h = http(false);
    const ticket = shoot(h.wall, ["a"]).tickets.get("a");
    const r = await h.post(ticket, jpeg());
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const g = await h.app.request(`/${id}.jpg`);
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("image/jpeg");
    expect(g.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(g.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(jpeg());
    // Já está no mural.
    expect((await h.post(ticket, jpeg())).status).toBe(409);
  });

  it("login ligado: sem sessão, ou com a sessão de outra conta, não envia nem vê", async () => {
    const h = http(true);
    const ticket = shoot(h.wall, ["a"]).tickets.get("a");
    expect((await h.post(ticket, jpeg())).status).toBe(401);
    expect((await h.post(ticket, jpeg(), { Cookie: "sessao-bruno" })).status).toBe(403);
    const ok = await h.post(ticket, jpeg(), { Cookie: "sessao-ana" });
    expect(ok.status).toBe(201);
    const { id } = (await ok.json()) as { id: string };
    expect((await h.app.request(`/${id}.jpg`)).status).toBe(401);
    expect((await h.app.request(`/${id}.jpg`, { headers: { Cookie: "sessao-bruno" } })).status).toBe(200);
  });

  it("recusa origem de fora, bilhete errado, tipo errado e corpo grande demais", async () => {
    const h = http(false);
    const ticket = shoot(h.wall, ["a"]).tickets.get("a");
    expect((await h.post(ticket, jpeg(), { Origin: "https://malicioso.example" })).status).toBe(403);
    expect((await h.post("bilhete-inventado", jpeg())).status).toBe(403);
    expect((await h.post(undefined, jpeg())).status).toBe(403);
    expect((await h.post(ticket, new TextEncoder().encode("GIF89a........"))).status).toBe(415);
    expect((await h.post(ticket, new Uint8Array(0))).status).toBe(415);
    const big = await h.post(ticket, jpeg(1280, 1071, PHOTOWALL_MAX_BYTES + 10));
    expect(big.status).toBe(413);
    expect(((await big.json()) as { error: string }).error).toBe("grande");
    expect(h.wall.snapshot().photos).toHaveLength(0);
    expect((await h.app.request("/naoexiste123.jpg")).status).toBe(404);
  });

  it(`limita a frequência por pessoa (${PHOTOWALL_RATE.max} por janela)`, async () => {
    const h = http(false);
    for (let i = 0; i < PHOTOWALL_RATE.max; i++) expect((await h.post(shoot(h.wall, ["a"]).tickets.get("a"), jpeg())).status).toBe(201);
    const r = await h.post(shoot(h.wall, ["a"]).tickets.get("a"), jpeg());
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toBe("muitas");
    expect((h.wall.snapshot() as PhotoWallState).photos).toHaveLength(PHOTOWALL_RATE.max);
  });
});
