import type { Sky, Vec3 } from "./astro.ts";

/**
 * Luz principal do escritório a partir do céu real (módulo puro).
 *
 * - A direção vem do Sol de verdade, visto da estação. Quando o Sol está abaixo do plano do piso
 *   (mas ainda acima da borda da Terra), a luz entra rasante pelas bordas: a altura é limitada a
 *   MIN_ELEVATION para o piso continuar iluminado, com sombras compridas; o rumo continua o real.
 * - Perto da borda da Terra a luz atravessa a atmosfera: fica dourada, depois laranja, e mais fraca.
 * - Na sombra da Terra a luz do Sol some e o escritório fica só com as luzes internas, mais quentes.
 */

export const MIN_ELEVATION = 14;

export interface OfficeLight {
  /** Direção de onde vem a luz principal (unitário, cena). */
  dir: Vec3;
  /** Cor da luz principal (sRGB 0-1) e intensidade. */
  color: Vec3;
  intensity: number;
  /** Luz ambiente (hemisfério): cor de cima, cor de baixo (sRGB) e intensidade. */
  skyColor: Vec3;
  groundColor: Vec3;
  sky: number;
  /** Quanto de Sol a estação recebe (0 = sombra da Terra). */
  sun: number;
}

const hex = (h: number): Vec3 => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const DAY = hex(0xfff1de);
const GOLDEN = hex(0xffd9ae);
const DUSK = hex(0xffb27a);
const SKY_DAY = hex(0xd8e8ff);
const SKY_NIGHT = hex(0xffe4c8);
const GROUND_DAY = hex(0x2a3550);
const GROUND_NIGHT = hex(0x3a2e2c);

function mix(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Direção da luz: a do Sol, com altura mínima (luz rasante pelas bordas da estação). */
export function lightDirection(sun: Vec3): Vec3 {
  const min = Math.sin((MIN_ELEVATION * Math.PI) / 180);
  if (sun[1] >= min) return sun;
  const h = Math.hypot(sun[0], sun[2]);
  if (h < 1e-6) return [0, 1, 0];
  const c = Math.cos((MIN_ELEVATION * Math.PI) / 180);
  return [(sun[0] / h) * c, min, (sun[2] / h) * c];
}

export function officeLight(sky: Pick<Sky, "sun" | "station">): OfficeLight {
  const sun = sky.station.light;
  // 0 com o Sol alto (12° ou mais acima da borda da Terra), 1 encostado na borda.
  const warm = Math.max(0, Math.min(1, 1 - sky.station.sunAboveLimb / 12));
  const color = warm < 0.5 ? mix(DAY, GOLDEN, warm * 2) : mix(GOLDEN, DUSK, (warm - 0.5) * 2);
  return {
    dir: lightDirection(sky.sun.dir),
    color,
    intensity: 1.7 * sun * (1 - 0.35 * warm * warm),
    skyColor: mix(SKY_NIGHT, SKY_DAY, sun),
    groundColor: mix(GROUND_NIGHT, GROUND_DAY, sun),
    // Na sombra o ambiente fica um pouco mais baixo, mas quente: as luzes internas é que seguram o lugar.
    sky: 0.95 + 0.2 * sun,
    sun,
  };
}
