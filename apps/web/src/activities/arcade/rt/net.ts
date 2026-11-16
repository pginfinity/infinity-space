import { RT_EV, RT_FRAME_PAUSED, RT_INPUT_EVERY, RT_STEP, rtMm, type RtGameDef, type RtTarget } from "@infinity/world";
import { sendAct } from "../../registry.ts";

/**
 * Rede de uma mesa de tempo real no cliente.
 *
 * - Quadros do servidor (30 Hz) entram em `onFrame`. Quem assiste vê a partida interpolada com
 *   ~100 ms de atraso (`sample`), sem tremer.
 * - Quem joga prevê: a simulação local roda à frente do servidor (meia ida e volta + folga), o
 *   próprio controle entra na hora e cada pedido sai marcado com o passo previsto. A cada quadro,
 *   a previsão volta ao estado do servidor e refaz os passos com o histórico do próprio controle;
 *   a diferença que sobra na tela some aos poucos (`corr`), sem saltos.
 */

const STEP_MS = RT_STEP * 1000;
/** Atraso da interpolação de quem assiste, em passos (100 ms). */
const INTERP = 12;
/** Folga da previsão além da meia ida e volta, em passos. */
const LEAD_SLACK = 3;
const HIST = 512;
/** Diferença acima disso (m) é corrigida de uma vez, sem suavizar. */
const SNAP = 0.3;
/** Tempo de suavização da correção (s). */
const SMOOTH = 0.07;

/** O que o cliente precisa saber de um jogo além da física: onde estão as coisas para desenhar. */
export interface DuelGameClient<S> {
  def: RtGameDef<S>;
  /** Quantos pontos (x, z) a cena desenha: disco/bola primeiro, depois os controles 0 e 1. */
  npoints: number;
  points(s: S, out: Float64Array): void;
}

export interface Frame<S> {
  k: number;
  at: number;
  paused: boolean;
  ev: number;
  sim: S;
}

/** Acontecimentos para som e efeito: `predicted` = vieram da previsão local (na hora). */
export type NetEvent = (ev: number, predicted: boolean) => void;

export class DuelNet<S> {
  readonly frames: Frame<S>[] = [];
  private readonly pool: S[] = [];
  private offF: number | null = null;
  private offP: number | null = null;
  private pongs: Array<{ rtt: number; off: number }> = [];
  /** Ida e volta estimada (ms). */
  rtt = 80;

  // ---- previsão (só quem joga)
  seat = -1;
  readonly sim: S;
  private readonly prev: S;
  private readonly scratch: S;
  tick = -1;
  /** Fração do passo atual (para desenhar entre o passo anterior e o atual). */
  private frac = 0;
  private frozen = false;
  private readonly histT = new Int32Array(HIST).fill(-1);
  private readonly histX = new Float64Array(HIST);
  private readonly histZ = new Float64Array(HIST);
  private readonly histA = new Uint8Array(HIST);
  /** Alvo atual do controle (coordenadas da mesa), escrito pelo controle do painel. */
  readonly target: RtTarget = { x: 0, z: 0, a: 0 };
  hasTarget = false;
  private readonly corr: Float64Array;
  private readonly pa: Float64Array;
  private readonly pb: Float64Array;
  private readonly targets: [RtTarget | null, RtTarget | null] = [null, null];
  private readonly mine: RtTarget = { x: 0, z: 0, a: 0 };
  private readonly theirs: RtTarget = { x: 0, z: 0, a: 0 };
  onEvent: NetEvent | null = null;
  private lastPing = 0;
  private pingsSent = 0;

  constructor(
    readonly id: string,
    readonly game: DuelGameClient<S>,
  ) {
    const d = game.def;
    this.sim = d.create(0);
    this.prev = d.create(0);
    this.scratch = d.create(0);
    this.corr = new Float64Array(game.npoints * 2);
    this.pa = new Float64Array(game.npoints * 2);
    this.pb = new Float64Array(game.npoints * 2);
  }

  // ---------------------------------------------------------------- entrada

