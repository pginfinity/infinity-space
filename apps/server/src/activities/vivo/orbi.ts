import {
  ORBI_CALL_RANGE,
  ORBI_FOLLOW_GAP,
  ORBI_FOLLOW_MS,
  ORBI_FOLLOW_SPEED,
  ORBI_ID,
  ORBI_KIND,
  ORBI_PET_MS,
  ORBI_PET_RANGE,
  ORBI_WANDER_SPEED,
  ORBI_WELCOME_MS,
  ORBI_ZONES,
  boundsOf,
  orbiArriveAt,
  orbiPathLength,
  orbiPoseAt,
  orbiTrimPath,
  pointInPolygon,
  polygonArea,
  yawOf,
  type OrbiPose,
  type OrbiState,
  type Vec2,
  type Zone,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Onde o Orbi descansa quando a estação abre: no Átrio, perto da recepção. */
const HOME: Vec2 = { x: 3.4, z: 6.2 };
/** De quanto em quanto tempo replaneja a rota quando segue alguém. */
const FOLLOW_REPLAN_MS = 550;
/** Pausa entre um passeio e outro. */
const REST_MIN_MS = 5000;
const REST_MAX_MS = 14000;
/** Passeios muito longos ficam para depois. */
const WANDER_MAX_PATH = 34;
/** Salas onde o Orbi não entra atrás de ninguém. */
const CLOSED = new Set(["meeting", "office", "focus"]);
/** Cada pessoa recebe as boas-vindas no máximo uma vez neste intervalo (o pedido vem do cliente). */
const WELCOME_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Orbi, o robô mascote: passeia pelas áreas comuns, segue quem chama e curte carinho.
 * O estado leva o trajeto e a hora de saída; cada cliente calcula a mesma posição (nada a 15 Hz na rede).
 *
 * Operações: `call` (seguir quem chamou), `pet` (carinho), `dismiss` (parar de seguir) e
 * `welcome` (primeiros passos: vai até quem acabou de chegar, de qualquer distância, se estiver livre).
 * Eventos: `pet` `{ name }`, `call` `{ name }`, `welcome` `{ name }` (só para quem chegou),
 * `bye` `{ reason }` (para quem ele seguia).
 */
export class OrbiActivity implements Activity {
  readonly id = ORBI_ID;
  readonly kind = ORBI_KIND;
  private state: OrbiState;
  private readonly zones: Zone[];
  private readonly areas: number[];
  private restUntil: number;
  private nextReplan = 0;
  private lastTarget: Vec2 | null = null;
  private readonly pose: OrbiPose = { x: 0, z: 0, yaw: 0, moving: false };
  /** Quando cada pessoa recebeu as boas-vindas (id → hora). */
  private readonly welcomed = new Map<string, number>();

  constructor(private readonly host: ActivityHost) {
    this.zones = ORBI_ZONES.map((id) => host.map.zones.find((z) => z.id === id)).filter((z): z is Zone => !!z);
    this.areas = this.zones.map((z) => polygonArea(z.polygon));
    const home = host.nav.nearestWalkable(HOME, 3) ?? HOME;
    const now = Date.now();
    this.state = { mode: "rest", from: home, path: [], speed: ORBI_WANDER_SPEED, startAt: now, yaw: Math.PI, follow: null, pet: null, now };
    this.restUntil = now + 3000;
  }

  snapshot(): OrbiState {
    return { ...this.state, now: Date.now() };
  }

  handle(from: string, op: string, _data?: unknown): void {
    const now = Date.now();
    const at = this.where(now);
    if (op === "call") {
      if (!this.host.near(from, at, ORBI_CALL_RANGE)) return;
      const name = this.host.playerName(from) ?? "Alguém";
      this.state = { ...this.state, mode: "follow", follow: { id: from, name, until: now + ORBI_FOLLOW_MS } };
      this.nextReplan = 0;
      this.lastTarget = null;
      this.followStep(now);
      this.host.changed(this);
      this.host.event(this, "call", { name }, { from });
      return;
    }
    if (op === "pet") {
      if (!this.host.near(from, at, ORBI_PET_RANGE)) return;
      if (this.state.pet && now - this.state.pet.at < 900) return;
      const p = this.host.playerPos(from);
      const yaw = p ? yawOf({ x: p.x - at.x, z: p.z - at.z }) : at.yaw;
      const name = this.host.playerName(from) ?? "Alguém";
      this.state = { ...this.state, mode: "pet", from: { x: at.x, z: at.z }, path: [], startAt: now, yaw, pet: { name, at: now } };
      this.host.changed(this);
      this.host.event(this, "pet", { name }, { from });
      return;
    }
    if (op === "welcome") {
      // Já acompanhando outra pessoa: não larga ninguém para dar boas-vindas.
      if (this.state.follow && this.state.follow.id !== from) return;
      if (now - (this.welcomed.get(from) ?? -Infinity) < WELCOME_COOLDOWN_MS) return;
      if (!this.host.playerPos(from)) return;
      const zone = this.host.playerZone(from);
      if (zone && CLOSED.has(zone.kind)) return;
      this.welcomed.set(from, now);
      const name = this.host.playerName(from) ?? "Alguém";
      this.state = { ...this.state, mode: "follow", follow: { id: from, name, until: now + ORBI_WELCOME_MS } };
      this.nextReplan = 0;
      this.lastTarget = null;
      this.followStep(now);
      this.host.changed(this);
      this.host.event(this, "welcome", { name }, { to: [from] });
      return;
    }
    if (op === "dismiss" && this.state.follow?.id === from) this.stopFollow(now, null);
  }

  tick(): void {
    const now = Date.now();
    const s = this.state;
    if (s.mode === "pet") {
      if (now - (s.pet?.at ?? 0) < ORBI_PET_MS) return;
      if (s.follow) {
        this.state = { ...s, mode: "follow" };
        this.nextReplan = 0;
        this.lastTarget = null;
        this.followStep(now);
      } else {
        this.state = { ...s, mode: "rest" };
        this.restUntil = now + 2500;
      }
      this.host.changed(this);
      return;
    }
    if (s.mode === "follow") {
      this.followStep(now);
      return;
    }
    if (s.mode === "wander") {
      if (now >= orbiArriveAt(s)) {
        const at = this.where(now);
        this.state = { ...s, mode: "rest", from: { x: at.x, z: at.z }, path: [], startAt: now, yaw: at.yaw };
        this.restUntil = now + REST_MIN_MS + Math.random() * (REST_MAX_MS - REST_MIN_MS);
        this.host.changed(this);
      }
      return;
    }
    // descansando: de vez em quando olha para o lado; depois sai para passear
    if (now >= this.restUntil) this.wander(now);
  }

  leave(id: string): void {
    this.welcomed.delete(id);
    if (this.state.follow?.id === id) this.stopFollow(Date.now(), null);
  }

  /** Posição agora (mesma conta dos clientes). */
  private where(now: number): OrbiPose {
    return orbiPoseAt(this.state, now, this.pose);
  }

  private followStep(now: number): void {
    const f = this.state.follow;
    if (!f) return;
    const target = this.host.playerPos(f.id);
    if (!target || now > f.until) {
      this.stopFollow(now, target ? "time" : null);
      return;
    }
    const zone = this.host.playerZone(f.id);
    if (zone && CLOSED.has(zone.kind)) {
      this.stopFollow(now, "room");
      return;
    }
    if (now < this.nextReplan) return;
    this.nextReplan = now + FOLLOW_REPLAN_MS;
    const at = this.where(now);
    const d = Math.hypot(target.x - at.x, target.z - at.z);
    const moved = !this.lastTarget || Math.hypot(target.x - this.lastTarget.x, target.z - this.lastTarget.z) > 0.7;
    if (d <= ORBI_FOLLOW_GAP + 0.5) {
      // pertinho: para e olha para a pessoa
      const yaw = yawOf({ x: target.x - at.x, z: target.z - at.z });
      if (at.moving || Math.abs(Math.atan2(Math.sin(yaw - this.state.yaw), Math.cos(yaw - this.state.yaw))) > 0.6) {
        this.state = { ...this.state, from: { x: at.x, z: at.z }, path: [], startAt: now, yaw };
        this.host.changed(this);
      }
      this.lastTarget = { x: target.x, z: target.z };
      return;
    }
    if (!moved && at.moving) return;
    const full = this.host.nav.findPath(at, target);
    if (!full) return;
    const path = orbiTrimPath(at, full, ORBI_FOLLOW_GAP);
    this.lastTarget = { x: target.x, z: target.z };
    this.state = { ...this.state, from: { x: at.x, z: at.z }, path, speed: ORBI_FOLLOW_SPEED, startAt: now };
    this.host.changed(this);
  }

  private stopFollow(now: number, reason: "time" | "room" | null): void {
    const f = this.state.follow;
    const at = this.where(now);
    this.state = { ...this.state, mode: "rest", follow: null, from: { x: at.x, z: at.z }, path: [], startAt: now, yaw: at.yaw };
    this.restUntil = now + 4000;
    this.host.changed(this);
    if (f && reason) this.host.event(this, "bye", { reason }, { to: [f.id] });
  }

  private wander(now: number): void {
    const at = this.where(now);
    for (let tries = 0; tries < 12; tries++) {
      const goal = this.randomSpot(at);
      if (!goal) continue;
      const path = this.host.nav.findPath(at, goal);
      if (!path || path.length === 0) continue;
      const len = orbiPathLength(at, path);
      if (len < 3 || len > WANDER_MAX_PATH) continue;
      // Passeio não corta caminho por sala de reunião, escritório nem cabine (a Sala Eclipse tem duas
      // portas alinhadas: a rota mais curta às vezes passava pelo meio da daily).
      if (this.crossesClosed(at, path)) continue;
      this.state = { ...this.state, mode: "wander", from: { x: at.x, z: at.z }, path, speed: ORBI_WANDER_SPEED, startAt: now };
      this.host.changed(this);
      return;
    }
    this.restUntil = now + 3000;
  }

  /** O caminho (de `from` pelos pontos) entra em alguma área fechada? Confere a cada meio metro. */
  private crossesClosed(from: Vec2, path: readonly Vec2[]): boolean {
    let a = from;
    for (const b of path) {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const kind = this.host.zones.zoneAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })?.kind;
        if (kind && CLOSED.has(kind)) return true;
      }
      a = b;
    }
    return false;
  }

  /** Ponto andável sorteado nas áreas comuns (salas maiores saem mais). */
  private randomSpot(from: Vec2): Vec2 | null {
    const total = this.areas.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let zone = this.zones[0];
    for (let i = 0; i < this.zones.length; i++) {
      r -= this.areas[i]!;
      if (r <= 0) {
        zone = this.zones[i];
        break;
      }
    }
    if (!zone) return null;
    const b = boundsOf(zone.polygon);
    for (let k = 0; k < 20; k++) {
      const p = { x: b.minX + Math.random() * (b.maxX - b.minX), z: b.minZ + Math.random() * (b.maxZ - b.minZ) };
      if (!pointInPolygon(p, zone.polygon) || !this.host.nav.isWalkable(p)) continue;
      if (Math.hypot(p.x - from.x, p.z - from.z) < 4) continue;
      return p;
    }
    return null;
  }
}
