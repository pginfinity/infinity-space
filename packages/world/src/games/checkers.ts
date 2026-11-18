import { forfeitTwoSeats, type BaseState, type GameRules } from "./types.ts";

/**
 * Damas, regras brasileiras (tabuleiro 8×8, 12 pedras de cada lado nas casas escuras).
 * Lugar 0 = Claras (começam, embaixo), lugar 1 = Escuras (em cima).
 *
 * - Pedra anda uma casa na diagonal para a frente; captura para a frente e para trás.
 * - Captura é obrigatória e vale a lei da maioria: entre as capturas possíveis, só valem as que
 *   tomam o maior número de peças (dama e pedra contam igual).
 * - As peças tomadas só saem no fim da sequência: não dá para pular a mesma peça duas vezes,
 *   e elas bloqueiam o caminho enquanto a sequência não termina.
 * - Dama voa: anda e captura a qualquer distância na diagonal, parando em qualquer casa vazia depois da peça tomada.
 * - Promove ao terminar o lance na última linha. Se passa pela última linha no meio de uma captura e a
 *   sequência continua, segue como pedra.
 * - Empate: 20 lances seguidos só de damas sem captura, ou a mesma posição pela terceira vez.
 * - Finais especiais (regras oficiais, as mesmas da regra internacional), contra uma dama sozinha:
 *   - 3 damas, 2 damas + 1 pedra ou 1 dama + 2 pedras: empate depois de 16 lances de cada lado;
 *   - 2 damas, 1 dama + 1 pedra ou 1 dama: empate depois de 5 lances de cada lado.
 *   A contagem começa quando a posição aparece e recomeça se a composição muda (captura ou promoção).
 *   Enquanto ela vale, é ela que decide o empate por lances: a regra dos 20 lances fica de fora (senão os
 *   20 lances só de damas acabariam antes com o final de 3 damas contra 1). A repetição continua valendo.
 * - Quem não tem lance (sem peças ou bloqueado) perde.
 */

export const CHECKERS_EMPTY = 0;
/** Códigos das casas: pedra e dama de cada lugar. */
export const CHECKERS_PIECE = { man0: 1, king0: 2, man1: 3, king1: 4 } as const;
/** Lances seguidos só de damas, sem captura, que empatam a partida. */
export const CHECKERS_KING_DRAW = 20;

/** Finais especiais contra uma dama sozinha: [damas, pedras] do outro lado → lances de cada lado até o empate. */
export const CHECKERS_ENDINGS: ReadonlyArray<{ kings: number; men: number; each: number }> = [
  { kings: 3, men: 0, each: 16 },
  { kings: 2, men: 1, each: 16 },
  { kings: 1, men: 2, each: 16 },
  { kings: 2, men: 0, each: 5 },
  { kings: 1, men: 1, each: 5 },
  { kings: 1, men: 0, each: 5 },
];

/** Final especial no tabuleiro: o lado mais forte (`strong`), o que ele tem e quantos lances de cada lado valem. */
export interface CheckersEnding {
  /** Lugar do lado com mais peças (no 1 dama contra 1 dama, o lugar 0). */
  strong: number;
  kings: number;
  men: number;
  /** Lances de cada lado até o empate (16 ou 5). */
  each: number;
  /** Composição das peças (muda com captura ou promoção, e a contagem recomeça). */
  key: string;
}

/** Contagem de um final especial em andamento. */
export interface CheckersEndgame {
  /** Lances de cada lado até o empate (16 ou 5). */
  each: number;
  /** Lances já feitos (dos dois lados somados) desde que a posição apareceu. */
  plies: number;
}

export interface CheckersMove {
  /** Casa de saída e cada casa onde a peça para (0 a 63, em ordem de leitura vista pelas Claras). */
  path: number[];
  /** Casas das peças tomadas, na ordem. */
  captured: number[];
}

export interface CheckersState extends BaseState {
  /** 64 casas em ordem de leitura (0 = a8, 63 = h1): 0 vazia, 1/2 pedra/dama das Claras, 3/4 pedra/dama das Escuras. */
  board: number[];
  last: CheckersMove | null;
  /** Lances seguidos só de damas, sem captura (empate aos 20). */
  kingMoves: number;
  /** Posições vistas desde o último lance sem volta (captura ou pedra andando), para a repetição. */
  seen: Record<string, number>;
  /** Peças perdidas por cada lugar. */
  lost: [number, number];
  /** Contagem do final especial (3 damas contra 1 e parecidos). null = não vale agora. */
  endgame: CheckersEndgame | null;
}

