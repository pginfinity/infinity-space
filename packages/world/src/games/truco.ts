import { nextSeed, shuffled } from "./rng.ts";
import { forfeitGroup, type BaseState, type CreateOptions, type GameRules } from "./types.ts";

/**
 * Truco paulista com baralho espanhol de 40 cartas (sem 8, 9 e 10), de 2 (mano a mano) ou 4 (em duplas:
 * lugares 0 e 2 contra 1 e 3). Partida até 12 pontos.
 *
 * - Cada mão: 3 cartas para cada um e uma carta virada (a "vira"). A manilha é o valor seguinte ao da vira.
 * - Força das cartas comuns: 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3. Manilhas ganham de todas, e entre elas
 *   vale o naipe: ouros (picafumo) < espadas < copas < paus (zap).
 * - Melhor de três vazas. Cartas comuns iguais de duplas diferentes empatam a vaza ("cangou"): empate na
 *   primeira, quem ganhar a segunda leva; vitória na primeira e empate depois, leva quem ganhou a primeira;
 *   três empates, ninguém marca.
 * - A mão vale 1. Na sua vez, dá para pedir truco (3); a outra dupla aceita, corre (quem pediu marca o valor
 *   de antes) ou pede mais: seis, nove, doze. A mesma dupla não aumenta duas vezes seguidas.
 * - Mão de onze: a dupla com 11 vê as cartas da dupla e decide se joga (a mão vale 3) ou corre (os outros
 *   marcam 1). Não se pede truco na mão de onze.
 * - Mão de ferro: as duas duplas com 11. Todos jogam às cegas (ninguém vê as próprias cartas), valendo 1.
 * - Carta coberta: da segunda vaza em diante, quem está na vez pode jogar a carta virada para baixo. Ela não
 *   vale nada: perde para qualquer carta aberta e não empata com ninguém. Se todas as cartas da vaza vierem
 *   cobertas, a vaza empata (como "cangou") e quem a começou começa a próxima.
 *   Na mão de ferro não se cobre: as cartas já vão às cegas, e cobrir só jogaria fora uma carta que nem
 *   quem joga conhece. Na mão de onze pode cobrir normalmente.
 *
 * Informação escondida: cada pessoa vê só a própria mão (na mão de onze, também a do parceiro). Quem assiste
 * vê só quantas cartas cada um tem. A carta coberta fica escondida na mesa, na vaza já fechada e no fim:
 * só quem pode ver a mão de quem cobriu (ele mesmo; na mão de onze, também o parceiro, que já tinha visto
 * essa carta na mão) sabe qual foi. A semente do embaralhamento nunca sai do servidor.
 */

/** Valores, do mais fraco para o mais forte (fora as manilhas). */
export const TRUCO_RANKS = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"] as const;
/** Naipes, do mais fraco para o mais forte entre as manilhas. */
export const TRUCO_SUITS = ["ouros", "espadas", "copas", "paus"] as const;
/** Valores da mão: normal, truco, seis, nove, doze. */
export const TRUCO_STAKES = [1, 3, 6, 9, 12] as const;
/** Pontos para vencer a partida. */
export const TRUCO_TARGET = 12;
export const TRUCO_SEATS = 4;
const HAND_SIZE = 3;

/** Carta: `naipe * 10 + valor` (0 a 39). */
export const trucoRank = (card: number): number => card % 10;
export const trucoSuit = (card: number): number => Math.floor(card / 10);
export const trucoCard = (rank: number, suit: number): number => suit * 10 + rank;

/** Valor que vira manilha, dada a vira. */
export const trucoManilha = (vira: number): number => (trucoRank(vira) + 1) % 10;

/** Força da carta nesta mão (manilhas acima de todas, pelo naipe). */
export function trucoPower(card: number, manilha: number): number {
  return trucoRank(card) === manilha ? 100 + trucoSuit(card) : trucoRank(card);
}

