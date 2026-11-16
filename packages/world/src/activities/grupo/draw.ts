import { grupoEditDistance, grupoFold } from "./common.ts";
import { DRAW_WORDS, type DrawLevel } from "./drawWords.ts";

export type { DrawLevel } from "./drawWords.ts";
export { DRAW_WORDS } from "./drawWords.ts";

/**
 * Desenhe e adivinhe, nos quadros brancos: quem está na sala do quadro entra; na sua vez a pessoa
 * escolhe uma palavra e desenha; os outros chutam. A palavra só vai para quem desenha (evento "word").
 *
 * O desenho não vai no estado (seria grande e frequente): os traços vão por eventos para todos
 * (o quadro no mundo mostra ao vivo) e quem chega pede o desenho inteiro com "sync".
 */

export const DRAW_KIND = "drawguess";
/** Id da atividade de um quadro branco. */
export const drawActId = (objectId: string): string => `desenho-${objectId}`;

/** Tamanho lógico do quadro (proporção do quadro branco do mundo). Pontos são inteiros nessa grade. */
export const DRAW_W = 1000;
export const DRAW_H = 536;

/** Cores do pincel (índice no traço). A última é a borracha (cor do quadro). */
export const DRAW_COLORS: readonly string[] = ["#0B1A33", "#8A93A3", "#E5484D", "#EE5C29", "#F2B134", "#2BC48A", "#00B7FF", "#7B61FF", "#E85D9A", "#8B5A3C", "#FFFFFF"];
export const DRAW_ERASER = DRAW_COLORS.length - 1;
/** Espessuras do pincel, em unidades da grade. */
export const DRAW_SIZES: readonly number[] = [4, 9, 18, 34];

export const DRAW_SECONDS: readonly number[] = [60, 80, 100];
export const DRAW_DEFAULT_SECONDS = 80;
export const DRAW_ROUNDS: readonly number[] = [1, 2, 3];
export const DRAW_DEFAULT_ROUNDS = 2;
/** Tempo para escolher a palavra (depois o servidor escolhe a fácil). */
export const DRAW_CHOOSE_MS = 12_000;
/** Pausa mostrando a palavra no fim da vez. */
export const DRAW_TURN_END_MS = 5_000;
export const DRAW_MIN_PLAYERS = 2;
export const DRAW_MAX_PLAYERS = 12;
export const DRAW_GUESS_MAX = 40;
/** Intervalo mínimo entre dois chutes da mesma pessoa. */
export const DRAW_GUESS_GAP_MS = 450;
/** Limites do desenho (por vez). */
export const DRAW_MAX_STROKES = 800;
export const DRAW_MAX_POINTS = 24_000;
/** Pontos por mensagem de traço (x, y contam como 1 ponto). */
export const DRAW_POINTS_PER_MSG = 80;
/** Itens do feed de chutes mantidos no estado. */
export const DRAW_FEED_MAX = 14;

/** Multiplicador de pontos por dificuldade. */
export const DRAW_LEVEL_MULT: Record<DrawLevel, number> = { facil: 1, medio: 1.5, dificil: 2 };

export type DrawPhase = "idle" | "lobby" | "choosing" | "drawing" | "turnEnd" | "final";

export interface DrawPlayer {
  id: string;
  name: string;
  score: number;
  /** Acertou a palavra desta vez. */
  guessed: boolean;
  /** Pontos ganhos na vez atual (ou na última). */
  gain: number;
  away?: boolean;
}

export interface DrawFeedItem {
  /** guess: chute errado (todos veem); correct: alguém acertou; info: aviso do jogo. */
  k: "guess" | "correct" | "info";
  name: string;
  text?: string;
}

export interface DrawState {
  phase: DrawPhase;
  game: number;
  /** Zona do quadro (quem está nela pode entrar). */
  zone: string;
  zoneName: string;
  /** Quem abriu a sala: escolhe as opções e começa. */
  owner: string | null;
  players: DrawPlayer[];
  drawer: string | null;
  round: number;
  rounds: number;
  seconds: number;
  /** Vez global (muda a cada desenhista). */
  turn: number;
  level: DrawLevel | null;
  /** Dica: "_" para letra escondida; espaço e hífen aparecem. */
  hint: string;
  /** A palavra, só no fim da vez. */
  word: string | null;
  left: number;
  duration: number;
  /** Id do desenho atual (muda ao limpar ou trocar de vez). */
  canvas: number;
  feed: DrawFeedItem[];
}

