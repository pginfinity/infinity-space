import { grupoEditDistance, grupoFold, grupoShuffle } from "./common.ts";
import type { PalCard, PalTheme } from "./palavraBank.ts";
import type { PalBank, PalThemeSummary } from "./palavraEdit.ts";

export type { PalCard, PalTheme } from "./palavraBank.ts";
export { PAL_CARDS, PAL_THEMES } from "./palavraBank.ts";

/**
 * Palavra secreta, no Marketing Studio: jogo de dicas em times. Na vez do time, um "dicador" vê a
 * palavra secreta e as palavras proibidas e dá dicas por voz (o áudio do escritório é por
 * proximidade) ou por escrito; o próprio time chuta pelo campo do jogo. Cada acerto vale 1 ponto e
 * puxa a próxima carta, até o tempo acabar. O time adversário vê a carta para fiscalizar: aperta
 * "Proibida!" quando ouve uma palavra proibida e o dicador decide se falou (perde 1 ponto e a carta).
 * Com 3 pessoas, um time só (cooperativo); com 4 ou mais, quem abriu a mesa escolhe entre dois times e
 * todos juntos (cooperativo). O dicador roda a cada vez. As cartas vêm do banco editável (`palavraEdit.ts`).
 *
 * Informação escondida: a carta só vai para o dicador e para o time adversário (evento "card").
 * O estado público tem o placar, de quem é a vez e as cartas já resolvidas, nunca a carta da vez.
 */

export const PAL_ID = "palavra";
export const PAL_KIND = "palavra";
/** Zona onde o jogo acontece (quem está nela entra). */
export const PAL_ZONE = "marketing";
export const PAL_MIN_PLAYERS = 3;
export const PAL_MAX_PLAYERS = 12;
/** A partir de quantas pessoas a partida pode ter dois times (abaixo disso, um time só, cooperativo). */
export const PAL_TEAMS_FROM = 4;
export const PAL_SECONDS: readonly number[] = [30, 60, 90];
export const PAL_DEFAULT_SECONDS = 60;
/** Rodadas: em cada uma, todo mundo dá dicas uma vez. */
export const PAL_ROUNDS: readonly number[] = [1, 2, 3];
export const PAL_DEFAULT_ROUNDS = 1;
/** Antes da vez: o dicador aperta "Começar" (ou começa sozinho depois disso). */
export const PAL_READY_MS = 15_000;
/** Pausa mostrando o resumo da vez. */
export const PAL_TURN_END_MS = 6_000;
/** Pulos por vez (sem perder ponto). */
export const PAL_SKIPS = 3;
/** Quanto tempo o dicador tem para decidir um "Proibida!" (depois, não vale). */
export const PAL_FLAG_MS = 10_000;
/** Intervalo mínimo entre dois "Proibida!" da mesma pessoa. */
export const PAL_FLAG_GAP_MS = 4_000;
export const PAL_GUESS_MAX = 40;
export const PAL_GUESS_GAP_MS = 400;
export const PAL_HINT_MAX = 80;
export const PAL_HINT_GAP_MS = 800;
/** Itens do feed da vez mantidos no estado. */
export const PAL_FEED_MAX = 18;
/** Nomes dos times (sem palavras do banco, para nada se confundir com uma carta; há teste). */
export const PAL_TEAM_NAMES: readonly string[] = ["Pulsar", "Quasar"];
/** Nome do time único da partida cooperativa. */
export const PAL_COOP_NAME = "Nebulosa";

/** Modo escolhido no lobby (vale com 4 pessoas ou mais): dois times ou todos juntos (cooperativo). */
export type PalMode = "teams" | "coop";
export const PAL_MODES: readonly PalMode[] = ["teams", "coop"];

export type PalPhase = "idle" | "lobby" | "ready" | "playing" | "turnEnd" | "final";
/** Papel de alguém na vez: dá dicas, chuta, fiscaliza (time adversário). */
export type PalRole = "giver" | "guesser" | "judge";

export interface PalPlayer {
  id: string;
  name: string;
  /** Índice do time (0 ou 1; na partida cooperativa, todos no 0). */
  team: number;
  away?: boolean;
}

export interface PalTeam {
  name: string;
  score: number;
}

