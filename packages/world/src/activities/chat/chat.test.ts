import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import { ZoneIndex } from "../../audio.ts";
import {
  CHAT_LINES_MAX,
  CHAT_TEXT_MAX,
  chatCid,
  chatClean,
  chatHash,
  chatHearers,
  chatKey,
  chatLinks,
  chatMentionQuery,
  chatMentions,
  chatMentionsName,
  chatMerge,
  chatNextId,
  chatPair,
  chatPairKeys,
  chatPreview,
  chatRateOk,
  chatSameGroup,
  chatTokens,
  type ChatMsg,
} from "./chat.ts";

const msg = (id: number, over: Partial<ChatMsg> = {}): ChatMsg => ({ id, at: id, from: "s1", fromKey: "ana", name: "Ana", text: `m${id}`, ...over });

describe("chat: identidade", () => {
  it("chave pelo nome ignora maiúsculas e espaços, mas não acentos", () => {
    expect(chatKey("  Ana   Paula ")).toBe("ana paula");
    expect(chatKey("ANA PAULA")).toBe(chatKey("ana paula"));
    expect(chatKey("José")).not.toBe(chatKey("Jose"));
    // NFC: "é" composto e decomposto são a mesma pessoa.
    expect(chatKey("José")).toBe(chatKey("José"));
  });

  it("par é igual dos dois lados e volta às duas chaves", () => {
    expect(chatPair("ana", "bruno")).toBe(chatPair("bruno", "ana"));
    expect(chatPairKeys(chatPair("bruno", "ana"))).toEqual(["ana", "bruno"]);
    expect(chatPair("ana", "ana b")).not.toBe(chatPair("ana a", "b"));
  });

  it("hash curto, estável e diferente para pares diferentes", () => {
    const h = chatHash(chatPair("ana", "bruno"));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(chatHash(chatPair("bruno", "ana"))).toBe(h);
    expect(chatHash(chatPair("ana", "carla"))).not.toBe(h);
  });

  it("id do cliente: curto e só letras, números e hífen", () => {
    expect(chatCid("abc-123")).toBe("abc-123");
    expect(chatCid("")).toBeUndefined();
    expect(chatCid("x".repeat(25))).toBeUndefined();
    expect(chatCid("<script>")).toBeUndefined();
    expect(chatCid(42)).toBeUndefined();
  });
});

