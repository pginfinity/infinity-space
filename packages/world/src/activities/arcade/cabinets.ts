/**
 * Fliperamas do Arcade: três jogos originais de uma pessoa, com ranking do escritório por jogo.
 * O jogo roda no navegador; o servidor guarda o ranking e confere se a pontuação é plausível
 * (limite absoluto e pontos por segundo desde o começo da partida).
 */

export const CAB_ID = "fliperamas";
export const CAB_KIND = "arcade-scores";

export type CabGameId = "faxina" | "cometa" | "estilhaco";

export interface CabGameInfo {
  id: CabGameId;
  name: string;
  /** Uma linha sobre o jogo. */
  pitch: string;
  /** Pontuação máxima aceita numa partida. */
  cap: number;
  /** Pontos por segundo de partida que ainda são plausíveis (mais uma folga fixa). */
  rate: number;
  slack: number;
}

export const CAB_GAMES: Record<CabGameId, CabGameInfo> = {
  faxina: { id: "faxina", name: "Faxina Orbital", pitch: "Pilote o rebocador e limpe a sucata em volta da estação.", cap: 900_000, rate: 900, slack: 3000 },
  cometa: { id: "cometa", name: "Cauda de Cometa", pitch: "Colete poeira estelar nas órbitas sem bater na própria cauda.", cap: 200_000, rate: 120, slack: 600 },
  estilhaco: { id: "estilhaco", name: "Estilhaço", pitch: "Quebre as placas de cristal e pegue as cápsulas que caem.", cap: 600_000, rate: 700, slack: 3000 },
};

export const CAB_ORDER: readonly CabGameId[] = ["faxina", "cometa", "estilhaco"];

/** Jogo de cada máquina pelo `variant` do objeto `arcade`. */
export function cabGameOfVariant(variant: number | undefined): CabGameId {
  return CAB_ORDER[((variant ?? 0) % 3 + 3) % 3]!;
}

/** Menor duração (ms) para uma partida contar. */
export const CAB_MIN_MS = 3000;
/** Quantas pessoas aparecem no ranking de cada jogo. */
export const CAB_TOP = 10;
/** Distância (m) da máquina para jogar. */
export const CAB_RANGE = 2.4;

export interface CabEntry {
  name: string;
  score: number;
  /** Quando foi (ms). */
  at: number;
}

export interface CabState {
  boards: Record<CabGameId, CabEntry[]>;
  /** Quem está jogando em cada máquina (id do objeto → nome). */
  busy: Record<string, string>;
}

export function cabEmpty(): CabState {
  return { boards: { faxina: [], cometa: [], estilhaco: [] }, busy: {} };
}

/** A pontuação cabe no que dá para fazer nesse tempo? */
export function cabPlausible(game: CabGameId, score: unknown, elapsedMs: number): score is number {
  const g = CAB_GAMES[game];
  if (!g || typeof score !== "number" || !Number.isInteger(score) || score < 0) return false;
  if (elapsedMs < CAB_MIN_MS && score > 0) return false;
  return score <= g.cap && score <= g.slack + (g.rate * elapsedMs) / 1000;
}

/**
 * Coloca a pontuação no ranking (uma linha por pessoa: só a melhor vale).
 * Devolve o ranking novo e a posição (1 = primeiro), ou posição null se não entrou ou não superou a própria marca.
 */
export function cabInsert(board: readonly CabEntry[], e: CabEntry): { board: CabEntry[]; rank: number | null; personalBest: boolean } {
  const key = e.name.trim().toLowerCase();
  const mine = board.find((x) => x.name.trim().toLowerCase() === key);
  if (e.score <= 0 || (mine && mine.score >= e.score)) return { board: [...board], rank: null, personalBest: false };
  const next = board.filter((x) => x !== mine);
  next.push(e);
  // empate: quem fez antes fica na frente
  next.sort((a, b) => b.score - a.score || a.at - b.at);
  const cut = next.slice(0, CAB_TOP);
  const i = cut.indexOf(e);
  return { board: cut, rank: i >= 0 ? i + 1 : null, personalBest: true };
}

/** Pontos com separador de milhar em pt-BR (sem depender do Intl do ambiente). */
export function cabFmt(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
