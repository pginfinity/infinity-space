/**
 * Busca da paleta (Ctrl+K), regra pura: sem acento, sem maiúsculas, cada palavra digitada precisa
 * aparecer (no começo de uma palavra do item ou, com 3+ letras, em qualquer lugar).
 */

/** "Sala Órbita" → "sala orbita". */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Searchable {
  label: string;
  /** Palavras extras que também acham o item (sinônimos, grupo, sala). */
  keywords?: string;
}

/**
 * Nota do item para a busca (0 = não combina). Maior é melhor: rótulo que começa com o que foi
 * digitado > palavras do rótulo > palavras-chave > trechos no meio.
 */
export function score(item: Searchable, query: string): number {
  const q = fold(query);
  if (!q) return 1;
  const label = fold(item.label);
  const extra = fold(item.keywords ?? "");
  const labelWords = label.split(" ");
  const extraWords = extra ? extra.split(" ") : [];
  let total = 0;
  for (const tok of q.split(" ")) {
    if (labelWords.some((w) => w.startsWith(tok))) total += 10;
    else if (extraWords.some((w) => w.startsWith(tok))) total += 5;
    else if (tok.length >= 3 && (label.includes(tok) || extra.includes(tok))) total += 2;
    else return 0;
  }
  if (label.startsWith(q)) total += 25;
  else if (label.includes(q)) total += 8;
  // Entre iguais, o rótulo mais curto (mais exato) vem antes.
  return total + 1 / (1 + label.length);
}

/** Itens que combinam, do melhor para o pior (estável entre iguais). */
export function rank<T extends Searchable>(items: readonly T[], query: string): T[] {
  return items
    .map((it, i) => ({ it, i, s: score(it, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
