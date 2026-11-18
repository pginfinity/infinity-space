import { grupoClean, grupoFold, grupoId } from "./common.ts";
import { PAL_COOP_NAME, PAL_TEAM_NAMES } from "./palavra.ts";
import { PAL_CARDS, PAL_THEMES, type PalTheme } from "./palavraBank.ts";

/**
 * Editor de cartas da Palavra secreta: o banco (temas com cartas) fica salvo no servidor e começa
 * com as 150 cartas originais. Quem está perto do painel de letras, sem partida em andamento, edita.
 *
 * O banco completo só vai, por evento, para quem abriu o editor; o estado público leva só o nome
 * dos temas e quantas cartas cada um tem (`PalThemeSummary`). Servidor e cliente usam as mesmas
 * conferências (o cliente para avisar cedo; o servidor decide).
 */

/** Proibidas por carta (exatamente). */
export const PAL_FORBIDDEN_COUNT = 4;
/** Tamanho máximo da palavra secreta e de cada proibida. */
export const PAL_WORD_MAX = 30;
/** Tamanho do nome de um tema. */
export const PAL_LABEL_MIN = 2;
export const PAL_LABEL_MAX = 24;
export const PAL_MAX_THEMES = 12;
/** Cartas por tema. */
export const PAL_MAX_CARDS = 100;
/** Distância do painel de letras (centro) para abrir o editor. */
export const PAL_EDIT_RANGE = 3.5;

export interface PalBankCard {
  id: string;
  word: string;
  forbidden: string[];
}

export interface PalBankTheme {
  id: PalTheme;
  label: string;
  cards: PalBankCard[];
}

export interface PalBank {
  version: 1;
  themes: PalBankTheme[];
}

/** Resumo público de um tema (vai no estado; sem as cartas). */
export interface PalThemeSummary {
  id: PalTheme;
  label: string;
  count: number;
}

/** Evento "bank": o banco completo, só para quem abriu o editor. */
export type PalBankEvent = PalBank;

/**
 * Erros do editor (a interface traduz): perto do painel, partida em andamento, nome de tema,
 * tema repetido, limite, palavra, proibidas, repetição dentro da carta, carta repetida no tema,
 * nome de time e último tema.
 */
export type PalBankError = "near" | "playing" | "label" | "themeDup" | "full" | "word" | "forbidden" | "repeat" | "duplicate" | "reserved" | "lastTheme";

/** Banco original: os 5 temas com as 150 cartas (ids fixos, iguais a cada restauração). */
export function palSeedBank(): PalBank {
  return {
    version: 1,
    themes: PAL_THEMES.map((t) => ({
      id: t.id,
      label: t.label,
      cards: PAL_CARDS.filter((c) => c.theme === t.id).map((c, i) => ({ id: `${t.id}-${i + 1}`, word: c.word, forbidden: [...c.forbidden] })),
    })),
  };
}

export function palSummaries(bank: PalBank): PalThemeSummary[] {
  return bank.themes.map((t) => ({ id: t.id, label: t.label, count: t.cards.length }));
}

/** Limpa o nome de um tema. Null se não serve. */
export function palCleanLabel(raw: unknown): string | null {
  const t = grupoClean(raw, PAL_LABEL_MAX);
  return grupoFold(t).length >= PAL_LABEL_MIN ? t : null;
}

/** Nomes que aparecem no placar para todo mundo: não podem ser palavra de carta. */
const RESERVED = new Set([...PAL_TEAM_NAMES, PAL_COOP_NAME].map(grupoFold));

/**
 * Confere e limpa uma carta vinda do cliente: palavra (2 letras ou mais), exatamente 4 proibidas,
 * nenhuma repetida (nem igual à palavra, sem contar acento e maiúscula) e nada igual a nome de time.
 */
export function palCleanCard(raw: unknown): { word: string; forbidden: string[] } | PalBankError {
  const r = (raw ?? {}) as { word?: unknown; forbidden?: unknown };
  const word = grupoClean(r.word, PAL_WORD_MAX);
  if (grupoFold(word).length < 2) return "word";
  if (!Array.isArray(r.forbidden) || r.forbidden.length !== PAL_FORBIDDEN_COUNT) return "forbidden";
  const forbidden = r.forbidden.map((f) => grupoClean(f, PAL_WORD_MAX));
  if (forbidden.some((f) => grupoFold(f).length === 0)) return "forbidden";
  const all = [word, ...forbidden].map(grupoFold);
  if (new Set(all).size !== all.length) return "repeat";
  if (all.some((w) => RESERVED.has(w))) return "reserved";
  return { word, forbidden };
}

/** Já existe no tema uma carta com essa palavra (fora a própria, ao editar)? */
export function palCardTaken(theme: Pick<PalBankTheme, "cards">, word: string, exceptId?: string): boolean {
  const w = grupoFold(word);
  return theme.cards.some((c) => c.id !== exceptId && grupoFold(c.word) === w);
}

/** Já existe outro tema com esse nome? */
export function palLabelTaken(bank: PalBank, label: string, exceptId?: string): boolean {
  const l = grupoFold(label);
  return bank.themes.some((t) => t.id !== exceptId && grupoFold(t.label) === l);
}

/** Id novo que ainda não existe no banco. */
export function palNewId(bank: PalBank, prefix: "tema" | "carta", rand: () => number = Math.random): string {
  const used = new Set(bank.themes.flatMap((t) => [t.id, ...t.cards.map((c) => c.id)]));
  let id = grupoId(prefix, rand);
  while (used.has(id)) id = grupoId(prefix, rand);
  return id;
}

const ID_OK = /^[a-z0-9-]{1,40}$/;

/** Banco lido do disco: descarta o que estiver estragado em vez de quebrar. Null se não sobra tema. */
export function palSanitizeBank(raw: unknown): PalBank | null {
  const r = raw as Partial<PalBank> | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.themes)) return null;
  const out: PalBank = { version: 1, themes: [] };
  const ids = new Set<string>();
  for (const t of r.themes as Partial<PalBankTheme>[]) {
    if (out.themes.length >= PAL_MAX_THEMES) break;
    const label = palCleanLabel(t?.label);
    if (!label || typeof t.id !== "string" || !ID_OK.test(t.id) || ids.has(t.id) || palLabelTaken(out, label)) continue;
    ids.add(t.id);
    const theme: PalBankTheme = { id: t.id, label, cards: [] };
    for (const c of Array.isArray(t.cards) ? (t.cards as Partial<PalBankCard>[]) : []) {
      if (theme.cards.length >= PAL_MAX_CARDS) break;
      const k = palCleanCard(c);
      if (typeof k === "string" || palCardTaken(theme, k.word)) continue;
      const id = typeof c.id === "string" && ID_OK.test(c.id) && !ids.has(c.id) ? c.id : palNewId({ version: 1, themes: [...out.themes, theme] }, "carta");
      ids.add(id);
      theme.cards.push({ id, ...k });
    }
    out.themes.push(theme);
  }
  return out.themes.length > 0 ? out : null;
}
