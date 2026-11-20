import { QUADRO_ID, QUADRO_KIND, QUADRO_MAX_BYTES, QUADRO_MAX_ELEMENTS, quadroClean, quadroNewer, recGroup, recordable, type QuadroElement, type QuadroState } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

interface Board {
  els: Map<string, QuadroElement>;
  sizes: Map<string, number>;
  bytes: number;
}

/**
 * Quadro branco das salas. Só quem está numa sala de reunião (ou no auditório) abre o quadro dela;
 * o desenho não sai da sala (porta fechada continua fechada para o quadro).
 *
 * Operações: `abrir` → evento `cena` { group, elements } só para quem abriu · `mudar` { elements }
 * (só o que mudou; ganha a versão maior) → evento `mudou` { elements } para os outros com o mesmo
 * quadro aberto · `fechar`. Guarda cada quadro em `quadro/<sala>`.
 */
export class QuadroActivity implements Activity {
  readonly id = QUADRO_ID;
  readonly kind = QUADRO_KIND;
  private readonly boards = new Map<string, Board>();
  /** Quem está com qual quadro aberto. */
  private readonly viewers = new Map<string, string>();

  constructor(private readonly host: ActivityHost) {}

  snapshot(): QuadroState {
    const open: Record<string, number> = {};
    for (const g of this.viewers.values()) open[g] = (open[g] ?? 0) + 1;
    return { open };
  }

  leave(id: string): void {
    if (this.viewers.delete(id)) this.host.changed(this);
  }

  handle(from: string, op: string, data: unknown): void {
    if (op === "fechar") return this.leave(from);
    const zone = this.host.playerZone(from);
    const group = recordable(zone) ? recGroup(zone) : null;
    if (op === "abrir") {
      if (!group) return;
      if (this.viewers.get(from) !== group) {
        this.viewers.set(from, group);
        this.host.changed(this);
      }
      this.host.event(this, "cena", { group, elements: [...this.board(group).els.values()] }, { to: [from] });
    } else if (op === "mudar") {
      // Saiu da sala com o quadro aberto: não desenha mais nele.
      if (!group || this.viewers.get(from) !== group) return;
      const list = (data as { elements?: unknown } | null)?.elements;
      if (!Array.isArray(list)) return;
      const b = this.board(group);
      const accepted: QuadroElement[] = [];
      for (const raw of list.slice(0, 500)) {
        const c = quadroClean(raw);
        if (!c || !quadroNewer(c.el, b.els.get(c.el.id))) continue;
        const old = b.sizes.get(c.el.id);
        if (old === undefined && b.els.size >= QUADRO_MAX_ELEMENTS) continue;
        if (b.bytes - (old ?? 0) + c.bytes > QUADRO_MAX_BYTES) continue;
        b.els.set(c.el.id, c.el);
        b.sizes.set(c.el.id, c.bytes);
        b.bytes += c.bytes - (old ?? 0);
        accepted.push(c.el);
      }
      if (accepted.length === 0) return;
      this.host.store.set(`quadro/${group}`, [...b.els.values()]);
      const others = [...this.viewers].filter(([id, g]) => g === group && id !== from).map(([id]) => id);
      if (others.length > 0) this.host.event(this, "mudou", { elements: accepted }, { to: others });
    }
  }

  private board(group: string): Board {
    let b = this.boards.get(group);
    if (!b) {
      b = { els: new Map(), sizes: new Map(), bytes: 0 };
      for (const raw of this.host.store.get<unknown[]>(`quadro/${group}`, [])) {
        const c = quadroClean(raw);
        if (!c) continue;
        b.els.set(c.el.id, c.el);
        b.sizes.set(c.el.id, c.bytes);
        b.bytes += c.bytes;
      }
      this.boards.set(group, b);
    }
    return b;
  }
}