/** Lance enviado pelo cliente: o caminho completo, da casa de saída à última parada. */
export interface CheckersMoveData {
  path: number[];
}

const FILES = "abcdefgh";
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const checkersRow = (sq: number): number => Math.floor(sq / 8);
export const checkersCol = (sq: number): number => sq % 8;
/** Casa escura (as únicas usadas). a1 é escura. */
export const checkersDark = (sq: number): boolean => (checkersRow(sq) + checkersCol(sq)) % 2 === 1;
/** Nome da casa em coordenadas (a1 a h8), com as Claras embaixo. */
export const checkersSquareName = (sq: number): string => `${FILES[checkersCol(sq)]}${8 - checkersRow(sq)}`;
/** Casa pelo nome ("c3"), ou -1. */
export function checkersSquare(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]!);
}

/** Dono da peça (0 ou 1), ou -1 se a casa está vazia. */
export function checkersOwner(p: number | undefined): number {
  if (p === 1 || p === 2) return 0;
  if (p === 3 || p === 4) return 1;
  return -1;
}

export const checkersIsKing = (p: number | undefined): boolean => p === 2 || p === 4;

const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const at = (r: number, c: number) => r * 8 + c;

/** Todas as sequências de captura da peça em `from` (cada uma até não dar para tomar mais nada). */
function capturesFrom(board: readonly number[], from: number, seat: number): CheckersMove[] {
  const king = checkersIsKing(board[from]);
  const foe = seat === 0 ? 1 : 0;
  const out: CheckersMove[] = [];
  // A casa de saída conta como vazia durante a sequência (a peça já saiu de lá).
  const empty = (sq: number) => sq === from || board[sq] === CHECKERS_EMPTY;

  const walk = (sq: number, path: number[], captured: number[]) => {
    let more = false;
    const r0 = checkersRow(sq);
    const c0 = checkersCol(sq);
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr;
      let c = c0 + dc;
      // Dama voa até a primeira peça da diagonal; pedra só olha a casa vizinha.
      while (king && inside(r, c) && empty(at(r, c))) {
        r += dr;
        c += dc;
      }
      if (!inside(r, c)) continue;
      const victim = at(r, c);
      if (checkersOwner(board[victim]) !== foe || captured.includes(victim)) continue;
      let lr = r + dr;
      let lc = c + dc;
      while (inside(lr, lc) && empty(at(lr, lc))) {
        more = true;
        walk(at(lr, lc), [...path, at(lr, lc)], [...captured, victim]);
        if (!king) break;
        lr += dr;
        lc += dc;
      }
    }
    if (!more && captured.length > 0) out.push({ path, captured });
  };
  walk(from, [from], []);
  return out;
}

/** Lances legais de quem está na vez: só as capturas máximas, se houver captura; senão os lances simples. */
export function checkersMoves(s: Pick<CheckersState, "board" | "turn">): CheckersMove[] {
  const seat = s.turn;
  const caps: CheckersMove[] = [];
  for (let sq = 0; sq < 64; sq++) if (checkersOwner(s.board[sq]) === seat) caps.push(...capturesFrom(s.board, sq, seat));
  if (caps.length > 0) {
    const max = Math.max(...caps.map((m) => m.captured.length));
    return caps.filter((m) => m.captured.length === max);
  }
  const out: CheckersMove[] = [];
  const ahead = seat === 0 ? -1 : 1;
  for (let sq = 0; sq < 64; sq++) {
    const p = s.board[sq];
    if (checkersOwner(p) !== seat) continue;
    for (const [dr, dc] of DIRS) {
      if (!checkersIsKing(p) && dr !== ahead) continue;
      let r = checkersRow(sq) + dr;
      let c = checkersCol(sq) + dc;
      while (inside(r, c) && s.board[at(r, c)] === CHECKERS_EMPTY) {
        out.push({ path: [sq, at(r, c)], captured: [] });
        if (!checkersIsKing(p)) break;
        r += dr;
        c += dc;
      }
    }
  }
  return out;
}

/** Tabuleiro inicial: Escuras nas três primeiras linhas, Claras nas três últimas (só casas escuras). */
export function checkersStart(): number[] {
  const board = new Array<number>(64).fill(CHECKERS_EMPTY);
  for (let sq = 0; sq < 64; sq++) {
    if (!checkersDark(sq)) continue;
    const r = checkersRow(sq);
    if (r <= 2) board[sq] = CHECKERS_PIECE.man1;
    else if (r >= 5) board[sq] = CHECKERS_PIECE.man0;
  }
  return board;
}

