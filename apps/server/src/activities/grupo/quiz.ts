import {
  QUIZ_COUNTS,
  QUIZ_HOST_GRACE_MS,
  QUIZ_ID,
  QUIZ_IDLE_MS,
  QUIZ_KIND,
  QUIZ_LECTERN_RANGE,
  QUIZ_MAX_PACKS,
  QUIZ_MAX_PLAYERS,
  QUIZ_MAX_QUESTIONS,
  QUIZ_READY_MS,
  QUIZ_SECONDS,
  QUIZ_STAGE,
  QUIZ_ZONES,
  grupoId,
  quizCleanQuestion,
  quizCleanTitle,
  quizDeal,
  quizEmptyState,
  quizPoints,
  quizSanitizeBank,
  quizSeedBank,
  quizSummaries,
  type QuizAnswered,
  type QuizBank,
  type QuizKey,
  type QuizPlayer,
  type QuizQuestion,
  type QuizState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const BANK_KEY = "grupo/quiz-banco";

/**
 * Quiz Show do Auditório.
 *
 * Operações (data não é confiável):
 * - apresentador (no palco ou no púlpito): `open`, `config {pack?, seconds?, count?}`, `start`, `reveal`, `next`, `end`
 * - plateia (no auditório): `join`, `leave`, `answer {n, choice}`
 * - banco (quem está no palco): `bank`, `packAdd {title}`, `packRename {id, title}`, `packDelete {id}`,
 *   `qSave {pack, id?, text, options, correct}`, `qDelete {pack, id}`
 *
 * Eventos: `key` (resposta certa, só para o apresentador), `answered` (confirmação, só para quem respondeu),
 * `bank` / `bankError` (só para quem edita), `start`, `reveal` e `final` (para todos, efeitos e sons).
 */
export class QuizActivity implements Activity {
  readonly id = QUIZ_ID;
  readonly kind = QUIZ_KIND;
  private bank: QuizBank;
  private st: QuizState;
  private deck: QuizQuestion[] = [];
  private qi = -1;
  private ends = 0;
  private qStart = 0;
  private readonly answers = new Map<string, { choice: number; at: number }>();
  private hostGoneAt = 0;
  private touched = Date.now();
  private readonly lectern: Vec2 | null;

  constructor(private readonly host: ActivityHost) {
    const stored = quizSanitizeBank(host.store.get<unknown>(BANK_KEY, null));
    this.bank = stored ?? quizSeedBank();
    if (!stored) host.store.set(BANK_KEY, this.bank);
    const l = host.objects("lectern")[0];
    this.lectern = l?.interact?.point ?? l?.pos ?? null;
    this.st = quizEmptyState(quizSummaries(this.bank));
  }

  snapshot(): QuizState {
    const timed = this.st.phase === "ready" || this.st.phase === "question";
    return { ...this.st, left: timed ? Math.max(0, this.ends - Date.now()) : 0, answered: this.answers.size };
  }

  // ---- permissões ---------------------------------------------------------------------------

  /** No palco ou no púlpito. */
  private onStage(id: string): boolean {
    if (this.host.playerZone(id)?.id === QUIZ_STAGE) return true;
    return !!this.lectern && this.host.near(id, this.lectern, QUIZ_LECTERN_RANGE);
  }

  private inAuditorium(id: string): boolean {
    const z = this.host.playerZone(id)?.id;
    return !!z && QUIZ_ZONES.includes(z);
  }

  private isHost(id: string): boolean {
    return this.st.host?.id === id;
  }

  private player(id: string): QuizPlayer | undefined {
    return this.st.players.find((p) => p.id === id);
  }

  // ---- pedidos -------------------------------------------------------------------------------

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (op) {
      case "open":
        return this.open(from);
      case "config":
        return this.config(from, d);
      case "join":
        return this.enter(from);
      case "leave":
        return this.leaveGame(from);
      case "start":
        return this.start(from);
      case "answer":
        return this.answer(from, d);
      case "reveal":
        if (this.isHost(from) && this.st.phase === "question") this.doReveal();
        return;
      case "next":
        if (this.isHost(from) && this.st.phase === "reveal") this.advance();
        return;
      case "end":
        return this.end(from);
      default:
        return this.bankOp(from, op, d);
    }
  }

  private open(from: string): void {
    if (!this.onStage(from)) return;
    this.touched = Date.now();
    if (this.st.phase === "idle") {
      const pack = this.bank.packs.find((p) => p.questions.length > 0) ?? this.bank.packs[0] ?? null;
      this.st = {
        ...quizEmptyState(quizSummaries(this.bank)),
        phase: "lobby",
        game: this.st.game + 1,
        host: { id: from, name: this.name(from) },
        pack: pack ? { id: pack.id, title: pack.title } : null,
        seconds: this.st.seconds,
        count: this.st.count,
      };
      this.hostGoneAt = 0;
      this.host.changed(this);
      return;
    }
    // Sem apresentador (caiu ou saiu): quem sobe ao palco assume.
    if (!this.isHost(from) && this.st.host && !this.host.players().includes(this.st.host.id)) {
      this.st.players = this.st.players.filter((p) => p.id !== from);
      this.st.host = { id: from, name: this.name(from) };
      this.hostGoneAt = 0;
      this.host.changed(this);
      this.sendKey();
    } else if (this.isHost(from)) {
      this.sendKey();
    }
  }

  private config(from: string, d: Record<string, unknown>): void {
    if (!this.isHost(from) || this.st.phase !== "lobby") return;
    if (typeof d.pack === "string") {
      const p = this.bank.packs.find((x) => x.id === d.pack);
      if (p) this.st.pack = { id: p.id, title: p.title };
    }
    if (typeof d.seconds === "number" && QUIZ_SECONDS.includes(d.seconds)) this.st.seconds = d.seconds;
    if (typeof d.count === "number" && QUIZ_COUNTS.includes(d.count)) this.st.count = d.count;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private enter(from: string): void {
    if (this.st.phase === "idle" || this.st.phase === "final" || this.isHost(from) || !this.inAuditorium(from)) return;
    if (this.player(from)) return;
    const name = this.name(from);
    // Quem caiu e voltou (id novo, mesmo nome) recupera a pontuação.
    const back = this.st.players.find((p) => p.away && p.name === name);
    if (back) {
      back.id = from;
      delete back.away;
    } else {
      if (this.st.players.filter((p) => !p.away).length >= QUIZ_MAX_PLAYERS) return;
      this.st.players.push({ id: from, name, score: 0, answered: false, gain: 0, streak: 0, hits: 0 });
    }
    this.touched = Date.now();
    this.host.changed(this);
  }

  private leaveGame(from: string): void {
    const before = this.st.players.length;
    this.st.players = this.st.players.filter((p) => p.id !== from);
    this.answers.delete(from);
    if (this.st.players.length !== before) {
      this.host.changed(this);
      this.maybeAllAnswered();
    }
  }

  private start(from: string): void {
    if (!this.isHost(from) || this.st.phase !== "lobby" || !this.st.pack) return;
    const pack = this.bank.packs.find((p) => p.id === this.st.pack!.id);
    if (!pack || pack.questions.length === 0 || this.active().length === 0) return;
    this.deck = quizDeal(pack.questions, this.st.count, Math.random);
    this.qi = -1;
    for (const p of this.st.players) Object.assign(p, { score: 0, gain: 0, streak: 0, hits: 0, answered: false });
    this.host.event(this, "start", { game: this.st.game, total: this.deck.length });
    this.nextQuestion();
  }

  private answer(from: string, d: Record<string, unknown>): void {
    if (this.st.phase !== "question") return;
    const p = this.player(from);
    if (!p || p.away || this.answers.has(from)) return;
    const n = d.n;
    const choice = d.choice;
    if (n !== this.qi + 1 || typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 3) return;
    const now = Date.now();
    if (now > this.ends) return;
    this.answers.set(from, { choice, at: now });
    p.answered = true;
    this.host.event(this, "answered", { n, choice } satisfies QuizAnswered, { to: [from] });
    this.host.changed(this);
    this.maybeAllAnswered();
  }

  private end(from: string): void {
    if (this.st.phase === "idle") return;
    const hostAway = !this.st.host || !this.host.players().includes(this.st.host.id);
    if (!this.isHost(from) && !(hostAway && this.onStage(from))) return;
    // No meio da partida, "encerrar" mostra o placar final; no lobby ou no placar, fecha.
    if (this.st.phase === "ready" || this.st.phase === "question" || this.st.phase === "reveal") {
      if (this.st.phase === "question") this.doReveal();
      this.finish();
      return;
    }
    this.reset();
  }

  // ---- andamento -----------------------------------------------------------------------------

  private active(): QuizPlayer[] {
    return this.st.players.filter((p) => !p.away);
  }

  private nextQuestion(): void {
    this.qi++;
    const q = this.deck[this.qi]!;
    this.answers.clear();
    for (const p of this.st.players) {
      p.answered = false;
      p.gain = 0;
    }
    this.st.phase = "ready";
    this.st.reveal = null;
    this.st.question = { n: this.qi + 1, total: this.deck.length, text: q.text, options: [] };
    this.st.duration = QUIZ_READY_MS;
    this.ends = Date.now() + QUIZ_READY_MS;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private openAnswers(): void {
    const q = this.deck[this.qi]!;
    this.st.phase = "question";
    this.st.question = { n: this.qi + 1, total: this.deck.length, text: q.text, options: [...q.options] };
    this.st.duration = this.st.seconds * 1000;
    this.qStart = Date.now();
    this.ends = this.qStart + this.st.duration;
    this.host.changed(this);
    this.sendKey();
  }

  private sendKey(): void {
    const q = this.deck[this.qi];
    if (!this.st.host || !q || (this.st.phase !== "question" && this.st.phase !== "ready")) return;
    this.host.event(this, "key", { n: this.qi + 1, correct: q.correct } satisfies QuizKey, { to: [this.st.host.id] });
  }

  private maybeAllAnswered(): void {
    if (this.st.phase !== "question") return;
    const act = this.active();
    if (act.length > 0 && act.every((p) => this.answers.has(p.id))) this.doReveal();
  }

  private doReveal(): void {
    const q = this.deck[this.qi]!;
    const counts = [0, 0, 0, 0];
    for (const a of this.answers.values()) counts[a.choice]!++;
    for (const p of this.st.players) {
      const a = this.answers.get(p.id);
      const right = !!a && a.choice === q.correct;
      p.gain = a ? quizPoints(right, a.at - this.qStart, this.st.duration) : 0;
      p.score += p.gain;
      p.streak = right ? p.streak + 1 : 0;
      if (right) {
        p.hits++;
        this.host.emote(p.id, "cheer");
      }
    }
    this.st.phase = "reveal";
    this.st.reveal = { correct: q.correct, counts };
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "reveal", { n: this.qi + 1, correct: q.correct });
  }

  private advance(): void {
    if (this.qi + 1 < this.deck.length) this.nextQuestion();
    else this.finish();
  }

  private finish(): void {
    this.st.phase = "final";
    this.st.question = null;
    this.answers.clear();
    this.touched = Date.now();
    const ranked = [...this.st.players].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top && top.score > 0) this.host.emote(top.id, "dance");
    this.host.changed(this);
    this.host.event(this, "final", { game: this.st.game, winner: top && top.score > 0 ? top.name : null });
  }

  private reset(): void {
    this.deck = [];
    this.qi = -1;
    this.answers.clear();
    this.st = { ...quizEmptyState(quizSummaries(this.bank)), game: this.st.game, seconds: this.st.seconds, count: this.st.count };
    this.host.changed(this);
  }

  tick(): void {
    const now = Date.now();
    const ph = this.st.phase;
    if (ph === "idle") return;
    if (ph === "ready" && now >= this.ends) this.openAnswers();
    else if (ph === "question" && now >= this.ends) this.doReveal();
    // Apresentador sumiu: a partida espera um pouco e depois fecha.
    if (this.st.host && !this.host.players().includes(this.st.host.id)) {
      if (!this.hostGoneAt) this.hostGoneAt = now;
      else if (now - this.hostGoneAt > QUIZ_HOST_GRACE_MS) {
        if (ph === "lobby" || ph === "final") this.reset();
        else this.finish();
        this.hostGoneAt = now;
      }
    } else this.hostGoneAt = 0;
    if ((ph === "lobby" || ph === "reveal" || ph === "final") && now - this.touched > QUIZ_IDLE_MS) this.reset();
  }

  leave(id: string): void {
    const p = this.player(id);
    if (!p) return;
    if (this.st.phase === "lobby") this.st.players = this.st.players.filter((x) => x.id !== id);
    else p.away = true;
    this.answers.delete(id);
    this.host.changed(this);
    this.maybeAllAnswered();
  }

  // ---- banco de perguntas --------------------------------------------------------------------

  private bankOp(from: string, op: string, d: Record<string, unknown>): void {
    const ops = ["bank", "packAdd", "packRename", "packDelete", "qSave", "qDelete"];
    if (!ops.includes(op)) return;
    if (!this.onStage(from) && !this.isHost(from)) return this.bankError(from, "stage");
    if (op === "bank") return this.sendBank(from);
    const packs = this.bank.packs;
    const pack = typeof d.pack === "string" ? packs.find((p) => p.id === d.pack) : typeof d.id === "string" ? packs.find((p) => p.id === d.id) : undefined;
    switch (op) {
      case "packAdd": {
        const title = quizCleanTitle(d.title);
        if (!title) return this.bankError(from, "title");
        if (packs.length >= QUIZ_MAX_PACKS) return this.bankError(from, "full");
        packs.push({ id: grupoId("pacote"), title, questions: [] });
        break;
      }
      case "packRename": {
        const title = quizCleanTitle(d.title);
        if (!pack) return;
        if (!title) return this.bankError(from, "title");
        pack.title = title;
        if (this.st.pack?.id === pack.id) this.st.pack.title = title;
        break;
      }
      case "packDelete": {
        if (!pack) return;
        this.bank.packs = packs.filter((p) => p !== pack);
        if (this.st.pack?.id === pack.id) {
          const other = this.bank.packs.find((p) => p.questions.length > 0) ?? this.bank.packs[0];
          this.st.pack = other ? { id: other.id, title: other.title } : null;
        }
        break;
      }
      case "qSave": {
        if (!pack) return;
        const existing = typeof d.id === "string" ? pack.questions.find((q) => q.id === d.id) : undefined;
        if (!existing && pack.questions.length >= QUIZ_MAX_QUESTIONS) return this.bankError(from, "full");
        const q = quizCleanQuestion(d, existing?.id);
        if (typeof q === "string") return this.bankError(from, q);
        if (existing) Object.assign(existing, q);
        else pack.questions.push(q);
        break;
      }
      case "qDelete": {
        if (!pack || typeof d.id !== "string") return;
        pack.questions = pack.questions.filter((q) => q.id !== d.id);
        break;
      }
    }
    this.host.store.set(BANK_KEY, this.bank);
    this.st.packs = quizSummaries(this.bank);
    this.host.changed(this);
    this.sendBank(from);
  }

  private sendBank(to: string): void {
    this.host.event(this, "bank", this.bank, { to: [to] });
  }

  private bankError(to: string, reason: string): void {
    this.host.event(this, "bankError", { reason }, { to: [to] });
  }

  private name(id: string): string {
    return this.host.playerName(id) ?? "Alguém";
  }
}
