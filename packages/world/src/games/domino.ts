import { shuffled } from "./rng.ts";
import { forfeitGroup, type BaseState, type CreateOptions, type GameRules } from "./types.ts";

/**
 * Dominó duplo-seis (28 pedras), de 2 a 4 pessoas. Com 4, em duplas: lugares 0 e 2 contra 1 e 3.
 *
 * - 7 pedras para cada um. Com 2 ou 3 pessoas sobra o monte; com 4 não sobra nada.
 * - Começa quem tem a maior bucha (6-6, senão 5-5...), jogando essa bucha. Sem bucha nenhuma nas mãos,
 *   começa quem tem a pedra mais alta, jogando essa pedra.
 * - A vez segue a ordem dos lugares. Sem pedra que sirva: com monte, compra até achar uma (ou o monte acabar);
 *   sem monte, passa.
 * - Fim: quem joga a última pedra bate e vence (com a dupla). Se ninguém mais tem como jogar e não há monte,
 *   o jogo tranca: vence quem tem menos pontos na mão (com duplas, a soma da dupla); pontos iguais empatam.
 *
 * Informação escondida: cada um vê só a própria mão; o monte não vai para ninguém (só quantas pedras tem).
 * No fim, todas as mãos aparecem (como na mesa de verdade, para contar os pontos).
 */

/** As 28 pedras: id → [menor, maior]. */
export const DOMINO_TILES: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<readonly [number, number]> = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push([a, b] as const);
  return out;
})();

export const DOMINO_HAND = 7;

/** Pedra na mesa: `a` é o número do lado esquerdo e `b` o do direito, como aparecem na fileira. */
export interface DominoLink {
  tile: number;
  a: number;
  b: number;
  /** Quem jogou. */
  by: number;
}

export interface DominoLast {
  seat: number;
  action: "play" | "draw" | "pass";
  tile?: number;
  /** Ponta onde a pedra entrou: 0 = esquerda (começo da fileira), 1 = direita. */
  end?: 0 | 1;
  /** Quantas pedras comprou. */
  drew?: number;
}

export interface DominoState extends BaseState {
  /** Lugares que jogam esta partida, na ordem da vez. */
  active: number[];
  /** Dupla de cada lugar (0 ou 1); -1 = cada um por si. */
  teamOf: number[];
  /** Mão de cada lugar (ids das pedras). Na visão de cada pessoa, só a própria vem; as outras vêm null. */
  hands: Array<number[] | null>;
  /** Quantas pedras cada lugar tem na mão (público). */
  counts: number[];
  /** Monte. Nunca sai do servidor: na visão vem vazio. */
  stock: number[];
  /** Quantas pedras há no monte (público). */
  stockCount: number;
  /** A fileira da mesa, da ponta esquerda à direita. */
  chain: DominoLink[];
  /** Números das duas pontas (null antes da primeira pedra). */
  ends: [number, number] | null;
  /** Pedra que abre a partida (a maior bucha de quem começa). */
  opener: number | null;
  last: DominoLast | null;
  /** Pontos na mão de cada lugar, no fim da partida. */
  pips: number[] | null;
}

/** Lance do dominó: jogar uma pedra (com a ponta, se servir nas duas), comprar ou passar. */
export type DominoMove = { play: number; end?: 0 | 1 } | { draw: true } | { pass: true };

export const dominoPips = (tile: number): number => {
  const t = DOMINO_TILES[tile];
  return t ? t[0] + t[1] : 0;
};

export const dominoIsDouble = (tile: number): boolean => {
  const t = DOMINO_TILES[tile];
  return !!t && t[0] === t[1];
};

/** Em que pontas a pedra serve (0 = esquerda, 1 = direita). Mesa vazia: serve em "0". */
export function dominoFits(tile: number, ends: readonly [number, number] | null): Array<0 | 1> {
  const t = DOMINO_TILES[tile];
  if (!t) return [];
  if (!ends) return [0];
  const out: Array<0 | 1> = [];
  if (t[0] === ends[0] || t[1] === ends[0]) out.push(0);
  if (t[0] === ends[1] || t[1] === ends[1]) out.push(1);
  return out;
}

