import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { NavGrid } from "../../nav.ts";
import { GAME_OF_TABLE } from "../../games/index.ts";
import { HOCKEY, PONG, POOL, rtTableToWorld } from "./index.ts";

const map = buildStationMap();
const nav = NavGrid.fromMap(map);

describe("planta: pacote arcade", () => {
  it("a mesa do jogo da velha tem partida e os dois lugares", () => {
    const t = map.objects.filter((o) => o.type === "tictactoe-table");
    expect(t.length).toBeGreaterThanOrEqual(1);
    for (const o of t) {
      expect(GAME_OF_TABLE[o.type]).toBe("tictactoe");
      const seats = map.objects.filter((c) => c.gameId === o.gameId && c.gameSeat !== undefined).map((c) => c.gameSeat);
      expect(seats.sort()).toEqual([0, 1]);
    }
  });

  it("dá para ficar em pé nos dois lados do hockey, do pingue-pongue e da sinuca", () => {
    const sides: Array<[string, number]> = [
      ["airhockey", HOCKEY.L / 2 + HOCKEY.STAND],
      ["pingpong", PONG.L / 2 + PONG.STAND],
      ["pool", POOL.L / 2 + POOL.STAND],
    ];
    for (const [type, d] of sides) {
      const tables = map.objects.filter((o) => o.type === type && o.gameId);
      expect(tables.length, type).toBeGreaterThanOrEqual(1);
      for (const t of tables) for (const s of [1, -1]) expect(nav.isWalkable(rtTableToWorld(t, 0, s * d)), `${t.id} lado ${s}`).toBe(true);
    }
  });

  it("tem placar de recordes no Arcade, três fliperamas e lixeiras nas áreas de trabalho e na copa", () => {
    expect(map.objects.filter((o) => o.type === "arcade-board" && o.zoneId === "arcade")).toHaveLength(1);
    expect(new Set(map.objects.filter((o) => o.type === "arcade").map((o) => (o.variant ?? 0) % 3)).size).toBe(3);
    const bins = map.objects.filter((o) => o.type === "trash-bin");
    expect(bins.length).toBeGreaterThanOrEqual(5);
    expect(bins.some((b) => b.zoneId === "cafe")).toBe(true);
  });
});
