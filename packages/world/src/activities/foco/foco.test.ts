import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { NavGrid } from "../../nav.ts";
import { ZoneIndex } from "../../audio.ts";
import {
  FOCO_FOCUS_MS,
  FOCO_LONG_MS,
  FOCO_SET_MS,
  FOCO_SHORT_MS,
  FOCO_VOTE_MS,
  focoCount,
  focoElapsed,
  focoEmpty,
  focoExpire,
  focoLeave,
  focoNow,
  focoPhaseAt,
  focoSeatPoints,
  focoSeats,
  focoSit,
  focoUnvote,
  focoVote,
  type FocoState,
} from "./index.ts";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

describe("Pomodoro: fases do ciclo", () => {
  it("25 de foco, 5 de pausa; depois do 4º foco, pausa de 15; e recomeça", () => {
    expect(FOCO_FOCUS_MS).toBe(25 * MIN);
    expect(FOCO_SHORT_MS).toBe(5 * MIN);
    expect(FOCO_LONG_MS).toBe(15 * MIN);
    const seq: Array<[number, string, number]> = [
      [0, "focus", 1],
      [24 * MIN, "focus", 1],
      [25 * MIN, "short", 1],
      [30 * MIN, "focus", 2],
      [55 * MIN, "short", 2],
      [60 * MIN, "focus", 3],
      [90 * MIN, "focus", 4],
      [114 * MIN, "focus", 4],
      [115 * MIN, "long", 4],
      [129 * MIN, "long", 4],
      [130 * MIN, "focus", 1],
    ];
    for (const [t, phase, round] of seq) expect(focoPhaseAt(t), `${t / MIN} min`).toMatchObject({ phase, round });
    expect(FOCO_SET_MS).toBe(130 * MIN);
  });

  it("diz quanto falta e o progresso; o índice muda a cada troca de fase", () => {
    const a = focoPhaseAt(10 * MIN);
    expect(a.left).toBe(15 * MIN);
    expect(a.progress).toBeCloseTo(0.4);
    const b = focoPhaseAt(27 * MIN);
    expect(b.left).toBe(3 * MIN);
    expect(b.index).toBe(a.index + 1);
    expect(focoPhaseAt(FOCO_SET_MS).index).toBe(8);
  });
});

