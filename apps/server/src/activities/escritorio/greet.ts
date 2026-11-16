import {
  GREET_COOLDOWN_MS,
  GREET_EMOTE,
  GREET_ID,
  GREET_KIND,
  GREET_SERVER_RANGE,
  GREET_TTL_MS,
  greetIsKind,
  type GreetEnd,
  type GreetGo,
  type GreetInvite,
  type GreetKind,
  type GreetPending,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

interface Invite {
  to: string;
  kind: GreetKind;
  until: number;
}

/**
 * Toca aqui, brinde e abraço. Um convida quem está pertinho (um convite por vez), o outro aceita
 * em até 8 s; aí os dois fazem o gesto (emotes existentes) e todo mundo vê o efeito.
 *
 * Operações: `invite` { to, kind }, `accept` { from }, `decline` { from }, `cancel`.
 * Eventos: `invite` (convidado), `pending` (quem convidou), `go` (todos),
 * `declined` / `expired` / `cancel` GreetEnd (os dois).
 */
export class GreetActivity implements Activity {
  readonly id = GREET_ID;
  readonly kind = GREET_KIND;
  /** Convites abertos, por quem convidou. */
  private readonly invites = new Map<string, Invite>();
  private readonly lastInvite = new Map<string, number>();

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): null {
    return null;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as { to?: unknown; from?: unknown; kind?: unknown };
    const now = this.now();
    if (op === "invite") {
      const to = d.to;
      if (typeof to !== "string" || to === from || !greetIsKind(d.kind)) return;
      if (now - (this.lastInvite.get(from) ?? -Infinity) < GREET_COOLDOWN_MS) return;
      if (!this.close(from, to)) return;
      this.lastInvite.set(from, now);
      const old = this.invites.get(from);
      if (old && old.to !== to) this.end("cancel", from, old.to);
      this.invites.set(from, { to, kind: d.kind, until: now + GREET_TTL_MS });
      const ms = GREET_TTL_MS;
      this.host.event(this, "invite", { from, name: this.host.playerName(from) ?? "Alguém", kind: d.kind, ms } satisfies GreetInvite, { to: [to], from });
      this.host.event(this, "pending", { to, name: this.host.playerName(to) ?? "alguém", kind: d.kind, ms } satisfies GreetPending, { to: [from] });
    } else if (op === "accept") {
      const a = d.from;
      if (typeof a !== "string") return;
      const inv = this.invites.get(a);
      if (!inv || inv.to !== from || now > inv.until) return;
      this.invites.delete(a);
      // Um pouco mais de folga: quem aceitou pode ter dado um passo.
      if (!this.close(a, from, 0.6)) {
        this.end("expired", a, from);
        return;
      }
      const e = GREET_EMOTE[inv.kind];
      this.host.emote(a, e);
      this.host.emote(from, e);
      this.host.event(this, "go", { a, b: from, kind: inv.kind } satisfies GreetGo);
    } else if (op === "decline") {
      const a = d.from;
      if (typeof a !== "string") return;
      const inv = this.invites.get(a);
      if (!inv || inv.to !== from) return;
      this.invites.delete(a);
      this.end("declined", a, from);
    } else if (op === "cancel") {
      const inv = this.invites.get(from);
      if (!inv) return;
      this.invites.delete(from);
      this.end("cancel", from, inv.to);
    }
  }

  tick(): void {
    if (!this.invites.size) return;
    const now = this.now();
    for (const [a, inv] of this.invites) {
      if (now <= inv.until) continue;
      this.invites.delete(a);
      this.end("expired", a, inv.to);
    }
  }

  leave(id: string): void {
    this.lastInvite.delete(id);
    for (const [a, inv] of this.invites) {
      if (a !== id && inv.to !== id) continue;
      this.invites.delete(a);
      this.end("cancel", a, inv.to);
    }
  }

  /** As duas pessoas estão pertinho e sem parede no meio? */
  private close(a: string, b: string, slack = 0): boolean {
    const pb = this.host.playerPos(b);
    return !!pb && this.host.near(a, pb, GREET_SERVER_RANGE + slack);
  }

  private end(ev: "declined" | "expired" | "cancel", from: string, to: string): void {
    this.host.event(this, ev, { from, to } satisfies GreetEnd, { to: [from, to] });
  }
}
