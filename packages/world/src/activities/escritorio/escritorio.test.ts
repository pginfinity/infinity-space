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
  photoWallAdd,
  photoWallFile,
  photoWallFit,
  photoWallImageInfo,
  photoWallRemove,
  photoWallSizeOk,
  photoWallUrl,
  PHOTOWALL_FILE_RE,
  PHOTOWALL_MAX,
  PHOTOWALL_MAX_SIDE,
  PHOTOWALL_SIDE,
  planeArc,
  planeDuration,
  statusNote,
  statusSplit,
  type BoardNote,
  type WallPhoto,
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

describe("mural de fotos da copa", () => {
  const photo = (id: string, at = 0): WallPhoto => ({ id, at, type: "jpeg", w: 1280, h: 1071, names: ["Ana"] });

  it("guarda no máximo PHOTOWALL_MAX e devolve as mais antigas que saíram", () => {
    let list: WallPhoto[] = [];
    let dropped: WallPhoto[] = [];
    for (let i = 0; i < PHOTOWALL_MAX + 2; i++) ({ photos: list, dropped } = photoWallAdd(list, photo(`foto${String(i).padStart(4, "0")}`, i)));
    expect(list).toHaveLength(PHOTOWALL_MAX);
    expect(list[0]!.id).toBe("foto0002");
    expect(list.at(-1)!.id).toBe(`foto${String(PHOTOWALL_MAX + 1).padStart(4, "0")}`);
    expect(dropped.map((p) => p.id)).toEqual(["foto0001"]);
    expect(photoWallAdd([], photo("unica0001")).dropped).toEqual([]);
  });

  it("tira do mural pelo id (e devolve a mesma lista se não acha)", () => {
    const list = [photo("aaaa00001"), photo("bbbb00002")];
    expect(photoWallRemove(list, "aaaa00001").map((p) => p.id)).toEqual(["bbbb00002"]);
    expect(photoWallRemove(list, "nada00000")).toBe(list);
  });

  it("arquivo e endereço só com id e extensão", () => {
    expect(photoWallFile({ id: "abc12345", type: "jpeg" })).toBe("abc12345.jpg");
    expect(photoWallUrl({ id: "abc12345", type: "png" })).toBe("/api/mural-fotos/abc12345.png");
    expect(PHOTOWALL_FILE_RE.test("abc12345.jpg")).toBe(true);
    expect(PHOTOWALL_FILE_RE.test("../segredo.jpg")).toBe(false);
    expect(PHOTOWALL_FILE_RE.test("abc12345.svg")).toBe(false);
  });

  it("reconhece PNG e JPEG pelos bytes e lê o tamanho", () => {
    expect(photoWallImageInfo(fakePng(1280, 960))).toEqual({ type: "png", w: 1280, h: 960 });
    expect(photoWallImageInfo(fakeJpeg(1280, 1071))).toEqual({ type: "jpeg", w: 1280, h: 1071 });
  });

  it("recusa o que não é imagem de verdade (ou vem cortado)", () => {
    const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    const text = bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const gif = bytes("GIF89a\u0001\u0000\u0001\u0000");
    expect(photoWallImageInfo(text)).toBeNull();
    expect(photoWallImageInfo(gif)).toBeNull();
    expect(photoWallImageInfo(new Uint8Array(0))).toBeNull();
    expect(photoWallImageInfo(fakePng(10, 10).subarray(0, 20))).toBeNull();
    expect(photoWallImageInfo(fakeJpeg(10, 10).subarray(0, 12))).toBeNull();
    // JPEG que chega aos dados (SOS) sem quadro
    expect(photoWallImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0]))).toBeNull();
    // PNG cujo primeiro bloco não é o IHDR
    const bad = fakePng(10, 10);
    bad[12] = "X".charCodeAt(0);
    expect(photoWallImageInfo(bad)).toBeNull();
  });

  it("tamanho aceito e redução para enviar", () => {
    expect(photoWallSizeOk(1280, 1071)).toBe(true);
    expect(photoWallSizeOk(PHOTOWALL_MAX_SIDE + 1, 100)).toBe(false);
    expect(photoWallSizeOk(10, 10)).toBe(false);
    expect(photoWallFit(1688, 1412)).toEqual({ w: PHOTOWALL_SIDE, h: Math.round((1412 * PHOTOWALL_SIDE) / 1688) });
    expect(photoWallFit(800, 600)).toEqual({ w: 800, h: 600 });
  });
});

/** Começo de um PNG (assinatura + IHDR) com o tamanho dado. */
function fakePng(w: number, h: number): Uint8Array {
  const b = new Uint8Array(45);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

/** Começo de um JPEG (SOI, APP0 JFIF, SOF0) com o tamanho dado. */
function fakeJpeg(w: number, h: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0x00, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
}
