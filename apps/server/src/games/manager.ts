import { GAMES, canAct, gameKindOf, gamePlayerCounts, type BaseState, type GameRules, type GameSnapshot, type MapDef, type ServerMsg, type TableState } from "@infinity/world";

/** O que a sala oferece aos jogos. */
export interface GameHost {
  broadcast(msg: ServerMsg): void;
  /**
   * Manda a cada pessoa da sala a mensagem que `msgFor(id)` devolver (jogos com informação escondida:
   * cada um recebe a própria visão). Mensagens iguais (o mesmo objeto) podem ser codificadas uma vez só.
   * Sem isto, quem joga e quem assiste recebem a visão de quem assiste (nunca vaza nada).
   */
  broadcastEach?(msgFor: (id: string) => ServerMsg): void;
  /** Semente para embaralhar (inteiro de 32 bits). Sem isto, sorteia com crypto. Os testes fixam. */
  random?(): number;
  playerName(id: string): string | undefined;
  /** Posição atual da pessoa (para conferir se está perto da mesa). */
  playerPos(id: string): { x: number; z: number } | undefined;
  /** Ver ActivityHost.claimSeat: libera lugares de espera nos jogos das atividades ou diz onde há partida. */
  claimSeat?(id: string): string | null;
  notify?(id: string, text: string): void;
}

/** Nome de cada jogo de mesa (para avisos). */
const TABLE_TITLE: Record<string, string> = { chess: "Xadrez", connect4: "Lig 4", tictactoe: "Jogo da velha", checkers: "Damas", domino: "Dominó", truco: "Truco" };

/** Distância máxima (m) entre a pessoa e o centro da mesa para sentar. */
export const SIT_RANGE = 3;
/** Quem está sentado sem partida rolando e se afasta além disso (m) por AWAY_SECONDS perde o lugar. */
export const AWAY_RANGE = 8;
export const AWAY_SECONDS = 6;

type Phase = GameSnapshot["phase"];

interface Table {
  id: string;
  kind: string;
  rules: GameRules<BaseState>;
  pos: { x: number; z: number };
  seats: Array<string | null>;
  phase: Phase;
  state: BaseState;
  rematch: boolean[];
  round: number;
  /** Nomes de quem jogou a partida atual (ou a última). */
  players: Array<string | null>;
  /** Segundos que cada lugar passou longe da mesa (para liberar lugar esquecido). */
  away: number[];
}

/**
 * Gerencia todas as mesas de jogo do mapa (objetos com `gameId`).
 *
 * Operações (`{ t: "game", table, op, data }`):
 * - `sit`  `{ seat?: number }`: senta no lugar pedido (ou no primeiro vago). Exige estar a até 3 m da mesa.
 *   A partida começa quando todos os lugares enchem.
 * - `start`: mesas que aceitam menos gente que os lugares (dominó, truco): quem está sentado começa a partida
 *   com quem já sentou, se a quantidade vale para o jogo.
 * - `stand`: levanta. No meio da partida conta como abandono (o outro vence).
 * - `move` (dados do jogo): lance de quem está na vez; o servidor confere tudo.
 * - `resign`: desiste da partida em andamento.
 * - `rematch` `{ on?: boolean }`: pede (ou retira) revanche; com todos de acordo, começa outra com os lados trocados
 *   (ou, nos jogos com `keepSeats`, com as mesmas pessoas nos mesmos lugares e outra pessoa começando).
 *
 * Informação escondida: nos jogos com `view` (dominó, truco), cada pessoa recebe a própria visão do estado:
 * quem joga vê a própria mão; quem assiste vê só quantas pedras ou cartas cada um tem. O estado inteiro nunca sai daqui.
 */
export class GamesManager {
  private readonly tables = new Map<string, Table>();

  constructor(
    private readonly map: MapDef,
    private readonly host: GameHost,
  ) {
    for (const o of this.map.objects) {
      const kind = gameKindOf(o);
      const rules = kind ? GAMES[kind] : undefined;
      if (!o.gameId || !kind || !rules || this.tables.has(o.gameId)) continue;
      this.tables.set(o.gameId, {
        id: o.gameId,
        kind,
        rules,
        pos: { x: o.pos.x, z: o.pos.z },
        seats: new Array<string | null>(rules.seats).fill(null),
        phase: "waiting",
        state: rules.create(),
        rematch: new Array<boolean>(rules.seats).fill(false),
        round: 0,
        players: new Array<string | null>(rules.seats).fill(null),
        away: new Array<number>(rules.seats).fill(0),
      });
    }
  }

