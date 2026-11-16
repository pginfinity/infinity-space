import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAMADO_COOLDOWN_MS,
  CHAMADO_TELEPORT_MS,
  CHAMADO_TTL_MS,
  NavGrid,
  SEGUIR_COOLDOWN_MS,
  SEGUIR_TTL_MS,
  ZoneIndex,
  buildStationMap,
  dist,
  wallBetween,
  type ChamadoEnd,
  type ChamadoInvite,
  type ChamadoTravel,
  type Emote,
  type MapDef,
  type SeguirEnd,
  type SeguirStart,
  type Vec2,
} from "@infinity/world";
import type { Store } from "../../store.ts";
import type { Activity, ActivityHost } from "../types.ts";
import { ChamadoActivity } from "./chamado.ts";
import { SeguirActivity } from "./seguir.ts";

const MAP: MapDef = buildStationMap();

interface Sent {
  ev: string;
  data: unknown;
  to?: string[];
}

/** Sala falsa com o mapa de verdade (rotas, paredes, zonas). */
class FakeHost implements ActivityHost {
  readonly map = MAP;
  readonly nav = NavGrid.fromMap(MAP);
  readonly zones = new ZoneIndex(MAP.zones);
  readonly store = { get: <T>(_k: string, f: T): T => f, set: () => undefined } as unknown as Store;
  pos = new Map<string, Vec2>();
  names = new Map<string, string>();
  events: Sent[] = [];
  notes: Array<[string, string]> = [];
  add(id: string, name: string, p: Vec2): void {
    this.names.set(id, name);
    this.pos.set(id, p);
  }
  changed(_a: Activity): void {}
  event(_a: Activity, ev: string, data?: unknown, opts?: { to?: Iterable<string> }): void {
    this.events.push({ ev, data, ...(opts?.to ? { to: [...opts.to] } : {}) });
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
  emote(_id: string, _e: Emote): void {}
  setHeld(): void {}
  objects() {
    return [];
  }
  near(id: string, p: Vec2, range: number): boolean {
    const q = this.pos.get(id);
    return !!q && dist(q, p) <= range && !wallBetween(MAP.walls, q, p);
  }
  claimSeat(): string | null {
    return null;
  }
  notify(id: string, text: string): void {
    this.notes.push([id, text]);
  }
  of<T>(ev: string): Array<{ data: T; to?: string[] }> {
    return this.events.filter((e) => e.ev === ev).map((e) => ({ data: e.data as T, to: e.to }));
  }
}

/** Átrio (Ana) e Arcade (Bruno): longe um do outro. */
const ANA = { x: -2, z: 3.5 };
const BRUNO = { x: -19, z: 17 };

describe("chamado", () => {
  let host: FakeHost;
  let now: number;
  let act: ChamadoActivity;
  beforeEach(() => {
    host = new FakeHost();
    now = 1_000_000;
    act = new ChamadoActivity(host, () => now);
    host.add("a", "Ana", ANA);
    host.add("b", "Bruno", BRUNO);
    host.add("c", "Carla", { x: 2, z: 7 });
  });

  it("chama, a pessoa topa e recebe onde quem chamou está", () => {
    act.handle("a", "call", { to: "b" });
    const [call] = host.of<ChamadoInvite>("call");
    expect(call!.to).toEqual(["b"]);
    expect(call!.data).toMatchObject({ from: "a", name: "Ana", place: "Átrio", ms: CHAMADO_TTL_MS });
    expect(host.of("calling")[0]!.to).toEqual(["a"]);
    act.handle("b", "accept", { from: "a" });
    expect(host.of("accepted")[0]).toMatchObject({ to: ["a"], data: { by: "b", name: "Bruno" } });
    expect(host.of("go")[0]).toMatchObject({ to: ["b"], data: { from: "a", at: ANA } });
  });

  it("ignora pedidos inválidos: a si mesmo, ninguém, aceite de outra pessoa", () => {
    act.handle("a", "call", { to: "a" });
    act.handle("a", "call", { to: "zzz" });
    act.handle("a", "call", { to: 42 });
    expect(host.of("call")).toHaveLength(0);
    act.handle("a", "call", { to: "b" });
    act.handle("c", "accept", { from: "a" });
    expect(host.of("go")).toHaveLength(0);
  });

  it("um chamado a cada 20 s por pessoa", () => {
    act.handle("a", "call", { to: "b" });
    now += 5000;
    act.handle("a", "call", { to: "c" });
    expect(host.of("call")).toHaveLength(1);
    const wait = host.of<{ ms: number }>("wait")[0]!;
    expect(wait.to).toEqual(["a"]);
    expect(wait.data.ms).toBe(CHAMADO_COOLDOWN_MS - 5000);
    // Outra pessoa pode chamar no mesmo instante.
    act.handle("c", "call", { to: "b" });
    expect(host.of("call")).toHaveLength(2);
    now += CHAMADO_COOLDOWN_MS;
    act.handle("a", "call", { to: "c" });
    expect(host.of("call")).toHaveLength(3);
    // O chamado anterior da Ana foi cancelado.
    expect(host.of<ChamadoEnd>("end").some((e) => e.data.reason === "cancel" && e.data.to === "b")).toBe(true);
  });

  it("recusa, cancela e expira em 30 s", () => {
    act.handle("a", "call", { to: "b" });
    act.handle("b", "decline", { from: "a" });
    expect(host.of<ChamadoEnd>("end")[0]).toMatchObject({ to: ["a", "b"], data: { reason: "declined" } });
    act.handle("b", "accept", { from: "a" });
    expect(host.of("go")).toHaveLength(0);

    act.handle("c", "call", { to: "b" });
    now += CHAMADO_TTL_MS + 1;
    act.tick();
    expect(host.of<ChamadoEnd>("end").at(-1)!.data).toMatchObject({ from: "c", to: "b", reason: "expired" });
    act.handle("b", "accept", { from: "c" });
    expect(host.of("go")).toHaveLength(0);
  });

  it("quem sai encerra o chamado", () => {
    act.handle("a", "call", { to: "b" });
    host.pos.delete("b");
    act.leave("b");
    expect(host.of<ChamadoEnd>("end")[0]!.data.reason).toBe("left");
  });

  describe("teleporte", () => {
    it("sem chamado aceito, nada acontece", () => {
      act.handle("b", "teleport", { from: "a" });
      act.handle("a", "call", { to: "b" });
      act.handle("b", "teleport", { from: "a" });
      expect(host.of("travel")).toHaveLength(0);
      expect(host.of("warp")).toHaveLength(0);
    });

    it("depois de topar: o servidor escolhe um lugar livre perto de quem chamou, uma vez só", () => {
      act.handle("a", "call", { to: "b" });
      act.handle("b", "accept", { from: "a" });
      // Tentar ir para perto de outra pessoa não vale.
      act.handle("b", "teleport", { from: "c" });
      expect(host.of("travel")).toHaveLength(0);
      act.handle("b", "teleport", { from: "a" });
      const [t] = host.of<ChamadoTravel>("travel");
      expect(t!.to).toEqual(["b"]);
      expect(t!.data.mode).toBe("dash");
      const spot = t!.data.to;
      expect(host.nav.isWalkable(spot)).toBe(true);
      expect(dist(spot, ANA)).toBeLessThan(3.1);
      expect(wallBetween(MAP.walls, ANA, spot)).toBe(false);
      expect(host.of("warp")[0]!.to).toBeUndefined();
      // Segunda vez: já usou.
      act.handle("b", "teleport", { from: "a" });
      expect(host.of("travel")).toHaveLength(1);
    });

    it("vence depois de 90 s", () => {
      act.handle("a", "call", { to: "b" });
      act.handle("b", "accept", { from: "a" });
      now += CHAMADO_TELEPORT_MS + 1;
      act.tick();
      act.handle("b", "teleport", { from: "a" });
      expect(host.of("travel")).toHaveLength(0);
    });

    it("usa o teleporte da sala quando ela oferecer", () => {
      const moved: Array<[string, Vec2]> = [];
      const withTp = Object.assign(host, {
        teleport: (id: string, p: Vec2) => {
          moved.push([id, p]);
          return true;
        },
      });
      act = new ChamadoActivity(withTp, () => now);
      act.handle("a", "call", { to: "b" });
      act.handle("b", "accept", { from: "a" });
      act.handle("b", "teleport", { from: "a" });
      expect(moved).toHaveLength(1);
      expect(moved[0]![0]).toBe("b");
      expect(host.of<ChamadoTravel>("travel")[0]!.data.mode).toBe("instant");
    });
  });
});

describe("seguir", () => {
  let host: FakeHost;
  let now: number;
  let act: SeguirActivity;
  beforeEach(() => {
    host = new FakeHost();
    now = 1_000_000;
    act = new SeguirActivity(host, () => now);
    host.add("a", "Ana", ANA);
    host.add("b", "Bruno", BRUNO);
    host.add("c", "Carla", { x: 2, z: 7 });
  });

  it("pede, a pessoa topa e os dois sabem", () => {
    act.handle("b", "ask", { to: "a" });
    expect(host.of("ask")[0]).toMatchObject({ to: ["a"], data: { from: "b", name: "Bruno", ms: SEGUIR_TTL_MS } });
    expect(host.of("asking")[0]).toMatchObject({ to: ["b"], data: { to: "a", name: "Ana" } });
    act.handle("a", "accept", { from: "b" });
    expect(host.of<SeguirStart>("start")[0]).toMatchObject({ to: ["b", "a"], data: { follower: "b", leader: "a", followerName: "Bruno", leaderName: "Ana" } });
    expect(act.following("b")).toBe("a");
  });

  it("sem aceite não segue: recusa e expiração", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "decline", { from: "b" });
    expect(host.of<SeguirEnd>("end")[0]!.data.reason).toBe("declined");
    expect(act.following("b")).toBeUndefined();
    now += SEGUIR_COOLDOWN_MS;
    act.handle("b", "ask", { to: "a" });
    now += SEGUIR_TTL_MS + 1;
    act.tick();
    expect(host.of<SeguirEnd>("end").at(-1)!.data.reason).toBe("expired");
    act.handle("a", "accept", { from: "b" });
    expect(act.following("b")).toBeUndefined();
  });