  onFrame(arr: unknown): void {
    if (!Array.isArray(arr) || arr.length < 4) return;
    const k = Number(arr[0]);
    if (!Number.isFinite(k)) return;
    const sim = this.pool.pop() ?? this.game.def.create(0);
    if (!this.game.def.decode(arr as number[], 3, sim)) {
      this.pool.push(sim);
      return;
    }
    const now = performance.now();
    const f: Frame<S> = { k, at: now, paused: (Number(arr[1]) & RT_FRAME_PAUSED) !== 0, ev: Number(arr[2]) | 0, sim };
    const last = this.frames.at(-1);
    if (last && k <= last.k) {
      // partida nova (o servidor recomeçou a contagem de passos) ou quadro repetido
      if (k < last.k - 240) this.reset();
      else {
        this.pool.push(sim);
        return;
      }
    }
    this.frames.push(f);
    while (this.frames.length > 10) this.pool.push(this.frames.shift()!.sim);
    const sample = k - now / STEP_MS;
    this.offF = this.offF === null || sample > this.offF ? sample : this.offF + (sample - this.offF) * 0.03;
    if (this.seat >= 0) this.reconcile(f);
    // sons do servidor: o que a previsão não toca (rebatida do outro, pontos), e tudo para quem assiste
    if (f.ev && this.onEvent) this.onEvent(f.ev, false);
  }

  onPong(data: unknown): void {
    const d = data as { c?: unknown; k?: unknown } | null;
    if (typeof d?.c !== "number" || typeof d.k !== "number") return;
    const now = performance.now();
    const rtt = Math.max(1, now - d.c);
    this.pongs.push({ rtt, off: d.k + rtt / 2 / STEP_MS - now / STEP_MS });
    if (this.pongs.length > 8) this.pongs.shift();
    // a amostra com a menor ida e volta é a mais confiável
    const best = this.pongs.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offP = best.off;
    this.rtt = this.rtt * 0.7 + rtt * 0.3;
  }

  /** Passo do servidor agora (estimado). */
  serverTick(now: number): number {
    if (this.offP !== null) return now / STEP_MS + this.offP;
    if (this.offF !== null) return now / STEP_MS + this.offF + this.rtt / 2 / STEP_MS;
    return -1;
  }

  reset(): void {
    for (const f of this.frames) this.pool.push(f.sim);
    this.frames.length = 0;
    this.offF = null;
    this.tick = -1;
    this.corr.fill(0);
  }

  // ---------------------------------------------------------------- quem assiste

  /** Pontos interpolados (quem assiste e a mesa no mundo). Devolve false sem quadros. */
  sample(now: number, out: Float64Array): boolean {
    const n = this.frames.length;
    if (!n || this.offF === null) return false;
    const t = now / STEP_MS + this.offF - INTERP;
    let i = n - 1;
    while (i > 0 && this.frames[i - 1]!.k > t) i--;
    const b = this.frames[i]!;
    const a = this.frames[Math.max(0, i - 1)]!;
    if (a === b || t >= b.k) {
      this.game.points(b.sim, out);
      return true;
    }
    this.game.points(a.sim, this.pa);
    this.game.points(b.sim, this.pb);
    const u = Math.max(0, Math.min(1, (t - a.k) / (b.k - a.k)));
    for (let j = 0; j < out.length; j++) out[j] = this.pa[j]! + (this.pb[j]! - this.pa[j]!) * u;
    return true;
  }

  /** Último quadro (estado do servidor), para regras e textos. */
  latest(): Frame<S> | undefined {
    return this.frames.at(-1);
  }

  // ---------------------------------------------------------------- quem joga

  /** Liga a previsão para o lugar `seat` (-1 desliga). */
  setSeat(seat: number): void {
    if (seat === this.seat) return;
    this.seat = seat;
    this.tick = -1;
    this.corr.fill(0);
    this.pongs = [];
    this.offP = null;
    this.pingsSent = 0;
    this.hasTarget = false;
  }

  /** Ping para acertar o relógio: rápido no começo, depois a cada segundo. */
  pingIfDue(now: number): void {
    const every = this.pingsSent < 5 ? 150 : 1000;
    if (now - this.lastPing < every) return;
    this.lastPing = now;
    this.pingsSent++;
    sendAct(this.id, "ping", { c: now });
  }

