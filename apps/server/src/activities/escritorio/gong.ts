import { GONG_COOLDOWN_MS, GONG_ID, GONG_KIND, GONG_RANGE, gongCleanMsg, gongMonth, type GongRing, type GongState } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "escritorio/gongo";

/**
 * Gongo: quem está perto toca (com mensagem opcional), todo mundo ouve e vê a comemoração.
 * Guarda só a contagem do mês do time inteiro.
 *
 * Operações: `ring` `{ msg?: string }`.
 * Eventos: `ring` `GongRing` (para todos).
 */
export class GongActivity implements Activity {
  readonly id = GONG_ID;
  readonly kind = GONG_KIND;
  private state: GongState;
  private lastAt = 0;
  private readonly at;

  constructor(private readonly host: ActivityHost) {
    const gong = host.objects("gong")[0];
    this.at = gong?.interact?.point ?? gong?.pos ?? { x: 0, z: 0 };
    this.state = host.store.get<GongState>(KEY, { month: gongMonth(Date.now()), count: 0, last: null });
  }

  snapshot(): GongState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "ring") return;
    const now = Date.now();
    if (now - this.lastAt < GONG_COOLDOWN_MS) return;
    if (!this.host.near(from, this.at, GONG_RANGE)) return;
    this.lastAt = now;
    const name = this.host.playerName(from) ?? "Alguém";
    const msg = gongCleanMsg((data as { msg?: unknown } | undefined)?.msg);
    const month = gongMonth(now);
    const count = (month === this.state.month ? this.state.count : 0) + 1;
    this.state = { month, count, last: { name, msg, at: now } };
    this.host.store.set(KEY, this.state);
    this.host.changed(this);
    this.host.emote(from, "cheer");
    this.host.event(this, "ring", { name, msg, count } satisfies GongRing, { from });
  }
}