/** Pedras da mão que podem ser jogadas agora. */
export function dominoPlayable(s: Pick<DominoState, "chain" | "ends" | "opener">, hand: readonly number[]): number[] {
  if (s.chain.length === 0) return hand.filter((t) => t === s.opener);
  return hand.filter((t) => dominoFits(t, s.ends).length > 0);
}

/** Próximo lugar na ordem da vez. */
export function dominoNext(s: Pick<DominoState, "active">, seat: number): number {
  const i = s.active.indexOf(seat);
  return s.active[(i + 1) % s.active.length] ?? seat;
}

const handPips = (hand: readonly number[] | null | undefined) => (hand ?? []).reduce((sum, t) => sum + dominoPips(t), 0);

/** Pedra que abre: a maior bucha nas mãos; sem bucha, a pedra mais alta. */
function openerOf(hands: ReadonlyArray<readonly number[]>): { tile: number; seat: number } | null {
  let best = null as { tile: number; seat: number; score: number } | null;
  for (let seat = 0; seat < hands.length; seat++) {
    for (const tile of hands[seat] ?? []) {
      const [a, b] = DOMINO_TILES[tile]!;
      // Bucha vale mais que qualquer pedra comum; entre comuns, a soma e depois o maior número.
      const score = (a === b ? 1000 : 0) + (a + b) * 10 + Math.max(a, b);
      if (!best || score > best.score) best = { tile, seat, score };
    }
  }
  return best ? { tile: best.tile, seat: best.seat } : null;
}

function blank(seats: number): DominoState {
  return {
    turn: 0,
    winner: null,
    draw: false,
    over: false,
    reason: null,
    moves: 0,
    active: [],
    teamOf: new Array<number>(seats).fill(-1),
    hands: Array.from({ length: seats }, () => []),
    counts: new Array<number>(seats).fill(0),
    stock: [],
    stockCount: 0,
    chain: [],
    ends: null,
    opener: null,
    last: null,
    pips: null,
  };
}

/** Ninguém consegue jogar e não há monte? */
function locked(s: DominoState): boolean {
  if (s.stock.length > 0 || s.chain.length === 0) return false;
  return s.active.every((seat) => dominoPlayable(s, s.hands[seat] ?? []).length === 0);
}

/** Encerra a partida trancada: menos pontos vence (duplas somam). */
function endLocked(s: DominoState): DominoState {
  const pips = s.active.reduce<number[]>((acc, seat) => ((acc[seat] = handPips(s.hands[seat])), acc), new Array<number>(s.hands.length).fill(0));
  const teams = s.teamOf.some((t) => t >= 0);
  const scoreOf = (seat: number) => (teams ? s.active.filter((o) => s.teamOf[o] === s.teamOf[seat]).reduce((sum, o) => sum + (pips[o] ?? 0), 0) : (pips[seat] ?? 0));
  const best = Math.min(...s.active.map(scoreOf));
  const lowest = s.active.filter((seat) => scoreOf(seat) === best);
  const tied = teams ? new Set(lowest.map((seat) => s.teamOf[seat])).size > 1 : lowest.length > 1;
  const base = { ...s, over: true, reason: "locked" as const, pips, acting: undefined };
  if (tied) return { ...base, draw: true, winner: null };
  return { ...base, winner: lowest[0]!, winners: lowest };
}

export const DOMINO_SEATS = 4;

