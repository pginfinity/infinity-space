import { describe, expect, it } from "vitest";
import { buildStationMap } from "../../map/estacao.ts";
import {
  MESAS_ITEMS,
  MESAS_ITEMS_MAX,
  MESAS_NOTES_PER_AUTHOR,
  MESAS_NOTES_PER_OWNER,
  mesasAddNote,
  mesasCheckin,
  mesasCheckout,
  mesasCleanItems,
  mesasDayEnd,
  mesasDeskOf,
  mesasDesks,
  mesasEmpty,
  mesasFixedOf,
  mesasKey,
  mesasLabel,
  mesasNotesOf,
  mesasOwner,
  mesasPruneNotes,
  mesasPurge,
  mesasRemoveNote,
  mesasRestore,
  mesasRestoreNotes,
  mesasSetFixed,
  mesasSetItems,
  type MesasNote,
} from "./rules.ts";

const map = buildStationMap();
const desks = mesasDesks(map);
// 15/11/2026, 14:00 em Brasília (17:00 UTC).
const NOW = Date.UTC(2026, 10, 15, 17, 0);

describe("mesas: mesas do mapa", () => {
  it("toda mesa de trabalho tem cadeira, sala e número; cabines de foco ficam de fora", () => {
    expect(desks.length).toBeGreaterThan(20);
    const zones = new Map(map.zones.map((z) => [z.id, z]));
    for (const d of desks) {
      expect(d.chairId, d.id).toBeTruthy();
      const chair = map.objects.find((o) => o.id === d.chairId)!;
      expect(chair.deskId).toBe(d.id);
      expect(chair.interact?.action).toBe("sit");
      expect(Math.hypot(chair.pos.x - d.seat.x, chair.pos.z - d.seat.z)).toBeLessThan(0.05);
      expect(zones.get(d.zoneId)?.kind).not.toBe("focus");
      expect(d.n).toBeGreaterThanOrEqual(1);
      expect(d.n).toBeLessThanOrEqual(d.of);
    }
    expect(map.desks.some((d) => zones.get(d.zoneId ?? "")?.kind === "focus")).toBe(true);
    // ids únicos
    expect(new Set(desks.map((d) => d.id)).size).toBe(desks.length);
  });

  it("rótulo com o número só quando a sala tem mais de uma mesa", () => {
    const dev = desks.find((d) => d.zoneId === "dev")!;
    expect(mesasLabel(dev)).toMatch(/^Dev Lab · Mesa \d+$/);
    const suite = desks.find((d) => d.zoneId === "diretoria-1")!;
    expect(mesasLabel(suite)).toBe("Suíte 1");
  });
});