/** Próximo valor depois de um pedido (1 → 3 → 6 → 9 → 12). */
export const trucoNextStake = (v: number): number => (v < 3 ? 3 : Math.min(TRUCO_TARGET, v + 3));

export interface TrucoPlay {
  seat: number;
  /** A carta jogada. Na visão de quem não pode ver uma carta coberta, vem null. */
  card: number | null;
  /** Jogada virada para baixo (não vale nada). Ausente = carta aberta. */
  covered?: true;
}

export interface TrucoRaise {
  /** Quem pediu (o último aumento). */
  by: number;
  /** Dupla de quem pediu. */
  team: number;
  /** Valor pedido. */
  to: number;
  /** De quem era a vez quando o primeiro pedido foi feito (volta para ela ao aceitar). */
  turn: number;
}

export interface TrucoHandResult {
  hand: number;
  /** Dupla que marcou (-1 = ninguém). */
  team: number;
  points: number;
  /** Como acabou: nas vazas, alguém correu de um pedido, a dupla da mão de onze correu, ou três empates. */
  how: "tricks" | "run" | "eleven" | "tie";
}

export interface TrucoState extends BaseState {
  /** Lugares que jogam (2 ou 4), na ordem da vez. */
  active: number[];
  /** Dupla de cada lugar (0 ou 1); -1 = fora da partida. */
  teamOf: number[];
  /** Pontos de cada dupla. */
  score: [number, number];
  /** Número da mão (1, 2...). */
  hand: number;
  /** Quem deu as cartas desta mão. */
  dealer: number;
  /** Cartas na mão de cada lugar. Na visão de cada pessoa, só as que ela pode ver; as outras vêm null. */
  hands: Array<number[] | null>;
  /** Quantas cartas cada lugar tem na mão (público). */
  counts: number[];
  vira: number;
  /** Valor (índice em TRUCO_RANKS) que é manilha nesta mão. */
  manilha: number;
  /** Cartas da vaza em andamento, na ordem jogada. */
  table: TrucoPlay[];
  /** Resultado de cada vaza já fechada nesta mão: dupla que ganhou ou -1 (empate). */
  tricks: number[];
  /** Última vaza fechada (para mostrar enquanto a mesa está vazia). `seat` = quem levou. */
  prevTrick: { cards: TrucoPlay[]; team: number; seat: number | null } | null;
  /** Quem começou a vaza em andamento. */
  lead: number;
  /** Quanto a mão vale agora. */
  stake: number;
  /** Pedido de truco (ou seis, nove, doze) esperando resposta. */
  raise: TrucoRaise | null;
  /** Dupla do último aumento aceito (não pode aumentar de novo em seguida). */
  raisedBy: number | null;
  /** Mão de onze: a dupla com 11 pontos (null = mão normal). */
  eleven: number | null;
  /** A dupla da mão de onze ainda está decidindo se joga. */
  deciding: boolean;
  /** Mão de ferro (as duas duplas com 11): ninguém vê as próprias cartas. */
  iron: boolean;
  /** Resultado da mão anterior. */
  lastHand: TrucoHandResult | null;
  /** Semente da próxima mão. Só no servidor: nunca vai na visão de ninguém. */
  seed?: number;
}

/** Lances do truco. */
export type TrucoMove =
  /** Joga a carta na posição `play` da própria mão; com `cover`, virada para baixo (da segunda vaza em diante). */
  | { play: number; cover?: boolean }
  /** Pede truco (ou o próximo valor). */
  | { truco: true }
  /** Responde a um pedido: aceita, corre ou pede mais. */
  | { answer: "accept" | "run" | "raise" }
  /** Mão de onze: a dupla com 11 joga ou corre. */
  | { eleven: "play" | "run" };

/** Próximo lugar na ordem da vez. */
export function trucoNext(s: Pick<TrucoState, "active">, seat: number): number {
  const i = s.active.indexOf(seat);
  return s.active[(i + 1) % s.active.length] ?? seat;
}

