import { grupoClean, grupoFold, grupoId } from "./common.ts";

/**
 * Quiz Show do Auditório: quem está no palco (ou no púlpito) apresenta; quem está no auditório joga.
 * Todos respondem ao mesmo tempo entre 4 alternativas; quem acerta mais rápido ganha mais pontos.
 *
 * O estado público nunca leva a resposta certa antes da revelação: ela vai só para o apresentador
 * (evento "key"). O banco de perguntas (com as respostas) vai só para quem pode editar (evento "bank").
 */

export const QUIZ_ID = "quiz";
export const QUIZ_KIND = "quiz";
/** Zonas do auditório: quem está nelas pode entrar no quiz. */
export const QUIZ_ZONES: readonly string[] = ["auditorio", "palco"];
/** Zona do palco: quem está nela pode apresentar e editar perguntas. */
export const QUIZ_STAGE = "palco";
/** Distância do púlpito que também vale como "no palco". */
export const QUIZ_LECTERN_RANGE = 2.4;

/** Segundos por pergunta que o apresentador pode escolher. */
export const QUIZ_SECONDS: readonly number[] = [10, 15, 20, 30];
export const QUIZ_DEFAULT_SECONDS = 20;
/** Quantidade de perguntas por partida (0 = todas do pacote). */
export const QUIZ_COUNTS: readonly number[] = [5, 10, 15, 0];
export const QUIZ_DEFAULT_COUNT = 10;
/** "Prepare-se": a pergunta aparece sozinha antes das alternativas. */
export const QUIZ_READY_MS = 3500;
/** Pontos por acerto: do máximo (resposta instantânea) ao mínimo (no último instante). */
export const QUIZ_MAX_POINTS = 1000;
export const QUIZ_MIN_POINTS = 500;
/** Sem apresentador por este tempo (caiu, saiu), a partida acaba. */
export const QUIZ_HOST_GRACE_MS = 45_000;
/** Lobby ou revelação parados por este tempo encerram sozinhos. */
export const QUIZ_IDLE_MS = 15 * 60_000;

export const QUIZ_TEXT_MAX = 180;
export const QUIZ_OPTION_MAX = 70;
export const QUIZ_TITLE_MAX = 40;
export const QUIZ_MAX_PACKS = 24;
export const QUIZ_MAX_QUESTIONS = 100;
export const QUIZ_MAX_PLAYERS = 60;
/** Letras das alternativas. */
export const QUIZ_LETTERS = ["A", "B", "C", "D"] as const;

export type QuizPhase = "idle" | "lobby" | "ready" | "question" | "reveal" | "final";

export interface QuizQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  /** Índice da alternativa certa (0 a 3). */
  correct: number;
}

