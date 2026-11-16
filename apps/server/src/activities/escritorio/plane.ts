import {
  PLANE_COOLDOWN_MS,
  PLANE_ID,
  PLANE_KIND,
  PLANE_MSG_MAX,
  dist,
  escClean,
  planeDuration,
  type PlaneBusy,
  type PlaneFly,
  type PlaneLetter,
  type PlaneSent,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/**
 * Aviãozinho de papel: um recado de até 140 caracteres para alguém online. Todo mundo vê o voo
 * (sem o texto); só quem recebe ganha o recado. Um avião a cada 10 s por pessoa.
 *
 * Operações: `throw` { to, msg }.
 * Eventos: `fly` PlaneFly (todos), `letter` PlaneLetter (quem recebe), `sent` PlaneSent e `busy` PlaneBusy (quem mandou).
 */
export class PlaneActivity implements Activity {
  readonly id = PLANE_ID;
  readonly kind = PLANE_KIND;
  private seq = 0;
  private readonly last = new Map<string, number>();

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): null {
    return null;
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "throw") return;
    const d = (data ?? {}) as { to?: unknown; msg?: unknown };
    const to = d.to;
    if (typeof to !== "string" || to === from || !this.host.players().includes(to)) return;
    const msg = escClean(d.msg, PLANE_MSG_MAX, { lines: true });
    if (!msg) return;
    const now = this.now();
    const wait = (this.last.get(from) ?? -Infinity) + PLANE_COOLDOWN_MS - now;
    if (wait > 0) {
      this.host.event(this, "busy", { ms: wait } satisfies PlaneBusy, { to: [from] });
      return;
    }
    const a = this.host.playerPos(from);
    const b = this.host.playerPos(to);
    if (!a || !b) return;
    this.last.set(from, now);
    const id = ++this.seq;
    const ms = planeDuration(dist(a, b));
    this.host.emote(from, "point");
    this.host.event(this, "fly", { id, from, to, ms } satisfies PlaneFly, { from });
    this.host.event(this, "letter", { id, fromName: this.host.playerName(from) ?? "Alguém", msg, ms } satisfies PlaneLetter, { to: [to], from });
    this.host.event(this, "sent", { id, toName: this.host.playerName(to) ?? "alguém", ms } satisfies PlaneSent, { to: [from] });
  }

  leave(id: string): void {
    this.last.delete(id);
  }
}
