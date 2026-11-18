import {
  PAL_COOP_NAME,
  PAL_DEFAULT_ROUNDS,
  PAL_DEFAULT_SECONDS,
  PAL_EDIT_RANGE,
  PAL_FEED_MAX,
  PAL_FLAG_GAP_MS,
  PAL_FLAG_MS,
  PAL_GUESS_GAP_MS,
  PAL_GUESS_MAX,
  PAL_HINT_GAP_MS,
  PAL_HINT_MAX,
  PAL_ID,
  PAL_KIND,
  PAL_MAX_CARDS,
  PAL_MAX_PLAYERS,
  PAL_MAX_THEMES,
  PAL_MIN_PLAYERS,
  PAL_MODES,
  PAL_READY_MS,
  PAL_ROUNDS,
  PAL_SECONDS,
  PAL_SKIPS,
  PAL_TEAM_NAMES,
  PAL_TURN_END_MS,
  PAL_ZONE,
  grupoClean,
  palCardAudience,
  palCardTaken,
  palCheckGuess,
  palCleanCard,
  palCleanLabel,
  palCleanThemes,
  palDeck,
  palHintHit,
  palLabelTaken,
  palNewId,
  palRole,
  palSanitizeBank,
  palSeedBank,
  palSplitTeams,
  palSummaries,
  palTotalTurns,
  palUsesTeams,
  palWinner,
  type PalBank,
  type PalBankError,
  type PalCard,
  type PalCardEvent,
  type PalFeedItem,
  type PalMode,
  type PalPlayer,
  type PalState,
  type PalTeam,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/** Sala parada (lobby ou placar final) fecha sozinha depois disso. */
const IDLE_MS = 10 * 60_000;
const LABEL = "Palavra secreta";
/** Chave do banco de cartas no store (null ou ausente: as 150 cartas originais). */
const BANK_KEY = "grupo/palavra-banco";
const BANK_OPS = ["bank", "themeAdd", "themeRename", "themeDelete", "cardSave", "cardDelete", "bankReset"];

const twoTeams = (): PalTeam[] => PAL_TEAM_NAMES.map((name) => ({ name, score: 0 }));

/**
 * Palavra secreta, no painel de letras do Marketing Studio.
 *
 * Operações: `join`, `leave`, `config {seconds?, rounds?, themes?, mode?}`, `shuffle` (sorteia os times de novo),
 * `start`, `go` (o dicador começa a vez), `guess {text}`, `hint {text}`, `skip`, `flag` (Proibida!),
 * `judge {ok}` (o dicador decide), `sync` (pede a carta de novo), `again`, `end`.
 * Editor de cartas (perto do painel e sem partida em andamento): `bank`, `themeAdd {label}`,
 * `themeRename {id, label}`, `themeDelete {id}`, `cardSave {theme, id?, word, forbidden}`, `cardDelete {id}`
 * e `bankReset` (volta às cartas originais).
 * Eventos: `card` (só para o dicador e o time adversário), `close` e `blocked` (só para quem mandou),
 * `bank` e `bankError` (só para quem edita), `turn`, `go`, `hit`, `skip`, `flag`, `forbidden`,
 * `turnEnd` e `final` (para todos: sons e efeitos).
 */
export class PalavraActivity implements Activity {
  readonly id = PAL_ID;
  readonly kind = PAL_KIND;
  private st: PalState;
  /** Banco de cartas (temas com cartas). Vai inteiro só para quem abre o editor. */
  private bank: PalBank;
  /** Onde fica o painel de letras (o editor abre perto dele). */
  private readonly board: Vec2 | null;
  /** Carta da vez: fica só aqui (vai por evento para quem pode ver). */
  private card: PalCard | null = null;
  private deck: PalCard[] = [];
  private readonly used = new Set<string>();
  /** Próximo dicador de cada time (índice na lista de quem está ativo no time). */
  private nextGiver = [0, 0];
  private firstTeam = 0;
  private ends = 0;
  private flagEnds = 0;
  private readonly lastGuess = new Map<string, number>();
  private readonly lastHint = new Map<string, number>();
  private readonly lastFlag = new Map<string, number>();
  private touched = Date.now();

  constructor(private readonly host: ActivityHost) {
    this.bank = palSanitizeBank(host.store.get<unknown>(BANK_KEY, null)) ?? palSeedBank();
    this.board = host.objects("word-board")[0]?.pos ?? null;
    this.st = this.empty(0);
  }

  private empty(game: number): PalState {
    return {
      phase: "idle",
      game,
      owner: null,
      coop: false,
      mode: "teams",
      players: [],
      teams: twoTeams(),
      seconds: PAL_DEFAULT_SECONDS,
      rounds: PAL_DEFAULT_ROUNDS,
      themes: this.bank.themes.map((t) => t.id),
      catalog: palSummaries(this.bank),
      turn: 0,
      turns: 0,
      team: 0,
      giver: null,
      cardNo: 0,
      skips: PAL_SKIPS,
      gain: 0,
      flag: null,
      done: [],
      feed: [],
      winner: null,
      left: 0,
      duration: 0,
    };
  }

  snapshot(): PalState {
    return { ...this.st, left: this.inGame() ? Math.max(0, this.ends - Date.now()) : 0 };
  }

  private player(id: string): PalPlayer | undefined {
    return this.st.players.find((p) => p.id === id);
  }

  private active(): PalPlayer[] {
    return this.st.players.filter((p) => !p.away);
  }

  private inGame(): boolean {
    const ph = this.st.phase;
    return ph === "ready" || ph === "playing" || ph === "turnEnd";
  }

  // ---- um jogo por vez ------------------------------------------------------------------------

  seatLabel(id: string): string | null {
    const p = this.player(id);
    return p && !p.away ? LABEL : null;
  }

  inMatchFor(id: string): boolean {
    return !!this.seatLabel(id) && this.inGame();
  }

  releaseSeat(id: string): void {
    if (!this.inGame()) this.drop(id, false);
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
      case "shuffle":
        return this.shuffle(from);
      case "start":
        return this.start(from);
      case "go":
        if (this.st.phase === "ready" && from === this.st.giver) this.play();
        return;
      case "guess":
        return this.guess(from, d.text);
      case "hint":
        return this.hint(from, d.text);
      case "skip":
        return this.skip(from);
      case "flag":
        return this.flag(from);
      case "judge":
        return this.judge(from, d.ok === true);
      case "sync":
        return this.sendCard([from]);
      case "again":
        return this.again(from);
      case "end":
        return this.end(from);
      default:
        return this.bankOp(from, op, d);
    }
  }

  /** Opções que passam de uma partida para a outra. */
  private kept(): Pick<PalState, "seconds" | "rounds" | "themes" | "mode"> {
    return { seconds: this.st.seconds, rounds: this.st.rounds, themes: this.st.themes, mode: this.st.mode };
  }

  // ---- sala ----------------------------------------------------------------------------------

  private enter(from: string): void {
    if (this.player(from) && !this.player(from)!.away) return;
    if (this.host.playerZone(from)?.id !== PAL_ZONE) return;
    const busy = this.host.claimSeat(from, this);
    if (busy) {
      this.host.notify(from, `Você está no meio de uma partida de ${busy}. Termine ou saia de lá primeiro.`);
      return;
    }
    const name = this.host.playerName(from) ?? "Alguém";
    if (this.st.phase === "idle") {
      this.st = { ...this.empty(this.st.game + 1), ...this.kept(), phase: "lobby", owner: from };
      this.resetTurnMemory();
    }
    const back = this.st.players.find((p) => p.away && p.name === name);
    if (back) {
      // Voltou (reconexão): mesmo lugar no time.
      back.id = from;
      delete back.away;
    } else {
      if (this.active().length >= PAL_MAX_PLAYERS) return;
      this.st.players.push({ id: from, name, team: this.smallerTeam() });
    }
    if (!this.st.owner || !this.player(this.st.owner) || this.player(this.st.owner)!.away) this.st.owner = from;
    if (this.inGame()) this.feed({ k: "info", name, text: "entrou" });
    this.touched = Date.now();
    this.host.changed(this);
    // Entrou no meio da vez, no time que fiscaliza: recebe a carta.
    this.sendCard([from]);
  }

  /** Time com menos gente ativa (no cooperativo, sempre o único). */
  private smallerTeam(): number {
    if (this.inGame() && this.st.coop) return 0;
    const n = [0, 0];
    for (const p of this.active()) n[p.team === 1 ? 1 : 0]!++;
    return n[1]! < n[0]! ? 1 : 0;
  }

  /** Saiu do jogo (ou do escritório, com `gone`). */
  private drop(id: string, gone: boolean): void {
    const p = this.player(id);
    if (!p) return;
    const playing = this.inGame();
    if (playing && gone) p.away = true;
    else this.st.players = this.st.players.filter((x) => x !== p);
    this.lastGuess.delete(id);
    this.lastHint.delete(id);
    this.lastFlag.delete(id);
    if (this.st.owner === id) this.st.owner = this.active()[0]?.id ?? null;
    if (this.active().length === 0) return this.reset();
    if (playing) {
      this.feed({ k: "info", name: p.name, text: "saiu" });
      if (!this.viable()) {
        // Sem gente para continuar: fecha a vez e vai para o placar final.
        if (this.st.phase === "playing") this.endTurn();
        return this.finish();
      }
      if (this.st.giver === id && this.st.phase !== "turnEnd") return this.endTurn();
      if (this.st.flag?.by === id) this.st.flag = null;
    }
    this.host.changed(this);
  }

  /** Dá para continuar? Cada time precisa de um dicador e de alguém para chutar. */
  private viable(): boolean {
    const act = this.active();
    if (this.st.coop) return act.length >= 2;
    return [0, 1].every((t) => act.filter((p) => p.team === t).length >= 2);
  }

  private config(from: string, d: Record<string, unknown>): void {
    if (from !== this.st.owner || this.st.phase !== "lobby") return;
    if (typeof d.seconds === "number" && PAL_SECONDS.includes(d.seconds)) this.st.seconds = d.seconds;
    if (typeof d.rounds === "number" && PAL_ROUNDS.includes(d.rounds)) this.st.rounds = d.rounds;
    if (d.themes !== undefined) {
      const themes = palCleanThemes(d.themes, this.bank.themes.map((t) => t.id));
      if (themes) this.st.themes = themes;
    }
    if (typeof d.mode === "string" && PAL_MODES.includes(d.mode as PalMode) && d.mode !== this.st.mode) {
      this.st.mode = d.mode as PalMode;
      // Voltou para dois times: os times da mesa ficam equilibrados de novo.
      if (this.st.mode === "teams") this.balance();
    }
    this.touched = Date.now();
    this.host.changed(this);
  }

  private shuffle(from: string): void {
    if (from !== this.st.owner || this.st.phase !== "lobby") return;
    const teams = palSplitTeams(this.active().map((p) => p.id), Math.random);
    for (const p of this.st.players) p.team = teams.get(p.id) ?? p.team;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private start(from: string): void {
    if (this.st.phase !== "lobby" || from !== this.st.owner) return;
    const act = this.active();
    if (act.length < PAL_MIN_PLAYERS) return;
    const deck = palDeck(this.bank, this.st.themes, Math.random);
    if (deck.length === 0) return;
    this.st.players = act;
    const coop = !palUsesTeams(act.length, this.st.mode);
    if (coop) for (const p of act) p.team = 0;
    else this.balance();
    const sizes = coop ? [act.length] : [0, 1].map((t) => act.filter((p) => p.team === t).length);
    this.st.coop = coop;
    this.st.teams = coop ? [{ name: PAL_COOP_NAME, score: 0 }] : twoTeams();
    this.st.turns = palTotalTurns(sizes, this.st.rounds, coop);
    this.st.turn = 0;
    this.st.winner = null;
    this.deck = deck;
    this.used.clear();
    this.nextGiver = [0, 0];
    this.firstTeam = coop ? 0 : Math.random() < 0.5 ? 0 : 1;
    this.nextTurn();
  }

  /** Times equilibrados (diferença de no máximo 1): quem entrou por último no maior muda de lado. */
  private balance(): void {
    for (;;) {
      const a = this.st.players.filter((p) => p.team === 0);
      const b = this.st.players.filter((p) => p.team === 1);
      if (Math.abs(a.length - b.length) <= 1) return;
      const big = a.length > b.length ? a : b;
      big[big.length - 1]!.team = a.length > b.length ? 1 : 0;
    }
  }

  private again(from: string): void {
    if (this.st.phase !== "final" || !this.player(from)) return;
    const players = this.active().map((p) => ({ id: p.id, name: p.name, team: p.team }));
    const owner = players.some((p) => p.id === this.st.owner) ? this.st.owner : from;
    this.st = { ...this.empty(this.st.game + 1), ...this.kept(), phase: "lobby", owner, players };
    // Depois de uma partida cooperativa, todos estavam no mesmo time.
    this.balance();
    this.resetTurnMemory();
    this.touched = Date.now();
    this.host.changed(this);
  }

  private end(from: string): void {
    if (from !== this.st.owner && !(this.st.phase === "final" && this.player(from))) return;
    if (this.inGame()) {
      if (this.st.phase === "playing") this.endTurn();
      this.finish();
    } else this.reset();
  }

  private reset(): void {
    this.st = { ...this.empty(this.st.game), ...this.kept() };
    this.resetTurnMemory();
    this.host.changed(this);
  }

  private resetTurnMemory(): void {
    this.card = null;
    this.lastGuess.clear();
    this.lastHint.clear();
    this.lastFlag.clear();
  }

  // ---- vez -----------------------------------------------------------------------------------

  private nextTurn(): void {
    if (this.st.turn >= this.st.turns) return this.finish();
    const team = this.st.coop ? 0 : (this.firstTeam + this.st.turn) % 2;
    const members = this.active().filter((p) => p.team === team);
    if (members.length === 0) return this.finish();
    const giver = members[this.nextGiver[team]! % members.length]!;
    this.nextGiver[team]!++;
    this.st.turn++;
    Object.assign(this.st, { phase: "ready", team, giver: giver.id, cardNo: 0, skips: PAL_SKIPS, gain: 0, flag: null, done: [], feed: [] });
    this.card = null;
    this.st.duration = PAL_READY_MS;
    this.ends = Date.now() + PAL_READY_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "turn", { turn: this.st.turn, giver: giver.id, name: giver.name, team });
  }

  /** O dicador começou (ou o tempo de preparo acabou): relógio correndo e primeira carta. */
  private play(): void {
    this.st.phase = "playing";
    this.st.duration = this.st.seconds * 1000;
    this.ends = Date.now() + this.st.duration;
    this.touched = Date.now();
    this.draw();
    this.host.changed(this);
    this.host.event(this, "go", { turn: this.st.turn });
  }

  /** Puxa a próxima carta (sem repetir na partida; se o baralho acabar, embaralha de novo). */
  private draw(): void {
    let card = this.deck.shift();
    while (card && this.used.has(card.word)) card = this.deck.shift();
    if (!card) {
      const fresh = palDeck(this.bank, this.st.themes, Math.random);
      this.deck = fresh.filter((c) => !this.used.has(c.word));
      if (this.deck.length === 0) {
        this.used.clear();
        this.deck = fresh;
      }
      card = this.deck.shift()!;
    }
    this.used.add(card.word);
    this.card = card;
    this.st.cardNo++;
    this.st.flag = null;
    this.sendCard();
  }

  /** Manda a carta da vez a quem pode ver (todos do público, ou só os de `to` que podem). */
  private sendCard(to?: string[]): void {
    if (this.st.phase !== "playing" || !this.card) return;
    const audience = palCardAudience(this.st);
    const list = to ? to.filter((id) => audience.includes(id)) : audience;
    if (list.length === 0) return;
    const theme = this.card.theme;
    const themeLabel = this.st.catalog.find((t) => t.id === theme)?.label ?? "";
    const ev: PalCardEvent = { game: this.st.game, turn: this.st.turn, n: this.st.cardNo, word: this.card.word, forbidden: [...this.card.forbidden], theme, themeLabel };
    this.host.event(this, "card", ev, { to: list });
  }

  /** Fecha a carta atual com um resultado e puxa a próxima. */
  private resolve(result: "hit" | "skip" | "forbidden", by?: string): void {
    if (!this.card) return;
    this.st.done = [...this.st.done, { word: this.card.word, result, ...(by ? { by } : {}) }];
    this.draw();
  }

  private guess(from: string, raw: unknown): void {
    if (this.st.phase !== "playing" || !this.card || this.st.flag) return;
    if (palRole(this.st, from) !== "guesser") return;
    const now = Date.now();
    if (now - (this.lastGuess.get(from) ?? 0) < PAL_GUESS_GAP_MS) return;
    this.lastGuess.set(from, now);
    const text = grupoClean(raw, PAL_GUESS_MAX);
    if (!text) return;
    const p = this.player(from)!;
    const r = palCheckGuess(text, this.card.word);
    if (r === "correct") {
      const word = this.card.word;
      this.st.teams[this.st.team]!.score++;
      this.st.gain++;
      this.feed({ k: "hit", name: p.name, text: word });
      this.host.emote(from, "cheer");
      this.resolve("hit", p.name);
      this.touched = now;
      this.host.changed(this);
      this.host.event(this, "hit", { name: p.name, word, team: this.st.team });
      return;
    }
    if (r === "close") {
      this.host.event(this, "close", { text }, { to: [from] });
      return;
    }
    this.feed({ k: "guess", name: p.name, text });
    this.host.changed(this);
  }

  private hint(from: string, raw: unknown): void {
    if (this.st.phase !== "playing" || !this.card || from !== this.st.giver) return;
    const now = Date.now();
    if (now - (this.lastHint.get(from) ?? 0) < PAL_HINT_GAP_MS) return;
    const text = grupoClean(raw, PAL_HINT_MAX);
    if (!text) return;
    this.lastHint.set(from, now);
    // Dica escrita que entrega a carta não sai daqui: só o dicador fica sabendo.
    const hit = palHintHit(text, this.card);
    if (hit) {
      this.host.event(this, "blocked", { text, word: hit }, { to: [from] });
      return;
    }
    this.feed({ k: "hint", name: this.player(from)?.name ?? "", text });
    this.host.changed(this);
  }

  private skip(from: string): void {
    if (this.st.phase !== "playing" || !this.card || from !== this.st.giver || this.st.flag || this.st.skips <= 0) return;
    const word = this.card.word;
    this.st.skips--;
    this.feed({ k: "skip", name: this.player(from)?.name ?? "", text: word });
    this.resolve("skip");
    this.host.changed(this);
    this.host.event(this, "skip", { word });
  }

  private flag(from: string): void {
    if (this.st.phase !== "playing" || !this.card || this.st.flag || this.st.coop) return;
    if (palRole(this.st, from) !== "judge") return;
    const now = Date.now();
    if (now - (this.lastFlag.get(from) ?? 0) < PAL_FLAG_GAP_MS) return;
    this.lastFlag.set(from, now);
    const name = this.player(from)!.name;
    this.st.flag = { by: from, name };
    this.flagEnds = now + PAL_FLAG_MS;
    this.feed({ k: "flag", name });
    this.host.changed(this);
    this.host.event(this, "flag", { name });
  }

  /** O dicador decide o "Proibida!": falou (perde 1 ponto e a carta) ou não falou. */
  private judge(from: string, ok: boolean): void {
    if (this.st.phase !== "playing" || !this.st.flag || from !== this.st.giver || !this.card) return;
    const giver = this.player(from)?.name ?? "";
    this.st.flag = null;
    if (ok) {
      const word = this.card.word;
      this.st.teams[this.st.team]!.score--;
      this.st.gain--;
      this.feed({ k: "forbidden", name: giver, text: word });
      this.resolve("forbidden");
      this.host.event(this, "forbidden", { word });
    } else this.feed({ k: "cleared", name: giver });
    this.touched = Date.now();
    this.host.changed(this);
  }

  private endTurn(): void {
    if (this.st.phase !== "playing" && this.st.phase !== "ready") return;
    if (this.card) this.st.done = [...this.st.done, { word: this.card.word, result: "time" }];
    this.card = null;
    this.st.flag = null;
    this.st.phase = "turnEnd";
    this.st.duration = PAL_TURN_END_MS;
    this.ends = Date.now() + PAL_TURN_END_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "turnEnd", { team: this.st.team, gain: this.st.gain });
  }

  private finish(): void {
    this.st.phase = "final";
    this.st.giver = null;
    this.st.flag = null;
    this.card = null;
    this.st.winner = palWinner(this.st.teams);
    this.touched = Date.now();
    for (const p of this.active()) if (this.st.coop ? this.st.teams[0]!.score > 0 : p.team === this.st.winner) this.host.emote(p.id, "dance");
    this.host.changed(this);
    const w = this.st.winner;
    this.host.event(this, "final", { winner: w === null ? null : this.st.teams[w]!.name, coop: this.st.coop });
  }

  private feed(item: PalFeedItem): void {
    this.st.feed = [...this.st.feed, item].slice(-PAL_FEED_MAX);
  }

  tick(): void {
    const now = Date.now();
    const ph = this.st.phase;
    if (ph === "ready" && now >= this.ends) this.play();
    else if (ph === "playing") {
      if (now >= this.ends) this.endTurn();
      else if (this.st.flag && now >= this.flagEnds) {
        // O dicador não decidiu a tempo: não vale.
        this.st.flag = null;
        this.feed({ k: "cleared", name: this.player(this.st.giver ?? "")?.name ?? "" });
        this.host.changed(this);
      }
    } else if (ph === "turnEnd" && now >= this.ends) this.nextTurn();
    else if ((ph === "lobby" || ph === "final") && now - this.touched > IDLE_MS) this.reset();
  }

  leave(id: string): void {
    this.drop(id, true);
  }

  // ---- editor de cartas ----------------------------------------------------------------------

  /**
   * Pedidos do editor: só perto do painel de letras e sem partida em andamento. No meio de uma
   * partida ninguém recebe o banco, então quem chuta nunca vê as cartas por este caminho.
   */
  private bankOp(from: string, op: string, d: Record<string, unknown>): void {
    if (!BANK_OPS.includes(op)) return;
    if (this.inGame()) return this.bankError(from, "playing");
    if (!this.board || !this.host.near(from, this.board, PAL_EDIT_RANGE)) return this.bankError(from, "near");
    if (op === "bank") return this.sendBank(from);
    const themes = this.bank.themes;
    const pick = (v: unknown) => (typeof v === "string" ? themes.find((t) => t.id === v) : undefined);
    let stored: PalBank | null = this.bank;
    switch (op) {
      case "themeAdd": {
        const label = palCleanLabel(d.label);
        if (!label) return this.bankError(from, "label");
        if (palLabelTaken(this.bank, label)) return this.bankError(from, "themeDup");
        if (themes.length >= PAL_MAX_THEMES) return this.bankError(from, "full");
        const all = themes.every((t) => this.st.themes.includes(t.id));
        const id = palNewId(this.bank, "tema");
        themes.push({ id, label, cards: [] });
        // Com todos os temas escolhidos na mesa, o novo entra na escolha também.
        if (all) this.st.themes = [...this.st.themes, id];
        break;
      }
      case "themeRename": {
        const theme = pick(d.id);
        if (!theme) return;
        const label = palCleanLabel(d.label);
        if (!label) return this.bankError(from, "label");
        if (palLabelTaken(this.bank, label, theme.id)) return this.bankError(from, "themeDup");
        theme.label = label;
        break;
      }
      case "themeDelete": {
        const theme = pick(d.id);
        if (!theme) return;
        if (themes.length <= 1) return this.bankError(from, "lastTheme");
        this.bank.themes = themes.filter((t) => t !== theme);
        break;
      }
      case "cardSave": {
        const theme = pick(d.theme);
        if (!theme) return;
        const id = typeof d.id === "string" ? d.id : null;
        const home = id ? themes.find((t) => t.cards.some((c) => c.id === id)) : undefined;
        const existing = home?.cards.find((c) => c.id === id);
        if (home !== theme && theme.cards.length >= PAL_MAX_CARDS) return this.bankError(from, "full");
        const card = palCleanCard(d);
        if (typeof card === "string") return this.bankError(from, card);
        if (palCardTaken(theme, card.word, existing?.id)) return this.bankError(from, "duplicate");
        if (existing && home) {
          existing.word = card.word;
          existing.forbidden = card.forbidden;
          // Mudou de tema: sai de um e entra no outro.
          if (home !== theme) {
            home.cards = home.cards.filter((c) => c !== existing);
            theme.cards.push(existing);
          }
        } else theme.cards.push({ id: palNewId(this.bank, "carta"), ...card });
        break;
      }
      case "cardDelete": {
        const home = themes.find((t) => t.cards.some((c) => c.id === d.id));
        if (!home) return;
        home.cards = home.cards.filter((c) => c.id !== d.id);
        break;
      }
      case "bankReset":
        this.bank = palSeedBank();
        // Nada guardado: vale o banco original (com as correções que ele ganhar em versões novas).
        stored = null;
        break;
    }
    this.host.store.set(BANK_KEY, stored);
    this.syncCatalog();
    this.touched = Date.now();
    this.host.changed(this);
    this.sendBank(from);
  }

  /** Resumo público dos temas; a escolha da mesa fica só com temas que existem (todos, se sobrar nenhum). */
  private syncCatalog(): void {
    const ids = this.bank.themes.map((t) => t.id);
    this.st.catalog = palSummaries(this.bank);
    const kept = this.st.themes.filter((id) => ids.includes(id));
    this.st.themes = kept.length > 0 ? kept : ids;
  }

  private sendBank(to: string): void {
    this.host.event(this, "bank", this.bank, { to: [to] });
  }

  private bankError(to: string, reason: PalBankError): void {
    this.host.event(this, "bankError", { reason }, { to: [to] });
  }
}
