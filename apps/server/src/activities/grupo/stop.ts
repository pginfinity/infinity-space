import {
  STOP_DEFAULT_CATEGORIES,
  STOP_DEFAULT_ROUNDS,
  STOP_DEFAULT_SECONDS,
  STOP_GRACE_MS,
  STOP_ID,
  STOP_KIND,
  STOP_MAX_PLAYERS,
  STOP_MIN_PLAYERS,
  STOP_REVIEW_MS,
  STOP_ROUNDS,
  STOP_SECONDS,
  STOP_SPIN_MS,
  STOP_ZONE,
  stopCleanAnswer,
  stopCleanCategories,
  stopDrawLetter,
  stopFitsLetter,
  stopScore,
  stopVoteKey,
  stopVotesNeeded,
  type StopPlayer,
  type StopState,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const CATS_KEY = "grupo/stop-categorias";
const IDLE_MS = 10 * 60_000;

/**
 * Stop (Adedonha) do Café.
 *
 * Operações: `join`, `leave`, `config {categories?, seconds?, rounds?}`, `start`, `draft {answers}`,
 * `stop {answers}`, `vote {player, cat, on}`, `ready {on}`, `next`, `again`, `end`.
 * Eventos: `spin` (letra sorteada), `go`, `stop` (alguém gritou), `results`, `final`.
 * As respostas ficam guardadas aqui durante a rodada; só vão para o estado na validação.
 */
export class StopActivity implements Activity {
  readonly id = STOP_ID;
  readonly kind = STOP_KIND;
  private st: StopState;
  private readonly drafts = new Map<string, string[]>();
  private ends = 0;
  private touched = Date.now();
  /** Quem estava na rodada quando ela acabou (para a votação). */
  private roundPlayers: string[] = [];

  constructor(private readonly host: ActivityHost) {
    const saved = stopCleanCategories(host.store.get<unknown>(CATS_KEY, null));
    this.st = this.empty(saved ?? [...STOP_DEFAULT_CATEGORIES], 0);
  }

  private empty(categories: string[], game: number): StopState {
    return {
      phase: "idle",
      game,
      owner: null,
      categories,
      seconds: STOP_DEFAULT_SECONDS,
      rounds: STOP_DEFAULT_ROUNDS,
      round: 0,
      letter: null,
      used: [],
      players: [],
      left: 0,
      duration: 0,
      stoppedBy: null,
      answers: null,
      votes: {},
      points: null,
    };
  }

  snapshot(): StopState {
    const ph = this.st.phase;
    const timed = ph === "spin" || ph === "playing" || ph === "stopping" || ph === "review";
    return { ...this.st, left: timed ? Math.max(0, this.ends - Date.now()) : 0 };
  }

  private player(id: string): StopPlayer | undefined {
    return this.st.players.find((p) => p.id === id);
  }

  private active(): StopPlayer[] {
    return this.st.players.filter((p) => !p.away);
  }

  private inGame(): boolean {
    const ph = this.st.phase;
    return ph !== "idle" && ph !== "lobby" && ph !== "final";
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (op) {
      case "join":
        return this.enter(from);
      case "leave":
        return this.drop(from, false);
      case "config":
        return this.config(from, d);
      case "start":
        return this.start(from);
      case "draft":
        return this.draft(from, d.answers);
      case "stop":
        return this.stop(from, d.answers);
      case "vote":
        return this.vote(from, d);
      case "ready":
        return this.ready(from, d.on !== false);
      case "next":
        if (this.st.phase === "results" && this.player(from)) this.nextRound();
        return;
      case "again":
        return this.again(from);
      case "end":
        return this.end(from);
    }
  }

  // ---- sala ----------------------------------------------------------------------------------

  private enter(from: string): void {
    if (this.player(from) && !this.player(from)!.away) return;
    if (this.host.playerZone(from)?.id !== STOP_ZONE) return;
    const name = this.host.playerName(from) ?? "Alguém";
    if (this.st.phase === "idle") {
      this.st = { ...this.empty(this.st.categories, this.st.game + 1), phase: "lobby", owner: from, seconds: this.st.seconds, rounds: this.st.rounds };
      this.drafts.clear();
    }
    const back = this.st.players.find((p) => p.away && p.name === name);
    if (back) {
      const old = back.id;
      back.id = from;
      delete back.away;
      const draft = this.drafts.get(old);
      if (draft) this.drafts.set(from, draft);
      if (this.st.answers?.[old]) this.st.answers[from] = this.st.answers[old]!;
    } else {
      if (this.active().length >= STOP_MAX_PLAYERS) return;
      this.st.players.push({ id: from, name, score: 0, filled: 0, ready: false, gain: 0 });
    }
    if (!this.st.owner || !this.player(this.st.owner) || this.player(this.st.owner)!.away) this.st.owner = from;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private drop(id: string, gone: boolean): void {
    const p = this.player(id);
    if (!p) return;
    if (this.inGame() && gone) p.away = true;
    else {
      this.st.players = this.st.players.filter((x) => x !== p);
      this.drafts.delete(id);
    }
    if (this.st.owner === id) this.st.owner = this.active()[0]?.id ?? null;
    if (this.active().length === 0) return this.reset();
    if (this.inGame() && this.active().length < STOP_MIN_PLAYERS && this.st.phase !== "results") {
      // Sozinho não tem Stop: apura o que houver e encerra.
      if (this.st.phase === "review") this.score();
      this.finish();
      return;
    }
    if (this.st.phase === "review") this.maybeAllReady();
    this.host.changed(this);
  }

  private config(from: string, d: Record<string, unknown>): void {
    if (from !== this.st.owner || this.st.phase !== "lobby") return;
    if (d.categories !== undefined) {
      const cats = stopCleanCategories(d.categories);
      if (cats) {
        this.st.categories = cats;
        this.host.store.set(CATS_KEY, cats);
      }
    }
    if (typeof d.seconds === "number" && STOP_SECONDS.includes(d.seconds)) this.st.seconds = d.seconds;
    if (typeof d.rounds === "number" && STOP_ROUNDS.includes(d.rounds)) this.st.rounds = d.rounds;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private start(from: string): void {
    if (this.st.phase !== "lobby" || from !== this.st.owner || this.active().length < STOP_MIN_PLAYERS) return;
    this.st.players = this.active();
    for (const p of this.st.players) Object.assign(p, { score: 0, gain: 0, filled: 0, ready: false });
    this.st.round = 0;
    this.st.used = [];
    this.nextRound();
  }

  private again(from: string): void {
    if (this.st.phase !== "final" || !this.player(from)) return;
    const owner = this.player(this.st.owner ?? "") && !this.player(this.st.owner ?? "")!.away ? this.st.owner : from;
    this.st = { ...this.empty(this.st.categories, this.st.game + 1), phase: "lobby", owner, seconds: this.st.seconds, rounds: this.st.rounds, players: this.active().map((p) => ({ ...p, score: 0, gain: 0, filled: 0, ready: false })) };
    this.drafts.clear();
    this.touched = Date.now();
    this.host.changed(this);
  }

  private end(from: string): void {
    if (from !== this.st.owner && !(this.st.phase === "final" && this.player(from))) return;
    if (this.inGame()) this.finish();
    else this.reset();
  }

  private reset(): void {
    this.st = this.empty(this.st.categories, this.st.game);
    this.drafts.clear();
    this.host.changed(this);
  }

  // ---- rodada --------------------------------------------------------------------------------

  private nextRound(): void {
    if (this.st.round >= this.st.rounds) return this.finish();
    this.st.round++;
    const letter = stopDrawLetter(this.st.used, Math.random);
    this.st.used = [...this.st.used, letter];
    this.st.letter = letter;
    this.st.phase = "spin";
    this.st.answers = null;
    this.st.points = null;
    this.st.votes = {};
    this.st.stoppedBy = null;
    for (const p of this.st.players) Object.assign(p, { filled: 0, ready: false, gain: 0 });
    this.drafts.clear();
    this.st.duration = STOP_SPIN_MS;
    this.ends = Date.now() + STOP_SPIN_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "spin", { letter, round: this.st.round });
  }

  private clean(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    return this.st.categories.map((_, i) => stopCleanAnswer(raw[i]));
  }

  private draft(from: string, raw: unknown): void {
    if (this.st.phase !== "playing" && this.st.phase !== "stopping") return;
    const p = this.player(from);
    const answers = this.clean(raw);
    if (!p || p.away || !answers) return;
    this.drafts.set(from, answers);
    const filled = answers.filter((a) => a.length > 0).length;
    if (filled !== p.filled) {
      p.filled = filled;
      this.host.changed(this);
    }
  }

  private stop(from: string, raw: unknown): void {
    if (this.st.phase !== "playing") return;
    const p = this.player(from);
    const answers = this.clean(raw);
    if (!p || p.away || !answers || answers.some((a) => a.length === 0)) return;
    this.drafts.set(from, answers);
    p.filled = answers.length;
    this.st.stoppedBy = p.name;
    this.toStopping();
    this.host.event(this, "stop", { name: p.name });
  }

  private toStopping(): void {
    this.st.phase = "stopping";
    this.st.duration = STOP_GRACE_MS;
    this.ends = Date.now() + STOP_GRACE_MS;
    this.host.changed(this);
  }

  private toReview(): void {
    const answers: Record<string, string[]> = {};
    this.roundPlayers = this.st.players.map((p) => p.id);
    for (const p of this.st.players) answers[p.id] = this.drafts.get(p.id) ?? this.st.categories.map(() => "");
    this.st.answers = answers;
    this.st.votes = {};
    this.st.phase = "review";
    for (const p of this.st.players) p.ready = !!p.away;
    this.st.duration = STOP_REVIEW_MS;
    this.ends = Date.now() + STOP_REVIEW_MS;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private vote(from: string, d: Record<string, unknown>): void {
    if (this.st.phase !== "review" || !this.st.answers || !this.player(from)) return;
    const target = d.player;
    const cat = d.cat;
    if (typeof target !== "string" || target === from || typeof cat !== "number" || !Number.isInteger(cat)) return;
    const row = this.st.answers[target];
    const answer = row?.[cat];
    if (!answer || !stopFitsLetter(answer, this.st.letter ?? "")) return;
    const key = stopVoteKey(target, cat);
    const cur = new Set(this.st.votes[key] ?? []);
    if (d.on === false) cur.delete(from);
    else cur.add(from);
    if (cur.size) this.st.votes[key] = [...cur];
    else delete this.st.votes[key];
    this.touched = Date.now();
    this.host.changed(this);
  }

  private ready(from: string, on: boolean): void {
    if (this.st.phase !== "review") return;
    const p = this.player(from);
    if (!p) return;
    p.ready = on;
    this.host.changed(this);
    this.maybeAllReady();
  }

  private maybeAllReady(): void {
    if (this.st.phase === "review" && this.active().every((p) => p.ready)) this.score();
  }

  private score(): void {
    if (!this.st.answers) return;
    const ids = this.roundPlayers.filter((id) => this.st.answers![id]);
    const n = ids.length;
    const need = stopVotesNeeded(n);
    const rows = ids.map((id) => this.st.answers![id]!);
    const annulled = ids.map((id) => this.st.categories.map((_, c) => (this.st.votes[stopVoteKey(id, c)] ?? []).filter((v) => v !== id).length >= need));
    const pts = stopScore(rows, this.st.letter ?? "", annulled);
    const points: Record<string, number[]> = {};
    ids.forEach((id, i) => {
      points[id] = pts[i]!;
      const p = this.player(id);
      if (p) {
        p.gain = pts[i]!.reduce((a, b) => a + b, 0);
        p.score += p.gain;
      }
    });
    this.st.points = points;
    this.st.phase = "results";
    this.touched = Date.now();
    const best = [...this.st.players].sort((a, b) => b.gain - a.gain)[0];
    if (best && best.gain > 0 && !best.away) this.host.emote(best.id, "cheer");
    this.host.changed(this);
    this.host.event(this, "results", { round: this.st.round });
  }

  private finish(): void {
    this.st.phase = "final";
    this.touched = Date.now();
    const top = [...this.st.players].sort((a, b) => b.score - a.score)[0];
    if (top && top.score > 0 && !top.away) this.host.emote(top.id, "dance");
    this.host.changed(this);
    this.host.event(this, "final", { winner: top && top.score > 0 ? top.name : null });
  }

  tick(): void {
    const now = Date.now();
    const ph = this.st.phase;
    if (ph === "spin" && now >= this.ends) {
      this.st.phase = "playing";
      this.st.duration = this.st.seconds * 1000;
      this.ends = now + this.st.duration;
      this.host.changed(this);
      this.host.event(this, "go", { letter: this.st.letter });
    } else if (ph === "playing" && now >= this.ends) this.toStopping();
    else if (ph === "stopping" && now >= this.ends) this.toReview();
    else if (ph === "review" && now >= this.ends) this.score();
    else if ((ph === "lobby" || ph === "results" || ph === "final") && now - this.touched > IDLE_MS) this.reset();
  }

  leave(id: string): void {
    this.drop(id, true);
  }
}
