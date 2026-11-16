/**
 * Utilidades puras dos jogos de grupo: limpeza de texto, comparação sem acento e sorteios.
 * Servidor e cliente usam as mesmas funções (o cliente para avisar cedo; o servidor decide).
 */

/** Corta, troca caracteres de controle por espaço e junta espaços repetidos. */
export function grupoClean(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * Forma de comparar respostas: minúsculas, sem acento, só letras, números e espaço simples.
 * "  São-Paulo! " → "sao paulo".
 */
export function grupoFold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distância de edição (Levenshtein) com corte: devolve `max + 1` se passar do limite. */
export function grupoEditDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return Math.min(prev[b.length] as number, max + 1);
}

/** Gerador pseudoaleatório com semente (testes e sorteios reproduzíveis). */
export function grupoRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralha uma cópia (Fisher-Yates). */
export function grupoShuffle<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Inteiro em [min, max] ou `fallback` (para números que vêm do cliente). */
export function grupoInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

/** Id curto e legível para perguntas e pacotes. */
export function grupoId(prefix: string, rand: () => number = Math.random): string {
  return `${prefix}-${Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, "0")}`;
}

/** Placar ordenado: mais pontos primeiro; empate pela ordem de entrada. */
export function grupoRank<T extends { score: number }>(list: readonly T[]): T[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map((x) => x.p);
}

/** Posição de cada um no placar, com empates dividindo a mesma posição (1, 2, 2, 4). */
export function grupoPlaces(scores: readonly number[]): number[] {
  return scores.map((s) => 1 + scores.filter((o) => o > s).length);
}
