import {
  FOCO_ID,
  FOCO_KIND,
  FOCO_SEAT_RANGE,
  FOCO_VOTE_OPS,
  focoEmpty,
  focoExpire,
  focoLeave,
  focoNow,
  focoSeatOf,
  focoSeatPoints,
  focoSit,
  focoUnvote,
  focoVote,
  type FocoState,
  type FocoVoteOp,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityFactory, ActivityHost } from "../types.ts";

/**
 * Mesa de foco com Pomodoro compartilhado (regras em packages/world/src/activities/foco).
 * Um relógio só, no servidor. Quem senta entra no ciclo em andamento; mesa vazia zera.
 *
 * Operações (só de quem está na mesa, menos `sit`):
 * - `sit` { seat }: sentou no lugar `seat` (o servidor confere se a pessoa está nele);
 * - `leave`: levantou;
 * - `vote` { op: "pause" | "resume" | "restart" }: concorda (ou propõe); vale quando todos concordam;
 * - `unvote`: retira a concordância;
 * - `dev-skip`: só fora de produção (testes): pula para 2 s antes do fim da fase atual.
 *
 * Presença, não vigilância: nada é salvo e nada é contado por pessoa. O estado é só o agora.
 */
export class FocoActivity implements Activity {
  readonly id = FOCO_ID;
  readonly kind = FOCO_KIND;
  private readonly seats: Vec2[];
  private state: FocoState;

  constructor(
    private readonly host: ActivityHost,
    private readonly dev = process.env.NODE_ENV !== "production",
  ) {
    this.seats = focoSeatPoints(host.map);
    this.state = focoEmpty(this.seats.length);
  }

  snapshot(): FocoState & { now: number } {
    return { ...this.state, now: Date.now() };
  }

  handle(from: string, op: string, data: unknown): void {
    const now = Date.now();
    if (op === "sit") {
      const seat = (data as { seat?: unknown } | undefined)?.seat;
      if (typeof seat !== "number" || !Number.isInteger(seat)) return;
      const p = this.seats[seat];
      if (!p || !this.host.near(from, p, FOCO_SEAT_RANGE)) return;
      this.set(focoSit(this.state, from, seat, now));
      return;
    }
    if (focoSeatOf(this.state, from) < 0) return;
    if (op === "leave") this.set(focoLeave(this.state, from, now));
    else if (op === "vote") {
      const want = (data as { op?: unknown } | undefined)?.op;
      if (FOCO_VOTE_OPS.includes(want as FocoVoteOp)) this.set(focoVote(this.state, from, want as FocoVoteOp, now));
    } else if (op === "unvote") this.set(focoUnvote(this.state, from));
    else if (op === "dev-skip" && this.dev) {
      const ph = focoNow(this.state, now);
      if (ph && this.state.startAt !== null && ph.left > 2000) this.set({ ...this.state, startAt: this.state.startAt - (ph.left - 2000) });
    }
  }

  tick(): void {
    const now = Date.now();
    let s = focoExpire(this.state, now);
    // Quem levantou sem avisar (fechou a aba, andou para longe) sai da mesa.
    for (const id of s.seats) {
      if (!id) continue;
      const i = focoSeatOf(s, id);
      if (!this.host.near(id, this.seats[i]!, FOCO_SEAT_RANGE)) s = focoLeave(s, id, now);
    }
    this.set(s);
  }

  leave(id: string): void {
    this.set(focoLeave(this.state, id, Date.now()));
  }

  private set(s: FocoState): void {
    if (s === this.state) return;
    this.state = s;
    this.host.changed(this);
  }
}

/** Pacote "foco": a mesa de foco com Pomodoro compartilhado. */
const create: ActivityFactory = (host) => [new FocoActivity(host)];
export default create;