/** Lugares de uma dupla, na ordem da vez. */
export const trucoTeam = (s: Pick<TrucoState, "active" | "teamOf">, team: number): number[] => s.active.filter((x) => s.teamOf[x] === team);

/** Primeiro lugar da outra dupla depois de `seat`, na ordem da vez. */
function firstFoe(s: Pick<TrucoState, "active" | "teamOf">, seat: number): number {
  let x = trucoNext(s, seat);
  for (let i = 0; i < s.active.length && s.teamOf[x] === s.teamOf[seat]; i++) x = trucoNext(s, x);
  return x;
}

/** Quem leva a mão pelas vazas: dupla, -1 (ninguém: três empates) ou null (ainda não decidiu). */
export function trucoHandWinner(tricks: readonly number[]): number | null {
  const [a, b, c] = tricks;
  if (tricks.length < 2 || a === undefined || b === undefined) return null;
  if (tricks.length === 2) {
    if (a === -1 && b === -1) return null;
    if (a === -1) return b;
    if (b === -1 || a === b) return a;
    return null;
  }
  if (c === undefined) return null;
  if (c !== -1) return c;
  return a !== -1 ? a : b !== -1 ? b : -1;
}

/**
 * Quem levou a vaza: dupla vencedora (-1 empate) e o lugar que joga primeiro na próxima.
 * Carta coberta não conta: só as abertas disputam. Tudo coberto: empate, e quem começou a vaza começa a próxima.
 */
export function trucoTrick(plays: readonly TrucoPlay[], manilha: number, teamOf: readonly number[]): { team: number; seat: number } {
  const open = plays.filter((p): p is TrucoPlay & { card: number } => !p.covered && p.card !== null);
  if (open.length === 0) return { team: -1, seat: plays[0]?.seat ?? 0 };
  const best = Math.max(...open.map((p) => trucoPower(p.card, manilha)));
  const top = open.filter((p) => trucoPower(p.card, manilha) === best);
  const teams = new Set(top.map((p) => teamOf[p.seat]));
  return { team: teams.size > 1 ? -1 : (teamOf[top[0]!.seat] ?? -1), seat: top[0]!.seat };
}

/** Dá para jogar coberta agora? Só da segunda vaza em diante, e nunca na mão de ferro. */
export const trucoCanCover = (s: Pick<TrucoState, "tricks" | "iron">): boolean => s.tricks.length > 0 && !s.iron;

/** Força da carta para ordenar a mão (da mais fraca para a mais forte). */
const sortHand = (hand: number[], manilha: number) => hand.sort((x, y) => trucoPower(x, manilha) - trucoPower(y, manilha));

/** Dá as cartas da mão seguinte. */
function deal(s: TrucoState, dealer: number, seed: number): TrucoState {
  const deck = shuffled(
    Array.from({ length: 40 }, (_, i) => i),
    seed,
  );
  const hands: Array<number[]> = s.hands.map(() => []);
  let seat = trucoNext(s, dealer);
  for (let i = 0; i < s.active.length; i++) {
    hands[seat] = deck.splice(0, HAND_SIZE);
    seat = trucoNext(s, seat);
  }
  const vira = deck.shift()!;
  const manilha = trucoManilha(vira);
  const at11 = [0, 1].filter((t) => s.score[t] === TRUCO_TARGET - 1);
  const iron = at11.length === 2;
  // Às cegas, a ordem das cartas não pode entregar a força: só ordena quando dá para ver.
  if (!iron) for (const h of hands) sortHand(h, manilha);
  const lead = trucoNext(s, dealer);
  const eleven = at11.length === 1 ? at11[0]! : null;
  const deciders = eleven === null ? [] : trucoTeam(s, eleven);
  const firstDecider = eleven === null ? lead : (s.active.slice(s.active.indexOf(lead)).concat(s.active).find((x) => s.teamOf[x] === eleven) ?? lead);
  return {
    ...s,
    dealer,
    hands,
    counts: hands.map((h) => h.length),
    vira,
    manilha,
    table: [],
    tricks: [],
    prevTrick: null,
    lead,
    stake: 1,
    raise: null,
    raisedBy: null,
    eleven,
    deciding: eleven !== null,
    iron,
    turn: eleven === null ? lead : firstDecider,
    acting: eleven === null ? undefined : deciders,
    seed: nextSeed(seed),
  };
}

