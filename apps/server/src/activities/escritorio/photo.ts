import { randomBytes } from "node:crypto";
import {
  PHOTO_COOLDOWN_MS,
  PHOTO_COUNTDOWN_MS,
  PHOTO_ID,
  PHOTO_KIND,
  PHOTO_START_RANGE,
  photoInFrame,
  photoParticipants,
  photoRig,
  type PhotoCountdown,
  type PhotoRig,
  type PhotoShot,
  type PhotoState,
  type PhotoTicket,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Quem dá os bilhetes do mural da copa (ver photowall.ts). */
export interface PhotoTickets {
  issue(shot: string, ids: readonly string[]): Map<string, string>;
}

/**
 * Cabine de fotos: alguém perto do tripé (ou já no quadro) dispara o timer; no fim, o servidor
 * diz quem saiu na foto e cada um gera a imagem no próprio navegador. A imagem não passa por aqui:
 * quem saiu na foto recebe um bilhete para, se quiser, pôr a foto no mural da copa (por HTTP).
 *
 * Operações: `start`.
 * Eventos: `countdown` PhotoCountdown (todos), `shot` PhotoShot (todos), `ticket` PhotoTicket
 * (só para cada pessoa que saiu na foto).
 */
export class PhotoActivity implements Activity {
  readonly id = PHOTO_ID;
  readonly kind = PHOTO_KIND;
  private phase: PhotoState["phase"] = "idle";
  private shotAt = 0;
  private readyAt = 0;
  private readonly rig: PhotoRig | null;

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
    private readonly tickets?: PhotoTickets,
  ) {
    const backdrop = host.objects("backdrop")[0];
    const tripod = host.objects("camera-tripod")[0];
    this.rig = backdrop && tripod ? photoRig(backdrop, tripod) : null;
  }

  snapshot(): PhotoState {
    return { phase: this.phase };
  }

  handle(from: string, op: string): void {
    if (op !== "start" || !this.rig) return;
    const now = this.now();
    if (this.phase !== "idle" || now < this.readyAt) return;
    const p = this.host.playerPos(from);
    if (!p) return;
    const ok = this.host.near(from, this.rig.tripod, PHOTO_START_RANGE) || photoInFrame(this.rig, p);
    if (!ok) return;
    this.phase = "countdown";
    this.shotAt = now + PHOTO_COUNTDOWN_MS;
    this.host.changed(this);
    this.host.event(this, "countdown", { name: this.host.playerName(from) ?? "Alguém", ms: PHOTO_COUNTDOWN_MS } satisfies PhotoCountdown, { from });
  }

  tick(): void {
    if (this.phase !== "countdown" || !this.rig) return;
    const now = this.now();
    if (now < this.shotAt) return;
    const people: Array<[string, Vec2]> = [];
    for (const id of this.host.players()) {
      const p = this.host.playerPos(id);
      if (p) people.push([id, p]);
    }
    this.phase = "idle";
    this.readyAt = now + PHOTO_COOLDOWN_MS;
    this.host.changed(this);
    const ids = photoParticipants(this.rig, people);
    const shot = randomBytes(6).toString("hex");
    this.host.event(this, "shot", { ids, shot } satisfies PhotoShot);
    if (!this.tickets) return;
    for (const [id, ticket] of this.tickets.issue(shot, ids)) this.host.event(this, "ticket", { shot, ticket } satisfies PhotoTicket, { to: [id] });
  }
}
