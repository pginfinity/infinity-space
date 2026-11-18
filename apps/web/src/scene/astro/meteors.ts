/**
 * Chuvas de meteoros (módulo puro). Calendário das principais chuvas anuais com janela, pico, radiante
 * e taxa zenital (ZHR), conforme o calendário da IMO (International Meteor Organization).
 *
 * Os meteoros são sorteados por minuto com uma semente fixa (o número do minuto): todo mundo que olha
 * o céu no mesmo instante (relógio do servidor) vê os mesmos meteoros, no mesmo lugar.
 */

export interface Shower {
  key: ShowerKey;
  /** Início, pico e fim da janela: [mês (1-12), dia]; o pico tem também a hora (UTC). */
  start: [number, number];
  peak: [number, number, number];
  end: [number, number];
  /** Radiante (J2000): ascensão reta em horas, declinação em graus. */
  ra: number;
  dec: number;
  /** Taxa zenital horária no pico (meteoros por hora num céu perfeito com o radiante a pino). */
  zhr: number;
  /** Velocidade de entrada (km/s): meteoros rápidos riscam mais depressa. */
  speed: number;
  /** Quão "pontudo" é o pico: a taxa cai 10× a cada 1/b dias de distância. */
  b: number;
}

export type ShowerKey = "quadrantidas" | "liridas" | "etaAquaridas" | "perseidas" | "orionidas" | "leonidas" | "geminideas" | "ursideas";

export const SHOWERS: readonly Shower[] = [
  { key: "quadrantidas", start: [12, 28], peak: [1, 3, 21], end: [1, 12], ra: 15.33, dec: 49, zhr: 80, speed: 41, b: 1.8 },
  { key: "liridas", start: [4, 14], peak: [4, 22, 18], end: [4, 30], ra: 18.07, dec: 34, zhr: 18, speed: 49, b: 0.9 },
  { key: "etaAquaridas", start: [4, 19], peak: [5, 6, 8], end: [5, 28], ra: 22.53, dec: -1, zhr: 50, speed: 66, b: 0.15 },
  { key: "perseidas", start: [7, 17], peak: [8, 12, 22], end: [8, 24], ra: 3.2, dec: 58, zhr: 100, speed: 59, b: 0.2 },
  { key: "orionidas", start: [10, 2], peak: [10, 21, 12], end: [11, 7], ra: 6.33, dec: 16, zhr: 20, speed: 66, b: 0.15 },
  { key: "leonidas", start: [11, 6], peak: [11, 17, 14], end: [11, 30], ra: 10.13, dec: 22, zhr: 15, speed: 71, b: 0.5 },
  { key: "geminideas", start: [12, 4], peak: [12, 14, 13], end: [12, 20], ra: 7.47, dec: 33, zhr: 150, speed: 35, b: 0.4 },
  { key: "ursideas", start: [12, 17], peak: [12, 22, 10], end: [12, 26], ra: 14.47, dec: 76, zhr: 10, speed: 33, b: 0.9 },
];

const DAY = 86_400_000;

/** Pico da chuva mais perto de `t` (pode ser no ano anterior ou no seguinte). */
export function peakNear(s: Shower, t: number): number {
  const y = new Date(t).getUTCFullYear();
  let best = 0;
  for (const yy of [y - 1, y, y + 1]) {
    const p = Date.UTC(yy, s.peak[0] - 1, s.peak[1], s.peak[2]);
    if (!best || Math.abs(p - t) < Math.abs(best - t)) best = p;
  }
  return best;
}

/** Janela [início, fim] (ms) em volta de um pico. */
function windowOf(s: Shower, peak: number): [number, number] {
  const y = new Date(peak).getUTCFullYear();
  let start = Date.UTC(y, s.start[0] - 1, s.start[1]);
  let end = Date.UTC(y, s.end[0] - 1, s.end[1], 23, 59);
  if (start > peak) start = Date.UTC(y - 1, s.start[0] - 1, s.start[1]);
  if (end < peak) end = Date.UTC(y + 1, s.end[0] - 1, s.end[1], 23, 59);
  return [start, end];
}

/** Atividade relativa ao pico (1 no pico, cai exponencialmente; 0 fora da janela). */
export function activity(s: Shower, t: number): number {
  const peak = peakNear(s, t);
  const [a, b] = windowOf(s, peak);
  if (t < a || t > b) return 0;
  return Math.pow(10, -s.b * (Math.abs(t - peak) / DAY));
}