/** Fecha a mão: marca os pontos e dá as cartas da próxima (ou encerra a partida). */
function endHand(s: TrucoState, team: number, points: number, how: TrucoHandResult["how"], seed: number): TrucoState {
  const score: [number, number] = [s.score[0], s.score[1]];
  if (team >= 0) score[team] = Math.min(TRUCO_TARGET, score[team]! + points);
  const lastHand: TrucoHandResult = { hand: s.hand, team, points: team >= 0 ? points : 0, how };
  const next: TrucoState = { ...s, score, lastHand, raise: null, acting: undefined, deciding: false };
  if (team >= 0 && score[team]! >= TRUCO_TARGET) {
    const winners = trucoTeam(s, team);
    return { ...next, over: true, winner: winners[0] ?? null, winners, reason: "score" };
  }
  return deal({ ...next, hand: s.hand + 1 }, trucoNext(s, s.dealer), seed);
}

function blank(): TrucoState {
  return {
    turn: 0,
    winner: null,
    draw: false,
    over: false,
    reason: null,
    moves: 0,
    active: [],
    teamOf: new Array<number>(TRUCO_SEATS).fill(-1),
    score: [0, 0],
    hand: 0,
    dealer: 0,
    hands: Array.from({ length: TRUCO_SEATS }, () => []),
    counts: new Array<number>(TRUCO_SEATS).fill(0),
    vira: 0,
    manilha: 1,
    table: [],
    tricks: [],
    prevTrick: null,
    lead: 0,
    stake: 1,
    raise: null,
    raisedBy: null,
    eleven: null,
    deciding: false,
    iron: false,
    lastHand: null,
  };
}

/** Estado no começo de uma mão qualquer (para os testes montarem situações). */
export function trucoWithScore(s: TrucoState, score: [number, number], seed = 1): TrucoState {
  return deal({ ...s, score }, s.dealer, seed);
}

