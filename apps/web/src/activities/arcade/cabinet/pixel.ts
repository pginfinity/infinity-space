/**
 * Base dos fliperamas: fonte de pixel própria (5×7, com acentos do português), cores das telas
 * e um gerador de números previsível. Tudo desenhado em canvas pequeno e ampliado sem suavizar.
 */

/** Resolução interna das telas dos fliperamas (retrato, como as máquinas antigas). */
export const SCREEN_W = 224;
export const SCREEN_H = 256;

/** Paleta das telas: marca da Infinity mais as cores de fliperama que ela permite. */
export const PX = {
  black: "#020B18",
  night: "#00112A",
  navy: "#0A2547",
  deep: "#06182F",
  orange: "#EE5C29",
  signal: "#00B7FF",
  sky: "#46AFE3",
  white: "#F2F0EF",
  cream: "#ECE6DF",
  slate: "#8A93A3",
  dim: "#3B4A63",
  gold: "#F2B134",
  green: "#2BC48A",
  pink: "#E85D9A",
  violet: "#9B8CFF",
  red: "#FF5A4E",
} as const;

// Cada glifo: 7 linhas de 5 bits (bit 4 = coluna da esquerda).
const G: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "%": [24, 25, 2, 4, 8, 19, 3],
  "#": [10, 10, 31, 10, 31, 10, 10],
  "*": [0, 4, 21, 14, 21, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "×": [0, 0, 17, 10, 4, 10, 17],
  "_": [0, 0, 0, 0, 0, 0, 31],
  "►": [8, 12, 14, 15, 14, 12, 8],
  "♥": [0, 10, 31, 31, 14, 4, 0],
  "·": [0, 0, 0, 4, 0, 0, 0],
  "º": [14, 10, 14, 0, 0, 0, 0],
};

// Acentos (desenhados acima da letra, nas 2 linhas de folga) e cedilha (abaixo).
const MARKS: Record<string, number[]> = {
  "́": [2, 4], // agudo
  "̀": [8, 4], // grave
  "̂": [4, 10], // circunflexo
  "̃": [13, 22], // til
  "̈": [10, 0], // trema
};

const GW = 5;
const GH = 7;
/** Altura de uma linha de texto (com espaço para acento e cedilha), em pixels de fonte. */
export const LINE_H = 11;
const ADV = 6;

const atlases = new Map<string, HTMLCanvasElement>();
const CHARS = Object.keys(G);

/** Atlas de glifos numa cor (feito uma vez por cor). */
function atlas(color: string): HTMLCanvasElement {
  let a = atlases.get(color);
  if (a) return a;
  a = document.createElement("canvas");
  a.width = CHARS.length * ADV;
  a.height = GH;
  const g = a.getContext("2d")!;
  g.fillStyle = color;
  CHARS.forEach((ch, i) => {
    const rows = G[ch]!;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (rows[y]! & (1 << (GW - 1 - x))) g.fillRect(i * ADV + x, y, 1, 1);
  });
  atlases.set(color, a);
  return a;
}

/** Largura do texto em pixels (escala 1). */
export function textWidth(text: string): number {
  return [...strip(text)].length * ADV - 1;
}

function strip(text: string): string {
  return text.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export interface TextOpts {
  color?: string;
  scale?: number;
  align?: "left" | "center" | "right";
  /** Sombra de 1 pixel embaixo e à direita (legibilidade sobre fundos). */
  shadow?: string;
}

/** Escreve texto na fonte de pixel. (x, y) = canto de cima da caixa da letra. */
export function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextOpts = {}): void {
  const s = o.scale ?? 1;
  const w = textWidth(text) * s;
  let cx = Math.round(o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x);
  const cy = Math.round(y);
  if (o.shadow) pixelText(ctx, text, x + s, y + s, { ...o, color: o.shadow, shadow: undefined });
  const color = o.color ?? PX.white;
  const img = atlas(color);
  const parts = text.toUpperCase().normalize("NFD");
  ctx.fillStyle = color;
  for (let i = 0; i < parts.length; i++) {
    const ch = parts[i]!;
    if (MARKS[ch] || ch === "̧") continue;
    const k = CHARS.indexOf(ch);
    if (k >= 0) ctx.drawImage(img, k * ADV, 0, GW, GH, cx, cy, GW * s, GH * s);
    // marcas que vêm logo depois da letra
    for (let j = i + 1; j < parts.length && /[̀-ͯ]/.test(parts[j]!); j++) {
      const m = parts[j]!;
      if (m === "̧") {
        ctx.fillRect(cx + 2 * s, cy + GH * s, s, s);
        ctx.fillRect(cx + 1 * s, cy + (GH + 1) * s, s, s);
        continue;
      }
      const rows = MARKS[m];
      if (!rows) continue;
      rows.forEach((bits, r) => {
        for (let b = 0; b < GW; b++) if (bits & (1 << (GW - 1 - b))) ctx.fillRect(cx + b * s, cy - (2 - r) * s - s, s, s);
      });
    }
    cx += ADV * s;
  }
}

/** Gerador previsível (mulberry32): mesma semente, mesma partida. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pontos com zeros à esquerda, como placar de fliperama. */
export function pad(n: number, len = 6): string {
  return String(Math.max(0, Math.floor(n))).padStart(len, "0");
}
