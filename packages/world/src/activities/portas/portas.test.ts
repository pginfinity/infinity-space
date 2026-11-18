import { beforeAll, describe, expect, it } from "vitest";
import {
  NavGrid,
  PRIVACY,
  ZoneIndex,
  audienceOf,
  buildStationMap,
  circleCandidates,
  circleKeep,
  circleShape,
  doorBars,
  doorsOf,
  nearestDoor,
  hearing,
  portasCleanNote,
  portasPrivacy,
  recGroup,
  recIdentity,
  type AudiencePerson,
  type MapDef,
  type PortasState,
  type PrivacyRules,
  type Vec2,
  type Zone,
} from "../../index.ts";

let map: MapDef;
let nav: NavGrid;
let zones: ZoneIndex;

beforeAll(() => {
  map = buildStationMap();
  nav = NavGrid.fromMap(map);
  zones = new ZoneIndex(map.zones);
});

const who = (id: string, pos: Vec2): AudiencePerson => ({ id, pos, zone: zones.zoneAt(pos) });
const hears = (listener: AudiencePerson, speaker: AudiencePerson, privacy?: PrivacyRules, megaphone = false) =>
  hearing(map.walls, listener, speaker, { privacy, megaphone }).mode;

// Lugares conhecidos da planta.
const ECLIPSE_A = { x: -22, z: -1 };
const ECLIPSE_B = { x: -19.5, z: 1.5 };
const ECLIPSE_C = { x: -22, z: 0.9 };
const ECLIPSE_FORA = { x: -17.4, z: -4.9 }; // logo do lado de fora da porta da Eclipse
const MARKETING = { x: -10.5, z: 2 }; // do outro lado do vidro da Sala Eclipse
const CORREDOR = { x: 0, z: -5.5 };
const PALCO = { x: 24.5, z: 17 };
const PLATEIA = { x: 11.6, z: 20 };
const CABINE = { x: 24.5, z: -2.4 };

const doorsClosed = (zone: string, admitted: string[]): PrivacyRules => ({ doors: new Map([[zone, new Set(admitted)]]) });
/** Gravador de reunião: grava só o grupo pedido. */
const recording = (group: string) => (z: Zone) => (recGroup(z) === group ? recIdentity(group) : null);

describe("portas no mapa", () => {
  it("toda sala fechada (reunião, suíte, cabine) tem porta; a Sala Eclipse tem duas entradas", () => {
    const doors = doorsOf(map);
    for (const z of map.zones.filter((z) => z.kind === "meeting" || z.kind === "office" || z.kind === "focus")) {
      expect(doors.filter((d) => d.zoneId === z.id).length, z.name).toBe(z.id === "eclipse" ? 2 : 1);
    }
    expect(doors.length).toBe(8);
  });

  it("entrada mais perto: quem está ao sul da Sala Eclipse usa a porta sul", () => {
    const doors = doorsOf(map);
    expect(nearestDoor(doors, "eclipse", { x: -17.4, z: 11 })!.pos.z).toBe(9);
    expect(nearestDoor(doors, "eclipse", { x: -17.4, z: -6 })!.pos.z).toBe(-4);
    expect(nearestDoor(doors, "atrio", { x: 0, z: 0 })).toBeUndefined();
  });

  it("a porta fica no vão: fora e dentro são andáveis, cada um na sua zona, e há caminho até a porta", () => {
    const start = map.spawns[0]!;
    for (const d of doorsOf(map)) {
      expect(nav.isWalkable(d.outside), `fora de ${d.zoneId}`).toBe(true);
      expect(nav.isWalkable(d.inside), `dentro de ${d.zoneId}`).toBe(true);
      expect(zones.zoneAt(d.inside)?.id, d.zoneId).toBe(d.zoneId);
      expect(zones.zoneAt(d.outside)?.kind, d.zoneId).toBe("open");
      expect(nav.findPath(start, d.outside), d.zoneId).not.toBeNull();
    }
  });

  it("estado do snapshot vira regra: só porta fechada ou trancada isola, e só quem não foi admitido", () => {
    const state: PortasState = {
      doors: {
        eclipse: { state: "closed", admitted: ["ana"], note: "", knocks: [] },
        "diretoria-2": { state: "open", admitted: [], note: "", knocks: [] },
        "diretoria-1": { state: "locked", admitted: ["bia"], note: "", knocks: [] },
      },
      circles: [{ id: "r1", members: ["caio", "duda"], center: { x: 0, z: 0 }, radius: 2, asks: [] }],
    };
    const p = portasPrivacy(state);
    expect([...p.doors!.keys()].sort()).toEqual(["diretoria-1", "eclipse"]);
    expect(p.circles!.get("duda")).toBe("r1");
    expect(doorBars(state, "eclipse", "ana")).toBe(false);
    expect(doorBars(state, "eclipse", "eva")).toBe(true);
    expect(doorBars(state, "diretoria-2", "eva")).toBe(false);
    expect(doorBars(state, "diretoria-1", "ana")).toBe(true);
  });

  it("bilhete: uma linha, sem controle, cortado no limite", () => {
    expect(portasCleanNote("  Em entrevista\naté 15h  ")).toBe("Em entrevista até 15h");
    expect(portasCleanNote("x".repeat(200)).length).toBe(60);
    expect(portasCleanNote(42)).toBe("");
  });
});

