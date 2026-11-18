/**
 * Regras puras do pacote easter (sem DOM, sem three): o detector do código Konami, a frase do mapa,
 * os sorteios com semente, o minuto dos 1,21 gigawatts e o código Morse. Testadas em rules.test.ts.
 */

// ---- código Konami --------------------------------------------------------------------------

/** ↑ ↑ ↓ ↓ ← → ← → B A, pelos códigos físicos das teclas (iguais em qualquer layout de teclado). */
export const KONAMI: readonly string[] = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];

/** Teclas que não contam (nem quebram a sequência): modificadores sozinhos. */
const MODIFIERS = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock"]);

export interface SequenceDetector {
  /** Mais uma tecla; devolve true quando a sequência acabou de fechar. */
  push(code: string): boolean;
  reset(): void;
}

/**
 * Detector de sequência: guarda só as últimas teclas e compara com o fim. Assim "↑ ↑ ↑ ↓ ↓…" ainda
 * vale (o terceiro ↑ não estraga). Não impede nada: só observa.
 */
export function sequenceDetector(seq: readonly string[] = KONAMI): SequenceDetector {
  let buf: string[] = [];
  return {
    push(code) {
      if (MODIFIERS.has(code)) return false;
      buf.push(code);
      if (buf.length > seq.length) buf.shift();
      if (buf.length === seq.length && buf.every((c, i) => c === seq[i])) {
        buf = [];
        return true;
      }
      return false;
    },
    reset() {
      buf = [];
    },
  };
}

// ---- frases do Mapa do Maroto -----------------------------------------------------------------

/** Minúsculas, sem acento, sem pontuação e com um espaço só entre as palavras. */
export function normalizePhrase(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const OPEN = normalizePhrase("juro solenemente não fazer nada de bom");
const CLOSE = normalizePhrase("malfeito feito");

/** "open" para revelar o mapa, "close" para esconder, null para mensagem normal. A frase tem que ser a mensagem inteira. */
export function spellOf(text: string): "open" | "close" | null {
  const n = normalizePhrase(text);
  if (n === OPEN) return "open";
  if (n === CLOSE) return "close";
  return null;
}

/** Quanto tempo o mapa fica com cara de pergaminho. */
export const PARCHMENT_MS = 5 * 60 * 1000;

// ---- sorteios com semente -----------------------------------------------------------------------

/** Semente de 32 bits a partir de partes (FNV-1a). */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = `${p}|`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Gerador determinístico (mulberry32): mesma semente, mesma sequência. Devolve [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "1 em n": verdadeiro com chance 1/n. */
export function oneIn(rand: () => number, n: number): boolean {
  return n <= 1 || Math.floor(rand() * n) === 0;
}

/** Índice de 0 a n-1, sem repetir o anterior (quando há mais de uma opção). */
export function pickIndex(rand: () => number, n: number, avoid = -1): number {
  if (n <= 1) return 0;
  if (avoid < 0 || avoid >= n) return Math.floor(rand() * n) % n;
  const i = Math.floor(rand() * (n - 1)) % (n - 1);
  return i >= avoid ? i + 1 : i;
}

// ---- 1,21 gigawatts ------------------------------------------------------------------------------

/** O minuto do relâmpago: 22:04, como no relógio da praça. */
export function isGigawattMinute(hour: number, minute: number): boolean {
  return hour === 22 && minute === 4;
}

/** Hora e minuto de um instante num fuso (o mesmo do relógio das TVs). */
export function clockParts(ms: number, timeZone: string): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/**
 * Brilho do relâmpago (0 a 1) num instante do minuto: duas piscadas rápidas no começo
 * e de novo a cada 15 s, para quem chegar no meio do minuto também ver.
 */
export function lightningFlash(secondsIntoMinute: number): number {
  const t = secondsIntoMinute % 15;
  if (t < 0.12) return 1;
  if (t < 0.22) return 0.25;
  if (t < 0.34) return 0.9;
  if (t < 0.7) return Math.max(0, 0.9 * (1 - (t - 0.34) / 0.36));
  return 0;
}

// ---- Morse ---------------------------------------------------------------------------------------

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
};

/** Palavra em Morse, letras separadas por espaço ("STAY" → "... - .- -.--"). */
export function morse(word: string): string {
  return [...normalizePhrase(word).replace(/ /g, "").toUpperCase()].map((c) => MORSE[c] ?? "").filter(Boolean).join(" ");
}

/** O mesmo, com a tipografia do toast: "..." vira reticências e um traço sozinho vira travessão. */
export function prettyMorse(code: string): string {
  return code
    .split(" ")
    .map((l) => (l === "..." ? "…" : l === "-" ? "—" : l))
    .join(" ");
}
