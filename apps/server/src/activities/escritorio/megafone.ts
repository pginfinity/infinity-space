import { MEGAFONE_ID, MEGAFONE_KIND, MEGAFONE_MAX_MS, MEGAFONE_TEXT, escClean, type MegafoneAviso, type MegafoneState } from "@infinity/world";
import type { MesasAdmin } from "../mesas/desks.ts";
import type { Activity, ActivityHost } from "../types.ts";

export interface MegafoneOpts {
  admin?: MesasAdmin;
  /** Sem login (desenvolvimento): aceita `admin-dev`. */
  devAdmin?: boolean;
  now?: () => number;
}

/**
 * Megafone do gestor (só admin). A sala lê `snapshot().speaker` para dar à voz dessa pessoa o alcance
 * do megafone (room.ts, `updateAudiences`).
 *
 * Operações de admin: `falar` { on } (um por vez; desliga sozinho em 5 min ou quando a pessoa sai) e
 * `escrever` { text } (evento `aviso` { text, by } para todos). Para quem tenta falar com o megafone
 * ocupado: `ocupado` { name }. `admin-dev` { on } só sem login.
 */
export class MegafoneActivity implements Activity {
  readonly id = MEGAFONE_ID;
  readonly kind = MEGAFONE_KIND;
  private state: MegafoneState = { speaker: null };
  private readonly now: () => number;
  private readonly devAdmins = new Set<string>();

  constructor(
    private readonly host: ActivityHost,
    private readonly opts: MegafoneOpts = {},
  ) {
    this.now = opts.now ?? Date.now;
  }

  snapshot(): MegafoneState {
    return this.state;
  }

  leave(id: string): void {
    this.devAdmins.delete(id);
    if (this.state.speaker?.id === id) this.stop();
  }

  tick(): void {
    const s = this.state.speaker;
    if (s && this.now() - s.since >= MEGAFONE_MAX_MS) this.stop();
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as { on?: unknown; text?: unknown };
    if (op === "admin-dev") {
      if (!this.opts.devAdmin) return;
      if (d.on === false) this.devAdmins.delete(from);
      else this.devAdmins.add(from);
      return;
    }
    if (!this.devAdmins.has(from) && !this.opts.admin?.(from, this.host.playerName(from) ?? "")) return;
    const name = this.host.playerName(from) ?? "Admin";
    if (op === "falar") {
      const s = this.state.speaker;
      if (d.on !== true) return void (s?.id === from && this.stop());
      if (s?.id === from) return;
      if (s) return this.host.event(this, "ocupado", { name: s.name }, { to: [from] });
      this.state = { speaker: { id: from, name, since: this.now() } };
      this.host.changed(this);
    } else if (op === "escrever") {
      const text = escClean(d.text, MEGAFONE_TEXT, { lines: true });
      if (text) this.host.event(this, "aviso", { text, by: name } satisfies MegafoneAviso);
    }
  }

  private stop(): void {
    this.state = { speaker: null };
    this.host.changed(this);
  }
}
