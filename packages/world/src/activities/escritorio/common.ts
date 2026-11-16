/** Utilidades puras do pacote "escritorio": textos limpos e marcas anônimas de autoria. */

/** Ponto no espaço (metros; y = altura). */
export interface EscVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Limpa um texto livre: tira caracteres de controle, junta espaços e corta em `max` unidades
 * sem partir emoji ao meio (pares substitutos). Aceita qualquer coisa: o que não é texto vira "".
 */
export function escClean(text: unknown, max: number, opts: { lines?: boolean } = {}): string {
  if (typeof text !== "string") return "";
  let s = opts.lines
    ? text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  s = s.trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  // Não deixa meio emoji no fim.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd();
}

/** Chave secreta do navegador (gerada no cliente, guardada no localStorage): letras, números e hífen. */
export function escValidKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 16 && key.length <= 64 && /^[A-Za-z0-9-]+$/.test(key);
}

/**
 * Marca anônima e estável de uma pessoa para um assunto (`salt`, ex.: "autor:<recado>").
 * Muda a cada assunto, então duas marcas não revelam que vieram da mesma pessoa; só quem tem a
 * chave consegue reconhecer as próprias. FNV-1a em duas faixas de 32 bits (64 bits, 16 hex).
 */
export function escTag(key: string, salt: string): string {
  const s = `${salt}\u0001${key}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c ^ (a >>> 13), 0x01000197);
  }
  // Mistura final para espalhar os bits.
  a ^= b >>> 15;
  a = Math.imul(a, 0x85ebca6b);
  b ^= a >>> 13;
  b = Math.imul(b, 0xc2b2ae35);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** Mês "AAAA-MM" de um instante (contadores mensais do time). */
export function escMonth(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