describe("audição com portas", () => {
  it("sala fechada continua isolada de quem está do lado de fora da porta, aberta ou fechada", () => {
    const ana = who("ana", ECLIPSE_A);
    const fora = who("eva", ECLIPSE_FORA);
    for (const p of [undefined, doorsClosed("eclipse", ["ana"])]) {
      expect(hears(fora, ana, p)).toBe("none");
      expect(hears(ana, fora, p)).toBe("none");
    }
  });

  it("quem foi admitido ouve todos lá dentro; quem entrou sem ser admitido não ouve nem é ouvido", () => {
    const ana = who("ana", ECLIPSE_A);
    const bia = who("bia", ECLIPSE_B);
    const intruso = who("eva", ECLIPSE_C);
    const p = doorsClosed("eclipse", ["ana", "bia"]);
    expect(hears(bia, ana, p)).toBe("clear");
    expect(hears(intruso, ana, p)).toBe("none");
    expect(hears(ana, intruso, p)).toBe("none");
    // Porta aberta: quem está dentro faz parte da reunião.
    expect(hears(intruso, ana)).toBe("clear");
  });

  it("pessoa sem id numa sala de porta fechada é tratada como intrusa", () => {
    const ana = who("ana", ECLIPSE_A);
    const anon = { pos: ECLIPSE_B, zone: zones.zoneAt(ECLIPSE_B) };
    expect(hearing(map.walls, anon, ana, { privacy: doorsClosed("eclipse", ["ana"]) }).mode).toBe("none");
  });

  it("cabine trancada: o colega encostado na porta não ouve", () => {
    const dentro = who("ana", CABINE);
    const porta = doorsOf(map).find((d) => d.zoneId === "foco-1")!;
    const fora = who("bia", porta.outside);
    expect(hears(fora, dentro, doorsClosed("foco-1", ["ana"]))).toBe("none");
  });
});

describe("audição com roda fechada", () => {
  const A = { x: 0, z: -5.5 };
  const B = { x: 1.5, z: -5.5 };
  const roda = (...ids: string[]): PrivacyRules => ({ circles: new Map(ids.map((id) => [id, "r1"])) });

  it("quem está na roda se ouve com volume cheio", () => {
    expect(hearing(map.walls, who("bia", B), who("ana", A), { privacy: roda("ana", "bia") })).toMatchObject({ mode: "clear", gain: 1 });
  });

  it("não vaza para quem está a 1 m de fora, nem entra o que essa pessoa fala", () => {
    const fora = who("caio", { x: 2.5, z: -5.5 });
    const p = roda("ana", "bia");
    expect(hears(fora, who("bia", B), p)).toBe("none");
    expect(hears(fora, who("ana", A), p)).toBe("none");
    expect(hears(who("bia", B), fora, p)).toBe("none");
    // Sem a roda, os três se ouviriam com clareza.
    expect(hears(fora, who("bia", B))).toBe("clear");
  });

  it("nem o megafone entra na roda", () => {
    const longe = who("caio", { x: 10, z: -5.5 });
    expect(hears(who("ana", A), longe, roda("ana", "bia"), true)).toBe("none");
    expect(hears(who("ana", A), longe, undefined, true)).toBe("clear");
  });

  it("duas rodas diferentes não se ouvem", () => {
    const p: PrivacyRules = { circles: new Map([["ana", "r1"], ["bia", "r2"]]) };
    expect(hears(who("bia", B), who("ana", A), p)).toBe("none");
  });

  it("quem da roda entra numa sala fechada deixa de ser ouvido pela roda (mesmo antes de sair dela)", () => {
    expect(hears(who("bia", ECLIPSE_FORA), who("ana", ECLIPSE_A), roda("ana", "bia"))).toBe("none");
  });
});