export const truco: GameRules<TrucoState> = {
  kind: "truco",
  seats: TRUCO_SEATS,
  players: [2, 4],
  keepSeats: true,

  create(opts?: CreateOptions) {
    const s = blank();
    const seated = (opts?.seated ?? []).filter((x, i, all) => Number.isInteger(x) && x >= 0 && x < TRUCO_SEATS && all.indexOf(x) === i).sort((a, b) => a - b);
    if (seated.length !== 2 && seated.length !== 4) return s;
    const n = seated.length;
    const teamOf = s.teamOf.map((_, seat) => (seated.includes(seat) ? seated.indexOf(seat) % 2 : -1));
    const round = Math.max(1, opts?.round ?? 1);
    // A cada partida nova, outra pessoa começa (sem trocar ninguém de lugar).
    const dealer = seated[(round - 1 + n - 1) % n]!;
    return deal({ ...s, active: seated, teamOf, hand: 1 }, dealer, opts?.seed ?? 0);
  },

  move(state, seat, data, seed) {
    if (state.over || !state.active.includes(seat)) return null;
    const d = (data ?? {}) as Partial<{ play: unknown; cover: unknown; truco: unknown; answer: unknown; eleven: unknown }>;
    const team = state.teamOf[seat]!;
    const fresh = seed ?? state.seed ?? 0;
    const moves = state.moves + 1;

    // Mão de onze: a dupla com 11 decide antes de qualquer carta.
    if (state.deciding) {
      if (team !== state.eleven || (d.eleven !== "play" && d.eleven !== "run")) return null;
      if (d.eleven === "run") return endHand({ ...state, moves }, team === 0 ? 1 : 0, 1, "eleven", fresh);
      return { ...state, moves, deciding: false, stake: 3, turn: state.lead, acting: undefined };
    }

    // Pedido esperando resposta: só a outra dupla responde.
    if (state.raise) {
      const r = state.raise;
      if (team === r.team) return null;
      if (d.answer === "accept") return { ...state, moves, stake: r.to, raisedBy: r.team, raise: null, turn: r.turn, acting: undefined };
      if (d.answer === "run") return endHand({ ...state, moves }, r.team, state.stake, "run", fresh);
      if (d.answer === "raise" && r.to < TRUCO_TARGET) {
        const raise: TrucoRaise = { by: seat, team, to: trucoNextStake(r.to), turn: r.turn };
        const foe = firstFoe(state, seat);
        return { ...state, moves, stake: r.to, raisedBy: r.team, raise, turn: foe, acting: trucoTeam(state, state.teamOf[foe]!) };
      }
      return null;
    }

    if (seat !== state.turn) return null;

    if (d.truco === true) {
      if (state.eleven !== null || state.iron || state.stake >= TRUCO_TARGET || state.raisedBy === team) return null;
      const raise: TrucoRaise = { by: seat, team, to: trucoNextStake(state.stake), turn: seat };
      const foe = firstFoe(state, seat);
      return { ...state, moves, raise, turn: foe, acting: trucoTeam(state, state.teamOf[foe]!) };
    }

    const index = d.play;
    const hand = state.hands[seat] ?? [];
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= hand.length) return null;
    if (d.cover !== undefined && typeof d.cover !== "boolean") return null;
    // Coberta: nunca na primeira vaza nem na mão de ferro.
    const cover = d.cover === true;
    if (cover && !trucoCanCover(state)) return null;
    const card = hand[index]!;
    const hands = state.hands.slice();
    hands[seat] = hand.filter((_, i) => i !== index);
    const counts = state.counts.slice();
    counts[seat] = hands[seat]!.length;
    const play: TrucoPlay = cover ? { seat, card, covered: true } : { seat, card };
    const table = [...state.table, play];
    const played: TrucoState = { ...state, hands, counts, table, moves };
    if (table.length < state.active.length) return { ...played, turn: trucoNext(state, seat) };

    // Vaza completa: quem levou começa a próxima (no empate, quem jogou primeiro a carta mais alta).
    const trick = trucoTrick(table, state.manilha, state.teamOf);
    const tricks = [...state.tricks, trick.team];
    const closed: TrucoState = { ...played, table: [], tricks, prevTrick: { cards: table, team: trick.team, seat: trick.team === -1 ? null : trick.seat } };
    const winner = trucoHandWinner(tricks);
    if (winner === null) return { ...closed, lead: trick.seat, turn: trick.seat };
    return endHand(closed, winner, winner >= 0 ? state.stake : 0, winner >= 0 ? "tricks" : "tie", fresh);
  },

  forfeit: forfeitGroup,

  view(state, viewer) {
    const mine = viewer >= 0 ? state.teamOf[viewer] : undefined;
    // Mão de onze: a dupla com 11 vê as cartas do parceiro.
    const partner = (i: number) => state.eleven !== null && mine === state.eleven && state.teamOf[i] === mine;
    const sees = (i: number) => !state.iron && (i === viewer || partner(i));
    // Carta coberta: só quem podia ver aquela mão sabe qual foi (na mesa, na última vaza e no fim da partida).
    const seesCover = (i: number) => i === viewer || partner(i);
    const hide = (p: TrucoPlay): TrucoPlay => (p.covered && !seesCover(p.seat) ? { seat: p.seat, card: null, covered: true } : { ...p });
    const { seed: _hidden, ...rest } = state;
    return {
      ...rest,
      hands: state.hands.map((h, i) => (sees(i) ? (h ?? []).slice() : null)),
      table: state.table.map(hide),
      prevTrick: state.prevTrick ? { ...state.prevTrick, cards: state.prevTrick.cards.map(hide) } : null,
    };
  },
};
