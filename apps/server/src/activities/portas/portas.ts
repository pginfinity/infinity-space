import {
  DOOR_STATES,
  PORTAS,
  PORTAS_ID,
  PORTAS_KIND,
  circleCandidates,
  circleCanAsk,
  circleKeep,
  circleShape,
  doorsOf,
  nearestDoor,
  portasCleanNote,
  type CircleSnap,
  type DoorDef,
  type DoorSnap,
  type DoorState,
  type PortasPerson,
  type PortasState,
  type PrivacyRules,
  type Vec2,
  type Zone,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/**
 * O que a sala do mundo (room.ts) usa da privacidade de conversa:
 * regras de audição, validação de pose e quando recalcular as audiências na hora.
 */
export interface PrivacySource {
  /** Regras de audição de agora (portas fechadas, rodas e sussurros). Mesmo objeto até algo mudar. */
  privacy(): PrivacyRules;
  /** A pessoa pode estar nesta zona? (sala de porta fechada ou trancada só para quem foi admitido) */
  mayStand(id: string, zone: Zone | undefined): boolean;
  /** Ponto andável do lado de fora da porta de uma sala (a entrada mais perto de `from`, se houver mais de uma). */
  exitOf(zoneId: string, from?: Vec2): Vec2 | undefined;
  /** Chamado quando a privacidade muda (porta, roda, sussurro), para as audiências não esperarem o tique. */
  onPrivacyChange(fn: () => void): void;
}

interface Request {
  name: string;
  at: number;
}

interface DoorLive {
  zoneId: string;
  /** Entradas físicas da sala (uma ou mais), todas com o mesmo estado. */
  defs: DoorDef[];
  state: DoorState;
  admitted: Set<string>;
  note: string;
  knocks: Map<string, Request>;
  emptySince: number | null;
}

interface CircleLive {
  id: string;
  members: string[];
  asks: Map<string, Request>;
  center: Vec2;
  radius: number;
}

const str = (v: unknown, max = 64): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const field = (data: unknown, k: string): unknown => (data && typeof data === "object" ? (data as Record<string, unknown>)[k] : undefined);

/**
 * Portas das salas, roda fechada e sussurro (atividade "portas").
 *
 * Operações:
 * - `porta` { zone, state }: quem está dentro troca o estado (aberta, fechada, trancada).
 * - `bilhete` { zone, text }: quem está dentro escreve o bilhete da porta (vazio apaga).
 * - `bater` { zone }: quem está perto da porta, do lado de fora, bate.
 * - `atender` { zone, who, ok }: quem está dentro deixa entrar (ok) ou responde "agora não".
 * - `roda` { with? }: fecha a roda com quem está perto · `roda-abrir` · `roda-sair`.
 * - `roda-pedir` { circle } · `roda-atender` { circle, who, ok }.
 * - `sussurro` { to } (ao apertar a tecla) · `sussurro-fim` (ao soltar).
 *
 * Eventos só para quem interessa: `bateu`, `batida`, `nao-perturbe`, `aberta`, `entrar`, `agora-nao`,
 * `sem-resposta`, `roda-fechada`, `roda-aberta`, `roda-sozinho`, `roda-pedido`, `roda-entrou`,
 * `roda-recusou`, `sussurro` { from, on } (para quem recebe) e `sussurro-ok` (para quem sussurra).
 * Quem sussurra para quem nunca vai no estado: só as duas pessoas sabem.
 */
export class PortasActivity implements Activity, PrivacySource {
  readonly id = PORTAS_ID;
  readonly kind = PORTAS_KIND;
  private readonly doors = new Map<string, DoorLive>();
  private circles: CircleLive[] = [];
  private readonly whispers = new Map<string, string>();
  private readonly lastKnock = new Map<string, number>();
  private readonly lastAsk = new Map<string, number>();
  private rules: PrivacyRules | null = null;
  private refresh: (() => void) | null = null;
  private seq = 0;

  constructor(private readonly host: ActivityHost) {
    for (const def of doorsOf(host.map)) {
      const d = this.doors.get(def.zoneId);
      if (d) d.defs.push(def);
      else this.doors.set(def.zoneId, { zoneId: def.zoneId, defs: [def], state: "open", admitted: new Set(), note: "", knocks: new Map(), emptySince: null });
    }
  }

  // ---- PrivacySource -------------------------------------------------------------------------

  privacy(): PrivacyRules {
    if (!this.rules) {
      const doors = new Map<string, ReadonlySet<string>>();
      for (const [zone, d] of this.doors) if (d.state !== "open") doors.set(zone, new Set(d.admitted));
      const circles = new Map<string, string>();
      for (const c of this.circles) for (const m of c.members) circles.set(m, c.id);
      this.rules = { doors, circles, whispers: new Map(this.whispers) };
    }
    return this.rules;
  }

  mayStand(id: string, zone: Zone | undefined): boolean {
    const d = zone ? this.doors.get(zone.id) : undefined;
    return !d || d.state === "open" || d.admitted.has(id);
  }

  exitOf(zoneId: string, from?: Vec2): Vec2 | undefined {
    const d = this.doors.get(zoneId);
    return d ? nearestDoor(d.defs, zoneId, from)?.outside : undefined;
  }

  /** Distância até a entrada mais perto da sala. */
  private doorDistance(d: DoorLive, p: Vec2): number {
    const n = nearestDoor(d.defs, d.zoneId, p);
    return n ? Math.hypot(p.x - n.pos.x, p.z - n.pos.z) : Infinity;
  }

  onPrivacyChange(fn: () => void): void {
    this.refresh = fn;
  }

  // ---- Activity ------------------------------------------------------------------------------

  snapshot(): PortasState {
    const doors: Record<string, DoorSnap> = {};
    for (const [zone, d] of this.doors) {
      doors[zone] = {
        state: d.state,
        admitted: d.state === "open" ? [] : [...d.admitted],
        note: d.note,
        knocks: [...d.knocks].map(([id, r]) => ({ id, name: r.name, at: r.at })),
      };
    }
    const circles: CircleSnap[] = this.circles.map((c) => ({
      id: c.id,
      members: [...c.members],
      center: c.center,
      radius: c.radius,
      asks: [...c.asks].map(([id, r]) => ({ id, name: r.name, at: r.at })),
    }));
    return { doors, circles };
  }

  handle(from: string, op: string, data: unknown): void {
    switch (op) {
      case "porta":
        return this.setDoor(from, str(field(data, "zone")), field(data, "state"));
      case "bilhete":
        return this.setNote(from, str(field(data, "zone")), field(data, "text"));
      case "bater":
        return this.knock(from, str(field(data, "zone")));
      case "atender":
        return this.answer(from, str(field(data, "zone")), str(field(data, "who")), field(data, "ok") === true);
      case "roda":
        return this.closeCircle(from, field(data, "with"));
      case "roda-abrir":
        return this.openCircle(from);
      case "roda-sair":
        return this.leaveCircle(from, true);
      case "roda-pedir":
        return this.ask(from, str(field(data, "circle")));
      case "roda-atender":
        return this.answerAsk(from, str(field(data, "circle")), str(field(data, "who")), field(data, "ok") === true);
      case "sussurro":
        return this.whisper(from, field(data, "to"));
      case "sussurro-fim":
        return this.endWhisper(from);
    }
  }

  tick(): void {
    const now = Date.now();
    let changed = false;
    let privacy = false;
    const zoneOf = new Map<string, string | undefined>();
    for (const id of this.host.players()) zoneOf.set(id, this.host.playerZone(id)?.id);

    for (const [zone, d] of this.doors) {
      let inside = 0;
      for (const z of zoneOf.values()) if (z === zone) inside++;
      // Sala vazia por um tempinho volta a "aberta", sem bilhete (cobre quem sai e volta na hora).
      if (inside === 0 && (d.state !== "open" || d.note || d.knocks.size)) {
        d.emptySince ??= now;
        if (now - d.emptySince >= PORTAS.emptyMs) {
          for (const id of d.knocks.keys()) this.tell(id, "aberta", { zone });
          privacy ||= d.state !== "open";
          this.reset(d);
          changed = true;
        }
      } else d.emptySince = null;
      // Batidas sem resposta, de quem foi embora ou de quem se afastou da porta.
      for (const [id, k] of d.knocks) {
        const pos = this.host.playerPos(id);
        const expired = now - k.at > PORTAS.knockTtlMs;
        if (!pos || expired || this.doorDistance(d, pos) > 8) {
          d.knocks.delete(id);
          if (pos && expired) this.tell(id, "sem-resposta", { zone });
          changed = true;
        }
      }
    }

    // Rodas: quem se afastou de todos ou entrou numa sala sai; com menos de duas pessoas, a roda some.
    if (this.circles.length) {
      const next: CircleLive[] = [];
      for (const c of this.circles) {
        const people = c.members.map((id) => this.person(id)).filter((p): p is PortasPerson => !!p);
        const keep = circleKeep(this.host.map.walls, people);
        if (keep.length !== c.members.length) {
          changed = privacy = true;
          for (const id of c.members) if (!keep.includes(id)) this.tell(id, "roda-saiu", {});
        }
        if (keep.length < 2) {
          for (const id of keep) this.tell(id, "roda-aberta", {});
          continue;
        }
        c.members = keep;
        const shape = circleShape(keep.map((id) => this.host.playerPos(id)!));
        // O anel só é reenviado quando muda de verdade (ninguém precisa de 15 estados por segundo).
        if (Math.hypot(shape.center.x - c.center.x, shape.center.z - c.center.z) > 0.15 || Math.abs(shape.radius - c.radius) > 0.1) {
          c.center = shape.center;
          c.radius = shape.radius;
          changed = true;
        }
        for (const [id, a] of c.asks) {
          const p = this.person(id);
          if (!p || now - a.at > PORTAS.askTtlMs || !circleCanAsk(c, p.pos, p.zone) || this.circleOf(id)) {
            c.asks.delete(id);
            changed = true;
          }
        }
        next.push(c);
      }
      this.circles = next;
    }

    if (privacy) this.privacyChanged();
    if (changed) this.host.changed(this);
  }

  leave(id: string): void {
    let privacy = false;
    for (const d of this.doors.values()) {
      if (d.admitted.delete(id)) privacy = true;
      d.knocks.delete(id);
    }
    for (const c of this.circles) c.asks.delete(id);
    if (this.circleOf(id)) {
      this.leaveCircle(id, true);
      privacy = true;
    }
    if (this.whispers.delete(id)) privacy = true;
    this.lastKnock.delete(id);
    this.lastAsk.delete(id);
    if (privacy) this.privacyChanged();
    this.host.changed(this);
  }

  // ---- portas --------------------------------------------------------------------------------

  /** Quem está dentro da sala agora. */
  private insiders(zone: string): string[] {
    return this.host.players().filter((id) => this.host.playerZone(id)?.id === zone);
  }

  /** Está dentro da sala e pode estar lá. */
  private isInside(id: string, d: DoorLive): boolean {
    return this.host.playerZone(id)?.id === d.zoneId && (d.state === "open" || d.admitted.has(id));
  }

  private setDoor(from: string, zone: string | null, state: unknown): void {
    const d = zone ? this.doors.get(zone) : undefined;
    if (!d || !DOOR_STATES.includes(state as DoorState) || !this.isInside(from, d)) return;
    const next = state as DoorState;
    if (next === d.state) return;
    const inside = this.insiders(d.zoneId);
    if (next === "open") {
      for (const id of d.knocks.keys()) this.tell(id, "aberta", { zone });
      d.knocks.clear();
      d.admitted.clear();
    } else if (next === "locked") {
      // Não perturbe: só quem está dentro agora fica (quem tinha saído um instante perde o acesso).
      for (const id of d.knocks.keys()) this.tell(id, "nao-perturbe", { zone });
      d.knocks.clear();
      d.admitted = new Set(inside);
    } else {
      // Fechada: quem está dentro agora (e quem já tinha sido admitido) pode entrar e sair.
      if (d.state === "open") d.admitted = new Set(inside);
      else for (const id of inside) d.admitted.add(id);
    }
    d.state = next;
    d.emptySince = null;
    this.privacyChanged();
    this.host.changed(this);
  }

  private setNote(from: string, zone: string | null, text: unknown): void {
    const d = zone ? this.doors.get(zone) : undefined;
    if (!d || !this.isInside(from, d)) return;
    const note = portasCleanNote(text);
    if (note === d.note) return;
    d.note = note;
    this.host.changed(this);
  }

  private knock(from: string, zone: string | null): void {
    const d = zone ? this.doors.get(zone) : undefined;
    if (!d || this.host.playerZone(from)?.id === d.zoneId) return;
    if (!d.defs.some((def) => this.host.near(from, def.pos, PORTAS.knockRange))) return;
    if (d.state === "open") return this.tell(from, "aberta", { zone });
    if (d.state === "locked") return this.tell(from, "nao-perturbe", { zone, note: d.note });
    if (d.admitted.has(from)) return this.tell(from, "entrar", { zone, by: "" });
    const now = Date.now();
    if (now - (this.lastKnock.get(from) ?? 0) < PORTAS.knockCooldownMs) return;
    this.lastKnock.set(from, now);
    const name = this.host.playerName(from) ?? "Alguém";
    d.knocks.set(from, { name, at: now });
    this.tell(from, "batida", { zone });
    this.host.event(this, "bateu", { zone, name }, { to: this.insiders(d.zoneId).filter((id) => d.admitted.has(id)), from });
    this.host.changed(this);
  }

  private answer(from: string, zone: string | null, who: string | null, ok: boolean): void {
    const d = zone ? this.doors.get(zone) : undefined;
    if (!d || !who || d.state === "open" || !this.isInside(from, d) || !d.knocks.has(who)) return;
    d.knocks.delete(who);
    const by = this.host.playerName(from) ?? "Alguém";
    if (ok) {
      d.admitted.add(who);
      this.tell(who, "entrar", { zone, by });
      this.privacyChanged();
    } else this.tell(who, "agora-nao", { zone, by });
    this.host.changed(this);
  }

  private reset(d: DoorLive): void {
    d.state = "open";
    d.admitted.clear();
    d.note = "";
    d.knocks.clear();
    d.emptySince = null;
  }

  // ---- roda fechada --------------------------------------------------------------------------

  private person(id: string): PortasPerson | undefined {
    const pos = this.host.playerPos(id);
    return pos ? { id, pos, zone: this.host.playerZone(id) } : undefined;
  }

  private circleOf(id: string): CircleLive | undefined {
    return this.circles.find((c) => c.members.includes(id));
  }

  private closeCircle(from: string, wanted: unknown): void {
    const me = this.person(from);
    if (!me || this.circleOf(from)) return;
    const taken = new Set(this.circles.flatMap((c) => c.members));
    const people = this.host.players().map((id) => this.person(id)).filter((p): p is PortasPerson => !!p);
    let others = circleCandidates(this.host.map.walls, me, people, taken);
    // A pessoa fecha a roda com quem viu na tela (quem chegou depois do clique não entra por tabela).
    if (Array.isArray(wanted)) others = others.filter((id) => wanted.includes(id));
    if (others.length === 0) return this.tell(from, "roda-sozinho", {});
    const members = [from, ...others];
    const shape = circleShape(members.map((id) => this.host.playerPos(id)!));
    this.circles.push({ id: `roda-${++this.seq}`, members, asks: new Map(), ...shape });
    const by = this.host.playerName(from) ?? "Alguém";
    this.host.event(this, "roda-fechada", { by }, { to: members, from });
    this.privacyChanged();
    this.host.changed(this);
  }

  private openCircle(from: string): void {
    const c = this.circleOf(from);
    if (!c) return;
    this.circles = this.circles.filter((x) => x !== c);
    const by = this.host.playerName(from) ?? "Alguém";
    this.host.event(this, "roda-aberta", { by }, { to: c.members, from });
    this.privacyChanged();
    this.host.changed(this);
  }

  private leaveCircle(id: string, notify: boolean): void {
    const c = this.circleOf(id);
    if (!c) return;
    c.members = c.members.filter((m) => m !== id);
    if (c.members.length < 2) {
      this.circles = this.circles.filter((x) => x !== c);
      if (notify) this.host.event(this, "roda-aberta", {}, { to: c.members });
    }
    this.privacyChanged();
    this.host.changed(this);
  }

  private ask(from: string, circle: string | null): void {
    const c = this.circles.find((x) => x.id === circle);
    const me = this.person(from);
    if (!c || !me || this.circleOf(from) || c.asks.has(from) || !circleCanAsk(c, me.pos, me.zone)) return;
    const now = Date.now();
    if (now - (this.lastAsk.get(from) ?? 0) < PORTAS.knockCooldownMs) return;
    this.lastAsk.set(from, now);
    const name = this.host.playerName(from) ?? "Alguém";
    c.asks.set(from, { name, at: now });
    this.host.event(this, "roda-pedido", { circle: c.id, name }, { to: c.members, from });
    this.host.changed(this);
  }

  private answerAsk(from: string, circle: string | null, who: string | null, ok: boolean): void {
    const c = this.circles.find((x) => x.id === circle);
    if (!c || !who || !c.members.includes(from) || !c.asks.has(who)) return;
    c.asks.delete(who);
    const p = this.person(who);
    const by = this.host.playerName(from) ?? "Alguém";
    if (ok && p && !this.circleOf(who) && circleCanAsk(c, p.pos, p.zone)) {
      c.members.push(who);
      this.tell(who, "roda-entrou", { by });
      this.privacyChanged();
    } else this.tell(who, "roda-recusou", { by });
    this.host.changed(this);
  }

  // ---- sussurro ------------------------------------------------------------------------------

  /**
   * Começa (ou troca) o sussurro. Vale para qualquer alvo: se a pessoa não existe ou está longe,
   * a regra de audição faz a voz não chegar a ninguém, que é o lado seguro.
   */
  private whisper(from: string, to: unknown): void {
    const target = typeof to === "string" && to !== from ? to.slice(0, 40) : "";
    const prev = this.whispers.get(from);
    if (prev === target) return;
    if (prev) this.tell(prev, "sussurro", { from, on: false });
    this.whispers.set(from, target);
    if (target) this.tell(target, "sussurro", { from, on: true });
    this.tell(from, "sussurro-ok", { to: target });
    this.privacyChanged();
  }

  private endWhisper(from: string): void {
    const prev = this.whispers.get(from);
    if (prev === undefined) return;
    this.whispers.delete(from);
    if (prev) this.tell(prev, "sussurro", { from, on: false });
    this.privacyChanged();
  }

  // ---- utilidades ----------------------------------------------------------------------------

  private tell(id: string, ev: string, data: unknown): void {
    this.host.event(this, ev, data, { to: [id] });
  }

  /** As regras mudaram: refaz o cache e pede à sala para recalcular as audiências agora. */
  private privacyChanged(): void {
    this.rules = null;
    this.refresh?.();
  }
}