export interface ActiveShower {
  shower: Shower;
  index: number;
  activity: number;
  peak: number;
}

export function activeShowers(t: number): ActiveShower[] {
  const out: ActiveShower[] = [];
  SHOWERS.forEach((shower, index) => {
    const a = activity(shower, t);
    if (a > 0) out.push({ shower, index, activity: a, peak: peakNear(shower, t) });
  });
  return out.sort((x, y) => y.activity * y.shower.zhr - x.activity * x.shower.zhr);
}

/** Próxima chuva cuja janela ainda não começou (para o painel quando nenhuma está ativa). */
export function nextShower(t: number): { shower: Shower; peak: number; start: number } {
  let best: { shower: Shower; peak: number; start: number } | null = null;
  for (const s of SHOWERS) {
    for (const p of [peakNear(s, t), peakNear(s, t + 365 * DAY)]) {
      const [start] = windowOf(s, p);
      if (start > t && (!best || start < best.start)) best = { shower: s, peak: p, start };
    }
  }
  return best!;
}

// ---- meteoros determinísticos -------------------------------------------------------------------

export interface Meteor {
  /** Início (ms) e duração (ms). */
  t0: number;
  dur: number;
  /** Índice em SHOWERS, ou -1 para um meteoro esporádico. */
  shower: number;
  /** Distância angular do radiante onde começa (graus) e direção em volta dele (radianos). */
  dist0: number;
  around: number;
  /** Comprimento do risco (graus). */
  length: number;
  /** Brilho relativo (0 a 1). */
  bright: number;
  /** Esporádico: ponto de partida sorteado (cos da altura, azimute) e rumo, em vez do radiante. */
  sporadic?: { u: number; az: number; heading: number };
}

/** Gerador pseudoaleatório pequeno e rápido (mulberry32). */
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

/** Meteoros por minuto que aparecem para uma chuva com o radiante a `radiantAlt` graus de altura. */
export function ratePerMinute(s: Shower, act: number, radiantAlt: number): number {
  // A taxa real (ZHR) multiplicada para ficar visível num escritório (15/h das Leônidas → ~1,5/min no pico),
  // limitada para as chuvas fortes não virarem chuva de fogos. Radiante abaixo do horizonte: quase nada.
  const alt = Math.max(0, Math.min(1, Math.sin((radiantAlt * Math.PI) / 180) + 0.1));
  return Math.min(6, (s.zhr * act) / 10) * alt;
}

/** Esporádicos de fundo (fora de chuva também caem alguns por hora). */
export const SPORADIC_PER_MINUTE = 0.12;
const SLOTS = 12;

/**
 * Meteoros que começam dentro do minuto `minute` (= floor(t / 60000)).
 * `rates[i]` = meteoros por minuto da chuva i (em SHOWERS) nesse minuto; os esporádicos entram sempre.
 */
export function meteorsInMinute(minute: number, rates: readonly number[]): Meteor[] {
  const out: Meteor[] = [];
  const base = minute * 60_000;
  const pick = (index: number, rate: number) => {
    if (rate <= 0) return;
    const r = rng(Math.imul(minute, 2654435761) ^ Math.imul(index + 7, 40503));
    const p = Math.min(1, rate / SLOTS);
    const speed = index >= 0 ? SHOWERS[index]!.speed : 40;
    for (let k = 0; k < SLOTS; k++) {
      // Sorteia sempre os mesmos números por vaga, aceita ou não: a sequência não depende da taxa.
      const accept = r();
      const t = r();
      const dur = r();
      const d0 = r();
      const ar = r();
      const len = r();
      const br = r();
      const extra = r();
      if (accept >= p) continue;
      const m: Meteor = {
        t0: base + t * 60_000,
        // Rápidos (Leônidas, 71 km/s) duram menos que lentos (Geminídeas, 35 km/s).
        dur: (450 + dur * 900) * (45 / speed),
        shower: index,
        dist0: 6 + d0 * 40,
        around: ar * Math.PI * 2,
        length: 6 + len * 16,
        bright: 0.35 + 0.65 * br * br,
      };
      if (index < 0) m.sporadic = { u: extra, az: ar * Math.PI * 2, heading: d0 * Math.PI * 2 };
      out.push(m);
    }
  };
  rates.forEach((rate, i) => pick(i, rate));
  pick(-1, SPORADIC_PER_MINUTE);
  return out.sort((a, b) => a.t0 - b.t0);
}