export const domino: GameRules<DominoState> = {
  kind: "domino",
  seats: DOMINO_SEATS,
  players: [2, 3, 4],
  keepSeats: true,

  create(opts?: CreateOptions) {
    const s = blank(DOMINO_SEATS);
    const seated = (opts?.seated ?? []).filter((x, i, all) => Number.isInteger(x) && x >= 0 && x < DOMINO_SEATS && all.indexOf(x) === i).sort((a, b) => a - b);
    if (seated.length < 2) return s;
    const tiles = shuffled(
      DOMINO_TILES.map((_, i) => i),
      opts?.seed ?? 0,
    );
    const hands = s.hands.map(() => [] as number[]);
    for (const seat of seated) hands[seat] = tiles.splice(0, DOMINO_HAND).sort((a, b) => a - b);
    const open = openerOf(hands)!;
    const teamOf = s.teamOf.map((_, seat) => (seated.length === 4 ? seat % 2 : -1));
    return { ...s, active: seated, teamOf, hands, counts: hands.map((h) => h.length), stock: tiles, stockCount: tiles.length, opener: open.tile, turn: open.seat };
  },

  move(state, seat, data) {
    if (state.over || seat !== state.turn || !state.active.includes(seat)) return null;
    const d = (data ?? {}) as Partial<{ play: unknown; end: unknown; draw: unknown; pass: unknown }>;
    const hand = state.hands[seat] ?? [];
    const canPlay = dominoPlayable(state, hand).length > 0;

    if (d.draw === true) {
      if (canPlay || state.stock.length === 0) return null;
      const stock = state.stock.slice();
      const mine = hand.slice();
      let drew = 0;
      // Compra até achar uma pedra que sirva ou o monte acabar.
      while (stock.length > 0) {
        const t = stock.shift()!;
        mine.push(t);
        drew++;
        if (dominoFits(t, state.ends).length > 0) break;
      }
      mine.sort((a, b) => a - b);
      const hands = state.hands.slice();
      hands[seat] = mine;
      const counts = state.counts.slice();
      counts[seat] = mine.length;
      const next: DominoState = { ...state, hands, counts, stock, stockCount: stock.length, moves: state.moves + 1, last: { seat, action: "draw", drew } };
      return locked(next) ? endLocked(next) : next;
    }

    if (d.pass === true) {
      if (canPlay || state.stock.length > 0) return null;
      const next: DominoState = { ...state, turn: dominoNext(state, seat), moves: state.moves + 1, last: { seat, action: "pass" } };
      return locked(next) ? endLocked(next) : next;
    }

    const tile = d.play;
    if (typeof tile !== "number" || !Number.isInteger(tile) || !hand.includes(tile)) return null;
    const [x, y] = DOMINO_TILES[tile]!;
    let chain: DominoLink[];
    let ends: [number, number];
    let end: 0 | 1 = 1;
    if (state.chain.length === 0 || !state.ends) {
      if (tile !== state.opener) return null;
      chain = [{ tile, a: x, b: y, by: seat }];
      ends = [x, y];
    } else {
      const fits = dominoFits(tile, state.ends);
      if (fits.length === 0) return null;
      const wanted = d.end;
      if (wanted === 0 || wanted === 1) {
        if (!fits.includes(wanted)) return null;
        end = wanted;
      } else if (fits.length === 1) end = fits[0]!;
      // Serve nas duas pontas com números diferentes: precisa dizer qual.
      else if (state.ends[0] === state.ends[1]) end = 1;
      else return null;
      const touch = state.ends[end];
      const other = x === touch ? y : x;
      if (end === 0) {
        chain = [{ tile, a: other, b: touch, by: seat }, ...state.chain];
        ends = [other, state.ends[1]];
      } else {
        chain = [...state.chain, { tile, a: touch, b: other, by: seat }];
        ends = [state.ends[0], other];
      }
    }

    const hands = state.hands.slice();
    hands[seat] = hand.filter((t) => t !== tile);
    const counts = state.counts.slice();
    counts[seat] = hands[seat]!.length;
    const next: DominoState = { ...state, hands, counts, chain, ends, moves: state.moves + 1, turn: dominoNext(state, seat), last: { seat, action: "play", tile, end } };
    if (hands[seat]!.length === 0) {
      const team = state.teamOf[seat] ?? -1;
      const winners = team >= 0 ? state.active.filter((o) => state.teamOf[o] === team) : [seat];
      const pips = state.hands.map((h, i) => (state.active.includes(i) ? handPips(i === seat ? [] : h) : 0));
      return { ...next, turn: seat, over: true, winner: seat, winners, reason: "domino", pips };
    }
    return locked(next) ? endLocked(next) : next;
  },

  forfeit: forfeitGroup,

  view(state, viewer) {
    // No fim, as mãos ficam à mostra (para contar os pontos); o monte nunca sai do servidor.
    const hands = state.hands.map((h, i) => (state.over || i === viewer ? (h ?? []).slice() : null));
    return { ...state, hands, stock: [] };
  },
};