describe("audição com sussurro", () => {
  const A = { x: 0, z: -5.5 };
  const B = { x: 1, z: -5.5 };
  const C = { x: -1, z: -5.5 };
  const whisper = (from: string, to: string, extra: PrivacyRules = {}): PrivacyRules => ({ ...extra, whispers: new Map([[from, to]]) });

  it("chega só à pessoa escolhida; quem está a 1 m não ouve", () => {
    const p = whisper("ana", "bia");
    expect(hearing(map.walls, who("bia", B), who("ana", A), { privacy: p })).toMatchObject({ mode: "clear", gain: 1 });
    expect(hears(who("caio", C), who("ana", A), p)).toBe("none");
    // Quem sussurra continua ouvindo os outros normalmente.
    expect(hears(who("ana", A), who("caio", C), p)).toBe("clear");
  });

  it("se a pessoa se afasta, a voz não chega a ninguém (não volta a valer para todos)", () => {
    const p = whisper("ana", "bia");
    const longe = who("bia", { x: A.x + PRIVACY.whisperReach + 0.5, z: -5.5 });
    expect(hears(longe, who("ana", A), p)).toBe("none");
    expect(hears(who("caio", C), who("ana", A), p)).toBe("none");
  });

  it("não atravessa parede nem porta de sala", () => {
    // Dev Lab e Produto & Design, lado a lado, separados por parede.
    expect(hears(who("bia", { x: -11.2, z: -11 }), who("ana", { x: -12.8, z: -11 }), whisper("ana", "bia"))).toBe("none");
    // De fora da porta da Eclipse para alguém logo do lado de dentro.
    const dentro = doorsOf(map).find((d) => d.zoneId === "eclipse")!.inside;
    expect(hears(who("bia", dentro), who("ana", ECLIPSE_FORA), whisper("ana", "bia"))).toBe("none");
  });

  it("dentro da sala de reunião, os outros da sala param de ouvir quem sussurra", () => {
    const p = whisper("ana", "bia", doorsClosed("eclipse", ["ana", "bia", "caio"]));
    const ana = who("ana", { x: -21, z: -1.3 });
    const bia = who("bia", { x: -21, z: -0.3 });
    expect(hears(bia, ana, p)).toBe("clear");
    expect(hears(who("caio", ECLIPSE_B), ana, p)).toBe("none");
  });

  it("no palco, a plateia para de ouvir quem sussurra", () => {
    const p = whisper("ana", "bia");
    expect(hears(who("caio", PLATEIA), who("ana", PALCO), p)).toBe("none");
    expect(hears(who("bia", { x: 24.5, z: 18 }), who("ana", PALCO), p)).toBe("clear");
  });

  it("não fura a roda fechada de outras pessoas", () => {
    const p = whisper("caio", "ana", { circles: new Map([["ana", "r1"], ["bia", "r1"]]) });
    expect(hears(who("ana", A), who("caio", C), p)).toBe("none");
  });
});