const key = (board: readonly number[], turn: number) => `${board.join("")}${turn}`;

/**
 * Final especial no tabuleiro, ou null: um lado com uma dama sozinha e o outro com uma das composições
 * de `CHECKERS_ENDINGS` (2 damas contra 2 damas, por exemplo, não entra: fica com a regra dos 20 lances).
 */
export function checkersEnding(board: readonly number[]): CheckersEnding | null {
  const kings = [0, 0];
  const men = [0, 0];
  for (const p of board) {
    const owner = checkersOwner(p);
    if (owner < 0) continue;
    if (checkersIsKing(p)) kings[owner]!++;
    else men[owner]!++;
  }
  for (const strong of [0, 1]) {
    const weak = strong === 0 ? 1 : 0;
    if (kings[weak] !== 1 || men[weak] !== 0) continue;
    const found = CHECKERS_ENDINGS.find((e) => e.kings === kings[strong] && e.men === men[strong]);
    if (found) return { strong, kings: found.kings, men: found.men, each: found.each, key: `${kings[0]}.${men[0]}x${kings[1]}.${men[1]}` };
  }
  return null;
}

/** Lances que faltam para o empate do final especial, contados para quem está na vez (null = não vale). */
export function checkersEndgameLeft(s: Pick<CheckersState, "endgame">): number | null {
  if (!s.endgame) return null;
  return Math.max(0, Math.ceil((s.endgame.each * 2 - s.endgame.plies) / 2));
}

export const checkers: GameRules<CheckersState> = {
  kind: "checkers",
  seats: 2,

  create() {
    const board = checkersStart();
    return { turn: 0, winner: null, draw: false, over: false, reason: null, moves: 0, board, last: null, kingMoves: 0, seen: { [key(board, 0)]: 1 }, lost: [0, 0], endgame: null };
  },

  move(state, seat, data) {
    if (state.over || seat !== state.turn) return null;
    const path = (data as Partial<CheckersMoveData> | null | undefined)?.path;
    if (!Array.isArray(path) || path.length < 2 || path.length > 20 || !path.every((x) => Number.isInteger(x) && x >= 0 && x < 64)) return null;
    const legal = checkersMoves(state).find((m) => m.path.length === path.length && m.path.every((x, i) => x === path[i]));
    if (!legal) return null;

    const board = state.board.slice();
    const from = legal.path[0]!;
    const to = legal.path.at(-1)!;
    const piece = board[from]!;
    board[from] = CHECKERS_EMPTY;
    for (const c of legal.captured) board[c] = CHECKERS_EMPTY;
    const lastRow = seat === 0 ? 0 : 7;
    const promote = !checkersIsKing(piece) && checkersRow(to) === lastRow;
    board[to] = promote ? piece + 1 : piece;

    const foe = seat === 0 ? 1 : 0;
    const lost: [number, number] = [state.lost[0], state.lost[1]];
    lost[foe] += legal.captured.length;
    // Lance sem volta (captura ou pedra andando): zera a contagem de damas e as posições vistas.
    const irreversible = legal.captured.length > 0 || !checkersIsKing(piece);
    const kingMoves = irreversible ? 0 : state.kingMoves + 1;
    const k = key(board, foe);
    const seen = irreversible ? {} : { ...state.seen };
    seen[k] = (seen[k] ?? 0) + 1;

    // Final especial: conta os lances desde que a composição apareceu; se mudou (captura, promoção), recomeça do zero.
    const ending = checkersEnding(board);
    const sameEnding = ending !== null && checkersEnding(state.board)?.key === ending.key;
    const endgame: CheckersEndgame | null = ending ? { each: ending.each, plies: sameEnding ? (state.endgame?.plies ?? 0) + 1 : 0 } : null;

    const next: CheckersState = { ...state, board, last: { path: legal.path, captured: legal.captured }, moves: state.moves + 1, turn: foe, kingMoves, seen, lost, endgame };
    if (checkersMoves(next).length === 0) return { ...next, over: true, winner: seat, reason: "nomoves" };
    if ((seen[k] ?? 0) >= 3) return { ...next, over: true, draw: true, reason: "repetition" };
    if (endgame && endgame.plies >= endgame.each * 2) return { ...next, over: true, draw: true, reason: "endgame" };
    // Com a contagem do final valendo, ela é quem decide (a regra dos 20 lances fica de fora).
    if (!endgame && kingMoves >= CHECKERS_KING_DRAW) return { ...next, over: true, draw: true, reason: "kings" };
    return next;
  },

  forfeit: forfeitTwoSeats,
};
