import { randomUUID } from "node:crypto";
import { CAB_GAMES, CAB_ID, CAB_KIND, CAB_RANGE, cabEmpty, cabGameOfVariant, cabInsert, cabPlausible, type CabGameId, type CabState, type MapObject, type Vec2 } from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "arcade/recordes";
/** Quem se afasta da máquina por este tempo larga a partida. */
const AWAY_S = 6;
/** Partida esquecida aberta (ms). */
const STALE_MS = 45 * 60_000;

interface Run {
  token: string;
  machine: string;
  game: CabGameId;
  at: number;
  away: number;
}

export interface CabOptions {
  now?: () => number;
}

/**
 * Fliperamas: o jogo roda no navegador; aqui ficam o ranking (persistente) e a conferência das pontuações.
 *
 * Operações:
 * - `start` `{ machine }`: começa uma partida na máquina (perto dela e se estiver livre). Responde `run` `{ token, game }` só para quem pediu.
 * - `score` `{ token, score }`: fim da partida. Confere o token, o tempo e o limite do jogo; responde `result`.
 * - `quit`: larga a partida sem pontuar.
 * Eventos: `run`, `result` `{ game, score, rank, personalBest, record }` (para quem jogou), `record` `{ game, name, score }` (para todos).
 */
export class CabinetsActivity implements Activity {
  readonly id = CAB_ID;
  readonly kind = CAB_KIND;
  private state: CabState;
  private readonly runs = new Map<string, Run>();
  private readonly machines = new Map<string, { game: CabGameId; at: Vec2 }>();
  private readonly now: () => number;

  constructor(
    private readonly host: ActivityHost,
    opts: CabOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    for (const o of host.objects("arcade")) this.machines.set(o.id, { game: cabGameOfVariant(o.variant), at: spot(o) });
    const saved = host.store.get<CabState>(KEY, cabEmpty());
    this.state = { boards: { ...cabEmpty().boards, ...saved.boards }, busy: {} };
  }

  snapshot(): CabState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    if (op === "start") this.start(from, d.machine);
    else if (op === "score") this.score(from, d.token, d.score);
    else if (op === "quit") this.quit(from);
  }

  tick(dt: number): void {
    const now = this.now();
    for (const [id, run] of this.runs) {
      const m = this.machines.get(run.machine);
      const far = !m || !this.host.near(id, m.at, CAB_RANGE + 1.5);
      run.away = far ? run.away + dt : 0;
      if (run.away >= AWAY_S || now - run.at > STALE_MS) this.quit(id);
    }
  }

  leave(id: string): void {
    this.quit(id);
  }

  private start(from: string, machine: unknown): void {
    if (typeof machine !== "string") return;
    const m = this.machines.get(machine);
    if (!m || !this.host.near(from, m.at, CAB_RANGE)) return;
    const busyBy = this.state.busy[machine];
    const mine = this.runs.get(from);
    if (busyBy && mine?.machine !== machine) {
      this.host.event(this, "busy", { machine, name: busyBy }, { to: [from] });
      return;
    }
    if (mine) this.release(mine.machine);
    const run: Run = { token: randomUUID(), machine, game: m.game, at: this.now(), away: 0 };
    this.runs.set(from, run);
    this.state = { ...this.state, busy: { ...this.state.busy, [machine]: this.host.playerName(from) ?? "Alguém" } };
    this.host.changed(this);
    this.host.event(this, "run", { token: run.token, game: run.game, machine }, { to: [from] });
  }

  private score(from: string, token: unknown, score: unknown): void {
    const run = this.runs.get(from);
    if (!run || token !== run.token) return;
    this.runs.delete(from);
    this.release(run.machine);
    const elapsed = this.now() - run.at;
    if (!cabPlausible(run.game, score, elapsed)) {
      this.host.event(this, "result", { game: run.game, score: 0, rank: null, personalBest: false, record: false, rejected: true }, { to: [from] });
      this.host.changed(this);
      return;
    }
    const name = this.host.playerName(from) ?? "Alguém";
    const before = this.state.boards[run.game][0]?.score ?? 0;
    const r = cabInsert(this.state.boards[run.game], { name, score, at: this.now() });
    const record = r.rank === 1 && score > before;
    if (r.personalBest) {
      this.state = { ...this.state, boards: { ...this.state.boards, [run.game]: r.board } };
      this.host.store.set(KEY, { boards: this.state.boards });
    }
    this.host.changed(this);
    this.host.event(this, "result", { game: run.game, score, rank: r.rank, personalBest: r.personalBest, record }, { to: [from] });
    if (record) {
      this.host.emote(from, "cheer");
      this.host.event(this, "record", { game: run.game, name, score, title: CAB_GAMES[run.game].name }, { from });
    }
  }

  private quit(from: string): void {
    const run = this.runs.get(from);
    if (!run) return;
    this.runs.delete(from);
    this.release(run.machine);
    this.host.changed(this);
  }

  private release(machine: string): void {
    if (!(machine in this.state.busy)) return;
    const busy = { ...this.state.busy };
    delete busy[machine];
    this.state = { ...this.state, busy };
  }
}

/** Onde quem joga fica: na frente da máquina. */
function spot(o: MapObject): Vec2 {
  return o.interact?.point ?? o.pos;
}
