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

/** Privacidade de conversa (pacote portas): distâncias em metros. */
export const PRIVACY = {
  /** Para começar a sussurrar, a pessoa precisa estar até aqui. */
  whisperRange: 1.5,
  /** Enquanto sussurra, a voz chega à pessoa até aqui; mais longe, não chega a ninguém. */
  whisperReach: 2.0,
  /** Quem está até aqui de alguém entra na roda quando ela é fechada. */
  circleRange: 2.5,
  /** Quem se afasta mais que isso de todos os outros sai da roda. */
  circleKeep: 3.5,
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
const FULL: Hearing = Object.freeze({ mode: "clear", gain: 1, muffled: false });
const MEGAPHONE: Hearing = Object.freeze({ mode: "clear", gain: 0.9, muffled: false });

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
  /** Id da pessoa. Sem ele, as regras de privacidade tratam a pessoa como desconhecida (não ouve sala fechada nem roda). */
  id?: string;
}

/**
 * Privacidade de conversa, decidida pelo servidor (pacote portas) e espelhada no cliente.
 * - Porta fechada ou trancada: só quem foi admitido ouve e é ouvido lá dentro (mesmo que alguém entre por engano).
 * - Roda fechada: quem está nela só ouve e só é ouvido por quem está nela.
 * - Sussurro: a voz de quem sussurra chega só à pessoa escolhida, se estiver perto; senão, a ninguém.
 */
export interface PrivacyRules {
  /** Salas com porta fechada ou trancada: id da zona → quem pode estar lá dentro. */
  doors?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Rodas fechadas: id da pessoa → id da roda. */
  circles?: ReadonlyMap<string, string>;
  /** Sussurros: quem sussurra → para quem. */
  whispers?: ReadonlyMap<string, string>;
}

export interface HearingOptions {
  /** O falante está com o megafone ligado: chega a todas as áreas, menos às salas de porta fechada e às rodas fechadas. */
  megaphone?: boolean;
  privacy?: PrivacyRules;
}

/** Quanto `listener` ouve `speaker`. */
export function hearing(walls: readonly Wall[], listener: HearingInput, speaker: HearingInput, opts: HearingOptions = {}): Hearing {
  const h = conversation(walls, listener, speaker, opts);
  const to = speaker.id === undefined ? undefined : opts.privacy?.whispers?.get(speaker.id);
  if (to === undefined) return h;
  // Sussurro: só a pessoa escolhida, nítida e perto. Se ela se afastou, a voz não chega a ninguém
  // (nunca volta a valer para todos enquanto a pessoa ainda acha que está sussurrando).
  if (listener.id !== to || h.mode !== "clear" || dist(listener.pos, speaker.pos) > PRIVACY.whisperReach) return SILENT;
  return FULL;
}

/** Audição sem o sussurro: salas, portas, rodas, palco, megafone e espaço aberto. */
function conversation(walls: readonly Wall[], listener: HearingInput, speaker: HearingInput, opts: HearingOptions): Hearing {
  const lz = listener.zone;
  const sz = speaker.zone;
  if (!lz || !sz) return SILENT;

  const p = opts.privacy;
  if (p) {
    // Porta fechada ou trancada: quem não foi admitido fica de fora nos dois sentidos.
    if (barred(p, lz, listener.id) || barred(p, sz, speaker.id)) return SILENT;
    // Roda fechada: funciona como uma sala sem paredes, nos dois sentidos (nem o megafone entra).
    const lc = listener.id === undefined ? undefined : p.circles?.get(listener.id);
    const sc = speaker.id === undefined ? undefined : p.circles?.get(speaker.id);
    if (lc !== undefined || sc !== undefined) return lc === sc && lz.group === sz.group ? FULL : SILENT;
  }

  // Megafone: chega a todas as áreas, menos às salas de porta fechada (não interrompe a reunião).
  if (lz.group !== sz.group) return opts.megaphone && !p?.doors?.has(lz.id) ? MEGAPHONE : SILENT;

  // Sala fechada: todos dentro se ouvem com volume cheio.
  if (CLOSED_KINDS.has(lz.kind)) return FULL;

  // Auditório: quem está no palco é ouvido por todos.
  if (sz.kind === "stage") return FULL;

  if (opts.megaphone) return MEGAPHONE;

  return spatial(walls, listener.pos, speaker.pos);
}

/** A pessoa está numa sala de porta fechada ou trancada sem ter sido admitida? */
export function barredFrom(p: PrivacyRules | undefined, zone: Zone | undefined, id: string | undefined): boolean {
  return !!p && !!zone && barred(p, zone, id);
}

function barred(p: PrivacyRules, zone: Zone, id: string | undefined): boolean {
  const admitted = p.doors?.get(zone.id);
  return admitted !== undefined && (id === undefined || !admitted.has(id));
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

export interface AudiencePerson extends HearingInput {
  id: string;
}

export interface AudienceOptions extends HearingOptions {
  /**
   * Gravador da sala onde o falante está (identidade no LiveKit), ou null se ela não está sendo gravada.
   * O gravador recebe a voz como qualquer pessoa da sala, menos sussurros e quem não foi admitido.
   */
  recorderFor?: (zone: Zone) => string | null;
}

export interface Audience {
  /** Quem pode receber a voz. */
  voice: string[];
  /** Quem pode receber vídeo e tela. Igual à voz, menos durante um sussurro (a pessoa continua sendo vista). */
  sight: string[];
}

/**
 * Quem pode ouvir (e ver) `speaker` agora. É a lista que o servidor manda para o falante liberar
 * as próprias faixas no LiveKit: quem não está aqui não recebe nada.
 */
export function audienceOf(walls: readonly Wall[], people: readonly AudiencePerson[], speaker: AudiencePerson, opts: AudienceOptions = {}): Audience {
  const p = opts.privacy;
  const whispering = p?.whispers?.has(speaker.id) ?? false;
  const seen: HearingOptions = whispering ? { ...opts, privacy: { ...p, whispers: undefined } } : opts;
  const voice: string[] = [];
  const sight: string[] = [];
  for (const listener of people) {
    if (listener.id === speaker.id) continue;
    if (hearing(walls, listener, speaker, opts).mode !== "none") voice.push(listener.id);
    if (whispering && hearing(walls, listener, speaker, seen).mode !== "none") sight.push(listener.id);
  }
  // Gravação: a voz de quem está na sala gravada vai também para o gravador (oculto, só escuta).
  const zone = speaker.zone;
  const recorder = zone && opts.recorderFor ? opts.recorderFor(zone) : null;
  if (recorder && !barredFrom(p, zone, speaker.id)) {
    if (!whispering) voice.push(recorder);
    sight.push(recorder);
  }
  voice.sort();
  return { voice, sight: whispering ? sight.sort() : voice };
}

/** Atalho: monta o índice de zonas de um mapa. */
export function zoneIndexOf(map: MapDef): ZoneIndex {
  return new ZoneIndex(map.zones);
}
