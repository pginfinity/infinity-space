import { beforeEach, describe, expect, it } from "vitest";
import {
  BOARD_MAX,
  BOARD_POST_COOLDOWN_MS,
  DEPLOY_COOLDOWN_MS,
  DEPLOY_COUNTDOWN_MS,
  DEPLOY_FLIGHT_MS,
  GREET_TTL_MS,
  NavGrid,
  PHOTO_COUNTDOWN_MS,
  PLANE_COOLDOWN_MS,
  ZoneIndex,
  boardOwnSalt,
  buildStationMap,
  dist,
  escTag,
  photoRig,
  type BoardState,
  type DeployState,
  type Emote,
  type MapDef,
  type Vec2,
} from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { BoardActivity } from "./board.ts";
import { DeployActivity } from "./deploy.ts";
import { GreetActivity } from "./greet.ts";
import { PhotoActivity } from "./photo.ts";
import { PlaneActivity } from "./plane.ts";

const MAP: MapDef = buildStationMap();
const KEY_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
  from?: string;
}

/** Sala falsa: posições, nomes, eventos e emotes registrados, armazenamento em memória. */
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
  events: Sent[] = [];
  emotes: Array<[string, Emote]> = [];
  dirty = 0;
  changed(_a: Activity): void {
    this.dirty++;
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
  playerZone(id: string) {
    const p = this.pos.get(id);
    return p ? this.zones.zoneAt(p) : undefined;
  }
  emote(id: string, e: Emote): void {
    this.emotes.push([id, e]);
  }
  setHeld(): void {}
  objects(type: string) {
    return MAP.objects.filter((o) => o.type === type);
  }
  near(id: string, p: Vec2, range: number): boolean {
    const at = this.pos.get(id);
    return !!at && dist(at, p) <= range;
  }
  put(id: string, name: string, p: Vec2): void {
    this.pos.set(id, p);
    this.names.set(id, name);
  }
  last(ev: string): Sent | undefined {
    return this.events.filter((e) => e.ev === ev).at(-1);
  }
}

const obj = (type: string) => MAP.objects.find((o) => o.type === type)!;

describe("botão de deploy", () => {
  let host: FakeHost;
  let now: number;
  let act: DeployActivity;
  const button = obj("big-button");
  beforeEach(() => {
    host = new FakeHost();
    now = new Date(2026, 10, 15, 10).getTime();
    act = new DeployActivity(host, () => now);
    host.put("a", "Ana", { x: button.pos.x - 1, z: button.pos.z });
    host.put("b", "Bruno", { x: 0, z: 0 });
  });

  it("recusa quem está longe e conta 3-2-1 para quem está perto", () => {
    act.handle("b", "press");
    expect(act.snapshot().phase).toBe("idle");
    act.handle("a", "press");
    expect(act.snapshot().phase).toBe("countdown");
    expect(host.last("countdown")).toMatchObject({ data: { name: "Ana", ms: DEPLOY_COUNTDOWN_MS } });
  });

  it("decola, conta o mês (sem nomes) e respeita o intervalo", () => {
    act.handle("a", "press");
    now += DEPLOY_COUNTDOWN_MS;
    act.tick();
    expect(host.last("launch")?.data).toEqual({ count: 1, ms: DEPLOY_FLIGHT_MS });
    const snap: DeployState = act.snapshot();
    expect(snap).toEqual({ month: "2026-11", count: 1, phase: "flight" });
    expect(JSON.stringify(host.mem.get("escritorio/deploy"))).not.toContain("Ana");
    now += DEPLOY_FLIGHT_MS;
    act.tick();
    expect(act.snapshot().phase).toBe("idle");
    act.handle("a", "press");
    expect(act.snapshot().phase).toBe("idle");
    expect(host.last("busy")).toMatchObject({ to: ["a"] });
    now += DEPLOY_COOLDOWN_MS;
    act.handle("a", "press");
    expect(act.snapshot().phase).toBe("countdown");
  });

  it("zera a contagem quando o mês vira", () => {
    act.handle("a", "press");
    now += DEPLOY_COUNTDOWN_MS;
    act.tick();
    now = new Date(2026, 11, 2, 10).getTime();
    expect(act.snapshot()).toMatchObject({ month: "2026-12", count: 0 });
  });
});

