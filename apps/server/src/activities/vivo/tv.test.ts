import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TV_NEXT_COOLDOWN_MS, TV_QUEUE_MAX, ZoneIndex, buildStationMap, tvPosition, type TvState, type Vec2 } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";
import { TvActivity } from "./tv.ts";

const ID = "dQw4w9WgXcQ";
const ID2 = "9bZkp7q19f0";
const link = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** Sala de mentira: pessoas em posições controladas e os eventos enviados. */
function setup() {
  const map = buildStationMap();
  const zones = new ZoneIndex(map.zones);
  const pos = new Map<string, Vec2>();
  const events: Array<{ ev: string; data: unknown; to?: string[] }> = [];
  const host = {
    map,
    zones,
    changed: () => undefined,
    event: (_a: Activity, ev: string, data: unknown, o?: { to?: Iterable<string> }) => void events.push({ ev, data, to: o?.to ? [...o.to] : undefined }),
    players: () => [...pos.keys()],
    playerName: (id: string) => id,
    playerPos: (id: string) => pos.get(id),
  } as unknown as ActivityHost;
  const act = new TvActivity(host);
  const st = () => act.snapshot() as TvState;
  // No lounge (sofá e frente da TV) e fora dele (recepção).
  pos.set("ana", { x: 5, z: -1.2 });
  pos.set("bruno", { x: 4, z: -2.5 });
  pos.set("caio", { x: 1, z: 6.5 });
  return { act, pos, st, events };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T19:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("TV do lounge (servidor)", () => {
  it("aceita só link do YouTube e guarda só o id e o título", () => {
    const { act, st, events } = setup();
    act.handle("ana", "add", { link: "https://vimeo.com/123" });
    act.handle("ana", "add", { link: ID });
    act.handle("ana", "add", { link: 42 });
    expect(st().playing).toBeNull();
    expect(events.filter((e) => e.ev === "refuse").map((e) => (e.data as { reason: string }).reason)).toEqual(["invalid", "invalid", "invalid"]);
    act.handle("ana", "add", { link: `${link(ID)}&t=30s` });
    const p = st().playing!;
    expect(p).toMatchObject({ video: ID, title: "", paused: false, pos: 0 });
    expect(Object.keys(p).sort()).toEqual(["at", "paused", "pos", "title", "video"]);
    expect(JSON.stringify(st())).not.toContain("ana");
  });

  it("só quem está no lounge controla", () => {
    const { act, st, events } = setup();
    act.handle("caio", "add", { link: link(ID) });
    expect(st().playing).toBeNull();
    expect(events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "far" }, to: ["caio"] });
    act.handle("ana", "add", { link: link(ID) });
    act.handle("caio", "pause", undefined);
    act.handle("caio", "next", undefined);
    expect(st().playing).toMatchObject({ video: ID, paused: false });
  });

  it("pausa, retoma e pula no tempo: a posição é a mesma para todos", () => {
    const { act, st } = setup();
    act.handle("ana", "add", { link: link(ID) });
    vi.advanceTimersByTime(20_000);
    act.handle("bruno", "pause", undefined);
    expect(st().playing).toMatchObject({ paused: true, pos: 20 });
    vi.advanceTimersByTime(60_000);
    expect(tvPosition(st().playing, Date.now())).toBe(20);
    act.handle("ana", "play", undefined);
    act.handle("ana", "seek", { to: 95 });
    vi.advanceTimersByTime(5000);
    expect(tvPosition(st().playing, Date.now())).toBe(100);
    act.handle("ana", "seek", { to: "muito" });
    expect(tvPosition(st().playing, Date.now())).toBe(100);
  });

  it("fila: põe na fila, pula com intervalo mínimo e troca na hora com `now`", () => {
    const { act, st, events } = setup();
    act.handle("ana", "add", { link: link(ID) });
    act.handle("bruno", "add", { link: `https://youtu.be/${ID2}` });
    expect(st().queue).toEqual([{ video: ID2, title: "" }]);
    expect(events.filter((e) => e.ev === "added").at(-1)).toMatchObject({ data: { by: "bruno", now: false } });
    act.handle("ana", "next", undefined);
    expect(st().playing?.video).toBe(ID2);
    act.handle("bruno", "next", undefined);
    expect(st().playing?.video).toBe(ID2);
    vi.advanceTimersByTime(TV_NEXT_COOLDOWN_MS);
    act.handle("bruno", "next", undefined);
    expect(st().playing).toBeNull();
    act.handle("ana", "add", { link: link(ID) });
    act.handle("ana", "add", { link: link(ID2), now: true });
    expect(st().playing?.video).toBe(ID2);
    for (let i = 0; i < TV_QUEUE_MAX + 2; i++) act.handle("ana", "add", { link: link(ID) });
    expect(st().queue.length).toBe(TV_QUEUE_MAX);
    expect(events.at(-1)).toMatchObject({ ev: "refuse", data: { reason: "full" } });
  });

  it("o player informa título e duração do vídeo atual (uma vez); no fim, passa para o próximo", () => {
    const { act, st } = setup();
    act.handle("ana", "add", { link: link(ID) });
    act.handle("bruno", "add", { link: link(ID2) });
    act.handle("ana", "meta", { video: ID2, title: "Outro", len: 10 });
    expect(st().playing).toMatchObject({ title: "" });
    act.handle("ana", "meta", { video: ID, title: " Vídeo\n do time ", len: 60 });
    act.handle("bruno", "meta", { video: ID, title: "Trocado", len: 999 });
    expect(st().playing).toMatchObject({ title: "Vídeo do time", len: 60 });
    // fim informado cedo demais não vale
    vi.advanceTimersByTime(10_000);
    act.handle("ana", "ended", { video: ID });
    expect(st().playing?.video).toBe(ID);
    // o relógio do servidor também encerra sozinho
    vi.advanceTimersByTime(53_000);
    act.tick();
    expect(st().playing?.video).toBe(ID2);
  });
});
