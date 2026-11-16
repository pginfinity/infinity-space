import { grupoClean, grupoFold } from "./common.ts";

/**
 * Stop (Adedonha) do Café: sorteia uma letra; todo mundo preenche as categorias com palavras que
 * começam por ela; quem completar tudo pode gritar STOP. Depois os jogadores anulam respostas
 * inválidas por votação e cada categoria vale 10 (resposta única), 5 (repetida) ou 0 (vazia ou anulada).
 *
 * As respostas ficam só no servidor durante a rodada (o estado mostra só quantas cada um preencheu)
 * e aparecem para todos na validação.
 */

export const STOP_ID = "stop";
export const STOP_KIND = "stop";
/** Zona onde o jogo acontece (quem está nela entra). */
export const STOP_ZONE = "cafe";

/** Letras sorteáveis: sem K, Q, W, X, Y e Z. */
export const STOP_LETTERS: readonly string[] = "ABCDEFGHIJLMNOPRSTUV".split("");

export const STOP_DEFAULT_CATEGORIES: readonly string[] = ["Nome", "Cidade/Estado/País", "Animal", "Fruta/Legume", "Objeto", "Cor", "Marca", "Profissão", "Comida", "Filme/Série"];
/** Sugestões extras para montar a rodada. */
export const STOP_SUGGESTED_CATEGORIES: readonly string[] = [
  "Parte do corpo",
  "Esporte",
  "Música",
  "Personagem",
  "Time de futebol",
  "Bebida",
  "Instrumento musical",
  "Coisa do escritório",
  "Tecnologia",
  "Super-herói",
  "Planta",
  "Lugar para viajar",
];

export const STOP_MIN_CATEGORIES = 3;
export const STOP_MAX_CATEGORIES = 12;
export const STOP_CATEGORY_MAX = 24;
export const STOP_ANSWER_MAX = 40;
export const STOP_SECONDS: readonly number[] = [60, 90, 120, 180];
export const STOP_DEFAULT_SECONDS = 120;
export const STOP_ROUNDS: readonly number[] = [1, 3, 5];
export const STOP_DEFAULT_ROUNDS = 3;
/** Roleta da letra antes de valer. */
export const STOP_SPIN_MS = 2600;
/** Depois do STOP, espera as últimas respostas chegarem. */
export const STOP_GRACE_MS = 1800;
/** Tempo máximo da validação (depois apura sozinho). */
export const STOP_REVIEW_MS = 90_000;
export const STOP_MIN_PLAYERS = 2;
export const STOP_MAX_PLAYERS = 16;
/** Pontos por categoria. */
export const STOP_POINTS_UNIQUE = 10;
export const STOP_POINTS_REPEATED = 5;

export type StopPhase = "idle" | "lobby" | "spin" | "playing" | "stopping" | "review" | "results" | "final";

export interface StopPlayer {
  id: string;
  name: string;
  score: number;
  /** Quantas categorias preencheu na rodada (sem dizer o quê). */
  filled: number;
  /** Terminou de validar. */
  ready: boolean;
  /** Pontos da última rodada apurada. */
  gain: number;
  away?: boolean;
}

export interface StopState {
  phase: StopPhase;
  game: number;
  owner: string | null;
  categories: string[];
  seconds: number;
  rounds: number;
  round: number;
  letter: string | null;
  used: string[];
  players: StopPlayer[];
  left: number;
  duration: number;
  /** Quem gritou STOP (nome), ou null se acabou o tempo. */
  stoppedBy: string | null;
  /** Respostas de todos, por id (só na validação e no resultado). */
  answers: Record<string, string[]> | null;
  /** Votos de anulação: chave "id:categoria" → ids de quem votou. */
  votes: Record<string, string[]>;
  /** Pontos da rodada por id e categoria (no resultado). */
  points: Record<string, number[]> | null;
}

/** Chave de voto de uma resposta. */
export const stopVoteKey = (playerId: string, category: number): string => `${playerId}:${category}`;

/** Limpa uma resposta. */
export function stopCleanAnswer(raw: unknown): string {
  return grupoClean(raw, STOP_ANSWER_MAX);
}

/** Limpa a lista de categorias (únicas, sem vazias, no máximo STOP_MAX_CATEGORIES). Null se poucas. */
export function stopCleanCategories(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const t = grupoClean(c, STOP_CATEGORY_MAX);
    const k = grupoFold(t);
    if (t.length < 2 || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= STOP_MAX_CATEGORIES) break;
  }
  return out.length >= STOP_MIN_CATEGORIES ? out : null;
}

/** A resposta começa com a letra (sem acento: "Ágata" vale para A) e tem pelo menos 2 letras? */
export function stopFitsLetter(answer: string, letter: string): boolean {
  const f = grupoFold(answer);
  return f.replace(/ /g, "").length >= 2 && f[0] === grupoFold(letter)[0];
}

/** Votos necessários para anular: maioria dos outros jogadores (com 2 jogadores, 1 voto). */
export function stopVotesNeeded(players: number): number {
  return Math.floor(Math.max(1, players - 1) / 2) + 1;
}

/** Sorteia a próxima letra, sem repetir as já usadas na partida (se acabarem, recomeça). */
export function stopDrawLetter(used: readonly string[], rand: () => number): string {
  const free = STOP_LETTERS.filter((l) => !used.includes(l));
  const pool = free.length > 0 ? free : STOP_LETTERS;
  return pool[Math.floor(rand() * pool.length)] as string;
}

/**
 * Pontua uma rodada. `answers[p][c]` é a resposta do jogador p na categoria c; `annulled[p][c]`
 * diz se foi anulada na votação. Vazia, fora da letra ou anulada: 0. Única: 10. Repetida: 5.
 */
export function stopScore(answers: readonly (readonly string[])[], letter: string, annulled: readonly (readonly boolean[])[]): number[][] {
  const cats = answers.reduce((m, a) => Math.max(m, a.length), 0);
  const valid = answers.map((row, p) => Array.from({ length: cats }, (_, c) => {
    const a = row[c] ?? "";
    return stopFitsLetter(a, letter) && !annulled[p]?.[c] ? grupoFold(a) : null;
  }));
  return valid.map((row) =>
    row.map((v, c) => {
      if (!v) return 0;
      const same = valid.filter((other) => other[c] === v).length;
      return same > 1 ? STOP_POINTS_REPEATED : STOP_POINTS_UNIQUE;
    }),
  );
}
