import { rng } from "./meteors.ts";
import type { Vec3 } from "./astro.ts";

/**
 * Satélites passando: pontos de luz que não piscam e cruzam o céu devagar (um arco de 50–110° em 2–5 min),
 * como os que se vê da órbita. Sorteados por janela de 5 min (semente = número da janela): o mesmo céu para
 * todo mundo no mesmo instante, sem servidor. Direções no referencial da cena (x leste, y cima, z sul).
 *
 * shortcut: satélites genéricos, sem órbita real; nomear a ISS (ou outro) pede TLE baixado da rede — fazer
 * se alguém quiser o satélite certo no lugar certo.
 */

export const SAT_WINDOW = 300_000;
/** Até quantos passam ao mesmo tempo (tamanho da geometria). */
export const SAT_SLOTS = 4;

export interface SatPass {
  t0: number;
  dur: number;
  /** Ponto de partida e direção do arco (perpendicular a `start`). */
  start: Vec3;
  toward: Vec3;
  /** Comprimento do arco (rad). */
  arc: number;
  /** Magnitude no meio da passagem (entra e sai da sombra da Terra apagando). */
  mag: number;
}

const cache = new Map<number, SatPass[]>();

/** Passagens que começam na janela k (0 a 2; em média ~0,85 a cada 5 min). */
export function passesInWindow(k: number): SatPass[] {
  const hit = cache.get(k);
  if (hit) return hit;
  const r = rng(Math.imul(k, 2246822519) ^ 0x5a7e11);
  const out: SatPass[] = [];
  const n = Math.floor(r() * 2.6);
  for (let i = 0; i < n; i++) {
    const t = r();
    const dur = 120_000 + r() * 180_000;
    // Começa entre a borda da Terra (~-15°) e 50° de altura, em qualquer rumo; segue num rumo qualquer.
    const alt = (-15 + r() * 65) * (Math.PI / 180);
    const az = r() * Math.PI * 2;
    const heading = r() * Math.PI * 2;
    const start: Vec3 = [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)];
    // Base do plano tangente em `start`: u = horizontal (leste do ponto), v = "para cima" no céu.
    const u: Vec3 = [Math.cos(az), 0, Math.sin(az)];
    const v: Vec3 = [start[1] * u[2] - start[2] * u[1], start[2] * u[0] - start[0] * u[2], start[0] * u[1] - start[1] * u[0]];
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    out.push({
      t0: k * SAT_WINDOW + t * SAT_WINDOW,
      dur,
      start,
      toward: [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
      arc: (50 + r() * 60) * (Math.PI / 180),
      mag: 1.8 + r() * 2.2,
    });
  }
  cache.set(k, out);
  // Só as janelas em uso (a atual e a anterior; uma passagem dura até 5 min).
  for (const key of cache.keys()) if (key < k - 2 || key > k + 2) cache.delete(key);
  return out;
}

/**
 * Satélites no céu no instante t: escreve direção e magnitude em `out` (até SAT_SLOTS) e devolve quantos.
 * A magnitude sobe nas pontas (entra e sai da sombra), para não "acender" do nada.
 */
export function satellitesAt(t: number, out: Array<{ dir: Vec3; mag: number }>): number {
  const k = Math.floor(t / SAT_WINDOW);
  let n = 0;
  for (let w = k - 1; w <= k && n < SAT_SLOTS; w++) {
    for (const p of passesInWindow(w)) {
      const f = (t - p.t0) / p.dur;
      if (f < 0 || f >= 1 || n >= SAT_SLOTS) continue;
      const a = p.arc * f;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const slot = (out[n] ??= { dir: [0, 0, 0], mag: 0 });
      slot.dir[0] = p.start[0] * ca + p.toward[0] * sa;
      slot.dir[1] = p.start[1] * ca + p.toward[1] * sa;
      slot.dir[2] = p.start[2] * ca + p.toward[2] * sa;
      const edge = Math.min(f, 1 - f) / 0.12;
      slot.mag = p.mag + 4 * Math.max(0, 1 - edge);
      n++;
    }
  }
  return n;
}
