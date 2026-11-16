import { POOL, POOL_KIND, poolEmpty, poolRack, poolRules, poolSimulate, rtNum, rtTableToWorld, type MapObject, type PoolState, type Vec2 } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Distância (m) do próprio lado da mesa para pegar o lugar. */
export const POOL_SIT_RANGE = 2.4;
/** Distância (m) da mesa para tacar (dá a volta na mesa). */
export const POOL_SHOOT_RANGE = 3.2;
export const POOL_AWAY_S = 8;

export interface PoolOptions {
  now?: () => number;
}

/**
 * Mesa de sinuca: dois lugares, por turnos. O servidor simula a tacada inteira (física determinística
 * do pacote do mundo), aplica as regras e manda o estado com a tacada (`last`) para os clientes animarem.
 * A próxima tacada só vale depois que a anterior terminou de rolar.
 *
 * Operações: `sit` `{ seat }`, `stand`, `shoot` `{ dir: { x, z }, power }`, `resign`, `rematch` `{ on? }`.
 */
export class PoolActivity implements Activity {
  readonly id: string;
  readonly kind = POOL_KIND;
  private state: PoolState = poolEmpty();
  private busyUntil = 0;
  private away: [number, number] = [0, 0];
  private readonly now: () => number;

  constructor(
    private readonly host: ActivityHost,
    private readonly table: MapObject,
    opts: PoolOptions = {},
  ) {
    this.id = table.gameId ?? table.id;
    this.now = opts.now ?? (() => Date.now());
  }

  standPoint(seat: number): Vec2 {
    return rtTableToWorld(this.table, 0, (seat === 0 ? 1 : -1) * (POOL.L / 2 + POOL.STAND));
  }

  snapshot(): PoolState {
    const s = this.state;
    return { ...s, names: [this.name(s.seats[0]), this.name(s.seats[1])] };
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    if (op === "sit") this.sit(from, d.seat);
    else if (op === "stand") this.stand(from);
    else if (op === "shoot") this.shoot(from, d);
    else if (op === "resign") {
      const seat = this.state.seats.indexOf(from);
      if (seat >= 0 && this.state.phase === "playing") {
        this.finish(seat === 0 ? 1 : 0, "resign");
        this.host.changed(this);
      }
    } else if (op === "rematch") this.rematch(from, d.on !== false);
  }

  tick(dt: number): void {
    this.state.seats.forEach((id, seat) => {
      if (!id) return;
      const far = !this.host.near(id, this.table.pos, POOL_SHOOT_RANGE + 2);
      this.away[seat] = far ? this.away[seat]! + dt : 0;
      if (this.away[seat]! >= POOL_AWAY_S) this.stand(id);
    });
  }

  leave(id: string): void {
    this.stand(id);
  }

  private name(id: string | null): string | null {
    return id ? (this.host.playerName(id) ?? null) : null;
  }

  private sit(from: string, seat: unknown): void {
    const s = this.state;
    if (s.phase === "playing" || (seat !== 0 && seat !== 1) || s.seats[seat] !== null) return;
    if (!this.host.near(from, this.standPoint(seat), POOL_SIT_RANGE)) return;
    const busy = this.host.claimSeat(from, this);
    if (busy) {
      this.host.notify(from, `Você está no meio de uma partida de ${busy}. Termine ou levante de lá primeiro.`);
      return;
    }
    const cur = s.seats.indexOf(from);
    if (cur >= 0) s.seats[cur] = null;
    s.seats[seat] = from;
    s.rematch = [false, false];
    this.away[seat] = 0;
    if (s.seats[0] && s.seats[1]) this.start();
    this.host.changed(this);
  }

  seatLabel(id: string): string | null {
    return this.state.seats.includes(id) ? "Sinuca" : null;
  }

  inMatchFor(id: string): boolean {
    return this.state.seats.includes(id) && this.state.phase === "playing";
  }

  releaseSeat(id: string): void {
    if (this.state.seats.includes(id) && this.state.phase !== "playing") this.stand(id);
  }

  private stand(from: string): void {
    const s = this.state;
    const seat = s.seats.indexOf(from);
    if (seat < 0) return;
    if (s.phase === "playing") this.finish(seat === 0 ? 1 : 0, "left");
    s.seats[seat] = null;
    s.rematch = [false, false];
    this.away[seat] = 0;
    if (!s.seats[0] && !s.seats[1]) this.state = { ...poolEmpty(), round: s.round };
    this.host.changed(this);
  }

  private start(): void {
    const s = this.state;
    const round = s.round + 1;
    this.state = {
      ...poolEmpty(),
      seats: s.seats,
      round,
      phase: "playing",
      players: [this.name(s.seats[0]), this.name(s.seats[1])],
      // quem sai alterna a cada partida na mesa
      turn: round % 2 === 1 ? 0 : 1,
      balls: poolRack(),
    };
    this.busyUntil = 0;
    this.away = [0, 0];
  }

  private finish(winner: number, reason: PoolState["reason"]): void {
    this.state = { ...this.state, phase: "finished", winner, reason, rematch: [false, false] };
    const id = this.state.seats[winner];
    if (id && reason === "eight") this.host.emote(id, "cheer");
  }

  private rematch(from: string, on: boolean): void {
    const s = this.state;
    const seat = s.seats.indexOf(from);
    if (s.phase !== "finished" || seat < 0 || !s.seats[0] || !s.seats[1] || s.rematch[seat] === on) return;
    s.rematch[seat] = on;
    if (s.rematch[0] && s.rematch[1]) this.start();
    this.host.changed(this);
  }

  private shoot(from: string, d: Record<string, unknown>): void {
    const s = this.state;
    const seat = s.seats.indexOf(from);
    const now = this.now();
    if (s.phase !== "playing" || seat < 0 || seat !== s.turn || now < this.busyUntil) return;
    if (!this.host.near(from, this.table.pos, POOL_SHOOT_RANGE)) return;
    const dir = d.dir as { x?: unknown; z?: unknown } | undefined;
    const x = rtNum(dir?.x, -10, 10);
    const z = rtNum(dir?.z, -10, 10);
    const power = rtNum(d.power, 0.05, 1);
    if (x === null || z === null || power === null) return;
    const len = Math.sqrt(x * x + z * z);
    if (len < 1e-6) return;
    // o mesmo vetor unitário vai para os clientes refazerem a tacada igual
    const unit = { x: x / len, z: z / len };
    const shot = poolSimulate(s.balls, unit, power);
    this.state = poolRules(s, seat, unit, power, shot);
    this.busyUntil = now + shot.time * 1000 + 250;
    const st = this.state;
    if (st.phase === "finished" && st.winner !== null) {
      const id = st.seats[st.winner];
      if (id && st.reason === "eight") this.host.emote(id, "cheer");
    }
    this.host.changed(this);
  }
}
