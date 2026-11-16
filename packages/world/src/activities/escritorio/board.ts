/**
 * Mural de recados do Átrio: post-its que ficam para todo mundo, com reações.
 * As regras são funções puras sobre a lista (o servidor guarda e confere; o cliente desenha).
 *
 * Autoria e reações usam marcas anônimas (`escTag`) feitas com a chave do navegador:
 * o autor reconhece e apaga os próprios recados mesmo depois de recarregar a página, e
 * ninguém consegue ligar dois recados (ou reações) à mesma pessoa.
 */

export const BOARD_ID = "mural";
export const BOARD_KIND = "board";
/** Recados no mural; ao passar disso, os mais antigos saem. */
export const BOARD_MAX = 40;
export const BOARD_TEXT_MAX = 140;
/** Distância máxima (m) do mural para escrever, reagir ou apagar. */
export const BOARD_RANGE = 3.4;
/** Intervalo mínimo entre dois recados da mesma pessoa. */
export const BOARD_POST_COOLDOWN_MS = 8000;
/** Cores dos post-its (tons pastel, para o laranja continuar sendo o único destaque da tela). */
export const BOARD_COLORS = ["#F6D86B", "#F4A6C0", "#8FD3F4", "#A8E0A1", "#C9BEFF"] as const;
/** Reações possíveis (uma por pessoa por recado). */
export const BOARD_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🚀"] as const;
export type BoardReaction = (typeof BOARD_REACTIONS)[number];

export interface BoardNote {
  id: string;
  /** Nome de quem escreveu (como estava na hora). */
  name: string;
  /** Índice em BOARD_COLORS. */
  color: number;
  text: string;
  /** Quando foi pregado (relógio do servidor, ms). */
  at: number;
  /** Marca anônima do autor (`escTag(chave, "autor:" + id)`). */
  own: string;
  /** Reações: emoji → marcas anônimas de quem reagiu (`escTag(chave, "reacao:" + id)`). */
  r: Partial<Record<BoardReaction, string[]>>;
}

export interface BoardState {
  notes: BoardNote[];
}

export const boardOwnSalt = (id: string) => `autor:${id}`;
export const boardReactSalt = (id: string) => `reacao:${id}`;

export function boardIsReaction(e: unknown): e is BoardReaction {
  return typeof e === "string" && (BOARD_REACTIONS as readonly string[]).includes(e);
}

export function boardColor(c: unknown): number {
  return typeof c === "number" && Number.isInteger(c) && c >= 0 && c < BOARD_COLORS.length ? c : 0;
}

/** Prega um recado no fim; se passar do limite, tira os mais antigos. */
export function boardPost(notes: readonly BoardNote[], note: BoardNote, max = BOARD_MAX): BoardNote[] {
  const next = [...notes, note];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Reage a um recado: uma reação por pessoa. Mesma reação de novo tira; outra troca.
 * Devolve a lista nova (ou a mesma, se o recado não existe).
 */
export function boardReact(notes: readonly BoardNote[], id: string, emoji: BoardReaction, voter: string): BoardNote[] {
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) return notes as BoardNote[];
  const n = notes[i]!;
  const had = (n.r[emoji] ?? []).includes(voter);
  const r: BoardNote["r"] = {};
  for (const e of BOARD_REACTIONS) {
    const list = (n.r[e] ?? []).filter((v) => v !== voter);
    if (e === emoji && !had) list.push(voter);
    if (list.length) r[e] = list;
  }
  const next = [...notes];
  next[i] = { ...n, r };
  return next;
}

/** Apaga um recado, só se a marca do autor bater. */
export function boardRemove(notes: readonly BoardNote[], id: string, own: string): BoardNote[] {
  const n = notes.find((x) => x.id === id);
  if (!n || n.own !== own) return notes as BoardNote[];
  return notes.filter((x) => x.id !== id);
}

/** Total de reações de um recado. */
export function boardReactionCount(n: BoardNote): number {
  let k = 0;
  for (const e of BOARD_REACTIONS) k += n.r[e]?.length ?? 0;
  return k;
}