describe("mesas: dia e pessoas", () => {
  it("o check-in vale até a meia-noite de Brasília", () => {
    expect(mesasDayEnd(NOW)).toBe(Date.UTC(2026, 10, 16, 3, 0));
    // 23:59 em Brasília (02:59 UTC do dia seguinte) ainda é o mesmo dia.
    expect(mesasDayEnd(Date.UTC(2026, 10, 16, 2, 59))).toBe(Date.UTC(2026, 10, 16, 3, 0));
    // Meia-noite em ponto já é o dia seguinte.
    expect(mesasDayEnd(Date.UTC(2026, 10, 16, 3, 0))).toBe(Date.UTC(2026, 10, 17, 3, 0));
  });

  it("chave da pessoa ignora maiúsculas e espaços", () => {
    expect(mesasKey("  Ana  Paula ")).toBe("ana paula");
    expect(mesasKey("ANA")).toBe(mesasKey("ana"));
  });

  it("objetos: só do catálogo, sem repetir, até três", () => {
    expect(mesasCleanItems(["caneca", "caneca", "x", 3, "cacto", "globo", "fones"])).toEqual(["caneca", "cacto", "globo"]);
    expect(mesasCleanItems("caneca")).toEqual([]);
    expect(MESAS_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(MESAS_ITEMS_MAX).toBe(3);
  });
});

describe("mesas: check-in e mesas fixas", () => {
  const [d1, d2, d3] = desks.map((d) => d.id) as [string, string, string];

  it("check-in, mesa ocupada para os outros e uma mesa por pessoa", () => {
    let s = mesasEmpty();
    const a = mesasCheckin(s, d1, "Ana", NOW);
    expect(a.error).toBeUndefined();
    s = a.state;
    expect(mesasOwner(s, d1, NOW)).toEqual({ name: "Ana", fixed: false });
    expect(mesasCheckin(s, d1, "Bruno", NOW).error).toBe("ocupada");
    expect(mesasCheckin(s, d1, "ana", NOW).error).toBe("ja-sua");
    // Ana muda de mesa: a primeira fica livre.
    s = mesasCheckin(s, d2, "Ana", NOW).state;
    expect(mesasOwner(s, d1, NOW)).toBeNull();
    expect(mesasDeskOf(s, "ana", NOW)).toBe(d2);
    expect(Object.keys(s.checkins)).toEqual([d2]);
  });

  it("o check-in vence à meia-noite e some na limpeza", () => {
    let s = mesasCheckin(mesasEmpty(), d1, "Ana", NOW).state;
    const end = mesasDayEnd(NOW);
    expect(mesasOwner(s, d1, end - 1)).not.toBeNull();
    expect(mesasOwner(s, d1, end)).toBeNull();
    expect(mesasPurge(s, end - 1)).toBe(s);
    s = mesasPurge(s, end);
    expect(s.checkins).toEqual({});
    // Outra pessoa pode fazer check-in no dia seguinte.
    expect(mesasCheckin(s, d1, "Bruno", end + 1000).error).toBeUndefined();
  });

  it("liberar a mesa", () => {
    const s = mesasCheckin(mesasEmpty(), d1, "Ana", NOW).state;
    expect(mesasCheckout(s, "bruno")).toBe(s);
    expect(mesasOwner(mesasCheckout(s, "ana"), d1, NOW)).toBeNull();
  });

  it("mesa fixa: aparece com o nome, ninguém faz check-in nela e tira quem estava", () => {
    let s = mesasCheckin(mesasEmpty(), d1, "Bruno", NOW).state;
    s = mesasSetFixed(s, d1, "Carla");
    expect(mesasOwner(s, d1, NOW)).toEqual({ name: "Carla", fixed: true });
    expect(mesasDeskOf(s, "bruno", NOW)).toBeNull();
    expect(mesasCheckin(s, d1, "Bruno", NOW).error).toBe("fixa");
    expect(mesasCheckin(s, d1, "carla", NOW).error).toBe("sua-fixa");
    // Uma mesa fixa por pessoa: marcar outra move a fixa.
    s = mesasSetFixed(s, d3, "Carla");
    expect(s.fixed).toEqual({ [d3]: "Carla" });
    expect(mesasFixedOf(s, "carla")).toBe(d3);
    // Com check-in em outra mesa, a mesa atual é a do check-in; sem, é a fixa.
    s = mesasCheckin(s, d2, "Carla", NOW).state;
    expect(mesasDeskOf(s, "carla", NOW)).toBe(d2);
    expect(mesasDeskOf(mesasCheckout(s, "carla"), "carla", NOW)).toBe(d3);
    // Desmarcar.
    s = mesasSetFixed(s, d3, "");
    expect(s.fixed).toEqual({});
    expect(mesasSetFixed(s, d3, "")).toBe(s);
  });

  it("objetos por pessoa", () => {
    let s = mesasSetItems(mesasEmpty(), "ana", ["caneca", "cacto"]);
    expect(s.items.ana).toEqual(["caneca", "cacto"]);
    expect(mesasSetItems(s, "ana", ["caneca", "cacto"])).toBe(s);
    s = mesasSetItems(s, "ana", []);
    expect(s.items).toEqual({});
  });

  it("estado salvo é limpo ao carregar (mesas que não existem, campos estranhos)", () => {
    const ids = new Set(desks.map((d) => d.id));
    const s = mesasRestore(
      {
        checkins: { [d1]: { name: "Ana", until: 5 }, "nao-existe": { name: "X", until: 9 }, [d2]: { name: 3 } },
        fixed: { [d3]: "Carla", [d2]: "" },
        items: { ana: ["caneca", "zzz"], bruno: "x" },
      },
      ids,
    );
    expect(s).toEqual({ checkins: { [d1]: { name: "Ana", until: 5 } }, fixed: { [d3]: "Carla" }, items: { ana: ["caneca"] } });
    expect(mesasRestore(null, ids)).toEqual(mesasEmpty());
  });
});

describe("mesas: recados", () => {
  const note = (id: string, from: string, to: string, at = NOW): MesasNote => ({ id, from, fromName: from, to, toName: to, desk: "d", text: "oi", at });

  it("cada autor deixa poucos recados pendentes para a mesma pessoa", () => {
    let notes: MesasNote[] = [];
    for (let i = 0; i < MESAS_NOTES_PER_AUTHOR; i++) {
      const r = mesasAddNote(notes, note(`n${i}`, "bruno", "ana"));
      expect(r.error).toBeUndefined();
      notes = r.notes;
    }
    expect(mesasAddNote(notes, note("x", "bruno", "ana")).error).toBe("limite");
    // Outra pessoa ainda pode.
    expect(mesasAddNote(notes, note("y", "carla", "ana")).error).toBeUndefined();
  });

  it("a dona guarda um número limitado (os mais antigos saem)", () => {
    let notes: MesasNote[] = [];
    for (let i = 0; i < MESAS_NOTES_PER_OWNER + 2; i++) notes = mesasAddNote(notes, note(`n${i}`, `p${i}`, "ana")).notes;
    expect(notes.length).toBe(MESAS_NOTES_PER_OWNER);
    expect(notes[0]!.id).toBe("n2");
  });

  it("só a dona e quem escreveu veem e apagam", () => {
    const notes = [note("a", "bruno", "ana"), note("b", "carla", "ana"), note("c", "ana", "bruno")];
    expect(mesasNotesOf(notes, "ana")).toEqual({ inbox: [notes[0], notes[1]], sent: [notes[2]] });
    expect(mesasNotesOf(notes, "carla")).toEqual({ inbox: [], sent: [notes[1]] });
    expect(mesasNotesOf(notes, "davi")).toEqual({ inbox: [], sent: [] });
    expect(mesasRemoveNote(notes, "a", "davi")).toBe(notes);
    expect(mesasRemoveNote(notes, "a", "bruno").map((n) => n.id)).toEqual(["b", "c"]);
    expect(mesasRemoveNote(notes, "a", "ana").map((n) => n.id)).toEqual(["b", "c"]);
  });

  it("recados velhos somem; arquivo estranho vira lista limpa", () => {
    const old = note("velho", "bruno", "ana", NOW - 31 * 24 * 3600 * 1000);
    const notes = [old, note("novo", "bruno", "ana")];
    expect(mesasPruneNotes(notes, NOW).map((n) => n.id)).toEqual(["novo"]);
    const fresh = [note("novo", "bruno", "ana")];
    expect(mesasPruneNotes(fresh, NOW)).toBe(fresh);
    expect(mesasRestoreNotes([note("a", "b", "c"), { id: 1 }, null, "x"]).map((n) => n.id)).toEqual(["a"]);
    expect(mesasRestoreNotes("x")).toEqual([]);
  });
});