/** Como uma carta da vez terminou: acerto, pulo, palavra proibida ou fim do tempo. */
export type PalResult = "hit" | "skip" | "forbidden" | "time";

export interface PalDone {
  word: string;
  result: PalResult;
  /** Quem acertou (nome). */
  by?: string;
}

export interface PalFeedItem {
  /** hint: dica escrita · guess: chute errado · hit: acerto · skip: pulo · flag: alguém apontou proibida ·
   *  forbidden: o dicador confirmou · cleared: não valeu · info: aviso do jogo. */
  k: "hint" | "guess" | "hit" | "skip" | "flag" | "forbidden" | "cleared" | "info";
  name: string;
  text?: string;
}

export interface PalState {
  phase: PalPhase;
  game: number;
  /** Quem abriu a mesa: escolhe as opções e começa. */
  owner: string | null;
  /** Partida de um time só (definido ao começar). */
  coop: boolean;
  /** Modo escolhido no lobby (com menos de 4 pessoas, a partida é cooperativa de qualquer jeito). */
  mode: PalMode;
  players: PalPlayer[];
  teams: PalTeam[];
  seconds: number;
  rounds: number;
  /** Temas escolhidos para a partida (ids do banco). */
  themes: PalTheme[];
  /** Temas do banco: nome e quantas cartas (nunca as cartas). */
  catalog: PalThemeSummary[];
  /** Vez atual (1..turns) e total de vezes da partida. */
  turn: number;
  turns: number;
  /** Time da vez. */
  team: number;
  /** Quem dá as dicas nesta vez. */
  giver: string | null;
  /** Número da carta na vez (casa com o evento "card"). */
  cardNo: number;
  /** Pulos que ainda restam nesta vez. */
  skips: number;
  /** Pontos do time da vez nesta vez (acertos menos proibidas). */
  gain: number;
  /** "Proibida!" esperando a decisão do dicador. */
  flag: { by: string; name: string } | null;
  /** Cartas já resolvidas nesta vez (podem ser mostradas a todos). */
  done: PalDone[];
  feed: PalFeedItem[];
  /** Resultado (no fim): índice do time vencedor, ou null (empate ou cooperativo). */
  winner: number | null;
  left: number;
  duration: number;
}

/** Evento "card": a carta da vez, só para o dicador e o time adversário. */
export interface PalCardEvent {
  game: number;
  turn: number;
  n: number;
  word: string;
  forbidden: string[];
  theme: PalTheme;
  /** Nome do tema, para mostrar na carta. */
  themeLabel: string;
}

const ARTICLES = new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas"]);
const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "em", "no", "na"]);

/** Tira artigos do começo ("a lua" → "lua"), mas nunca deixa vazio. */
function stripArticles(folded: string): string {
  const t = folded.split(" ");
  while (t.length > 1 && ARTICLES.has(t[0]!)) t.shift();
  return t.join(" ");
}

/**
 * Confere um chute: sem acento, maiúscula, pontuação nem espaços ("Guarda chuva" = "guarda-chuva"),
 * com artigo na frente ("a Lua") e plural simples. "close" = quase (vai só para quem chutou).
 */
export function palCheckGuess(guess: string, word: string): "correct" | "close" | "wrong" {
  const g = stripArticles(grupoFold(guess)).replace(/ /g, "");
  const w = stripArticles(grupoFold(word)).replace(/ /g, "");
  if (!g || !w) return "wrong";
  if (g === w) return "correct";
  if (w.length >= 4 && (g === `${w}s` || g === `${w}es` || w === `${g}s`)) return "correct";
  if (w.length >= 3 && g.includes(w)) return "close";
  const tol = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
  if (tol > 0 && grupoEditDistance(g, w, tol) <= tol) return "close";
  return "wrong";
}

/** Raiz de uma palavra para pegar derivadas ("chuva" pega "chuvoso"; "café" pega "cafezinho"). */
function stem(t: string): string {
  return t.length >= 4 ? t.slice(0, Math.max(4, t.length - 2)) : t;
}

function tokenHits(tok: string, target: string): boolean {
  if (tok === target || tok === `${target}s` || tok === `${target}es`) return true;
  return target.length >= 4 && tok.length >= 4 && tok.startsWith(stem(target));
}

/**
 * Uma dica escrita entrega a carta? Devolve a palavra (secreta ou proibida) que ela contém, ou null.
 * Vale também parte da palavra secreta ("escova" em "escova de dente") e derivadas ("chuvoso").
 */