  /** Mensagem `{ t: "game" }` de um jogador. */
  handle(playerId: string, table: string, op: string, data: unknown): void {
    const t = this.tables.get(table);
    if (!t) return;
    let changed = false;
    switch (op) {
      case "sit":
        changed = this.sit(t, playerId, data);
        break;
      case "stand":
        changed = this.stand(t, playerId);
        break;
      case "start":
        changed = this.startNow(t, playerId);
        break;
      case "move":
        changed = this.move(t, playerId, data);
        break;
      case "resign":
        changed = this.resign(t, playerId);
        break;
      case "rematch":
        changed = this.rematch(t, playerId, data);
        break;
    }
    if (changed) this.publish(t);
  }

  /** Jogador saiu da sala: libera os lugares dele. */
  leave(playerId: string): void {
    for (const t of this.tables.values()) if (this.stand(t, playerId)) this.publish(t);
  }

  /**
   * Estado de todas as mesas como `viewer` pode ver (vai no welcome). Sem `viewer`, a visão de quem assiste:
   * nada escondido sai daqui por engano.
   */
  snapshots(viewer?: string): GameSnapshot[] {
    return [...this.tables.values()].map((t) => this.snapshot(t, viewer ? t.seats.indexOf(viewer) : -1));
  }

  /** Estado completo de uma mesa, com tudo o que é escondido. Só para testes e diagnóstico: nunca mande para a rede. */
  fullState(table: string): BaseState | undefined {
    return this.tables.get(table)?.state;
  }

  /** Chamado a cada tick do servidor (15 Hz). Libera lugares de quem foi embora sem levantar. */
  tick(dtSeconds: number): void {
    for (const t of this.tables.values()) {
      if (t.phase === "playing") {
        t.away.fill(0);
        continue;
      }
      t.seats.forEach((id, seat) => {
        if (!id) return;
        const p = this.host.playerPos(id);
        const far = !p || Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > AWAY_RANGE;
        t.away[seat] = far ? (t.away[seat] ?? 0) + dtSeconds : 0;
      });
      const gone = t.seats.filter((id, seat) => id && (t.away[seat] ?? 0) >= AWAY_SECONDS) as string[];
      if (gone.length > 0 && gone.map((id) => this.stand(t, id)).some(Boolean)) this.publish(t);
    }
  }

  // ---------------------------------------------------------------- operações

  /** Onde a pessoa está sentada (para os outros jogos não a sentarem em dois lugares). */
  seatInfo(id: string): { label: string; playing: boolean } | null {
    for (const t of this.tables.values()) if (t.seats.includes(id)) return { label: TABLE_TITLE[t.kind] ?? "um jogo de mesa", playing: t.phase === "playing" };
    return null;
  }

  /** Levanta a pessoa das mesas sem partida rolando. */
  releaseSeat(id: string): void {
    for (const t of this.tables.values()) if (t.seats.includes(id) && t.phase !== "playing" && this.stand(t, id)) this.publish(t);
  }

  private sit(t: Table, playerId: string, data: unknown): boolean {
    const p = this.host.playerPos(playerId);
    if (!p || Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > SIT_RANGE) return false;
    if (t.phase === "playing") return false;

    // Sentado em outra mesa com partida rolando: precisa terminar ou levantar lá antes.
    const elsewhere = [...this.tables.values()].filter((o) => o !== t && o.seats.includes(playerId));
    if (elsewhere.some((o) => o.phase === "playing")) return false;

    // Em outro tipo de jogo (hockey, sinuca...): sai de lá se estava só esperando; com partida, não senta.
    const busy = this.host.claimSeat?.(playerId);
    if (busy) {
      this.host.notify?.(playerId, `Você está no meio de uma partida de ${busy}. Termine ou levante de lá primeiro.`);
      return false;
    }

    const wanted = (data as { seat?: unknown } | null | undefined)?.seat;
    const current = t.seats.indexOf(playerId);
    let seat: number;
    if (typeof wanted === "number") {
      if (!Number.isInteger(wanted) || wanted < 0 || wanted >= t.seats.length) return false;
      if (wanted === current) return false;
      if (t.seats[wanted] !== null) return false;
      seat = wanted;
    } else {
      if (current >= 0) return false;
      seat = t.seats.indexOf(null);
      if (seat < 0) return false;
    }

    for (const o of elsewhere) if (this.stand(o, playerId)) this.publish(o);
    if (current >= 0) t.seats[current] = null;
    t.seats[seat] = playerId;
    t.away[seat] = 0;
    t.rematch.fill(false);
    if (t.seats.every((s) => s !== null) && this.counts(t).includes(t.seats.length)) this.start(t);
    return true;
  }