export interface QuizPack {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export interface QuizBank {
  version: 1;
  packs: QuizPack[];
}

export interface QuizPackSummary {
  id: string;
  title: string;
  count: number;
}

export interface QuizPlayer {
  id: string;
  name: string;
  score: number;
  /** Respondeu a pergunta atual (sem dizer qual). */
  answered: boolean;
  /** Pontos ganhos na última pergunta revelada. */
  gain: number;
  /** Acertos seguidos. */
  streak: number;
  /** Acertos na partida. */
  hits: number;
  /** Saiu do escritório no meio da partida (a pontuação fica). */
  away?: boolean;
}

export interface QuizState {
  phase: QuizPhase;
  /** Muda a cada partida (chave da interface). */
  game: number;
  host: { id: string; name: string } | null;
  pack: { id: string; title: string } | null;
  seconds: number;
  count: number;
  players: QuizPlayer[];
  /** Pergunta atual (sem a resposta). */
  question: { n: number; total: number; text: string; options: string[] } | null;
  /** Milissegundos até acabar a fase com prazo ("ready" ou "question"), no momento do envio. */
  left: number;
  /** Duração total da fase com prazo, em ms. */
  duration: number;
  /** Quantos jogadores já responderam. */
  answered: number;
  reveal: { correct: number; counts: number[] } | null;
  packs: QuizPackSummary[];
}

/** Evento "key": a resposta certa, só para o apresentador. */
export interface QuizKey {
  n: number;
  correct: number;
}

/** Evento "bank": o banco completo, só para quem pode editar. */
export type QuizBankEvent = QuizBank;

/** Evento "answered": confirma a resposta de quem respondeu (só para essa pessoa). */
export interface QuizAnswered {
  n: number;
  choice: number;
}

/** Pontos de um acerto, pelo tempo que a pessoa levou. Errou ou não respondeu: zero. */
export function quizPoints(correct: boolean, elapsedMs: number, durationMs: number): number {
  if (!correct) return 0;
  const f = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1;
  const raw = QUIZ_MAX_POINTS - (QUIZ_MAX_POINTS - QUIZ_MIN_POINTS) * f;
  return Math.round(raw / 10) * 10;
}

export function quizEmptyState(packs: QuizPackSummary[] = []): QuizState {
  return {
    phase: "idle",
    game: 0,
    host: null,
    pack: null,
    seconds: QUIZ_DEFAULT_SECONDS,
    count: QUIZ_DEFAULT_COUNT,
    players: [],
    question: null,
    left: 0,
    duration: 0,
    answered: 0,
    reveal: null,
    packs,
  };
}

export function quizSummaries(bank: QuizBank): QuizPackSummary[] {
  return bank.packs.map((p) => ({ id: p.id, title: p.title, count: p.questions.length }));
}

/** Quantas perguntas uma partida terá com essa escolha. */
export function quizGameLength(count: number, available: number): number {
  return count <= 0 ? available : Math.min(count, available);
}

/** Limpa o título de um pacote. Devolve null se não serve. */
export function quizCleanTitle(raw: unknown): string | null {
  const t = grupoClean(raw, QUIZ_TITLE_MAX);
  return t.length >= 2 ? t : null;
}

/** Erros possíveis ao salvar uma pergunta (a interface traduz). */
export type QuizQuestionError = "text" | "options" | "duplicate" | "correct";

/** Confere e limpa uma pergunta vinda do cliente. */
export function quizCleanQuestion(raw: unknown, id?: string): QuizQuestion | QuizQuestionError {
  const r = (raw ?? {}) as { text?: unknown; options?: unknown; correct?: unknown };
  const text = grupoClean(r.text, QUIZ_TEXT_MAX);
  if (text.length < 5) return "text";
  if (!Array.isArray(r.options) || r.options.length !== 4) return "options";
  const options = r.options.map((o) => grupoClean(o, QUIZ_OPTION_MAX));
  if (options.some((o) => o.length === 0)) return "options";
  if (new Set(options.map(grupoFold)).size !== 4) return "duplicate";
  const correct = typeof r.correct === "number" && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= 3 ? r.correct : -1;
  if (correct < 0) return "correct";
  return { id: id ?? grupoId("q"), text, options: options as QuizQuestion["options"], correct };
}

/** Banco lido do disco: descarta o que estiver estragado em vez de quebrar. */
export function quizSanitizeBank(raw: unknown): QuizBank | null {
  const r = raw as Partial<QuizBank> | null;
  if (!r || !Array.isArray(r.packs)) return null;
  const packs: QuizPack[] = [];
  const seen = new Set<string>();
  for (const p of r.packs.slice(0, QUIZ_MAX_PACKS)) {
    const title = quizCleanTitle(p?.title);
    if (!title || typeof p.id !== "string" || seen.has(p.id)) continue;
    seen.add(p.id);
    const questions: QuizQuestion[] = [];
    for (const q of Array.isArray(p.questions) ? p.questions.slice(0, QUIZ_MAX_QUESTIONS) : []) {
      const c = quizCleanQuestion(q, typeof q?.id === "string" ? q.id : undefined);
      if (typeof c !== "string") questions.push(c);
    }
    packs.push({ id: p.id, title, questions });
  }
  return { version: 1, packs };
}

/**
 * Sorteia a ordem das perguntas e embaralha as alternativas de cada uma (a certa muda de lugar),
 * para pacotes escritos sempre com a certa em "A" não virarem moleza.
 */
export function quizDeal(questions: readonly QuizQuestion[], count: number, rand: () => number): QuizQuestion[] {
  const order = [...questions];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j] as QuizQuestion, order[i] as QuizQuestion];
  }
  return order.slice(0, quizGameLength(count, order.length)).map((q) => {
    const idx = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j] as number, idx[i] as number];
    }
    return { ...q, options: idx.map((k) => q.options[k] as string) as QuizQuestion["options"], correct: idx.indexOf(q.correct) };
  });
}
