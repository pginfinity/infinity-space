import {
  SEGUIR_COOLDOWN_MS,
  SEGUIR_ID,
  SEGUIR_KIND,
  SEGUIR_MAX,
  SEGUIR_TTL_MS,
  seguirCycle,
  type SeguirAsk,
  type SeguirAsking,
  type SeguirEnd,
  type SeguirEndReason,
  type SeguirStart,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

interface Ask {
  to: string;
  until: number;
}

/**
 * Seguir com aceite. Um pedido aberto por pessoa; quem é seguido precisa topar em 20 s.
 * Cada pessoa segue no máximo uma; até 10 podem seguir a mesma (passeio guiado). Sem rodas.
 * O andar em si é do cliente de quem segue (poses normais, validadas pela sala como sempre).
 *
 * Operações: `ask` { to }, `accept` { from }, `decline` { from }, `cancel`, `stop` { who? }.
 * Eventos: `ask` (quem vai ser seguido), `asking` (quem pediu), `start` e `end` (os dois).
 */
export class SeguirActivity implements Activity {
  readonly id = SEGUIR_ID;
  readonly kind = SEGUIR_KIND;
  /** Pedidos abertos, por quem pediu. */
  private readonly asks = new Map<string, Ask>();
  /** Quem segue → quem é seguido. */
  private readonly follows = new Map<string, string>();
  private readonly lastAsk = new Map<string, number>();

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): null {
    return null;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as { to?: unknown; from?: unknown; who?: unknown };
    const now = this.now();
    switch (op) {
      case "ask": {
        const to = d.to;
        if (typeof to !== "string" || to === from || this.host.playerName(to) === undefined) return;
        if (now - (this.lastAsk.get(from) ?? -Infinity) < SEGUIR_COOLDOWN_MS) return;
        if (this.follows.get(from) === to) return;
        if (seguirCycle(this.follows, from, to)) {
          this.host.notify(from, `${this.nameOf(to)} já está seguindo você.`);
          return;
        }
        if (this.followersOf(to) >= SEGUIR_MAX) {
          this.host.notify(from, `${this.nameOf(to)} já tem gente demais atrás.`);
          return;
        }
        this.lastAsk.set(from, now);
        const old = this.asks.get(from);
        if (old) this.end("cancel", from, old.to);
        this.asks.set(from, { to, until: now + SEGUIR_TTL_MS });
        this.host.event(this, "ask", { from, name: this.nameOf(from), ms: SEGUIR_TTL_MS } satisfies SeguirAsk, { to: [to], from });
        this.host.event(this, "asking", { to, name: this.nameOf(to), ms: SEGUIR_TTL_MS } satisfies SeguirAsking, { to: [from] });
        break;
      }
      case "accept": {
        const a = d.from;
        if (typeof a !== "string") return;
        const ask = this.asks.get(a);
        if (!ask || ask.to !== from || now > ask.until) return;
        this.asks.delete(a);
        // As coisas podem ter mudado desde o pedido.
        if (seguirCycle(this.follows, a, from) || this.followersOf(from) >= SEGUIR_MAX) {
          this.end("declined", a, from);
          return;
        }
        const prev = this.follows.get(a);
        if (prev) {
          this.follows.delete(a);
          this.end("switched", a, prev, a);
        }
        this.follows.set(a, from);
        const start: SeguirStart = { follower: a, leader: from, followerName: this.nameOf(a), leaderName: this.nameOf(from) };
        this.host.event(this, "start", start, { to: [a, from] });
        break;
      }
      case "decline": {
        const a = d.from;
        if (typeof a !== "string") return;
        const ask = this.asks.get(a);
        if (!ask || ask.to !== from) return;
        this.asks.delete(a);
        this.end("declined", a, from);
        break;
      }
      case "cancel": {
        const ask = this.asks.get(from);
        if (!ask) return;
        this.asks.delete(from);
        this.end("cancel", from, ask.to);
        break;
      }
      case "stop": {
        // Quem segue para de seguir; quem é seguido dispensa uma pessoa (who) ou todas.
        const leader = this.follows.get(from);
        if (leader && (d.who === undefined || d.who === from)) {
          this.follows.delete(from);
          this.end("stopped", from, leader, from);
          return;
        }
        for (const [f, l] of this.follows) {
          if (l !== from || (typeof d.who === "string" && d.who !== f)) continue;
          this.follows.delete(f);
          this.end("stopped", f, from, from);
        }
        break;
      }
    }
  }

  tick(): void {
    const now = this.now();
    for (const [a, ask] of this.asks) {
      if (now <= ask.until) continue;
      this.asks.delete(a);
      this.end("expired", a, ask.to);
    }
  }

  leave(id: string): void {
    this.lastAsk.delete(id);
    for (const [a, ask] of this.asks) {
      if (a !== id && ask.to !== id) continue;
      this.asks.delete(a);
      this.end("left", a, ask.to, id);
    }
    for (const [f, l] of this.follows) {
      if (f !== id && l !== id) continue;
      this.follows.delete(f);
      this.end("left", f, l, id);
    }
  }

  /** Quem segue quem (para os testes). */
  following(id: string): string | undefined {
    return this.follows.get(id);
  }

  private followersOf(id: string): number {
    let n = 0;
    for (const l of this.follows.values()) if (l === id) n++;
    return n;
  }

  private nameOf(id: string): string {
    return this.host.playerName(id) ?? "Alguém";
  }

  private end(reason: SeguirEndReason, follower: string, leader: string, by?: string): void {
    const ev: SeguirEnd = { follower, leader, reason, ...(by ? { by } : {}) };
    this.host.event(this, "end", ev, { to: [follower, leader] });
  }
}
