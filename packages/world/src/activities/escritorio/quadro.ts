/**
 * Quadro branco das salas (Excalidraw): um quadro por sala de reunião (o mesmo grupo da gravação:
 * auditório e palco dividem o quadro). Só quem está na sala abre e desenha; o desenho fica guardado.
 *
 * Sincronização: cada elemento do Excalidraw tem `version` e `versionNonce`; ganha a versão maior e,
 * no empate, o `versionNonce` menor (a mesma regra do `reconcileElements` do Excalidraw).
 */

export const QUADRO_ID = "quadro";
export const QUADRO_KIND = "quadro";
/** Tamanho máximo de um elemento (um traço livre muito longo passa disso e não vai). */
export const QUADRO_ELEMENT_BYTES = 48 * 1024;
/** Elementos por quadro (contando os apagados, que o Excalidraw precisa para sincronizar). */
export const QUADRO_MAX_ELEMENTS = 5000;
/** Tamanho total de um quadro. */
export const QUADRO_MAX_BYTES = 4 * 1024 * 1024;

export interface QuadroState {
  /** Quantas pessoas estão com o quadro aberto, por sala (só o número). */
  open: Record<string, number>;
}

/** Elemento do Excalidraw como o servidor guarda (só os campos que a regra usa são conferidos). */
export interface QuadroElement {
  id: string;
  version: number;
  versionNonce: number;
  type: string;
  [k: string]: unknown;
}

/** Imagem e página embutida ficam de fora: precisam de arquivo/endereço de fora e o quadro não guarda. */
const TYPES = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "frame"]);

/** Confere um elemento vindo do cliente. Devolve o elemento (com link só http/https) e o tamanho, ou null. */
export function quadroClean(raw: unknown): { el: QuadroElement; bytes: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !/^[\w-]{1,64}$/.test(e.id)) return null;
  if (!Number.isSafeInteger(e.version) || (e.version as number) < 1 || !Number.isSafeInteger(e.versionNonce)) return null;
  if (typeof e.type !== "string" || !TYPES.has(e.type)) return null;
  const el = { ...e, link: typeof e.link === "string" && /^https?:\/\//i.test(e.link) ? e.link : null } as unknown as QuadroElement;
  const bytes = JSON.stringify(el).length;
  return bytes <= QUADRO_ELEMENT_BYTES ? { el, bytes } : null;
}

/** O elemento que chegou substitui o guardado? */
export function quadroNewer(incoming: QuadroElement, current: QuadroElement | undefined): boolean {
  if (!current) return true;
  return incoming.version > current.version || (incoming.version === current.version && incoming.versionNonce < current.versionNonce);
}
