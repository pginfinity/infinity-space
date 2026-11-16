import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { NOTE_MAX } from "../../protocol.ts";
import {
  BOARD_MAX,
  boardPost,
  boardReact,
  boardReactionCount,
  boardRemove,
  deployCountdownDigit,
  deployProgress,
  escClean,
  escTag,
  escValidKey,
  photoInFrame,
  photoParticipants,
  photoRig,
  planeArc,
  planeDuration,
  statusNote,
  statusSplit,
  type BoardNote,
} from "./index.ts";

describe("textos limpos", () => {
  it("tira controle, junta espaços e corta sem partir emoji", () => {
    expect(escClean("  oi\u0000  \n tudo  bem ", 40)).toBe("oi tudo bem");
    expect(escClean(42, 10)).toBe("");
    const s = "a".repeat(9) + "🚀";
    expect(escClean(s, 10)).toBe("a".repeat(9));
    expect(escClean("linha 1\n\n\n\nlinha 2", 40, { lines: true })).toBe("linha 1\n\nlinha 2");
  });

  it("status tem no máximo NOTE_MAX e separa o emoji inicial", () => {
    expect(statusNote("x".repeat(80)).length).toBe(NOTE_MAX);
    expect(statusSplit("🍽️ Almoço")).toEqual({ emoji: "🍽️", text: "Almoço" });
    expect(statusSplit("Em call")).toEqual({ emoji: "", text: "Em call" });
  });
});

describe("marcas anônimas", () => {
  it("são estáveis, mudam com o assunto e com a chave", () => {
    const k = "3f2a9c1e-77aa-4b1c-9d2e-0a1b2c3d4e5f";
    expect(escTag(k, "autor:1")).toBe(escTag(k, "autor:1"));
    expect(escTag(k, "autor:1")).not.toBe(escTag(k, "autor:2"));
    expect(escTag(k, "autor:1")).not.toBe(escTag(k + "x", "autor:1"));
    expect(escTag(k, "autor:1")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("aceita só chaves no formato esperado", () => {
    expect(escValidKey("3f2a9c1e-77aa-4b1c-9d2e-0a1b2c3d4e5f")).toBe(true);
    expect(escValidKey("curta")).toBe(false);
    expect(escValidKey("<script>alert(1)</script>xxxxxxxx")).toBe(false);
    expect(escValidKey(null)).toBe(false);
  });
});

describe("mural de recados", () => {
  const note = (id: string, own = "dono"): BoardNote => ({ id, name: "Ana", color: 0, text: id, at: 0, own, r: {} });

  it("guarda no máximo BOARD_MAX e tira os mais antigos", () => {
    let list: BoardNote[] = [];
    for (let i = 0; i < BOARD_MAX + 5; i++) list = boardPost(list, note(`n${i}`));
    expect(list).toHaveLength(BOARD_MAX);
    expect(list[0]!.id).toBe("n5");
    expect(list.at(-1)!.id).toBe(`n${BOARD_MAX + 4}`);
  });

  it("uma reação por pessoa: repetir tira, outra troca", () => {
    let list = [note("a")];
    list = boardReact(list, "a", "👍", "v1");
    list = boardReact(list, "a", "👍", "v2");
    expect(list[0]!.r["👍"]).toEqual(["v1", "v2"]);
    list = boardReact(list, "a", "❤️", "v1");
    expect(list[0]!.r["👍"]).toEqual(["v2"]);
    expect(list[0]!.r["❤️"]).toEqual(["v1"]);
    list = boardReact(list, "a", "❤️", "v1");
    expect(list[0]!.r["❤️"]).toBeUndefined();
    expect(boardReactionCount(list[0]!)).toBe(1);
    expect(boardReact(list, "nao-existe", "👍", "v1")).toBe(list);
  });

  it("só o autor apaga", () => {
    const list = [note("a", "eu"), note("b", "outra")];
    expect(boardRemove(list, "a", "outra")).toBe(list);
    expect(boardRemove(list, "a", "eu").map((n) => n.id)).toEqual(["b"]);
  });
});

describe("foguete do deploy", () => {
  it("o voo começa devagar, acelera e termina em 1", () => {
    expect(deployProgress(0)).toBe(0);
    expect(deployProgress(10_000)).toBe(1);
    let last = -1;
    for (let ms = 0; ms <= 6000; ms += 250) {
      const p = deployProgress(ms);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(deployProgress(1500)).toBeLessThan(0.15);
  });

  it("contagem 3, 2, 1, decolar", () => {
    expect([0, 999, 1000, 2500, 3000].map((ms) => deployCountdownDigit(ms))).toEqual([3, 3, 2, 1, 0]);
  });
});

describe("aviãozinho", () => {
  it("voa de 3 a 6 segundos", () => {
    expect(planeDuration(0)).toBe(3000);
    expect(planeDuration(20)).toBeGreaterThan(3000);
    expect(planeDuration(200)).toBe(6000);
  });

  it("sai da mão, sobe em arco e chega em quem recebe", () => {
    const a = { x: 0, y: 1.2, z: 0 };
    const b = { x: 10, y: 1.3, z: 0 };
    const out = { x: 0, y: 0, z: 0 };
    expect(planeArc(a, b, 0, out)).toMatchObject(a);
    const end = planeArc(a, b, 1, { x: 0, y: 0, z: 0 });
    expect(end.x).toBeCloseTo(10);
    expect(end.y).toBeCloseTo(1.3);
    expect(planeArc(a, b, 0.5, out).y).toBeGreaterThan(2);
  });
});

describe("cabine de fotos", () => {
  const map = buildStationMap();
  const backdrop = map.objects.find((o) => o.type === "backdrop")!;
  const tripod = map.objects.find((o) => o.type === "camera-tripod")!;
  const rig = photoRig(backdrop, tripod);

  it("o quadro fica entre o fundo e o tripé, e a câmera olha para o fundo", () => {
    const mid = { x: (backdrop.pos.x + tripod.pos.x) / 2, z: (backdrop.pos.z + tripod.pos.z) / 2 };
    expect(photoInFrame(rig, mid)).toBe(true);
    expect(photoInFrame(rig, { x: backdrop.pos.x, z: backdrop.pos.z - 1 })).toBe(false);
    expect(photoInFrame(rig, tripod.pos)).toBe(false);
    const look = { x: rig.camera.target.x - rig.camera.pos.x, z: rig.camera.target.z - rig.camera.pos.z };
    const toBackdrop = { x: backdrop.pos.x - tripod.pos.x, z: backdrop.pos.z - tripod.pos.z };
    expect(look.x * toBackdrop.x + look.z * toBackdrop.z).toBeGreaterThan(0);
  });

  it("recebe a foto quem está no quadro ou atrás da câmera", () => {
    const mid = { x: (backdrop.pos.x + tripod.pos.x) / 2, z: (backdrop.pos.z + tripod.pos.z) / 2 };
    const behind = { x: tripod.pos.x, z: tripod.pos.z + 0.8 };
    const far = { x: tripod.pos.x + 8, z: tripod.pos.z };
    expect(
      photoParticipants(rig, [
        ["a", mid],
        ["b", behind],
        ["c", far],
      ]),
    ).toEqual(["a", "b"]);
  });
});