  /** Começa já, com quem está sentado (mesas que aceitam menos gente que os lugares). */
  private startNow(t: Table, playerId: string): boolean {
    if (t.phase !== "waiting" || !t.seats.includes(playerId)) return false;
    if (!this.counts(t).includes(this.seated(t).length)) return false;
    this.start(t);
    return true;
  }

  private stand(t: Table, playerId: string): boolean {
    const seat = t.seats.indexOf(playerId);
    if (seat < 0) return false;
    if (t.phase === "playing") {
      t.state = t.rules.forfeit(t.state, seat, "left");
      t.phase = "finished";
    }
    t.seats[seat] = null;
    t.away[seat] = 0;
    t.rematch.fill(false);
    // Mesa vazia volta a ficar arrumada para a próxima dupla.
    if (t.seats.every((s) => s === null)) {
      t.phase = "waiting";
      t.state = t.rules.create();
      t.players.fill(null);
    }
    return true;
  }

  private move(t: Table, playerId: string, data: unknown): boolean {
    if (t.phase !== "playing") return false;
    const seat = t.seats.indexOf(playerId);
    // Na vez, ou entre quem pode responder agora (truco: a dupla que recebeu o pedido).
    if (!canAct(t.state, seat)) return false;
    const next = t.rules.move(t.state, seat, data, this.seed());
    if (!next) return false;
    t.state = next;
    if (next.over) t.phase = "finished";
    return true;
  }

  private resign(t: Table, playerId: string): boolean {
    if (t.phase !== "playing") return false;
    const seat = t.seats.indexOf(playerId);
    if (seat < 0) return false;
    t.state = t.rules.forfeit(t.state, seat, "resign");
    t.phase = "finished";
    return true;
  }

  private rematch(t: Table, playerId: string, data: unknown): boolean {
    if (t.phase !== "finished") return false;
    const seat = t.seats.indexOf(playerId);
    const seated = this.seated(t);
    if (seat < 0 || !this.counts(t).includes(seated.length)) return false;
    const on = (data as { on?: unknown } | null | undefined)?.on !== false;
    if (t.rematch[seat] === on) return false;
    t.rematch[seat] = on;
    if (seated.every((s) => t.rematch[s])) {
      // Revanche troca os lados: quem jogou em segundo agora começa. Nas mesas de vários lugares, todo mundo
      // fica onde está e o próprio jogo passa a vez de começar para outra pessoa (pelo número da partida).
      if (!t.rules.keepSeats) t.seats.push(t.seats.shift()!);
      this.start(t);
    }
    return true;
  }

  // ---------------------------------------------------------------- apoio

  /** Lugares ocupados, em ordem. */
  private seated(t: Table): number[] {
    return t.seats.flatMap((id, i) => (id ? [i] : []));
  }

  /** Com quantas pessoas a partida desta mesa pode acontecer. */
  private counts(t: Table): readonly number[] {
    return gamePlayerCounts(t.rules);
  }

  /** Semente nova para embaralhar (nunca vai para a rede). */
  private seed(): number {
    const r = this.host.random?.();
    if (r !== undefined) return r >>> 0;
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!;
  }

  private start(t: Table): void {
    t.round++;
    t.state = t.rules.create({ seated: this.seated(t), seed: this.seed(), round: t.round });
    t.phase = "playing";
    t.players = t.seats.map((id) => (id ? (this.host.playerName(id) ?? null) : null));
    t.rematch.fill(false);
    t.away.fill(0);
  }

  /** Fotografia da mesa como o lugar `seat` vê (-1 = quem assiste). */
  private snapshot(t: Table, seat: number): GameSnapshot {
    const seen = t.rules.view ? t.rules.view(t.state, seat) : t.state;
    const state: TableState = {
      ...seen,
      rematch: t.rematch.slice(),
      round: t.round,
      names: t.seats.map((id) => (id ? (this.host.playerName(id) ?? null) : null)),
      players: t.players.slice(),
    };
    return { table: t.id, kind: t.kind, seats: t.seats.slice(), phase: t.phase, state };
  }

  private publish(t: Table): void {
    const spectator: ServerMsg = { t: "game", game: this.snapshot(t, -1) };
    if (!t.rules.view || !this.host.broadcastEach) {
      this.host.broadcast(spectator);
      return;
    }
    // Uma mensagem por lugar (cada um vê a própria mão) e a mesma para todos que assistem.
    const bySeat = new Map<number, ServerMsg>();
    this.host.broadcastEach((id) => {
      const seat = t.seats.indexOf(id);
      if (seat < 0) return spectator;
      let msg = bySeat.get(seat);
      if (!msg) {
        msg = { t: "game", game: this.snapshot(t, seat) };
        bySeat.set(seat, msg);
      }
      return msg;
    });
  }
}
