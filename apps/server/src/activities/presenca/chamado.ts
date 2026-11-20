import {
  CHAMADO_COOLDOWN_MS,
  CHAMADO_ID,
  CHAMADO_KIND,
  CHAMADO_PAIR_COOLDOWN_MS,
  CHAMADO_TELEPORT_MS,
  CHAMADO_TTL_MS,
  PRESENCA_DASH_SPEED,
  portasCleanNote,
  presencaFreeSpot,
  type ChamadoAccepted,
  type ChamadoCalling,
  type ChamadoEnd,
  type ChamadoEndReason,
  type ChamadoGo,
  type ChamadoInvite,
  type ChamadoTravel,
  type ChamadoWait,
  type ChamadoWarp,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/**
 * A sala ainda não sabe mover um avatar por conta própria. Quando a base ganhar
 * `host.teleport(id, ponto)` (muda a posição no servidor e manda a correção de pose ao cliente),
 * o teleporte passa a ser instantâneo sem mudar nada aqui. Até lá: travessia rápida pelo caminho.
 */
type TeleportHost = ActivityHost & { teleport?(id: string, p: Vec2): boolean };

interface Call {
  to: string;
  until: number;
}

interface Accepted {
  from: string;
  until: number;
}

/**
 * Chamar alguém. Um chamado aberto por pessoa, no máximo um a cada 20 s e a mesma pessoa no máximo
 * uma vez por minuto; expira em 30 s. Nada fica guardado depois disso (sem histórico de quem chamou quem).
 * Topar libera, por 90 s, um teleporte (uma vez só) para um lugar livre perto da outra pessoa,
 * escolhido aqui no servidor: o cliente nunca diz para onde vai.
 *
 * Respostas de quem foi chamado: `accept` (vou aí), `here` (chama aqui: quem chamou é que vem),
 * `decline` { note? } (agora não, com resposta rápida), `chat` (respondo no chat) e `quiet`
 * (em Foco ou Não perturbe: vê depois).
 * Operações: `call` { to }, `accept`/`here`/`decline`/`chat`/`quiet` { from }, `cancel`, `teleport` { from }.
 * Eventos: `call` (chamado), `calling` (quem chamou), `accepted` (quem vai receber a visita),
 * `go` (quem vai andar), `end` ChamadoEnd (os dois), `travel` (quem vai), `warp` (todos), `wait` (quem chamou cedo demais).
 */
export class ChamadoActivity implements Activity {
  readonly id = CHAMADO_ID;
  readonly kind = CHAMADO_KIND;
  /** Chamados abertos, por quem chamou. */
  private readonly calls = new Map<string, Call>();
  /** Chamados aceitos que ainda podem virar teleporte, por quem topou. */
  private readonly accepted = new Map<string, Accepted>();
  private readonly lastCall = new Map<string, number>();
  /** Último chamado por par "quem chamou>quem foi chamado"; some depois de um minuto. */
  private readonly lastPair = new Map<string, number>();

  constructor(
    private readonly host: TeleportHost,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): null {
    return null;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as { to?: unknown; from?: unknown; note?: unknown };
    const now = this.now();
    switch (op) {
      case "call": {
        const to = d.to;
        if (typeof to !== "string" || to === from || !this.online(to)) return;
        const pair = `${from}>${to}`;
        const wait = Math.max(
          (this.lastCall.get(from) ?? -Infinity) + CHAMADO_COOLDOWN_MS - now,
          (this.lastPair.get(pair) ?? -Infinity) + CHAMADO_PAIR_COOLDOWN_MS - now,
        );
        if (wait > 0) {
          this.host.event(this, "wait", { ms: wait } satisfies ChamadoWait, { to: [from] });
          return;
        }
        this.lastCall.set(from, now);
        this.lastPair.set(pair, now);
        const old = this.calls.get(from);
        if (old) this.end("cancel", from, old.to);
        this.calls.set(from, { to, until: now + CHAMADO_TTL_MS });
        const place = this.host.playerZone(from)?.name ?? "";
        this.host.event(this, "call", { from, name: this.nameOf(from), place, ms: CHAMADO_TTL_MS } satisfies ChamadoInvite, { to: [to], from });
        this.host.event(this, "calling", { to, name: this.nameOf(to), ms: CHAMADO_TTL_MS } satisfies ChamadoCalling, { to: [from] });
        break;
      }
      case "accept": {
        const a = d.from;
        if (typeof a !== "string") return;
        const call = this.calls.get(a);
        if (!call || call.to !== from || now > call.until) return;
        this.calls.delete(a);
        const at = this.host.playerPos(a);
        if (!at) return;
        this.accepted.set(from, { from: a, until: now + CHAMADO_TELEPORT_MS });
        this.host.event(this, "accepted", { by: from, name: this.nameOf(from) } satisfies ChamadoAccepted, { to: [a] });
        this.host.event(this, "go", { from: a, name: this.nameOf(a), at } satisfies ChamadoGo, { to: [from] });
        break;
      }
      case "here": {
        // Quem foi chamado pede para quem chamou vir: o mesmo "topar", com os papéis trocados.
        const a = d.from;
        if (typeof a !== "string") return;
        const call = this.calls.get(a);
        if (!call || call.to !== from || now > call.until) return;
        this.calls.delete(a);
        const at = this.host.playerPos(from);
        if (!at) return;
        this.accepted.set(a, { from, until: now + CHAMADO_TELEPORT_MS });
        this.host.event(this, "accepted", { by: a, name: this.nameOf(a) } satisfies ChamadoAccepted, { to: [from] });
        this.host.event(this, "go", { from, name: this.nameOf(from), at, here: true } satisfies ChamadoGo, { to: [a] });
        break;
      }
      case "decline":
      case "chat":
      case "quiet": {
        const a = d.from;
        if (typeof a !== "string") return;
        const call = this.calls.get(a);
        if (!call || call.to !== from) return;
        this.calls.delete(a);
        this.end(op === "decline" ? "declined" : op, a, from, op === "decline" ? portasCleanNote(d.note) : undefined);
        break;
      }
      case "cancel": {
        const call = this.calls.get(from);
        if (!call) return;
        this.calls.delete(from);
        this.end("cancel", from, call.to);
        break;
      }
      case "teleport":
        this.teleport(from, d.from, now);
        break;
    }
  }

  tick(): void {
    const now = this.now();
    for (const [a, call] of this.calls) {
      if (now <= call.until) continue;
      this.calls.delete(a);
      this.end("expired", a, call.to);
    }
    for (const [b, acc] of this.accepted) if (now > acc.until) this.accepted.delete(b);
    for (const [pair, at] of this.lastPair) if (now - at >= CHAMADO_PAIR_COOLDOWN_MS) this.lastPair.delete(pair);
  }

  leave(id: string): void {
    this.lastCall.delete(id);
    this.accepted.delete(id);
    for (const [b, acc] of this.accepted) if (acc.from === id) this.accepted.delete(b);
    for (const [a, call] of this.calls) {
      if (a !== id && call.to !== id) continue;
      this.calls.delete(a);
      this.end("left", a, call.to);
    }
  }

  /** Só depois de um chamado aceito, uma vez, para perto de quem chamou. */
  private teleport(who: string, caller: unknown, now: number): void {
    const acc = this.accepted.get(who);
    if (!acc || acc.from !== caller || now > acc.until) return;
    const center = this.host.playerPos(acc.from);
    const start = this.host.playerPos(who);
    if (!center || !start) return;
    const others = this.host
      .players()
      .filter((id) => id !== who)
      .map((id) => this.host.playerPos(id))
      .filter((p): p is Vec2 => !!p);
    const spot = presencaFreeSpot(this.host.nav, this.host.map.walls, center, others, start);
    if (!spot) {
      // Continua valendo: dá para tentar de novo quando abrir espaço.
      this.host.notify(who, `Não há lugar livre perto de ${this.nameOf(acc.from)} agora. Tente de novo em instantes.`);
      return;
    }
    this.accepted.delete(who);
    const instant = typeof this.host.teleport === "function" && this.host.teleport(who, spot);
    const mode: ChamadoTravel["mode"] = instant ? "instant" : "dash";
    // Duração estimada do efeito (a travessia segue o caminho, um pouco mais longo que a reta).
    const ms = instant ? 700 : Math.min(9000, Math.round((Math.hypot(spot.x - start.x, spot.z - start.z) * 1.35 * 1000) / PRESENCA_DASH_SPEED) + 400);
    this.host.event(this, "travel", { from: acc.from, to: spot, mode } satisfies ChamadoTravel, { to: [who] });
    this.host.event(this, "warp", { id: who, ms } satisfies ChamadoWarp);
  }

  private online(id: string): boolean {
    return this.host.playerName(id) !== undefined;
  }

  private nameOf(id: string): string {
    return this.host.playerName(id) ?? "Alguém";
  }

  private end(reason: ChamadoEndReason, from: string, to: string, note?: string): void {
    this.host.event(this, "end", { from, to, reason, ...(note ? { note } : {}) } satisfies ChamadoEnd, { to: [from, to] });
  }
}
