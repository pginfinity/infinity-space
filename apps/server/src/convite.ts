import { createHash, randomBytes } from "node:crypto";
import { CONVITE_ID, CONVITE_KIND, CONVITE_MAX_LINKS, CONVITE_TTL_MS, recGroup, recordable, type ConvitePedido, type ConviteState } from "@infinity/world";
import type { Activity, ActivityHost } from "./activities/types.ts";

/** Link guardado: só o hash do código (quem lê a pasta de dados não entra com ele). */
interface Link {
  group: string;
  exp: number;
}

/** O que a sala faz com quem espera na porta. */
export interface ConviteRoom {
  admit(pid: string): void;
  refuse(pid: string): void;
}

const KEY = "convites";
const hash = (token: string) => createHash("sha256").update(token).digest("base64url");

/**
 * Convites de cliente para uma reunião (ver packages/world/src/activities/escritorio/convite.ts).
 * Quem está numa sala de reunião gera o link; os pedidos de entrada aparecem para todos do escritório,
 * mas só quem está na mesma sala deixa entrar ou recusa.
 */
export class ConviteActivity implements Activity {
  readonly id = CONVITE_ID;
  readonly kind = CONVITE_KIND;
  private readonly pedidos = new Map<string, ConvitePedido>();

  constructor(
    private readonly host: ActivityHost,
    private readonly room: ConviteRoom,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): ConviteState {
    return { pedidos: [...this.pedidos.values()] };
  }

  /** Sala (grupo) do convite, se o link ainda vale. */
  groupOf(token: string): string | null {
    const links = this.links();
    const h = hash(token);
    return Object.hasOwn(links, h) ? links[h]!.group : null;
  }

  /** O convidado chegou à porta. */
  ask(p: ConvitePedido): void {
    this.pedidos.set(p.pid, p);
    this.host.changed(this);
  }

  /** O convidado desistiu (fechou a página) antes de alguém responder. */
  drop(pid: string): void {
    if (this.pedidos.delete(pid)) this.host.changed(this);
  }

  handle(from: string, op: string, data: unknown): void {
    const zone = this.host.playerZone(from);
    const group = recordable(zone) ? recGroup(zone) : null;
    if (!group) return;
    if (op === "criar") {
      const links = this.links();
      if (Object.keys(links).length >= CONVITE_MAX_LINKS) return this.host.notify(from, "Há convites demais no ar agora. Tente de novo mais tarde.");
      const token = randomBytes(18).toString("base64url");
      const exp = this.now() + CONVITE_TTL_MS;
      links[hash(token)] = { group, exp };
      this.host.store.set(KEY, links);
      this.host.event(this, "link", { token, exp, sala: zone!.name }, { to: [from] });
      return;
    }
    if (op !== "admitir" && op !== "recusar") return;
    const pid = (data as { pid?: unknown } | null)?.pid;
    const p = typeof pid === "string" ? this.pedidos.get(pid) : undefined;
    if (!p || p.group !== group) return;
    this.pedidos.delete(p.pid);
    this.host.changed(this);
    if (op === "admitir") this.room.admit(p.pid);
    else this.room.refuse(p.pid);
  }

  /** Links que ainda valem (os vencidos saem na próxima gravação). */
  private links(): Record<string, Link> {
    const t = this.now();
    return Object.fromEntries(Object.entries(this.host.store.get<Record<string, Link>>(KEY, {})).filter(([, l]) => l.exp > t));
  }
}