describe("Pomodoro: a mesa", () => {
  const sit = (s: FocoState, id: string, seat: number, at = T0) => focoSit(s, id, seat, at);

  it("o primeiro a sentar começa o ciclo; quem chega no meio entra no ciclo em andamento", () => {
    let s = sit(focoEmpty(4), "ana", 0);
    expect(s.startAt).toBe(T0);
    s = sit(s, "bruno", 2, T0 + 12 * MIN);
    expect(s.startAt).toBe(T0);
    expect(focoNow(s, T0 + 12 * MIN)).toMatchObject({ phase: "focus", round: 1, left: 13 * MIN });
    expect(focoCount(s)).toBe(2);
  });

  it("lugar ocupado não troca de dono; trocar de lugar libera o anterior", () => {
    let s = sit(focoEmpty(4), "ana", 0);
    expect(sit(s, "bruno", 0)).toBe(s);
    expect(sit(s, "bruno", 9)).toBe(s);
    s = sit(s, "ana", 3);
    expect(s.seats).toEqual([null, null, null, "ana"]);
  });

  it("mesa vazia zera o relógio (e quem senta depois começa um ciclo novo)", () => {
    let s = sit(sit(focoEmpty(4), "ana", 0), "bruno", 1, T0 + MIN);
    s = focoLeave(s, "ana", T0 + 20 * MIN);
    expect(s.startAt).toBe(T0);
    s = focoLeave(s, "bruno", T0 + 21 * MIN);
    expect(s).toEqual(focoEmpty(4));
    s = sit(s, "caio", 2, T0 + 40 * MIN);
    expect(s.startAt).toBe(T0 + 40 * MIN);
  });

  it("pausar só vale quando todos os sentados concordam; a pausa para o relógio", () => {
    let s = sit(sit(focoEmpty(4), "ana", 0), "bruno", 1);
    s = focoVote(s, "ana", "pause", T0 + 10 * MIN);
    expect(s.pausedAt).toBeNull();
    expect(s.vote).toMatchObject({ op: "pause", ids: ["ana"] });
    // quem não está sentado não vota
    expect(focoVote(s, "caio", "pause", T0 + 10 * MIN)).toBe(s);
    s = focoVote(s, "bruno", "pause", T0 + 11 * MIN);
    expect(s.pausedAt).toBe(T0 + 11 * MIN);
    expect(s.vote).toBeNull();
    expect(focoElapsed(s, T0 + 50 * MIN)).toBe(11 * MIN);
    // retomar também precisa de todos; o tempo parado não conta
    s = focoVote(focoVote(s, "ana", "resume", T0 + 20 * MIN), "bruno", "resume", T0 + 20 * MIN);
    expect(s.pausedAt).toBeNull();
    expect(focoElapsed(s, T0 + 21 * MIN)).toBe(12 * MIN);
  });

  it("sozinho na mesa, a própria proposta já vale; reiniciar volta ao começo do foco", () => {
    let s = sit(focoEmpty(4), "ana", 0);
    s = focoVote(s, "ana", "restart", T0 + 40 * MIN);
    expect(s.startAt).toBe(T0 + 40 * MIN);
    expect(focoNow(s, T0 + 40 * MIN)).toMatchObject({ phase: "focus", round: 1, progress: 0 });
  });

  it("proposta diferente substitui a aberta; desistir e expirar tiram a proposta", () => {
    let s = sit(sit(focoEmpty(4), "ana", 0), "bruno", 1);
    s = focoVote(s, "ana", "pause", T0);
    s = focoVote(s, "bruno", "restart", T0 + 1000);
    expect(s.vote).toMatchObject({ op: "restart", ids: ["bruno"] });
    expect(focoUnvote(s, "bruno").vote).toBeNull();
    expect(focoExpire(s, T0 + 1000 + FOCO_VOTE_MS + 1).vote).toBeNull();
    expect(focoExpire(s, T0 + 2000).vote).not.toBeNull();
    // retomar não faz sentido com o relógio andando
    expect(focoVote(s, "ana", "resume", T0)).toBe(s);
  });

  it("quem sai deixa de travar o acordo: se os que ficaram concordam, vale", () => {
    let s = sit(sit(focoEmpty(4), "ana", 0), "bruno", 1);
    s = focoVote(s, "ana", "pause", T0 + 5 * MIN);
    s = focoLeave(s, "bruno", T0 + 6 * MIN);
    expect(s.pausedAt).toBe(T0 + 6 * MIN);
    expect(s.seats).toEqual(["ana", null, null, null]);
  });

  it("quem chega durante uma proposta também precisa concordar", () => {
    let s = sit(focoEmpty(4), "ana", 0);
    s = sit(s, "bruno", 1);
    s = focoVote(s, "ana", "pause", T0);
    s = sit(s, "caio", 2);
    s = focoVote(s, "bruno", "pause", T0);
    expect(s.pausedAt).toBeNull();
    s = focoVote(s, "caio", "pause", T0 + 1);
    expect(s.pausedAt).toBe(T0 + 1);
  });

  it("o estado guarda só o agora: lugares, relógio e proposta (nada por pessoa)", () => {
    const s = focoVote(sit(sit(focoEmpty(4), "ana", 0), "bruno", 1), "ana", "pause", T0);
    expect(Object.keys(s).sort()).toEqual(["pausedAt", "seats", "startAt", "vote"]);
  });
});

describe("Pomodoro: a mesa no mapa", () => {
  const map = buildStationMap();
  const nav = NavGrid.fromMap(map);
  const zones = new ZoneIndex(map.zones);

  it("tem a mesa e quatro lugares no corredorzinho Foco, alcançáveis a partir da chegada", () => {
    const table = map.objects.find((o) => o.type === "focus-table")!;
    expect(table).toBeDefined();
    expect(zones.zoneAt(table.pos)?.id).toBe("foco-hall");
    const seats = focoSeats(map);
    expect(seats.length).toBe(4);
    for (const p of focoSeatPoints(map)) {
      expect(zones.zoneAt(p)?.id).toBe("foco-hall");
      const path = nav.findPath(map.spawns[0]!, p);
      expect(path).not.toBeNull();
    }
  });

  it("não fecha a passagem: dá para ir do corredor norte ao sul pelo Foco e entrar nas cabines", () => {
    const north = { x: 20.8, z: -5.5 };
    const south = { x: 20.8, z: 10.5 };
    const path = nav.findPath(north, south)!;
    expect(path).not.toBeNull();
    expect(path.every((p) => p.x > 18.5 && p.x < 22.5)).toBe(true);
    for (const z of [-2.4, 0.9, 4.1, 7.4]) expect(nav.findPath(north, { x: 24, z }), `cabine em z=${z}`).not.toBeNull();
  });
});
