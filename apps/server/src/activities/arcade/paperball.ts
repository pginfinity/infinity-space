import { PAPER, PAPER_ID, PAPER_KIND, paperDay, paperLanding, paperOutcome, rtNum, type MapObject, type PaperState, type PaperThrow, type Vec2 } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "arcade/bolinha";
/** Quem vê o arremesso (m): o resto do escritório não precisa do evento. */
const SHOW_RANGE = 24;

export interface PaperOptions {
  now?: () => number;
}

/**
 * Bolinha de papel: a pessoa perto de uma lixeira mira e arremessa; o servidor calcula onde cai com a
 * posição que conhece, conta a sequência de acertos (some ao errar) e guarda o recorde do dia.
 *
 * Operações: `hold` `{ on }` (bolinha na mão, perto de uma lixeira), `throw` `{ dir: { x, z }, power }`.
 * Eventos: `throw` (PaperThrow) para quem está por perto.
 */
export class PaperBallActivity implements Activity {
  readonly id = PAPER_ID;
  readonly kind = PAPER_KIND;
  private state: PaperState;
  private readonly bins: MapObject[];
  private readonly streak = new Map<string, number>();
  private readonly last = new Map<string, number>();
  private readonly holding = new Set<string>();
  private readonly now: () => number;

  constructor(
    private readonly host: ActivityHost,
    opts: PaperOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.bins = host.objects("trash-bin");
    this.state = host.store.get<PaperState>(KEY, { day: paperDay(this.now()), record: null });
    this.rollDay();
  }

  snapshot(): PaperState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    if (op === "hold") this.hold(from, d.on === true);
    else if (op === "throw") this.throw(from, d);
  }

  tick(): void {
    this.rollDay();
    // quem foi embora com a bolinha na mão guarda a bolinha
    for (const id of this.holding) if (!this.binNear(id)) this.hold(id, false);
  }

  leave(id: string): void {
    this.streak.delete(id);
    this.last.delete(id);
    this.holding.delete(id);
  }

  /** Lixeira mais perto, a até PAPER.RANGE e sem parede no meio. */
  private binNear(id: string): MapObject | null {
    const p = this.host.playerPos(id);
    if (!p) return null;
    let best: MapObject | null = null;
    let bestD = Infinity;
    for (const b of this.bins) {
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      if (d < bestD && this.host.near(id, b.pos, PAPER.RANGE)) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  private hold(id: string, on: boolean): void {
    if (on && !this.binNear(id)) return;
    if (on === this.holding.has(id)) return;
    if (on) this.holding.add(id);
    else this.holding.delete(id);
    this.host.setHeld(id, on ? "paper" : null);
  }

  private throw(id: string, d: Record<string, unknown>): void {
    const now = this.now();
    if (now - (this.last.get(id) ?? -Infinity) < PAPER.COOLDOWN_MS) return;
    const dir = d.dir as { x?: unknown; z?: unknown } | undefined;
    const dx = rtNum(dir?.x, -1e3, 1e3);
    const dz = rtNum(dir?.z, -1e3, 1e3);
    const power = rtNum(d.power, 0, 1);
    if (dx === null || dz === null || power === null || Math.hypot(dx, dz) < 1e-6) return;
    const bin = this.binNear(id);
    const from = this.host.playerPos(id);
    if (!bin || !from) return;
    this.last.set(id, now);
    this.rollDay();
    const to = paperLanding(from, { x: dx, z: dz }, power);
    const result = paperOutcome(from, to, bin.pos);
    const name = this.host.playerName(id) ?? "Alguém";
    let streak = this.streak.get(id) ?? 0;
    if (result === "hit") streak++;
    else if (result !== "close") streak = 0;
    this.streak.set(id, streak);
    const best = this.state.record?.streak ?? 0;
    const record = result === "hit" && streak > best;
    if (record) {
      this.state = { day: this.state.day, record: { name, streak } };
      this.host.store.set(KEY, this.state);
      this.host.changed(this);
    }
    this.host.emote(id, "point");
    const ev: PaperThrow = { id, name, from: round(from), to: round(to), bin: bin.id, result, streak, record };
    this.host.event(this, "throw", ev, { to: this.host.players().filter((p) => this.close(p, from)), from: id });
  }

  private close(id: string, p: Vec2): boolean {
    const q = this.host.playerPos(id);
    return !!q && Math.hypot(q.x - p.x, q.z - p.z) <= SHOW_RANGE;
  }

  private rollDay(): void {
    const day = paperDay(this.now());
    if (day === this.state.day) return;
    this.state = { day, record: null };
    this.host.store.set(KEY, this.state);
    this.host.changed(this);
  }
}

const round = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 });
