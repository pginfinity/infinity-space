import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { ZoneIndex } from "../../audio.ts";
import {
  TV_DUCK,
  TV_LOUNGE,
  TV_SCREEN,
  tvCleanTitle,
  tvFinished,
  tvInLounge,
  tvPosition,
  tvSeek,
  tvSetPaused,
  tvStart,
  tvSyncPlan,
  tvValidId,
  tvVideoId,
  tvVolume,
} from "./tv.ts";

const T0 = 1_700_000_000_000;
const ID = "dQw4w9WgXcQ";

describe("TV do lounge: links", () => {
  it("aceita os formatos de link do YouTube", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `https://m.youtube.com/watch?feature=share&v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `youtube.com/watch?v=${ID}`,
      `  https://youtu.be/${ID}  `,
    ])
      expect(tvVideoId(link), link).toBe(ID);
  });

  it("recusa o que não é link do YouTube ou não tem id válido", () => {
    for (const link of [
      "",
      ID, // só o id: precisa ser link
      `https://vimeo.com/${ID}`,
      `https://youtube.com.evil.com/watch?v=${ID}`,
      `https://evilyoutube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=curto`,
      `https://www.youtube.com/watch?v=${ID}x`,
      `https://www.youtube.com/watch?v=dQw4w9WgXc!`,
      `https://www.youtube.com/channel/${ID}`,
      `javascript:alert(1)//youtube.com/watch?v=${ID}`,
      `https://user:senha@youtube.com/watch?v=${ID}`,
      `ftp://youtube.com/watch?v=${ID}`,
      "x".repeat(400),
    ])
      expect(tvVideoId(link), link).toBeNull();
    expect(tvVideoId(42)).toBeNull();
    expect(tvValidId(ID)).toBe(true);
    expect(tvValidId("../../etc/pa")).toBe(false);
  });

  it("limpa o título: uma linha, sem controle, com limite", () => {
    expect(tvCleanTitle("  Olá\n\tmundo  ")).toBe("Olá mundo");
    expect(tvCleanTitle(null)).toBe("");
    expect([...tvCleanTitle("é".repeat(300))].length).toBe(100);
  });
});

describe("TV do lounge: tempo", () => {
  it("calcula a posição a partir do instante de referência", () => {
    const p = tvStart({ video: ID, title: "" }, T0);
    expect(tvPosition(p, T0)).toBe(0);
    expect(tvPosition(p, T0 + 12_500)).toBe(12.5);
    expect(tvPosition(null, T0)).toBe(0);
    // com duração conhecida, não passa do fim
    expect(tvPosition({ ...p, len: 10 }, T0 + 60_000)).toBe(10);
  });

  it("pausar congela a posição; retomar continua dali", () => {
    let p = tvStart({ video: ID, title: "" }, T0);
    p = tvSetPaused(p, true, T0 + 30_000);
    expect(p).toMatchObject({ paused: true, pos: 30 });
    expect(tvPosition(p, T0 + 90_000)).toBe(30);
    p = tvSetPaused(p, false, T0 + 90_000);
    expect(tvPosition(p, T0 + 95_000)).toBe(35);
    expect(tvSetPaused(p, false, T0)).toBe(p);
  });

  it("pular para um ponto respeita os limites", () => {
    const p = { ...tvStart({ video: ID, title: "" }, T0), len: 100 };
    expect(tvPosition(tvSeek(p, 40, T0 + 5000), T0 + 6000)).toBe(41);
    expect(tvSeek(p, -5, T0).pos).toBe(0);
    expect(tvSeek(p, 500, T0).pos).toBe(100);
    expect(tvSeek(p, Number.NaN, T0)).toBe(p);
  });

  it("sabe quando o vídeo acabou (só com duração conhecida e tocando)", () => {
    const p = tvStart({ video: ID, title: "" }, T0);
    expect(tvFinished(p, T0 + 999_000)).toBe(false);
    expect(tvFinished({ ...p, len: 60 }, T0 + 61_000)).toBe(false);
    expect(tvFinished({ ...p, len: 60 }, T0 + 63_000)).toBe(true);
    expect(tvFinished({ ...p, len: 60, paused: true, pos: 60 }, T0 + 99_000)).toBe(false);
  });
});

describe("TV do lounge: sincronização do player", () => {
  const want = { ...tvStart({ video: ID, title: "" }, T0) };

  it("carrega o vídeo certo no ponto certo", () => {
    expect(tvSyncPlan(want, { video: null, playing: false, time: 0 }, T0 + 20_000)).toEqual({ load: ID, seek: 20, play: true });
  });

  it("só corrige a posição quando passa de 1,5 s fora do tempo", () => {
    expect(tvSyncPlan(want, { video: ID, playing: true, time: 19 }, T0 + 20_000)).toEqual({});
    expect(tvSyncPlan(want, { video: ID, playing: true, time: 18.4 }, T0 + 20_000)).toEqual({ seek: 20 });
    expect(tvSyncPlan(want, { video: ID, playing: true, time: 22 }, T0 + 20_000)).toEqual({ seek: 20 });
  });

  it("segue pausa e play do estado compartilhado; sem vídeo, descarrega", () => {
    const paused = tvSetPaused(want, true, T0 + 10_000);
    expect(tvSyncPlan(paused, { video: ID, playing: true, time: 10.2 }, T0 + 30_000)).toEqual({ play: false });
    expect(tvSyncPlan(want, { video: ID, playing: false, time: 30 }, T0 + 30_000)).toEqual({ play: true });
    expect(tvSyncPlan(null, { video: ID, playing: true, time: 3 }, T0)).toEqual({ load: "" });
    expect(tvSyncPlan(null, { video: null, playing: false, time: 0 }, T0)).toEqual({});
  });

  it("volume próprio, abaixado enquanto alguém perto fala", () => {
    expect(tvVolume(0.6, false)).toBe(0.6);
    expect(tvVolume(0.6, true)).toBeCloseTo(0.6 * TV_DUCK);
    expect(tvVolume(3, false)).toBe(1);
  });
});

describe("TV do lounge: no mapa", () => {
  const map = buildStationMap();
  const zones = new ZoneIndex(map.zones);

  it("a TV do lounge existe e fica no Átrio, na frente do sofá; o lounge é parte do Átrio", () => {
    const tv = map.objects.find((o) => o.type === "tv" && o.screenId === TV_SCREEN)!;
    expect(tv).toBeDefined();
    expect(zones.zoneAt(tv.pos)?.id).toBe("atrio");
    const sofa = map.objects.find((o) => o.type === "sofa" && o.zoneId === "atrio")!;
    expect(tvInLounge(sofa.pos)).toBe(true);
    expect(tvInLounge({ x: tv.pos.x, z: tv.pos.z + 1 })).toBe(true);
    for (const x of [TV_LOUNGE.x0, TV_LOUNGE.x1]) for (const z of [TV_LOUNGE.z0, TV_LOUNGE.z1]) expect(zones.zoneAt({ x: x + (x < 3 ? 0.1 : -0.1), z: z + (z < 0 ? 0.1 : -0.1) })?.id).toBe("atrio");
    // a recepção e o caminho de quem chega ficam fora
    expect(tvInLounge(map.spawns[0])).toBe(false);
    expect(tvInLounge({ x: 1, z: 5 })).toBe(false);
    expect(tvInLounge(undefined)).toBe(false);
  });
});
