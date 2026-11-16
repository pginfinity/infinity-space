import { randomUUID } from "node:crypto";
import {
  MESAS_ID,
  MESAS_KIND,
  MESAS_NOTE_COOLDOWN_MS,
  MESAS_NOTE_MAX,
  MESAS_NOTE_RANGE,
  MESAS_PEOPLE_MAX,
  MESAS_SEAT_RANGE,
  escClean,
  mesasAddNote,
  mesasCheckin,
  mesasCheckout,
  mesasCleanItems,
  mesasDesks,
  mesasKey,
  mesasLabel,
  mesasNotesOf,
  mesasOwner,
  mesasPruneNotes,
  mesasPurge,
  mesasRemoveNote,
  mesasRestore,
  mesasRestoreNotes,
  mesasSetFixed,
  mesasSetItems,
  type MesasDesk,
  type MesasNote,
  type MesasPrivate,
  type MesasState,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY_STATE = "mesas/estado";
const KEY_NOTES = "mesas/recados";
const KEY_LAST = "mesas/ultima";

/** Quem pode marcar mesas fixas (a sala não conta o papel da conta às atividades; ver admin.ts). */
export type MesasAdmin = (id: string, name: string) => boolean;

interface Req {
  desk?: unknown;
  text?: unknown;
  id?: unknown;
  items?: unknown;
  name?: unknown;
  on?: unknown;
}

/** Recusas que o cliente explica num aviso. */
export type MesasRefusal = "longe" | "fixa" | "sua-fixa" | "ocupada" | "livre" | "propria" | "espera" | "limite" | "sem-ultima" | "admin" | "vazio";

/**
 * Mesas de trabalho: check-in nas rotativas, mesas fixas (admin), objetos pessoais e recados.
 *
 * Estado público (`snapshot`): de quem é cada mesa hoje, as fixas e os objetos de cada pessoa.
 * Recados vão só para a dona e para quem escreveu (evento `privado`, por pessoa).
 *
 * Operações:
 * - `checkin` { desk }: sentado na cadeira da mesa. `checkin-ultima`: na última mesa usada, de onde estiver.
 * - `checkout`: libera a mesa do check-in.
 * - `objetos` { items }: até três objetos do catálogo.
 * - `recado` { desk, text }: perto da mesa de alguém. `apagar` { id }: a dona ou quem escreveu.
 * - `fixar` { desk, name }: admin; nome vazio desfaz.
 * - `admin-dev` { on }: só com o login desligado (desenvolvimento), libera as ações de admin para esta conexão.
 *
 * Eventos: `privado` (MesasPrivate, só para a pessoa), `ok` { op, desk? } e `recusa` { code, name?, ms? }.
 */
export class MesasActivity implements Activity {
  readonly id = MESAS_ID;
  readonly kind = MESAS_KIND;
  private state: MesasState;
  private notes: MesasNote[];
  private last: Record<string, string>;
  private readonly desks = new Map<string, MesasDesk>();
  /** Chave (nome) que cada conexão tinha da última vez (para reenviar o privado se o nome mudar). */
  private readonly seen = new Map<string, string>();
  /** Último recado de cada pessoa (pelo nome: reconectar não zera a espera). */
  private readonly lastNote = new Map<string, number>();
  private readonly devAdmins = new Set<string>();
  private acc = 0;
  private pruneAcc = 0;

  constructor(
    private readonly host: ActivityHost,
    private readonly opts: { admin?: MesasAdmin; now?: () => number; devAdmin?: boolean } = {},
  ) {
    for (const d of mesasDesks(host.map)) this.desks.set(d.id, d);
    const ids = new Set(this.desks.keys());
    this.state = mesasPurge(mesasRestore(host.store.get(KEY_STATE, null), ids), this.now());
    this.notes = mesasPruneNotes(mesasRestoreNotes(host.store.get(KEY_NOTES, [])), this.now());
    const last = host.store.get<Record<string, string>>(KEY_LAST, {});
    this.last = {};
    if (last && typeof last === "object") for (const [k, v] of Object.entries(last)) if (typeof v === "string" && ids.has(v)) this.last[k] = v;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  snapshot(): MesasState {
    return this.state;
  }

  join(id: string): void {
    this.sendPrivate([id]);
  }

  leave(id: string): void {
    this.seen.delete(id);
    this.devAdmins.delete(id);
  }

  tick(dt: number): void {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    const now = this.now();
    // Meia-noite: os check-ins do dia acabam.
    const next = mesasPurge(this.state, now);
    if (next !== this.state) this.commit(next);
    // Nome mudou (login desligado): os recados e o resto pessoal são outros.
    for (const id of this.host.players()) {
      const name = this.host.playerName(id);
      if (name !== undefined && this.seen.get(id) !== mesasKey(name)) this.sendPrivate([id]);
    }
    this.pruneAcc += 1;
    if (this.pruneAcc >= 3600) {
      this.pruneAcc = 0;
      for (const [k, at] of this.lastNote) if (now - at > MESAS_NOTE_COOLDOWN_MS) this.lastNote.delete(k);
      const pruned = mesasPruneNotes(this.notes, now);
      if (pruned !== this.notes) this.saveNotes(pruned, new Set(this.notes.filter((n) => !pruned.includes(n)).flatMap((n) => [n.to, n.from])));
    }
  }

  handle(from: string, op: string, data: unknown): void {
    const name = this.host.playerName(from);
    if (!name) return;
    const key = mesasKey(name);
    const d = (data ?? {}) as Req;
    const now = this.now();
    switch (op) {
      case "checkin": {
        const desk = this.desk(d.desk);
        if (!desk) return;
        if (!this.host.near(from, desk.seat, MESAS_SEAT_RANGE)) return this.refuse(from, "longe");
        return this.checkin(from, key, name, desk, now);
      }
      case "checkin-ultima": {
        const desk = this.desk(this.last[key]);
        if (!desk) return this.refuse(from, "sem-ultima");
        return this.checkin(from, key, name, desk, now);
      }
      case "checkout": {
        const next = mesasCheckout(this.state, key);
        if (next === this.state) return;
        this.commit(next);
        this.host.event(this, "ok", { op: "checkout" }, { to: [from] });
        return;
      }
      case "objetos": {
        if (!(key in this.state.items) && Object.keys(this.state.items).length >= MESAS_PEOPLE_MAX) return;
        const next = mesasSetItems(this.state, key, mesasCleanItems(d.items));
        if (next !== this.state) this.commit(next);
        return;
      }
      case "recado": {
        const desk = this.desk(d.desk);
        if (!desk) return;
        if (!this.host.near(from, desk.pos, MESAS_NOTE_RANGE) && !this.host.near(from, desk.seat, MESAS_NOTE_RANGE)) return this.refuse(from, "longe");
        const owner = mesasOwner(this.state, desk.id, now);
        if (!owner) return this.refuse(from, "livre");
        const to = mesasKey(owner.name);
        if (to === key) return this.refuse(from, "propria");
        const text = escClean(d.text, MESAS_NOTE_MAX);
        if (!text) return this.refuse(from, "vazio");
        const wait = (this.lastNote.get(key) ?? -Infinity) + MESAS_NOTE_COOLDOWN_MS - now;
        if (wait > 0) return this.refuse(from, "espera", { ms: wait });
        const note: MesasNote = { id: `${now.toString(36)}${randomUUID().slice(0, 6)}`, to, toName: owner.name, from: key, fromName: name, desk: desk.id, text, at: now };
        const r = mesasAddNote(this.notes, note);
        if (r.error) return this.refuse(from, "limite", { name: owner.name });
        this.lastNote.set(key, now);
        this.saveNotes(r.notes, new Set([to, key]));
        this.host.event(this, "ok", { op: "recado", desk: desk.id }, { to: [from] });
        return;
      }
      case "apagar": {
        if (typeof d.id !== "string") return;
        const n = this.notes.find((x) => x.id === d.id);
        const next = mesasRemoveNote(this.notes, d.id, key);
        if (next === this.notes || !n) return;
        this.saveNotes(next, new Set([n.to, n.from]));
        return;
      }
      case "fixar": {
        if (!this.isAdmin(from, name)) return this.refuse(from, "admin");
        const desk = this.desk(d.desk);
        if (!desk) return;
        const who = escClean(d.name, 32);
        const before = mesasOwner(this.state, desk.id, now);
        const next = mesasSetFixed(this.state, desk.id, who);
        if (next === this.state) return;
        this.commit(next);
        // Quem tinha check-in ali perde o lugar: avisa.
        if (who && before && !before.fixed && mesasKey(before.name) !== mesasKey(who)) {
          for (const id of this.idsOf(mesasKey(before.name))) this.host.notify(id, `Sua mesa (${mesasLabel(desk)}) agora é fixa de ${who}. Escolha outra mesa livre.`);
        }
        this.host.event(this, "ok", { op: "fixar", desk: desk.id }, { to: [from] });
        return;
      }
      case "admin-dev": {
        if (!this.opts.devAdmin) return;
        if (d.on === false) this.devAdmins.delete(from);
        else this.devAdmins.add(from);
        this.sendPrivate([from]);
        return;
      }
    }
  }

  private checkin(from: string, key: string, name: string, desk: MesasDesk, now: number): void {
    const r = mesasCheckin(this.state, desk.id, name, now);
    if (r.error === "ja-sua") return;
    if (r.error) return this.refuse(from, r.error, { name: mesasOwner(this.state, desk.id, now)?.name });
    this.commit(r.state);
    if (this.last[key] !== desk.id) {
      const last = { ...this.last, [key]: desk.id };
      const keys = Object.keys(last);
      if (keys.length > MESAS_PEOPLE_MAX) delete last[keys[0]!];
      this.last = last;
      this.host.store.set(KEY_LAST, this.last);
      this.sendPrivate(this.idsOf(key));
    }
    this.host.event(this, "ok", { op: "checkin", desk: desk.id }, { to: [from] });
  }

  private desk(id: unknown): MesasDesk | undefined {
    return typeof id === "string" ? this.desks.get(id) : undefined;
  }

  private commit(next: MesasState): void {
    this.state = next;
    this.host.store.set(KEY_STATE, next);
    this.host.changed(this);
  }

  private saveNotes(next: MesasNote[], keys: Set<string>): void {
    this.notes = next;
    this.host.store.set(KEY_NOTES, next);
    const ids: string[] = [];
    for (const k of keys) ids.push(...this.idsOf(k));
    this.sendPrivate(ids);
  }

  private refuse(to: string, code: MesasRefusal, extra: { name?: string | undefined; ms?: number } = {}): void {
    this.host.event(this, "recusa", { code, ...(extra.name ? { name: extra.name } : {}), ...(extra.ms ? { ms: Math.ceil(extra.ms) } : {}) }, { to: [to] });
  }

  /** Conexões abertas de uma pessoa (a mesma pessoa pode estar em dois aparelhos). */
  private idsOf(key: string): string[] {
    return this.host.players().filter((id) => {
      const n = this.host.playerName(id);
      return n !== undefined && mesasKey(n) === key;
    });
  }

  private isAdmin(id: string, name: string): boolean {
    return this.devAdmins.has(id) || !!this.opts.admin?.(id, name);
  }

  /** Manda a cada conexão só o que é dela: recados para ela, recados que deixou, última mesa e se é admin. */
  private sendPrivate(ids: Iterable<string>): void {
    for (const id of new Set(ids)) {
      const name = this.host.playerName(id);
      if (name === undefined) continue;
      const key = mesasKey(name);
      this.seen.set(id, key);
      const { inbox, sent } = mesasNotesOf(this.notes, key);
      const data: MesasPrivate = { inbox, sent, last: this.last[key] ?? null, admin: this.isAdmin(id, name) };
      this.host.event(this, "privado", data, { to: [id] });
    }
  }
}