describe("chat: limpeza do texto", () => {
  it("aceita só texto e tira espaços das pontas", () => {
    expect(chatClean(42)).toBe("");
    expect(chatClean(null)).toBe("");
    expect(chatClean("   oi  ")).toBe("oi");
    expect(chatClean(" \n \t ")).toBe("");
    expect(chatClean("​​")).toBe("");
  });

  it("guarda quebras de linha, mas no máximo uma linha em branco", () => {
    expect(chatClean("a\r\nb")).toBe("a\nb");
    expect(chatClean("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(chatClean("a   \nb")).toBe("a\nb");
  });

  it("tira caracteres de controle e marcas de direção", () => {
    expect(chatClean("a\u0000b\u0007c")).toBe("a b c");
    expect(chatClean("https://x.com/‮gpj.exe")).toBe("https://x.com/gpj.exe");
  });

  it("corta em 1000 sem partir emoji e limita as linhas", () => {
    const long = "a".repeat(CHAT_TEXT_MAX - 1) + "😀";
    const cut = chatClean(long);
    expect(cut.length).toBe(CHAT_TEXT_MAX - 1);
    expect(chatClean("b".repeat(5000)).length).toBe(CHAT_TEXT_MAX);
    const many = Array.from({ length: 60 }, (_, i) => `l${i}`).join("\n");
    expect(chatClean(many).split("\n").length).toBe(CHAT_LINES_MAX);
  });

  it("prévia numa linha só, com reticências", () => {
    expect(chatPreview("oi\n\ntudo bem?")).toBe("oi tudo bem?");
    expect(chatPreview("x".repeat(100), 10)).toBe("xxxxxxxxx…");
  });
});

describe("chat: links e menções", () => {
  it("acha links http e https e deixa a pontuação de fora", () => {
    expect(chatLinks("veja https://ai-infinity.io.").map((l) => l.href)).toEqual(["https://ai-infinity.io"]);
    expect(chatLinks("(ver http://a.com/x)").map((l) => l.href)).toEqual(["http://a.com/x"]);
    expect(chatLinks("wiki https://pt.wikipedia.org/wiki/Foo_(bar)!").map((l) => l.href)).toEqual(["https://pt.wikipedia.org/wiki/Foo_(bar)"]);
    expect(chatLinks("dois: https://a.com, https://b.com/?q=1&x=2")).toHaveLength(2);
  });

  it("ignora o que não é http/https ou não tem endereço", () => {
    expect(chatLinks("javascript:alert(1)")).toEqual([]);
    expect(chatLinks("ftp://a.com")).toEqual([]);
    expect(chatLinks("https://")).toEqual([]);
    expect(chatLinks("https://.")).toEqual([]);
    expect(chatLinks("xhttps://a.com")).toEqual([]);
    expect(chatLinks("data:text/html,<b>")).toEqual([]);
  });

  it("menções: o nome mais longo vence e precisa de borda", () => {
    const names = ["Ana", "Ana Paula", "Bruno"];
    const t = "oi @ana paula e @Bruno! @anabela não, e@ana não";
    const m = chatMentions(t, names);
    expect(m.map((x) => x.key)).toEqual(["ana paula", "bruno"]);
    expect(t.slice(m[0]!.start, m[0]!.end)).toBe("@ana paula");
    expect(chatMentionsName("valeu @Ana.", "Ana")).toBe(true);
    expect(chatMentionsName("valeu Ana", "Ana")).toBe(false);
    expect(chatMentionsName("@@Ana", "Ana")).toBe(false);
  });

  it("tokens: texto, link e menção na ordem, sem menção dentro de link", () => {
    const toks = chatTokens("@Ana veja https://x.com/@Ana agora", ["Ana"]);
    expect(toks).toEqual([
      { t: "mention", s: "@Ana", key: "ana" },
      { t: "text", s: " veja " },
      { t: "link", s: "https://x.com/@Ana", href: "https://x.com/@Ana" },
      { t: "text", s: " agora" },
    ]);
    expect(chatTokens("só texto", [])).toEqual([{ t: "text", s: "só texto" }]);
  });

  it("sugestão de menção enquanto digita", () => {
    const names = ["Ana Paula", "Bruno"];
    expect(chatMentionQuery("oi @an", 6, names)).toEqual({ start: 3, query: "an" });
    expect(chatMentionQuery("oi @", 4, names)).toEqual({ start: 3, query: "" });
    expect(chatMentionQuery("oi @ana p", 9, names)).toEqual({ start: 3, query: "ana p" });
    expect(chatMentionQuery("oi @bruno x", 11, names)).toBeNull();
    expect(chatMentionQuery("email@an", 8, names)).toBeNull();
    expect(chatMentionQuery("sem arroba", 10, names)).toBeNull();
  });
});

describe("chat: regras", () => {
  it("no máximo 5 mensagens em qualquer segundo", () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) expect(chatRateOk(times, 1000 + i * 10)).toBe(true);
    expect(chatRateOk(times, 1100)).toBe(false);
    expect(chatRateOk(times, 1999)).toBe(false);
    expect(chatRateOk(times, 2000)).toBe(true);
  });

  it("junta por id, sem repetir, e guarda as últimas", () => {
    const a = [msg(1), msg(3)];
    const b = [msg(2), msg(3, { text: "novo" }), msg(4)];
    const out = chatMerge(a, b, 3);
    expect(out.map((m) => m.id)).toEqual([2, 3, 4]);
    expect(out[1]!.text).toBe("novo");
    expect(chatMerge(a, [], 10)).toBe(a);
  });

  it("agrupa mensagens seguidas da mesma pessoa com pouco intervalo", () => {
    expect(chatSameGroup(undefined, msg(1))).toBe(false);
    expect(chatSameGroup(msg(1, { at: 0 }), msg(2, { at: 60_000 }))).toBe(true);
    expect(chatSameGroup(msg(1, { at: 0 }), msg(2, { at: 6 * 60_000 }))).toBe(false);
    expect(chatSameGroup(msg(1), msg(2, { fromKey: "bruno", name: "Bruno" }))).toBe(false);
  });

  it("ids crescentes ligados ao relógio", () => {
    expect(chatNextId(0, 1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(chatNextId(1_700_000_000_000, 1_700_000_000_000)).toBe(1_700_000_000_001);
    expect(chatNextId(1_700_000_000_005, 1_600_000_000_000)).toBe(1_700_000_000_006);
  });
});

describe("chat: quem lê o Perto (regra da voz)", () => {
  const map = buildStationMap();
  const zones = new ZoneIndex(map.zones);
  const at = (id: string, x: number, z: number) => ({ id, pos: { x, z }, zone: zones.zoneAt({ x, z }) });

  it("área aberta: só quem está na conversa nítida", () => {
    const speaker = at("a", 1, 2);
    const ids = chatHearers(map.walls, speaker, [at("perto", 3, 2), at("longe", 1 + 9, 2)]);
    expect(ids).toEqual(["perto"]);
  });

  it("sala fechada: quem está dentro lê; quem está do lado de fora da parede, não", () => {
    const inside = at("a", -21, -1);
    expect(inside.zone?.kind).toBe("meeting");
    const ids = chatHearers(map.walls, inside, [at("dentro", -24.5, 1.5), at("fora", -15, -1)]);
    expect(ids).toEqual(["dentro"]);
    // E quem está fora não lê quem está dentro.
    expect(chatHearers(map.walls, at("b", -15, -1), [inside])).toEqual([]);
  });
});
