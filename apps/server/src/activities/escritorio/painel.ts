import { randomUUID } from "node:crypto";
import {
  PAINEL_DEPLOYS_TOP,
  PAINEL_ID,
  PAINEL_KIND,
  PAINEL_NOTICES_MAX,
  PAINEL_NOTICE_TEXT,
  PAINEL_RANGE,
  escClean,
  painelDeployRise,
  painelDeploys,
  painelParseBirthdays,
  painelParseGoals,
  painelPrintBirthdays,
  painelUpcoming,
  vivoDay,
  type PainelBirthday,
  type PainelDeploy,
  type PainelNotice,
  type PainelState,
  type Vec2,
} from "@infinity/world";
import type { MesasAdmin } from "../mesas/desks.ts";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "escritorio/painel";
/** De quanto em quanto tempo pergunta ao Supremacy o que subiu. */
export const PAINEL_POLL_MS = 120_000;
const DAY_CHECK_MS = 60_000;

interface Saved {
  goals: string[];
  notices: PainelNotice[];
  birthdays: PainelBirthday[];
}

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface PainelOpts {
  admin?: MesasAdmin;
  /** Sem login (desenvolvimento): aceita `admin-dev`. */
  devAdmin?: boolean;
  now?: () => number;
  /** O mesmo token de serviço só de leitura que o Hub usa; sem ele, o quadro do que subiu some. */
  supremacy?: { url: string; token: string } | null;
  fetch?: Fetch;
}

export function supremacyFromEnv(env: NodeJS.ProcessEnv): PainelOpts["supremacy"] {
  const url = env.SUPREMACY_URL?.trim().replace(/\/+$/, "");
  const token = env.SUPREMACY_SERVICE_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** "AAAA-MM-DD" de `n` dias antes de `day`. */
const daysBefore = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};

/**
 * Painel do time no Átrio. Todos veem; só admin edita (perto do painel).
 *
 * Operações: `abrir` (responde `papel` { admin, birthdays? } só para quem abriu; a lista inteira de
 * aniversários só vai para admin), e de admin `metas` { text }, `aviso` { text }, `tirar-aviso` { id },
 * `aniversarios` { text } (responde `salvo` { bad }). `admin-dev` { on } só sem login.
 * Evento para todos: `subiu` { client } quando o Supremacy conta um deploy novo de um cliente.
 */
export class PainelActivity implements Activity {
  readonly id = PAINEL_ID;
  readonly kind = PAINEL_KIND;
  private saved: Saved;
  private state: PainelState;
  private readonly at: Vec2;
  private readonly now: () => number;
  private readonly devAdmins = new Set<string>();
  private day = "";
  private nextDayCheck = 0;
  private nextPoll = 0;
  private polling = false;
  private warned = false;
  /** Lista inteira da última consulta (o quadro mostra só o topo, mas a subida conta todos). */
  private full: PainelDeploy[] | null = null;

  constructor(
    private readonly host: ActivityHost,
    private readonly opts: PainelOpts = {},
  ) {
    this.now = opts.now ?? Date.now;
    const o = host.objects("lobby-panel")[0];
    this.at = o?.interact?.point ?? o?.pos ?? { x: 0, z: 0 };
    const s = host.store.get<Partial<Saved>>(KEY, {});
    this.saved = {
      goals: Array.isArray(s.goals) ? s.goals : [],
      notices: Array.isArray(s.notices) ? s.notices : [],
      birthdays: Array.isArray(s.birthdays) ? s.birthdays : [],
    };
    this.state = { goals: this.saved.goals, notices: this.saved.notices, birthdays: [], deploys: null };
    this.refreshDay();
  }

  snapshot(): PainelState {
    return this.state;
  }

  leave(id: string): void {
    this.devAdmins.delete(id);
  }

  tick(): void {
    const now = this.now();
    if (now >= this.nextDayCheck) {
      this.nextDayCheck = now + DAY_CHECK_MS;
      if (vivoDay(now) !== this.day) {
        this.refreshDay();
        this.host.changed(this);
      }
    }
    if (this.opts.supremacy && now >= this.nextPoll) {
      this.nextPoll = now + PAINEL_POLL_MS;
      void this.poll();
    }
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as { text?: unknown; id?: unknown; on?: unknown };
    if (op === "admin-dev") {
      if (!this.opts.devAdmin) return;
      if (d.on === false) this.devAdmins.delete(from);
      else this.devAdmins.add(from);
      return this.sendRole(from);
    }
    if (op === "abrir") return this.sendRole(from);
    if (!this.isAdmin(from) || !this.host.near(from, this.at, PAINEL_RANGE)) return;
    if (op === "metas") {
      this.saved.goals = painelParseGoals(d.text);
    } else if (op === "aviso") {
      const text = escClean(d.text, PAINEL_NOTICE_TEXT, { lines: true });
      if (!text) return;
      const now = this.now();
      const notice = { id: `${now.toString(36)}${randomUUID().slice(0, 4)}`, text, at: now, by: this.host.playerName(from) ?? "Admin" };
      this.saved.notices = [notice, ...this.saved.notices].slice(0, PAINEL_NOTICES_MAX);
    } else if (op === "tirar-aviso") {
      this.saved.notices = this.saved.notices.filter((n) => n.id !== d.id);
    } else if (op === "aniversarios") {
      const { list, bad } = painelParseBirthdays(d.text);
      this.saved.birthdays = list;
      this.refreshDay();
      this.host.event(this, "salvo", { bad }, { to: [from] });
      this.sendRole(from);
    } else return;
    this.host.store.set(KEY, this.saved);
    this.state = { ...this.state, goals: this.saved.goals, notices: this.saved.notices };
    this.host.changed(this);
  }

  private isAdmin(id: string): boolean {
    return this.devAdmins.has(id) || !!this.opts.admin?.(id, this.host.playerName(id) ?? "");
  }

  private sendRole(id: string): void {
    const admin = this.isAdmin(id);
    this.host.event(this, "papel", admin ? { admin, birthdays: painelPrintBirthdays(this.saved.birthdays) } : { admin }, { to: [id] });
  }

  private refreshDay(): void {
    const now = this.now();
    this.day = vivoDay(now);
    this.state = { ...this.state, birthdays: painelUpcoming(this.saved.birthdays, now) };
  }

  /** Pergunta ao Supremacy os deploys que foram ao ar nos últimos 7 dias, por cliente. */
  async poll(): Promise<void> {
    const sup = this.opts.supremacy;
    if (!sup || this.polling) return;
    this.polling = true;
    try {
      const ate = vivoDay(this.now());
      const f = this.opts.fetch ?? (fetch as unknown as Fetch);
      const r = await f(`${sup.url}/api/deploys/por-cliente?de=${daysBefore(ate, 6)}&ate=${ate}`, { headers: { "X-Service-Token": sup.token }, signal: AbortSignal.timeout(10_000) });
      const list = r.ok ? painelDeploys(await r.json()) : null;
      if (!list) {
        if (!this.warned) console.warn(`[painel] o Supremacy respondeu ${r.status} em /api/deploys/por-cliente`);
        this.warned = true;
        return;
      }
      for (const client of painelDeployRise(this.full, list)) this.host.event(this, "subiu", { client });
      this.full = list;
      const top = list.slice(0, PAINEL_DEPLOYS_TOP);
      if (JSON.stringify(top) !== JSON.stringify(this.state.deploys)) {
        this.state = { ...this.state, deploys: top };
        this.host.changed(this);
      }
    } catch {
      // Supremacy fora do ar: o painel fica com o último número.
    } finally {
      this.polling = false;
    }
  }
}