  /** Passo previsto (à frente do servidor). */
  private predictedTick(now: number): number {
    const s = this.serverTick(now);
    return s < 0 ? -1 : s + this.rtt / 2 / STEP_MS + LEAD_SLACK;
  }

  /** Anda a previsão até agora. Chame a cada quadro de animação, com o painel aberto. */
  advance(now: number, playing: boolean): void {
    if (this.seat < 0) return;
    this.pingIfDue(now);
    const f = this.latest();
    const goal = this.predictedTick(now);
    if (!f || goal < 0) return;
    const target = Math.floor(goal);
    this.frac = goal - target;
    if (this.tick < 0 || target - this.tick > 240 || target < f.k) {
      // começo ou máquina engasgada por mais de 2 s: parte do último quadro (e manda o controle mesmo assim)
      this.game.def.copy(f.sim, this.sim);
      this.game.def.copy(f.sim, this.prev);
      this.tick = Math.max(f.k, target);
      this.corr.fill(0);
      this.frozen = false;
      this.takeInput(this.tick - (this.tick % RT_INPUT_EVERY));
      return;
    }
    // passos desde o último quadro de animação (decai a correção na mesma conta)
    const steps = target - this.tick;
    if (steps > 0) {
      const k = Math.exp(-(steps * RT_STEP) / SMOOTH);
      for (let j = 0; j < this.corr.length; j++) this.corr[j]! *= k;
    }
    while (this.tick < target) {
      this.tick++;
      if (this.tick % RT_INPUT_EVERY === 0) this.takeInput(this.tick);
      this.game.def.copy(this.sim, this.prev);
      if (!playing || f.paused || this.frozen) continue;
      const ev = this.stepAt(this.sim, this.tick, f);
      if (ev && this.onEvent) {
        const mine = this.seat === 0 ? RT_EV.hit0 : RT_EV.hit1;
        this.onEvent(ev & (mine | RT_EV.wall | RT_EV.bounce), true);
      }
      if (ev & (RT_EV.point0 | RT_EV.point1)) this.frozen = true;
    }
  }

  /** Lê o controle neste passo de envio: guarda no histórico e manda para o servidor. */
  private takeInput(tick: number): void {
    if (!this.hasTarget) return;
    const i = tick % HIST;
    const x = rtMm(this.target.x);
    const z = rtMm(this.target.z);
    const a = this.target.a ? 1 : 0;
    this.target.a = 0;
    // sem mudança e sem ação: o servidor continua com o alvo anterior
    const pi = this.lastSampleIdx;
    if (pi >= 0 && !a && this.histT[pi]! >= 0 && rtMm(this.histX[pi]!) === x && rtMm(this.histZ[pi]!) === z && tick - this.histT[pi]! < 60) return;
    this.histT[i] = tick;
    this.histX[i] = x / 1000;
    this.histZ[i] = z / 1000;
    this.histA[i] = a;
    this.lastSampleIdx = i;
    sendAct(this.id, "aim", a ? { t: tick, x, z, a } : { t: tick, x, z });
  }
  private lastSampleIdx = -1;

  /** Meu alvo valendo no passo `t` (o último enviado até ele), com a ação só no passo exato. */
  private myTargetAt(t: number, f: Frame<S>): RtTarget | null {
    for (let back = 0; back < 120; back++) {
      const tt = t - back;
      const i = ((tt % HIST) + HIST) % HIST;
      if (this.histT[i] === tt) {
        this.mine.x = this.histX[i]!;
        this.mine.z = this.histZ[i]!;
        this.mine.a = back === 0 ? this.histA[i]! : 0;
        return this.mine;
      }
    }
    // sem histórico: fica onde o servidor viu
    this.game.points(f.sim, this.pa);
    const j = 2 + this.seat * 2;
    this.mine.x = this.pa[j]!;
    this.mine.z = this.pa[j + 1]!;
    this.mine.a = 0;
    return this.mine;
  }