export function palHintHit(hint: string, card: { word: string; forbidden: readonly string[] }): string | null {
  const hf = grupoFold(hint);
  if (!hf) return null;
  const toks = hf.split(" ");
  const joined = hf.replace(/ /g, "");
  for (const t of [card.word, ...card.forbidden]) {
    const tf = grupoFold(t);
    if (!tf) continue;
    const parts = tf.split(" ");
    if (parts.length > 1) {
      if (joined.includes(parts.join(""))) return t;
      // Da palavra secreta, nenhuma parte pode aparecer.
      if (t === card.word && parts.some((p) => !STOPWORDS.has(p) && toks.some((k) => tokenHits(k, p)))) return t;
    } else if (toks.some((k) => tokenHits(k, tf))) return t;
  }
  return null;
}

/** Limpa a lista de temas vinda do cliente (só os do banco, na ordem do banco, sem repetir). Null se ficar vazia. */
export function palCleanThemes(raw: unknown, known: readonly PalTheme[]): PalTheme[] | null {
  if (!Array.isArray(raw)) return null;
  const out = known.filter((id) => raw.includes(id));
  return out.length > 0 ? out : null;
}

/** Baralho embaralhado com as cartas dos temas escolhidos (todos, se nenhum). */
export function palDeck(bank: PalBank, themes: readonly PalTheme[], rand: () => number = Math.random): PalCard[] {
  const set = new Set(themes);
  const cards = bank.themes.filter((t) => set.size === 0 || set.has(t.id)).flatMap((t) => t.cards.map((c) => ({ word: c.word, forbidden: [...c.forbidden], theme: t.id })));
  return grupoShuffle(cards, rand);
}

/** Quantas cartas os temas escolhidos somam (pelo resumo público do banco). */
export function palDeckSize(catalog: readonly PalThemeSummary[], themes: readonly PalTheme[]): number {
  return catalog.filter((t) => themes.includes(t.id)).reduce((n, t) => n + t.count, 0);
}

/** A partida terá dois times? Só com 4 pessoas ou mais e o modo "dois times". */
export function palUsesTeams(players: number, mode: PalMode): boolean {
  return players >= PAL_TEAMS_FROM && mode === "teams";
}

/** Sorteia os times: ordem aleatória, um para cada lado (diferença de no máximo 1). Devolve o time de cada id. */
export function palSplitTeams(ids: readonly string[], rand: () => number = Math.random): Map<string, number> {
  const out = new Map<string, number>();
  grupoShuffle(ids, rand).forEach((id, i) => out.set(id, i % 2));
  return out;
}

/** Quantas vezes a partida tem: em cada rodada, todo mundo dá dicas (o time menor repete dicador). */
export function palTotalTurns(teamSizes: readonly number[], rounds: number, coop: boolean): number {
  if (coop) return rounds * (teamSizes[0] ?? 0);
  return rounds * 2 * Math.max(0, ...teamSizes);
}

/** Papel da pessoa na vez atual (null fora da vez ou fora do jogo). */
export function palRole(s: Pick<PalState, "phase" | "coop" | "team" | "giver" | "players">, id: string | null | undefined): PalRole | null {
  if (!id || (s.phase !== "ready" && s.phase !== "playing" && s.phase !== "turnEnd")) return null;
  const p = s.players.find((x) => x.id === id && !x.away);
  if (!p) return null;
  if (s.giver === id) return "giver";
  if (s.coop || p.team === s.team) return "guesser";
  return "judge";
}

/** Quem pode ver a carta da vez: o dicador e o time adversário. */
export function palCardAudience(s: Pick<PalState, "phase" | "coop" | "team" | "giver" | "players">): string[] {
  return s.players.filter((p) => !p.away && (palRole(s, p.id) === "giver" || palRole(s, p.id) === "judge")).map((p) => p.id);
}

/** Vencedor por pontos: índice do time com mais pontos, ou null no empate (e no cooperativo). */
export function palWinner(teams: readonly PalTeam[]): number | null {
  if (teams.length < 2) return null;
  const [a, b] = teams as [PalTeam, PalTeam];
  return a.score === b.score ? null : a.score > b.score ? 0 : 1;
}
