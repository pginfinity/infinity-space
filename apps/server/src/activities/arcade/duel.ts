import {
  RT_COUNTDOWN_MS,
  RT_FRAME_EVERY,
  RT_FRAME_PAUSED,
  RT_MAX_LEAD,
  RT_POINT_PAUSE_MS,
  RT_STEP,
  RT_WATCH_RANGE,
  RT_EV,
  duelEmpty,
  duelWinner,
  rtNum,
  rtTableToWorld,
  type DuelEnd,
  type DuelState,
  type MapObject,
  type RtGameDef,
  type RtTarget,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Distância (m) do ponto em pé para pedir o lugar. */
export const DUEL_SIT_RANGE = 2.4;
/** Quem se afasta além disso (m) do próprio lugar por DUEL_AWAY_S segundos perde o lugar (e a partida). */
export const DUEL_AWAY_RANGE = 4;
export const DUEL_AWAY_S = 5;
/** Sem saque por este tempo (ms), o servidor saca por quem está demorando. */
export const DUEL_AUTO_SERVE_MS = 6000;
/** Fila de pedidos de movimento por lugar. */
const QUEUE_MAX = 24;

/** Quem está sentado em qual mesa de tempo real (uma de cada vez). */
const seatedIn = new Map<string, DuelActivity<unknown>>();

interface Queued extends RtTarget {
  t: number;
}

export interface DuelOptions {
  /** Relógio em ms (testes). */
  now?: () => number;
  /** false = sem timer próprio: os testes andam com `advance(ms)`. */
  timer?: boolean;
}

/**
 * Mesa de jogo de dois em tempo real (hockey, pingue-pongue): lugares, contagem, física com
 * autoridade do servidor em passos fixos e quadros a 30 Hz para quem joga e quem assiste por perto.
 *
 * Operações:
 * - `sit` `{ seat }`: pede o lugar (a até DUEL_SIT_RANGE m do ponto em pé daquele lado).
 * - `stand`: levanta. Com partida rolando, perde por abandono.
 * - `aim` `{ t, x, z, a? }`: alvo do controle em mm, no passo previsto `t`. `a` = sacar.
 * - `ping` `{ c }`: responde `pong` `{ c, k }` (k = passo atual do servidor) só para quem pediu.
 * - `resign`, `rematch` `{ on? }`.
 * Eventos: `f` (quadro, RtFrame), `point` `{ scorer, score }`, `end` `{ winner, reason }`.
 */
export class DuelActivity<S> implements Activity {
  readonly id: string;
  readonly kind: string;
  private state: DuelState = duelEmpty();
  private sim: S;
  private step = 0;
  private acc = 0;
  private lastAt = 0;
  private sinceFrame = 0;
  private evAcc = 0;
  private queues: [Queued[], Queued[]] = [[], []];
  private targets: [RtTarget | null, RtTarget | null] = [null, null];
  private countdownUntil = 0;
  private pauseUntil = 0;
  private prepareServe: number | null = null;
  private waitingSince = 0;
  private first = 0;
  private away: [number, number] = [0, 0];
  private watchers: string[] = [];
  private watchersAt = -Infinity;
  private timer: NodeJS.Timeout | undefined;
  private readonly now: () => number;
  private readonly useTimer: boolean;

  constructor(
    private readonly host: ActivityHost,
    private readonly def: RtGameDef<S>,
    private readonly table: MapObject,
    opts: DuelOptions = {},
  ) {
    this.id = table.gameId ?? table.id;
    this.kind = def.kind;
    this.sim = def.create(0);
    this.now = opts.now ?? (() => performance.now());
    this.useTimer = opts.timer !== false;
  }

  seatLabel(id: string): string | null {
    return this.state.seats.includes(id) ? (this.kind === "pingpong" ? "Pingue-pongue" : "Hockey de mesa") : null;
  }

  inMatchFor(id: string): boolean {
    return this.state.seats.includes(id) && this.inMatch();
  }

  releaseSeat(id: string): void {
    if (this.state.seats.includes(id) && !this.inMatch()) this.stand(id);
  }

  /** Onde fica em pé quem joga no lado de `seat`. */
  standPoint(seat: number): Vec2 {
    return rtTableToWorld(this.table, 0, (seat === 0 ? 1 : -1) * (this.def.L / 2 + this.def.stand));
  }

  snapshot(): DuelState {
    const s = this.state;
    return {
      ...s,
      seats: [s.seats[0], s.seats[1]],
      names: [this.name(s.seats[0]), this.name(s.seats[1])],
      score: [s.score[0], s.score[1]],
      rematch: [s.rematch[0], s.rematch[1]],
      countdown: s.phase === "countdown" ? Math.max(0, Math.round(this.countdownUntil - this.now())) : 0,
    };
  }

  /** Estado da simulação (testes). */
  simState(): S {
    return this.sim;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (op) {
      case "sit":
        this.sit(from, d.seat);
        break;
      case "stand":
        this.stand(from);
        break;
      case "aim":
        this.aim(from, d);
        break;
      case "ping": {
        const c = rtNum(d.c, -1e15, 1e15);
        if (c !== null) this.host.event(this, "pong", { c, k: this.step + this.acc / RT_STEP }, { to: [from] });
        break;
      }
      case "resign": {
        const seat = this.state.seats.indexOf(from);
        if (seat >= 0 && (this.state.phase === "playing" || this.state.phase === "countdown")) this.finish(seat === 0 ? 1 : 0, "resign");
        break;
      }
      case "rematch":
        this.rematch(from, d.on !== false);
        break;
    }
  }

  tick(dt: number): void {
    // Quem saiu de perto da mesa perde o lugar (no meio da partida, perde a partida).
    this.state.seats.forEach((id, seat) => {
      if (!id) return;
      const far = !this.host.near(id, this.standPoint(seat), DUEL_AWAY_RANGE);
      this.away[seat] = far ? this.away[seat]! + dt : 0;
      if (this.away[seat]! >= DUEL_AWAY_S) this.stand(id);
    });
  }

  leave(id: string): void {
    this.stand(id);
  }

  dispose(): void {
    this.stopLoop();
    for (const id of this.state.seats) if (id && seatedIn.get(id) === this) seatedIn.delete(id);
  }

  // ---------------------------------------------------------------- lugares

  private sit(from: string, seatRaw: unknown): void {
    const s = this.state;
    if (s.phase === "playing" || s.phase === "countdown") return;
    if (seatRaw !== 0 && seatRaw !== 1) return;
    const seat = seatRaw;
    if (s.seats[seat] !== null) return;
    if (!this.host.near(from, this.standPoint(seat), DUEL_SIT_RANGE)) return;
    const busy = this.host.claimSeat(from, this);
    if (busy) {
      this.host.notify(from, `Você está no meio de uma partida de ${busy}. Termine ou levante de lá primeiro.`);
      return;
    }
    const other = seatedIn.get(from);
    if (other && other !== this) {
      if (other.inMatch()) return;
      other.stand(from);
    }
    const current = s.seats.indexOf(from);
    if (current >= 0) s.seats[current] = null;
    s.seats[seat] = from;
    seatedIn.set(from, this as DuelActivity<unknown>);
    this.away[seat] = 0;
    s.rematch = [false, false];
    if (s.seats[0] && s.seats[1]) this.startMatch();
    else this.host.changed(this);
  }

  private stand(from: string): void {
    const s = this.state;
    const seat = s.seats.indexOf(from);
    if (seat < 0) return;
    if (s.phase === "playing") this.finish(seat === 0 ? 1 : 0, "left");
    else if (s.phase === "countdown") {
      // ainda não começou: volta a esperar, sem resultado
      s.phase = "waiting";
      s.round = Math.max(0, s.round - 1);
      this.stopLoop();
    }
    s.seats[seat] = null;
    if (seatedIn.get(from) === this) seatedIn.delete(from);
    this.away[seat] = 0;
    s.rematch = [false, false];
    this.queues[seat] = [];
    this.targets[seat] = null;
    if (!s.seats[0] && !s.seats[1]) {
      // mesa vazia volta arrumada
      s.phase = "waiting";
      s.score = [0, 0];
      s.winner = null;
      s.reason = null;
      s.players = [null, null];
      this.sim = this.def.create(0);
      this.stopLoop();
    }
    this.host.changed(this);
  }

  private rematch(from: string, on: boolean): void {
    const s = this.state;
    const seat = s.seats.indexOf(from);
    if (s.phase !== "finished" || seat < 0 || !s.seats[0] || !s.seats[1]) return;
    if (s.rematch[seat] === on) return;
    s.rematch[seat] = on;
    if (s.rematch[0] && s.rematch[1]) {
      // revanche troca os lados
      s.seats = [s.seats[1], s.seats[0]];
      this.startMatch();
      return;
    }
    this.host.changed(this);
  }

  /** Está numa partida (contagem ou jogo)? */
  inMatch(): boolean {
    return this.state.phase === "playing" || this.state.phase === "countdown";
  }

  private name(id: string | null): string | null {
    return id ? (this.host.playerName(id) ?? null) : null;
  }

  // ---------------------------------------------------------------- partida

  private startMatch(): void {
    const s = this.state;
    s.round++;
    s.phase = "countdown";
    s.score = [0, 0];
    s.winner = null;
    s.reason = null;
    s.rematch = [false, false];
    s.players = [this.name(s.seats[0]), this.name(s.seats[1])];
    this.first = s.round % 2 === 1 ? 0 : 1;
    s.serve = this.first;
    this.sim = this.def.create(s.serve);
    this.queues = [[], []];
    this.targets = [null, null];
    this.prepareServe = null;
    this.pauseUntil = 0;
    this.away = [0, 0];
    this.countdownUntil = this.now() + RT_COUNTDOWN_MS;
    this.startLoop();
    this.host.changed(this);
  }

  private finish(winner: number, reason: DuelEnd): void {
    const s = this.state;
    s.phase = "finished";
    s.winner = winner;
    s.reason = reason;
    s.rematch = [false, false];
    this.sendFrame(true);
    this.stopLoop();
    const id = s.seats[winner];
    if (id && reason === "score") this.host.emote(id, "cheer");
    this.host.event(this, "end", { winner, reason, score: [s.score[0], s.score[1]] }, { to: this.receivers(true) });
    this.host.changed(this);
  }

  private point(scorer: number): void {
    const s = this.state;
    s.score[scorer]!++;
    this.host.event(this, "point", { scorer, score: [s.score[0], s.score[1]] }, { to: this.receivers(true) });
    const w = duelWinner(s.score, this.def.win, this.def.by);
    if (w !== null) {
      this.finish(w, "score");
      return;
    }
    s.serve = this.def.nextServe(s.score, scorer, this.first);
    this.prepareServe = s.serve;
    this.pauseUntil = this.now() + RT_POINT_PAUSE_MS;
    this.host.changed(this);
  }

  private aim(from: string, d: Record<string, unknown>): void {
    const seat = this.state.seats.indexOf(from);
    if (seat < 0 || !this.inMatch()) return;
    const x = rtNum(d.x, -5000, 5000);
    const z = rtNum(d.z, -5000, 5000);
    let t = rtNum(d.t, 0, 1e12);
    if (x === null || z === null || t === null) return;
    t = Math.min(Math.floor(t), this.step + RT_MAX_LEAD);
    const q = this.queues[seat]!;
    const last = q.at(-1);
    if (last && t < last.t) t = last.t;
    q.push({ t, x: x / 1000, z: z / 1000, a: d.a === 1 ? 1 : 0 });
    if (q.length > QUEUE_MAX) q.splice(0, q.length - QUEUE_MAX);
  }

  // ---------------------------------------------------------------- física

  private startLoop(): void {
    this.lastAt = this.now();
    this.acc = 0;
    this.sinceFrame = 0;
    if (this.useTimer && !this.timer) this.timer = setInterval(() => this.advance(), 1000 / 60);
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Anda a física até agora (o timer chama; os testes chamam com o relógio falso). */
  advance(): void {
    const s = this.state;
    if (!this.inMatch()) return;
    const now = this.now();
    this.acc += Math.min(0.25, Math.max(0, (now - this.lastAt) / 1000));
    this.lastAt = now;
    if (s.phase === "countdown" && now >= this.countdownUntil) {
      s.phase = "playing";
      this.waitingSince = now;
      this.host.changed(this);
    }
    if (this.prepareServe !== null && now >= this.pauseUntil) {
      this.def.prepare(this.sim, this.prepareServe);
      this.prepareServe = null;
      this.waitingSince = now;
    }
    while (this.acc >= RT_STEP && this.inMatch()) {
      this.acc -= RT_STEP;
      this.step++;
      const paused = s.phase !== "playing" || this.prepareServe !== null;
      if (!paused) this.physics(now);
      if (++this.sinceFrame >= RT_FRAME_EVERY) this.sendFrame(paused);
    }
  }

  private physics(now: number): void {
    for (const seat of [0, 1] as const) {
      const q = this.queues[seat];
      while (q.length && q[0]!.t <= this.step) this.targets[seat] = q.shift()!;
    }
    const waiting = this.def.waitingFor?.(this.sim) ?? null;
    if (waiting === null) this.waitingSince = now;
    else if (now - this.waitingSince > DUEL_AUTO_SERVE_MS) {
      // quem devia sacar está demorando: o saque sai sozinho
      const t = this.targets[waiting] ?? this.def.home(waiting);
      this.targets[waiting] = { x: t.x, z: t.z, a: 1 };
      this.waitingSince = now;
    }
    const ev = this.def.step(this.sim, this.targets, RT_STEP);
    // a ação (saque) vale para um passo só
    for (const seat of [0, 1] as const) {
      const t = this.targets[seat];
      if (t?.a) this.targets[seat] = { x: t.x, z: t.z, a: 0 };
    }
    this.evAcc |= ev;
    if (ev & RT_EV.point0) this.point(0);
    else if (ev & RT_EV.point1) this.point(1);
  }

  private sendFrame(paused: boolean): void {
    // o servidor fica com o mesmo estado arredondado que os clientes recebem
    const enc = this.def.encode(this.sim);
    this.def.decode(enc, 0, this.sim);
    const frame = [this.step, paused ? RT_FRAME_PAUSED : 0, this.evAcc, ...enc];
    this.evAcc = 0;
    this.sinceFrame = 0;
    this.host.event(this, "f", frame, { to: this.receivers() });
  }

  /** Quem joga e quem está perto da mesa (recalculado duas vezes por segundo). */
  private receivers(fresh = false): string[] {
    const now = this.now();
    if (fresh || now - this.watchersAt > 500) {
      this.watchersAt = now;
      const set = new Set<string>();
      for (const id of this.state.seats) if (id) set.add(id);
      for (const id of this.host.players()) if (this.host.near(id, this.table.pos, RT_WATCH_RANGE)) set.add(id);
      this.watchers = [...set];
    }
    return this.watchers;
  }
}