describe("quem recebe a voz (lista do servidor)", () => {
  const people = () => [who("ana", ECLIPSE_A), who("bia", ECLIPSE_B), who("caio", CORREDOR), who("duda", MARKETING), who("eva", PALCO), who("fabi", PLATEIA)];

  it("sem privacidade nem gravação, igual à regra de audição", () => {
    const list = people();
    expect(audienceOf(map.walls, list, list[0]!)).toEqual({ voice: ["bia"], sight: ["bia"] });
  });

  it("gravador de reunião recebe só a sala gravada", () => {
    const list = people();
    const opts = { recorderFor: recording("eclipse") };
    expect(audienceOf(map.walls, list, list[0]!, opts).voice).toEqual(["bia", recIdentity("eclipse")]);
    expect(audienceOf(map.walls, list, list[2]!, opts).voice).not.toContain(recIdentity("eclipse"));
    expect(audienceOf(map.walls, list, list[3]!, opts).voice).not.toContain(recIdentity("eclipse"));
  });

  it("gravador continua com a sala gravada de porta fechada, mas não grava quem não foi admitido", () => {
    const list = [...people(), who("gil", ECLIPSE_C)];
    const opts = { recorderFor: recording("eclipse"), privacy: doorsClosed("eclipse", ["ana", "bia"]) };
    expect(audienceOf(map.walls, list, list[0]!, opts).voice).toEqual(["bia", recIdentity("eclipse")]);
    expect(audienceOf(map.walls, list, list[6]!, opts).voice).toEqual([]);
  });

  it("palco do auditório continua transmitindo para a plateia (e o gravador do auditório)", () => {
    const list = people();
    const a = audienceOf(map.walls, list, list[4]!, { recorderFor: recording("aud"), privacy: { doors: new Map(), circles: new Map() } });
    expect(a.voice).toEqual(["fabi", recIdentity("aud")]);
  });

  it("sussurro: a voz vai só para a pessoa (nem para o gravador), mas quem sussurra continua sendo visto", () => {
    const list = [...people(), who("gil", ECLIPSE_C)];
    const opts = { recorderFor: recording("eclipse"), privacy: { whispers: new Map([["ana", "gil"]]) } };
    const a = audienceOf(map.walls, list, list[0]!, opts);
    expect(a.voice).toEqual(["gil"]);
    expect(a.sight).toEqual(["bia", "gil", recIdentity("eclipse")]);
  });

  it("roda fechada: a lista de quem está na roda só tem a roda", () => {
    const A = who("ana", { x: 0, z: -5.5 });
    const B = who("bia", { x: 1.5, z: -5.5 });
    const C = who("caio", { x: 2.5, z: -5.5 });
    const opts = { privacy: { circles: new Map([["ana", "r1"], ["bia", "r1"]]) } };
    expect(audienceOf(map.walls, [A, B, C], B, opts).voice).toEqual(["ana"]);
    expect(audienceOf(map.walls, [A, B, C], C, opts).voice).toEqual([]);
  });
});

describe("roda fechada: quem entra e quem fica", () => {
  const P = (id: string, x: number, z: number) => ({ id, pos: { x, z }, zone: zones.zoneAt({ x, z }) });

  it("entram só os vizinhos diretos, numa área aberta, sem parede e fora de outra roda", () => {
    const ana = P("ana", 0, -5.5);
    const list = [ana, P("bia", 1.5, -5.5), P("caio", -2, -5.5), P("duda", 4, -5.5), P("eva", 0.5, -7.6), P("fabi", -1, -6)];
    // eva está atrás da parede (Produto & Design); duda, longe demais; fabi já está em outra roda.
    expect(circleCandidates(map.walls, ana, list, new Set(["fabi"])).sort()).toEqual(["bia", "caio"]);
    expect(circleCandidates(map.walls, P("gil", -21, -1), list, new Set())).toEqual([]);
  });

  it("quem se afasta de todos sai; quem entra numa sala sai", () => {
    expect(circleKeep(map.walls, [P("ana", 0, -5.5), P("bia", 1.5, -5.5), P("caio", 9, -5.5)])).toEqual(["ana", "bia"]);
    expect(circleKeep(map.walls, [P("ana", 0, -5.5), P("bia", ECLIPSE_A.x, ECLIPSE_A.z)])).toEqual(["ana"]);
  });

  it("se a roda se divide em dois grupos, fica o maior (no empate, o de quem fechou)", () => {
    const kept = circleKeep(map.walls, [P("ana", 0, -5.5), P("bia", 1.5, -5.5), P("caio", 15, -5.5), P("duda", 16, -5.5)]);
    expect(kept).toEqual(["ana", "bia"]);
    expect(circleKeep(map.walls, [P("ana", 0, -5.5), P("caio", 15, -5.5), P("duda", 16, -5.5)])).toEqual(["caio", "duda"]);
  });

  it("o anel envolve todos com folga", () => {
    const s = circleShape([{ x: 0, z: 0 }, { x: 2, z: 0 }]);
    expect(s.center).toEqual({ x: 1, z: 0 });
    expect(s.radius).toBeGreaterThanOrEqual(1.8);
  });
});
