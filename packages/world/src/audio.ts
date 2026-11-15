import { dist, lerp, polygonArea, pointInPolygon, segmentsIntersect, smoothstep, type Vec2 } from "./geometry.ts";
import type { MapDef, Wall, Zone } from "./map/types.ts";

/**
 * Regra de audição: quem ouve quem, com que volume e se o som chega abafado.
 * Função pura, rodada igual no servidor (para privacidade) e no cliente (para o volume a cada quadro).
 */

/** Distâncias em metros. */
export const HEARING = {
  /** Até aqui, volume cheio. */
  full: 2.0,
  /** Até aqui, conversa nítida (volume caindo até `edgeGain`). Também é o raio do anel "quem te ouve". */
  conversation: 5.0,
  /** Até aqui, som ambiente abafado. */
  ambient: 12.0,
  /** Volume na borda da conversa nítida. */
  edgeGain: 0.45,
  /** Volume máximo do som ambiente abafado. */
  ambientGain: 0.2,
  /** Quanto uma parede no caminho reduz o volume. */
  occluded: 0.35,
} as const;

export type HearingMode = "none" | "clear" | "ambient";

export interface Hearing {
  mode: HearingMode;
  /** Volume de 0 a 1. */
  gain: number;
  /** Aplicar filtro de "outro lado da sala" (passa-baixa + reverb). */
  muffled: boolean;
}

export const SILENT: Hearing = Object.freeze({ mode: "none", gain: 0, muffled: false });

const CLOSED_KINDS = new Set<Zone["kind"]>(["meeting", "office", "focus"]);

/** Índice para descobrir em que zona um ponto está. A menor zona que contém o ponto vence. */
export class ZoneIndex {
  private readonly sorted: Zone[];
  constructor(zones: readonly Zone[]) {
    this.sorted = [...zones].sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));
  }
  zoneAt(p: Vec2): Zone | undefined {
    for (const z of this.sorted) if (pointInPolygon(p, z.polygon)) return z;
    return undefined;
  }
}

/** Alguma parede corta o caminho entre os dois pontos. */
export function wallBetween(walls: readonly Wall[], a: Vec2, b: Vec2): boolean {
  for (const w of walls) if (segmentsIntersect(a, b, w.a, w.b)) return true;
  return false;
}

export interface HearingInput {
  pos: Vec2;
  zone: Zone | undefined;
}

export interface HearingOptions {
  /** O falante está usando o megafone: chega a todas as áreas abertas. */
  megaphone?: boolean;
}

/** Quanto `listener` ouve `speaker`. */
export function hearing(walls: readonly Wall[], listener: HearingInput, speaker: HearingInput, opts: HearingOptions = {}): Hearing {
  const lz = listener.zone;
  const sz = speaker.zone;
  if (!lz || !sz) return SILENT;

  if (lz.group !== sz.group) {
    if (opts.megaphone && lz.group === "open" && sz.group === "open") return { mode: "clear", gain: 0.9, muffled: false };
    return SILENT;
  }

  // Sala fechada: todos dentro se ouvem com volume cheio.
  if (CLOSED_KINDS.has(lz.kind)) return { mode: "clear", gain: 1, muffled: false };

  // Auditório: quem está no palco é ouvido por todos.
  if (sz.kind === "stage") return { mode: "clear", gain: 1, muffled: false };

  if (opts.megaphone) return { mode: "clear", gain: 0.9, muffled: false };

  return spatial(walls, listener.pos, speaker.pos);
}

/** Áudio espacial em área aberta. */
export function spatial(walls: readonly Wall[], a: Vec2, b: Vec2): Hearing {
  const d = dist(a, b);
  if (d > HEARING.ambient) return SILENT;

  let result: Hearing;
  if (d <= HEARING.full) result = { mode: "clear", gain: 1, muffled: false };
  else if (d <= HEARING.conversation) {
    result = { mode: "clear", gain: lerp(1, HEARING.edgeGain, smoothstep(HEARING.full, HEARING.conversation, d)), muffled: false };
  } else {
    result = { mode: "ambient", gain: HEARING.ambientGain * (1 - smoothstep(HEARING.conversation, HEARING.ambient, d)), muffled: true };
  }

  if (wallBetween(walls, a, b)) {
    result = { mode: "ambient", gain: result.gain * (result.mode === "clear" ? HEARING.occluded : 0.5), muffled: true };
  }
  return result.gain < 0.01 ? SILENT : result;
}

/** Atalho: monta o índice de zonas de um mapa. */
export function zoneIndexOf(map: MapDef): ZoneIndex {
  return new ZoneIndex(map.zones);
}
