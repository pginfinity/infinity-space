import {
  DRAW_CHOOSE_MS,
  DRAW_COLORS,
  DRAW_DEFAULT_ROUNDS,
  DRAW_DEFAULT_SECONDS,
  DRAW_FEED_MAX,
  DRAW_GUESS_GAP_MS,
  DRAW_GUESS_MAX,
  DRAW_KIND,
  DRAW_MAX_PLAYERS,
  DRAW_MAX_POINTS,
  DRAW_MAX_STROKES,
  DRAW_MIN_PLAYERS,
  DRAW_ROUNDS,
  DRAW_SECONDS,
  DRAW_SIZES,
  DRAW_TURN_END_MS,
  drawActId,
  drawCheckGuess,
  drawCleanPoints,
  drawDrawerPoints,
  drawGuessPoints,
  drawHint,
  drawLetterIndexes,
  drawPickChoices,
  drawRevealCount,
  grupoClean,
  type DrawBegin,
  type DrawCanvas,
  type DrawChoices,
  type DrawFeedItem,
  type DrawLevel,
  type DrawPlayer,
  type DrawPoints,
  type DrawState,
  type DrawStroke,
  type DrawWord,
  type MapObject,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Sala parada (lobby ou placar final) fecha sozinha depois disso. */
const IDLE_MS = 10 * 60_000;

/**
 * Desenhe e adivinhe num quadro branco.
 *
 * Operações: `join`, `leave`, `config {rounds?, seconds?}`, `start`, `choose {i}`, `guess {text}`, `skip`,
 * `begin {s, c, w, p}`, `pts {s, p}`, `undo`, `clear`, `sync`, `again`, `end`.
 * Eventos: `choices` e `word` (só para quem desenha), `close` (só para quem chutou perto),
 * `begin` / `pts` / `undo` / `clear` (traços, para todos), `canvas` (desenho inteiro, para quem pediu),
 * `correct`, `turn`, `turnEnd` e `final` (para todos, sons e efeitos).
 */
export class DrawActivity implements Activity {
  readonly kind = DRAW_KIND;
  readonly id: string;
  private st: DrawState;
  private strokes: DrawStroke[] = [];
  private points = 0;
  private word: string | null = null;
  private choices: DrawChoices | null = null;
  private revealed = new Set<number>();
  private ends = 0;
  private turnStart = 0;
  private readonly drawn = new Set<string>();
  private readonly used = new Set<string>();
  private readonly lastGuess = new Map<string, number>();
  private correctCount = 0;
  private touched = Date.now();

  constructor(
    private readonly host: ActivityHost,
    board: MapObject,
  ) {
    this.id = drawActId(board.id);
    const zoneId = board.zoneId ?? host.zones.zoneAt(board.pos)?.id ?? "";
    const zoneName = host.map.zones.find((z) => z.id === zoneId)?.name ?? "";
    this.st = this.empty(zoneId, zoneName, 0);
  }

  private empty(zone: string, zoneName: string, game: number): DrawState {
    return {
      phase: "idle",
      game,
      zone,
      zoneName,
      owner: null,
      players: [],
      drawer: null,
      round: 0,
      rounds: DRAW_DEFAULT_ROUNDS,
      seconds: DRAW_DEFAULT_SECONDS,
      turn: 0,
      level: null,
      hint: "",
      word: null,
      left: 0,
      duration: 0,
      canvas: 0,
      feed: [],
    };
  }

  snapshot(): DrawState {
    const timed = this.st.phase === "choosing" || this.st.phase === "drawing" || this.st.phase === "turnEnd";
    return { ...this.st, left: timed ? Math.max(0, this.ends - Date.now()) : 0 };
  }

  private player(id: string): DrawPlayer | undefined {
    return this.st.players.find((p) => p.id === id);
  }

  private active(): DrawPlayer[] {
    return this.st.players.filter((p) => !p.away);
  }

  private inRoom(id: string): boolean {
    return this.host.playerZone(id)?.id === this.st.zone;
  }

  private playing(): boolean {
    const ph = this.st.phase;
    return ph === "choosing" || ph === "drawing" || ph === "turnEnd";
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
      case "choose":
        if (this.st.phase === "choosing" && from === this.st.drawer && typeof d.i === "number") this.choose(d.i);
        return;
      case "guess":
        return this.guess(from, d.text);
      case "skip":
        if (this.st.phase === "drawing" && from === this.st.drawer) this.endTurn();
        return;
      case "begin":
        return this.begin(from, d);
      case "pts":
        return this.pts(from, d);
      case "undo":
        if (this.st.phase === "drawing" && from === this.st.drawer && this.strokes.length > 0) {
          const s = this.strokes.pop()!;
          this.points -= s.p.length / 2;
          this.host.event(this, "undo", { canvas: this.st.canvas }, { from });
        }
        return;
      case "clear":
        if (this.st.phase === "drawing" && from === this.st.drawer) {
          this.newCanvas();
          this.host.event(this, "clear", { canvas: this.st.canvas }, { from });
          this.host.changed(this);
        }
        return;
      case "sync":
        return this.sync(from);
      case "again":
        return this.again(from);
      case "end":
        return this.end(from);
    }
  }

  // ---- sala ----------------------------------------------------------------------------------

  private enter(from: string): void {
    if (this.player(from) && !this.player(from)!.away) return;
    if (!this.inRoom(from)) return;
    const name = this.host.playerName(from) ?? "Alguém";
    if (this.st.phase === "idle") {
      this.st = { ...this.empty(this.st.zone, this.st.zoneName, this.st.game + 1), phase: "lobby", owner: from, rounds: this.st.rounds, seconds: this.st.seconds, canvas: this.st.canvas + 1 };
      this.strokes = [];
      this.points = 0;
    }
    const back = this.st.players.find((p) => p.away && p.name === name);
    if (back) {
      back.id = from;
      delete back.away;
    } else {
      if (this.active().length >= DRAW_MAX_PLAYERS) return;
      this.st.players.push({ id: from, name, score: 0, guessed: false, gain: 0 });
    }
    if (!this.st.owner || !this.player(this.st.owner) || this.player(this.st.owner)!.away) this.st.owner = from;
    this.feed({ k: "info", name, text: "entrou" });
    this.touched = Date.now();
    this.host.changed(this);
    this.sync(from);
  }

  /** Saiu do jogo (ou do escritório, com `gone`). */
  private drop(id: string, gone: boolean): void {
    const p = this.player(id);
    if (!p) return;
    if (this.playing() && gone) p.away = true;
    else this.st.players = this.st.players.filter((x) => x !== p);
    if (this.st.owner === id) this.st.owner = this.active()[0]?.id ?? null;
    this.feed({ k: "info", name: p.name, text: "saiu" });
    if (this.active().length === 0) {
      this.reset();
      return;
    }
    if (this.playing()) {
      if (this.active().length < DRAW_MIN_PLAYERS) {
        if (this.st.phase === "drawing") this.endTurn();
        this.finish();
        return;
      }
      if (this.st.drawer === id) {
        if (this.st.phase === "drawing") this.endTurn();
        else if (this.st.phase === "choosing") this.nextTurn();
        return;
      }
      if (this.st.phase === "drawing") this.maybeAllGuessed();
    }
    this.host.changed(this);
  }

  private config(from: string, d: Record<string, unknown>): void {
    if (from !== this.st.owner || this.st.phase !== "lobby") return;
    if (typeof d.rounds === "number" && DRAW_ROUNDS.includes(d.rounds)) this.st.rounds = d.rounds;
    if (typeof d.seconds === "number" && DRAW_SECONDS.includes(d.seconds)) this.st.seconds = d.seconds;
    this.host.changed(this);
  }

  private start(from: string): void {
    if (this.st.phase !== "lobby" || !this.player(from)) return;
    if (from !== this.st.owner) return;
    if (this.active().length < DRAW_MIN_PLAYERS) return;
    this.st.players = this.active();
    for (const p of this.st.players) Object.assign(p, { score: 0, gain: 0, guessed: false });
    this.st.round = 1;
    this.drawn.clear();
    this.used.clear();
    this.st.feed = [];
    this.nextTurn();
  }

  private again(from: string): void {
    if (this.st.phase !== "final" || !this.player(from)) return;
    this.st.phase = "lobby";
    this.st.players = this.active();
    for (const p of this.st.players) Object.assign(p, { score: 0, gain: 0, guessed: false });
    this.st.owner = this.player(this.st.owner ?? "") ? this.st.owner : from;
    this.st.drawer = null;
    this.st.word = null;
    this.st.hint = "";
    this.st.round = 0;
    this.st.game++;
    this.st.feed = [];
    this.newCanvas();
    this.touched = Date.now();
    this.host.changed(this);
  }

  private end(from: string): void {
    if (from !== this.st.owner && !(this.st.phase === "final" && this.player(from))) return;
    if (this.playing()) {
      if (this.st.phase === "drawing") this.endTurn();
      this.finish();
    } else this.reset();
  }

  private reset(): void {
    this.st = { ...this.empty(this.st.zone, this.st.zoneName, this.st.game), canvas: this.st.canvas + 1, rounds: this.st.rounds, seconds: this.st.seconds };
    this.strokes = [];
    this.points = 0;
    this.word = null;
    this.choices = null;
    this.host.event(this, "clear", { canvas: this.st.canvas });
    this.host.changed(this);
  }

  // ---- vez -----------------------------------------------------------------------------------

  private nextTurn(): void {
    const act = this.active();
    let next = act.find((p) => !this.drawn.has(p.id));
    if (!next) {
      this.st.round++;
      this.drawn.clear();
      if (this.st.round > this.st.rounds) return this.finish();
      next = act[0];
    }
    if (!next) return this.finish();
    this.drawn.add(next.id);
    for (const p of this.st.players) {
      p.guessed = false;
      p.gain = 0;
    }
    this.correctCount = 0;
    this.word = null;
    this.revealed.clear();
    this.st.phase = "choosing";
    this.st.drawer = next.id;
    this.st.turn++;
    this.st.level = null;
    this.st.hint = "";
    this.st.word = null;
    this.st.duration = DRAW_CHOOSE_MS;
    this.ends = Date.now() + DRAW_CHOOSE_MS;
    this.newCanvas();
    this.choices = { turn: this.st.turn, options: drawPickChoices(this.used, Math.random) };
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "clear", { canvas: this.st.canvas });
    this.host.event(this, "choices", this.choices, { to: [next.id] });
    this.host.event(this, "turn", { turn: this.st.turn, drawer: next.id, name: next.name });
  }

  private choose(i: number): void {
    const opt = this.choices?.options[Math.max(0, Math.min(2, Math.round(i)))];
    if (!opt) return;
    this.word = opt.word;
    this.used.add(opt.word);
    this.st.level = opt.level;
    this.st.hint = drawHint(opt.word, this.revealed);
    this.st.phase = "drawing";
    this.st.duration = this.st.seconds * 1000;
    this.turnStart = Date.now();
    this.ends = this.turnStart + this.st.duration;
    this.choices = null;
    this.host.changed(this);
    this.sendWord();
  }

  private sendWord(): void {
    if (!this.word || !this.st.drawer || !this.st.level) return;
    this.host.event(this, "word", { turn: this.st.turn, word: this.word, level: this.st.level } satisfies DrawWord, { to: [this.st.drawer] });
  }

  private guess(from: string, raw: unknown): void {
    if (this.st.phase !== "drawing" || from === this.st.drawer || !this.word || !this.st.level) return;
    const p = this.player(from);
    if (!p || p.away || p.guessed) return;
    const now = Date.now();
    if (now - (this.lastGuess.get(from) ?? 0) < DRAW_GUESS_GAP_MS) return;
    this.lastGuess.set(from, now);
    const text = grupoClean(raw, DRAW_GUESS_MAX);
    if (!text) return;
    const r = drawCheckGuess(text, this.word);
    if (r === "correct") {
      p.guessed = true;
      p.gain = drawGuessPoints(Math.max(0, this.ends - now), this.st.duration, this.correctCount, this.st.level as DrawLevel);
      p.score += p.gain;
      this.correctCount++;
      const drawer = this.player(this.st.drawer ?? "");
      if (drawer) {
        const pts = drawDrawerPoints(this.st.level as DrawLevel);
        drawer.gain += pts;
        drawer.score += pts;
      }
      this.feed({ k: "correct", name: p.name });
      this.host.emote(from, "cheer");
      this.host.event(this, "correct", { id: from, name: p.name, gain: p.gain });
      this.host.changed(this);
      this.maybeAllGuessed();
      return;
    }
    if (r === "close") {
      this.host.event(this, "close", { text }, { to: [from] });
      return;
    }
    this.feed({ k: "guess", name: p.name, text });
    this.host.changed(this);
  }

  private maybeAllGuessed(): void {
    const guessers = this.active().filter((p) => p.id !== this.st.drawer);
    if (guessers.length > 0 && guessers.every((p) => p.guessed)) this.endTurn();
  }

  private endTurn(): void {
    if (this.st.phase !== "drawing" && this.st.phase !== "choosing") return;
    this.st.phase = "turnEnd";
    this.st.word = this.word;
    if (this.word) this.st.hint = this.word;
    this.st.duration = DRAW_TURN_END_MS;
    this.ends = Date.now() + DRAW_TURN_END_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "turnEnd", { word: this.word, guessed: this.correctCount });
  }

  private finish(): void {
    this.st.phase = "final";
    this.st.drawer = null;
    this.choices = null;
    this.touched = Date.now();
    const top = [...this.st.players].sort((a, b) => b.score - a.score)[0];
    if (top && top.score > 0 && !top.away) this.host.emote(top.id, "dance");
    this.host.changed(this);
    this.host.event(this, "final", { winner: top && top.score > 0 ? top.name : null });
  }

  // ---- desenho -------------------------------------------------------------------------------

  private newCanvas(): void {
    this.strokes = [];
    this.points = 0;
    this.st.canvas++;
  }

  private begin(from: string, d: Record<string, unknown>): void {
    if (this.st.phase !== "drawing" || from !== this.st.drawer) return;
    if (this.strokes.length >= DRAW_MAX_STROKES) return;
    const p = drawCleanPoints(d.p);
    const s = d.s;
    const c = d.c;
    const w = d.w;
    if (!p || typeof s !== "number" || !Number.isInteger(s) || s < 0) return;
    if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c >= DRAW_COLORS.length) return;
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w >= DRAW_SIZES.length) return;
    if (this.points + p.length / 2 > DRAW_MAX_POINTS) return;
    if (this.strokes.some((x) => x.s === s)) return;
    const stroke: DrawStroke = { s, c, w, p };
    this.strokes.push(stroke);
    this.points += p.length / 2;
    this.host.event(this, "begin", { canvas: this.st.canvas, ...stroke, p } satisfies DrawBegin, { from });
  }

  private pts(from: string, d: Record<string, unknown>): void {
    if (this.st.phase !== "drawing" || from !== this.st.drawer) return;
    const p = drawCleanPoints(d.p);
    const last = this.strokes[this.strokes.length - 1];
    if (!p || !last || last.s !== d.s) return;
    if (this.points + p.length / 2 > DRAW_MAX_POINTS) return;
    last.p.push(...p);
    this.points += p.length / 2;
    this.host.event(this, "pts", { canvas: this.st.canvas, s: last.s, p } satisfies DrawPoints, { from });
  }

  private sync(to: string): void {
    this.host.event(this, "canvas", { canvas: this.st.canvas, strokes: this.strokes } satisfies DrawCanvas, { to: [to] });
    if (to === this.st.drawer) {
      if (this.st.phase === "choosing" && this.choices) this.host.event(this, "choices", this.choices, { to: [to] });
      if (this.st.phase === "drawing") this.sendWord();
    }
  }

  private feed(item: DrawFeedItem): void {
    this.st.feed = [...this.st.feed, item].slice(-DRAW_FEED_MAX);
  }

  tick(): void {
    const now = Date.now();
    const ph = this.st.phase;
    if (ph === "choosing" && now >= this.ends) this.choose(0);
    else if (ph === "drawing") {
      if (now >= this.ends) this.endTurn();
      else if (this.word) {
        const letters = drawLetterIndexes(this.word);
        const want = drawRevealCount((now - this.turnStart) / this.st.duration, letters.length);
        if (want > this.revealed.size) {
          const hidden = letters.filter((i) => !this.revealed.has(i));
          const pick = hidden[Math.floor(Math.random() * hidden.length)];
          if (pick !== undefined) {
            this.revealed.add(pick);
            this.st.hint = drawHint(this.word, this.revealed);
            this.host.changed(this);
          }
        }
      }
    } else if (ph === "turnEnd" && now >= this.ends) this.nextTurn();
    else if ((ph === "lobby" || ph === "final") && now - this.touched > IDLE_MS) this.reset();
  }

  leave(id: string): void {
    this.lastGuess.delete(id);
    this.drop(id, true);
  }
}