/** Um traço: cor, espessura e pontos [x0, y0, x1, y1...] na grade DRAW_W × DRAW_H. */
export interface DrawStroke {
  s: number;
  c: number;
  w: number;
  p: number[];
}

/** Eventos de desenho (para todos): começo de traço, mais pontos, desfazer, limpar. */
export interface DrawBegin extends DrawStroke {
  canvas: number;
}
export interface DrawPoints {
  canvas: number;
  s: number;
  p: number[];
}
/** Evento "canvas": o desenho inteiro (resposta ao "sync"). */
export interface DrawCanvas {
  canvas: number;
  strokes: DrawStroke[];
}
/** Evento "choices", só para quem desenha. */
export interface DrawChoices {
  turn: number;
  options: { word: string; level: DrawLevel }[];
}
/** Evento "word", só para quem desenha. */
export interface DrawWord {
  turn: number;
  word: string;
  level: DrawLevel;
}

export type DrawGuessResult = "correct" | "close" | "wrong";

/** Compara um chute com a palavra: sem acento, sem pontuação, com tolerância para "quase". */
export function drawCheckGuess(guess: string, word: string): DrawGuessResult {
  const g = grupoFold(guess);
  const w = grupoFold(word);
  if (!g || !w) return "wrong";
  if (g === w || g.replace(/ /g, "") === w.replace(/ /g, "")) return "correct";
  // Frase com a palavra dentro ("é uma girafa"): não vai para o feed (entregaria a resposta).
  if (w.length >= 3 && g.replace(/ /g, "").includes(w.replace(/ /g, ""))) return "close";
  const tol = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
  if (tol === 0) return "wrong";
  const d = grupoEditDistance(g.replace(/ /g, ""), w.replace(/ /g, ""), tol);
  return d <= tol ? "close" : "wrong";
}

/** Pontos de quem acerta: mais cedo vale mais; o primeiro ganha bônus; palavra difícil multiplica. */
export function drawGuessPoints(leftMs: number, durationMs: number, order: number, level: DrawLevel): number {
  const f = durationMs > 0 ? Math.min(1, Math.max(0, leftMs / durationMs)) : 0;
  const base = 100 + 200 * f + (order === 0 ? 50 : 0);
  return Math.round((base * DRAW_LEVEL_MULT[level]) / 5) * 5;
}

/** Pontos de quem desenha por pessoa que acertou. */
export function drawDrawerPoints(level: DrawLevel): number {
  return Math.round((60 * DRAW_LEVEL_MULT[level]) / 5) * 5;
}

/** Dica com as letras reveladas: "_" esconde letras; espaço, hífen e pontuação aparecem. */
export function drawHint(word: string, revealed: ReadonlySet<number>): string {
  return [...word].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !revealed.has(i) ? "_" : ch)).join("");
}

/** Quantas letras revelar: nenhuma até a metade do tempo, uma na metade, outra aos 3/4 (até 1/3 da palavra). */
export function drawRevealCount(elapsedFrac: number, letters: number): number {
  const cap = Math.floor(letters / 3);
  const want = elapsedFrac >= 0.75 ? 2 : elapsedFrac >= 0.5 ? 1 : 0;
  return Math.min(cap, want);
}

/** Índices de letras (não espaço/hífen) da palavra. */
export function drawLetterIndexes(word: string): number[] {
  const out: number[] = [];
  [...word].forEach((ch, i) => {
    if (/[\p{L}\p{N}]/u.test(ch)) out.push(i);
  });
  return out;
}

/** Sorteia três opções (uma de cada dificuldade), evitando as já usadas na partida. */
export function drawPickChoices(used: ReadonlySet<string>, rand: () => number): { word: string; level: DrawLevel }[] {
  return (["facil", "medio", "dificil"] as const).map((level) => {
    const list = DRAW_WORDS[level];
    const free = list.filter((w) => !used.has(w));
    const pool = free.length > 0 ? free : list;
    return { word: pool[Math.floor(rand() * pool.length)] as string, level };
  });
}

/** Confere uma lista de pontos vinda do cliente: inteiros dentro da grade, quantidade par e limitada. */
export function drawCleanPoints(raw: unknown, max = DRAW_POINTS_PER_MSG): number[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length % 2 !== 0 || raw.length > max * 2) return null;
  const out: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[i] = Math.min(i % 2 === 0 ? DRAW_W : DRAW_H, Math.max(0, Math.round(v)));
  }
  return out;
}
