import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ActSnapshot } from "@infinity/world";
import type { Activity, ActivityFactory, ActivityHost } from "./types.ts";

/** Pedidos por segundo que cada pessoa pode mandar para atividades (física em tempo real cabe aqui). */
const RATE = 90;

/**
 * Carrega os pacotes de atividades (cada subpasta com `index.ts`) e distribui pedidos, tiques, entradas e saídas.
 */
export class ActivitiesManager {
  private readonly acts = new Map<string, Activity>();
  private readonly dirty = new Set<Activity>();
  private readonly budget = new Map<string, { at: number; n: number }>();

  constructor(
    private readonly host: Omit<ActivityHost, "changed">,
    private readonly broadcastAct: (snap: ActSnapshot) => void,
  ) {}

  /** Lê `activities/<pacote>/index.ts`. Um pacote quebrado não derruba os outros. */
  async load(dir = dirname(fileURLToPath(import.meta.url))): Promise<void> {
    const packs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "index.ts")));
    for (const p of packs) {
      try {
        const mod = (await import(pathToFileURL(join(dir, p.name, "index.ts")).href)) as { default?: ActivityFactory };
        if (typeof mod.default !== "function") continue;
        this.add(mod.default, p.name);
      } catch (e) {
        console.error(`[atividades] pacote ${p.name} falhou ao carregar:`, e);
      }
    }
  }

  /** Registra as atividades de uma fábrica (usado por `load` e pelos testes). */
  add(factory: ActivityFactory, label = "?"): Activity[] {
    const host: ActivityHost = { ...this.host, changed: (a) => this.dirty.add(a) };
    const list = factory(host);
    for (const a of list) {
      if (this.acts.has(a.id)) console.warn(`[atividades] id repetido: ${a.id} (pacote ${label})`);
      this.acts.set(a.id, a);
    }
    console.log(`[atividades] ${label}: ${list.length} atividade(s)`);
    return list;
  }

  get(id: string): Activity | undefined {
    return this.acts.get(id);
  }

  snapshots(): ActSnapshot[] {
    return [...this.acts.values()].map(snap);
  }

  handle(from: string, id: string, op: string, data: unknown): void {
    const a = this.acts.get(id);
    if (!a || !this.allow(from)) return;
    this.safe(a, () => a.handle(from, op, data));
    this.flush();
  }

  tick(dt: number): void {
    for (const a of this.acts.values()) if (a.tick) this.safe(a, () => a.tick!(dt));
    this.flush();
  }

  join(id: string): void {
    for (const a of this.acts.values()) if (a.join) this.safe(a, () => a.join!(id));
    this.flush();
  }

  leave(id: string): void {
    this.budget.delete(id);
    for (const a of this.acts.values()) if (a.leave) this.safe(a, () => a.leave!(id));
    this.flush();
  }

  dispose(): void {
    for (const a of this.acts.values()) this.safe(a, () => a.dispose?.());
  }

  /** Manda o estado de quem mudou. */
  flush(): void {
    if (!this.dirty.size) return;
    const list = [...this.dirty];
    this.dirty.clear();
    for (const a of list) this.broadcastAct(snap(a));
  }

  private allow(id: string): boolean {
    const now = Date.now();
    const b = this.budget.get(id);
    if (!b || now - b.at >= 1000) {
      this.budget.set(id, { at: now, n: 1 });
      return true;
    }
    return ++b.n <= RATE;
  }

  private safe(a: Activity, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      console.error(`[atividades] erro em ${a.id}:`, e);
    }
  }
}

function snap(a: Activity): ActSnapshot {
  return { id: a.id, kind: a.kind, state: a.snapshot() };
}