describe("mural de recados", () => {
  let host: FakeHost;
  let now: number;
  let act: BoardActivity;
  const board = obj("notice-board");
  const state = () => act.snapshot() as BoardState;
  beforeEach(() => {
    host = new FakeHost();
    now = 1_000_000;
    act = new BoardActivity(host, () => now);
    host.put("a", "Ana", board.interact!.point);
    host.put("b", "Bruno", { x: board.interact!.point.x + 1, z: board.interact!.point.z });
    host.put("c", "Caio", { x: 20, z: 15 });
  });

  it("prega recado limpo e cortado; recusa sem chave, longe ou vazio", () => {
    act.handle("a", "post", { key: KEY_A, text: "  Bem-vindos,\u0000 time!  ", color: 3 });
    act.handle("a", "post", { text: "sem chave" });
    act.handle("c", "post", { key: KEY_A, text: "de longe" });
    act.handle("b", "post", { key: KEY_B, text: "   " });
    act.handle("b", "post", { key: KEY_B, text: "x".repeat(300), color: 99 });
    const notes = state().notes;
    expect(notes.map((n) => n.text.length)).toEqual(["Bem-vindos, time!".length, 140]);
    expect(notes[0]).toMatchObject({ name: "Ana", color: 3, text: "Bem-vindos, time!" });
    expect(notes[1]!.color).toBe(0);
    expect(notes[0]!.own).toBe(escTag(KEY_A, boardOwnSalt(notes[0]!.id)));
    expect(JSON.stringify(notes)).not.toContain(KEY_A);
  });

  it("limita um recado a cada poucos segundos por pessoa", () => {
    act.handle("a", "post", { key: KEY_A, text: "um" });
    act.handle("a", "post", { key: KEY_A, text: "dois" });
    expect(state().notes).toHaveLength(1);
    expect(host.last("busy")).toMatchObject({ to: ["a"] });
    now += BOARD_POST_COOLDOWN_MS;
    act.handle("a", "post", { key: KEY_A, text: "dois" });
    expect(state().notes).toHaveLength(2);
  });

  it("guarda no máximo 40 e persiste", () => {
    for (let i = 0; i < BOARD_MAX + 3; i++) {
      now += BOARD_POST_COOLDOWN_MS;
      act.handle("a", "post", { key: KEY_A, text: `r${i}` });
    }
    expect(state().notes).toHaveLength(BOARD_MAX);
    expect(state().notes[0]!.text).toBe("r3");
    const again = new BoardActivity(host, () => now);
    expect((again.snapshot() as BoardState).notes).toHaveLength(BOARD_MAX);
  });

  it("uma reação por pessoa e só o autor apaga", () => {
    act.handle("a", "post", { key: KEY_A, text: "oi" });
    const id = state().notes[0]!.id;
    act.handle("b", "react", { key: KEY_B, id, emoji: "🎉" });
    act.handle("b", "react", { key: KEY_B, id, emoji: "👍" });
    act.handle("b", "react", { key: KEY_B, id, emoji: "💩" });
    expect(state().notes[0]!.r).toEqual({ "👍": [expect.any(String)] });
    act.handle("b", "remove", { key: KEY_B, id });
    expect(state().notes).toHaveLength(1);
    // A Ana recarregou a página (outro id de sessão), mas a chave do navegador é a mesma.
    host.put("a2", "Ana", board.interact!.point);
    act.handle("a2", "remove", { key: KEY_A, id });
    expect(state().notes).toHaveLength(0);
  });
});

describe("aviãozinho", () => {
  let host: FakeHost;
  let now: number;
  let act: PlaneActivity;
  beforeEach(() => {
    host = new FakeHost();
    now = 5_000_000;
    act = new PlaneActivity(host, () => now);
    host.put("a", "Ana", { x: 0, z: 0 });
    host.put("b", "Bruno", { x: 12, z: 0 });
  });

  it("voo para todos, recado só para quem recebe", () => {
    act.handle("a", "throw", { to: "b", msg: "  Bora almoçar? " });
    const fly = host.last("fly")!;
    expect(fly.to).toBeUndefined();
    expect(fly.data).toMatchObject({ from: "a", to: "b" });
    expect(JSON.stringify(fly.data)).not.toContain("almoçar");
    const ms = (fly.data as { ms: number }).ms;
    expect(ms).toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThanOrEqual(6000);
    expect(host.last("letter")).toMatchObject({ to: ["b"], data: { fromName: "Ana", msg: "Bora almoçar?" } });
    expect(host.last("sent")).toMatchObject({ to: ["a"], data: { toName: "Bruno" } });
    expect(host.emotes).toContainEqual(["a", "point"]);
  });

  it("recusa para si, para quem não está online, sem texto e mais de um a cada 10 s", () => {
    act.handle("a", "throw", { to: "a", msg: "eu" });
    act.handle("a", "throw", { to: "zzz", msg: "fantasma" });
    act.handle("a", "throw", { to: "b", msg: "  " });
    expect(host.events).toHaveLength(0);
    act.handle("a", "throw", { to: "b", msg: "um" });
    act.handle("a", "throw", { to: "b", msg: "dois" });
    expect(host.events.filter((e) => e.ev === "fly")).toHaveLength(1);
    expect(host.last("busy")).toMatchObject({ to: ["a"] });
    now += PLANE_COOLDOWN_MS;
    act.handle("a", "throw", { to: "b", msg: "dois" });
    expect(host.events.filter((e) => e.ev === "fly")).toHaveLength(2);
  });
});