  it("não aceita pedido em nome de outra pessoa nem em sequência rápida", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("c", "accept", { from: "b" });
    expect(act.following("b")).toBeUndefined();
    act.handle("b", "ask", { to: "c" });
    expect(host.of("ask")).toHaveLength(1);
  });

  it("quem segue para, quem é seguido dispensa", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "accept", { from: "b" });
    act.handle("b", "stop", {});
    expect(host.of<SeguirEnd>("end").at(-1)!.data).toMatchObject({ follower: "b", leader: "a", reason: "stopped", by: "b" });
    expect(act.following("b")).toBeUndefined();

    now += SEGUIR_COOLDOWN_MS;
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "accept", { from: "b" });
    act.handle("c", "ask", { to: "a" });
    act.handle("a", "accept", { from: "c" });
    act.handle("a", "stop", { who: "c" });
    expect(act.following("c")).toBeUndefined();
    expect(act.following("b")).toBe("a");
    act.handle("a", "stop", {});
    expect(act.following("b")).toBeUndefined();
  });

  it("sem rodas: quem é seguido não pode seguir quem o segue", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "accept", { from: "b" });
    act.handle("a", "ask", { to: "b" });
    expect(host.of("ask")).toHaveLength(1);
    expect(host.notes.at(-1)![0]).toBe("a");
  });

  it("seguir outra pessoa troca o seguir anterior", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "accept", { from: "b" });
    now += SEGUIR_COOLDOWN_MS;
    act.handle("b", "ask", { to: "c" });
    act.handle("c", "accept", { from: "b" });
    expect(act.following("b")).toBe("c");
    expect(host.of<SeguirEnd>("end").some((e) => e.data.reason === "switched" && e.data.leader === "a")).toBe(true);
  });

  it("quem sai encerra o seguir dos dois lados", () => {
    act.handle("b", "ask", { to: "a" });
    act.handle("a", "accept", { from: "b" });
    host.pos.delete("a");
    act.leave("a");
    expect(host.of<SeguirEnd>("end").at(-1)!.data).toMatchObject({ follower: "b", leader: "a", reason: "left" });
    expect(act.following("b")).toBeUndefined();
  });
});