  /** O outro: segue na direção em que vinha, por pouco tempo (o servidor corrige logo). */
  private theirTarget(f: Frame<S>, t: number): RtTarget {
    this.game.points(f.sim, this.pa);
    const o = this.seat === 0 ? 1 : 0;
    const j = 2 + o * 2;
    const prev = this.frames.length > 1 ? this.frames[this.frames.length - 2] : undefined;
    let vx = 0;
    let vz = 0;
    if (prev && f.k > prev.k) {
      this.game.points(prev.sim, this.pb);
      const dt = (f.k - prev.k) * RT_STEP;
      vx = (this.pa[j]! - this.pb[j]!) / dt;
      vz = (this.pa[j + 1]! - this.pb[j + 1]!) / dt;
    }
    const ahead = Math.min(0.1, Math.max(0, (t - f.k) * RT_STEP));
    this.theirs.x = this.pa[j]! + vx * ahead;
    this.theirs.z = this.pa[j + 1]! + vz * ahead;
    this.theirs.a = 0;
    return this.theirs;
  }

  private stepAt(s: S, t: number, f: Frame<S>): number {
    const me = this.myTargetAt(t, f);
    const them = this.theirTarget(f, t);
    this.targets[this.seat] = me;
    this.targets[this.seat === 0 ? 1 : 0] = them;
    return this.game.def.step(s, this.targets, RT_STEP);
  }

  /** Volta ao estado do servidor e refaz os passos até o passo previsto; guarda a diferença para suavizar. */
  private reconcile(f: Frame<S>): void {
    if (this.tick < 0) return;
    if (f.paused) {
      this.game.def.copy(f.sim, this.sim);
      this.game.def.copy(f.sim, this.prev);
      this.corr.fill(0);
      this.frozen = false;
      if (f.k > this.tick) this.tick = f.k;
      return;
    }
    if (f.k >= this.tick) {
      this.game.def.copy(f.sim, this.sim);
      this.game.def.copy(f.sim, this.prev);
      this.tick = f.k;
      this.frozen = false;
      return;
    }
    // onde as coisas estavam na tela antes da correção
    this.game.points(this.sim, this.pa);
    for (let j = 0; j < this.pa.length; j++) this.pa[j]! += this.corr[j]!;
    const s = this.scratch;
    this.game.def.copy(f.sim, s);
    let frozen = false;
    for (let t = f.k + 1; t <= this.tick; t++) {
      if (t === this.tick) this.game.def.copy(s, this.prev);
      if (frozen) continue;
      if (this.stepAt(s, t, f) & (RT_EV.point0 | RT_EV.point1)) frozen = true;
    }
    this.game.def.copy(s, this.sim);
    this.frozen = frozen;
    this.game.points(this.sim, this.pb);
    let big = false;
    for (let j = 0; j < this.pb.length; j++) {
      this.corr[j] = this.pa[j]! - this.pb[j]!;
      if (Math.abs(this.corr[j]!) > SNAP) big = true;
    }
    if (big) this.corr.fill(0);
  }

  /** Pontos da previsão para desenhar (com a suavização). */
  predicted(out: Float64Array): boolean {
    if (this.seat < 0 || this.tick < 0) return false;
    this.game.points(this.prev, this.pa);
    this.game.points(this.sim, out);
    const u = this.frac;
    for (let j = 0; j < out.length; j++) out[j] = this.pa[j]! + (out[j]! - this.pa[j]!) * u + this.corr[j]!;
    return true;
  }

  /** Simulação prevista (para dados extras, como a altura da bola). */
  predictedSim(): S | null {
    return this.seat >= 0 && this.tick >= 0 ? this.sim : null;
  }
}

const nets = new Map<string, DuelNet<unknown>>();

/** Rede de uma mesa (uma por atividade, criada sob demanda). */
export function duelNet<S>(id: string, game: DuelGameClient<S>): DuelNet<S> {
  let n = nets.get(id) as DuelNet<S> | undefined;
  if (!n) {
    n = new DuelNet(id, game);
    nets.set(id, n as DuelNet<unknown>);
  }
  return n;
}

export function existingNet<S>(id: string): DuelNet<S> | undefined {
  return nets.get(id) as DuelNet<S> | undefined;
}