describe("toca aqui, brinde e abraço", () => {
  let host: FakeHost;
  let now: number;
  let act: GreetActivity;
  beforeEach(() => {
    host = new FakeHost();
    now = 9_000_000;
    act = new GreetActivity(host, () => now);
    host.put("a", "Ana", { x: 0, z: 0 });
    host.put("b", "Bruno", { x: 1.2, z: 0 });
    host.put("c", "Caio", { x: 9, z: 0 });
  });

  it("convite e aceite: os dois fazem o emote e todos veem", () => {
    act.handle("a", "invite", { to: "b", kind: "highfive" });
    expect(host.last("invite")).toMatchObject({ to: ["b"], data: { from: "a", name: "Ana", kind: "highfive" } });
    expect(host.last("pending")).toMatchObject({ to: ["a"], data: { to: "b", name: "Bruno" } });
    act.handle("c", "accept", { from: "a" });
    expect(host.last("go")).toBeUndefined();
    act.handle("b", "accept", { from: "a" });
    expect(host.last("go")?.data).toEqual({ a: "a", b: "b", kind: "highfive" });
    expect(host.emotes).toEqual([
      ["a", "clap"],
      ["b", "clap"],
    ]);
  });

  it("recusa longe, tipo inválido e convite para si", () => {
    act.handle("a", "invite", { to: "c", kind: "hug" });
    act.handle("a", "invite", { to: "b", kind: "beijo" });
    act.handle("a", "invite", { to: "a", kind: "hug" });
    expect(host.events).toHaveLength(0);
  });

  it("expira em 8 s e avisa os dois", () => {
    act.handle("a", "invite", { to: "b", kind: "toast" });
    now += GREET_TTL_MS + 1;
    act.tick();
    expect(host.last("expired")).toMatchObject({ to: ["a", "b"] });
    act.handle("b", "accept", { from: "a" });
    expect(host.last("go")).toBeUndefined();
  });

  it("recusar e sair cancelam o convite", () => {
    act.handle("a", "invite", { to: "b", kind: "hug" });
    act.handle("b", "decline", { from: "a" });
    expect(host.last("declined")).toMatchObject({ data: { from: "a", to: "b" } });
    now += 2000;
    act.handle("a", "invite", { to: "b", kind: "hug" });
    act.leave("b");
    expect(host.last("cancel")).toMatchObject({ data: { from: "a", to: "b" } });
  });
});

describe("cabine de fotos", () => {
  let host: FakeHost;
  let now: number;
  let act: PhotoActivity;
  const rig = photoRig(obj("backdrop"), obj("camera-tripod"));
  const inFrame = { x: (rig.frame[0]!.x + rig.frame[2]!.x) / 2, z: (rig.frame[0]!.z + rig.frame[2]!.z) / 2 };
  beforeEach(() => {
    host = new FakeHost();
    now = 3_000_000;
    act = new PhotoActivity(host, () => now);
    host.put("a", "Ana", { x: rig.tripod.x, z: rig.tripod.z + 0.8 });
    host.put("b", "Bruno", inFrame);
    host.put("c", "Caio", { x: 0, z: 0 });
  });

  it("dispara perto do tripé e manda a foto para quem está na cabine", () => {
    act.handle("c", "start");
    expect(act.snapshot().phase).toBe("idle");
    act.handle("a", "start");
    expect(act.snapshot().phase).toBe("countdown");
    expect(host.last("countdown")).toMatchObject({ data: { name: "Ana", ms: PHOTO_COUNTDOWN_MS } });
    now += PHOTO_COUNTDOWN_MS - 10;
    act.tick();
    expect(host.last("shot")).toBeUndefined();
    now += 10;
    act.tick();
    expect(host.last("shot")?.data).toEqual({ ids: ["a", "b"] });
    expect(act.snapshot().phase).toBe("idle");
  });
});
