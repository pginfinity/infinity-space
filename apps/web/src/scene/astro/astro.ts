import {
  Body,
  GeoVector,
  Illumination,
  MoonPhase,
  NextLunarEclipse,
  NextMoonQuarter,
  Observer,
  ObserverVector,
  Rotation_EQJ_HOR,
  SearchGlobalSolarEclipse,
  SearchLunarEclipse,
  SearchMoonQuarter,
  type RotationMatrix,
  type Vector,
} from "astronomy-engine";

/**
 * Astronomia de verdade para o céu da estação (módulo puro: sem three, sem React, testável).
 *
 * A estação fica parada sobre São Paulo (ficção: geoestacionária de verdade só existe no equador),
 * a 400 km de altura, como a Estação Espacial Internacional. Tudo o mais é real: Sol, Lua (com a fase),
 * planetas e estrelas nas posições do instante, calculados pela astronomy-engine (MIT).
 *
 * Referencial da cena (o mesmo do escritório): x = leste, y = cima, z = sul (norte = -z), em São Paulo.
 * Direções no céu vêm sempre como vetores unitários nesse referencial.
 */

export type Vec3 = [number, number, number];

export const SAO_PAULO = { lat: -23.55, lon: -46.63 } as const;
export const EARTH_RADIUS_KM = 6371;
/** Altura da estação (a da ISS). A Terra ocupa a parte de baixo da vista: a borda fica ~20° abaixo do horizonte. */
export const STATION_ALT_KM = 400;
/** Distância da estação ao centro da Terra, em raios terrestres. */
export const STATION_DIST = 1 + STATION_ALT_KM / EARTH_RADIUS_KM;
/** Raio aparente da Terra visto da estação (graus): o Sol "se põe" atrás dela a esse ângulo do nadir. */
export const EARTH_ANGULAR_RADIUS = (Math.asin(1 / STATION_DIST) * 180) / Math.PI;
/** Raio aparente do Sol (graus). */
export const SUN_ANGULAR_RADIUS = 0.267;

const KM_PER_AU = 149_597_870.7;
const MOON_RADIUS_KM = 1737.4;
const RAD = Math.PI / 180;

const surface = new Observer(SAO_PAULO.lat, SAO_PAULO.lon, 0);
const station = new Observer(SAO_PAULO.lat, SAO_PAULO.lon, STATION_ALT_KM * 1000);

export type MoonPhaseKey = "nova" | "crescente" | "quartoCrescente" | "gibosaCrescente" | "cheia" | "gibosaMinguante" | "quartoMinguante" | "minguante";
export type PlanetKey = "venus" | "marte" | "jupiter" | "saturno";

export interface Planet {
  key: PlanetKey;
  dir: Vec3;
  /** Magnitude visual (menor = mais brilhante). */
  mag: number;
}

export interface Sky {
  /** Instante (ms desde 1970). */
  time: number;
  /** Rotação do equador J2000 (estrelas, RA/Dec) para a cena, linha a linha (3×3). Já inclui o tempo sidéreo. */
  eqjToScene: number[];
  sun: { dir: Vec3 };
  moon: {
    /** Direção vista da estação. */
    dir: Vec3;
    /** Do centro da Terra até a Lua, no referencial da cena, em raios terrestres (para a sombra do eclipse). */
    geo: Vec3;
    distanceKm: number;
    /** Raio aparente real (graus). */
    radius: number;
    /** Fração iluminada (0 a 1). */
    fraction: number;
    /** Ângulo de fase da lunação: 0 = nova, 90 = quarto crescente, 180 = cheia, 270 = quarto minguante. */
    phase: number;
    phaseKey: MoonPhaseKey;
  };
  planets: Planet[];
  /** Polo norte celeste na cena (orienta a Lua e as chuvas de meteoros). */
  north: Vec3;
  station: {
    /** Quantos graus o centro do Sol está acima da borda da Terra, visto da estação (negativo = atrás dela). */
    sunAboveLimb: number;
    /** Luz do Sol na estação: 1 = Sol inteiro, 0 = sombra da Terra (passa pelo disco do Sol no meio). */
    light: number;
  };
}

/** Matriz 3×3 (linha a linha) aplicada a um vetor. */
export function apply(m: readonly number[], v: { x: number; y: number; z: number } | Vec3): Vec3 {
  const x = Array.isArray(v) ? v[0] : (v as Vector).x;
  const y = Array.isArray(v) ? v[1] : (v as Vector).y;
  const z = Array.isArray(v) ? v[2] : (v as Vector).z;
  return [m[0]! * x + m[1]! * y + m[2]! * z, m[3]! * x + m[4]! * y + m[5]! * z, m[6]! * x + m[7]! * y + m[8]! * z];
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Rotação EQJ → cena. A astronomy-engine dá EQJ → horizonte (x = norte, y = oeste, z = zênite);
 * a cena é x = leste (= -oeste), y = zênite, z = sul (= -norte).
 * (RotateVector da biblioteca faz out[i] = Σ rot[j][i]·v[j].)
 */
function sceneRotation(rot: RotationMatrix): number[] {
  const r = rot.rot;
  return [
    -r[0]![1]!, -r[1]![1]!, -r[2]![1]!,
    r[0]![2]!, r[1]![2]!, r[2]![2]!,
    -r[0]![0]!, -r[1]![0]!, -r[2]![0]!,
  ];
}

export function eqjToScene(date: Date): number[] {
  return sceneRotation(Rotation_EQJ_HOR(date, surface));
}

/** RA (horas) e Dec (graus) J2000 → vetor unitário EQJ. */
export function raDecToEqj(raHours: number, decDeg: number): Vec3 {
  const ra = raHours * 15 * RAD;
  const dec = decDeg * RAD;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Altura (graus) de uma direção da cena acima do plano horizontal de São Paulo. */
export function altitudeOf(dir: Vec3): number {
  return Math.asin(Math.max(-1, Math.min(1, dir[1]))) / RAD;
}

/** Azimute (graus, 0 = norte, 90 = leste) de uma direção da cena. */
export function azimuthOf(dir: Vec3): number {
  const a = Math.atan2(dir[0], -dir[2]) / RAD;
  return a < 0 ? a + 360 : a;
}

/** Ângulo (graus) do Sol acima da borda da Terra, visto da estação. */
export function sunAboveLimb(sunDir: Vec3): number {
  // Ângulo entre o Sol e o nadir (0, -1, 0), menos o raio aparente da Terra.
  const fromNadir = Math.acos(Math.max(-1, Math.min(1, -sunDir[1]))) / RAD;
  return fromNadir - EARTH_ANGULAR_RADIUS;
}

/** Fração do disco do Sol visível acima da borda da Terra (0 a 1, suave pelo tamanho do disco). */
export function stationLight(aboveLimb: number): number {
  const k = Math.max(0, Math.min(1, (aboveLimb + SUN_ANGULAR_RADIUS) / (2 * SUN_ANGULAR_RADIUS)));
  return k * k * (3 - 2 * k);
}

export function moonPhaseKey(phase: number): MoonPhaseKey {
  const p = ((phase % 360) + 360) % 360;
  // Nova, quartos e cheia são instantes: ganham uma faixa estreita (±7,5°, ~14 h); o resto é crescente/gibosa.
  if (p < 7.5 || p >= 352.5) return "nova";
  if (p < 82.5) return "crescente";
  if (p < 97.5) return "quartoCrescente";
  if (p < 172.5) return "gibosaCrescente";
  if (p < 187.5) return "cheia";
  if (p < 262.5) return "gibosaMinguante";
  if (p < 277.5) return "quartoMinguante";
  return "minguante";
}

const PLANETS: Array<[PlanetKey, Body]> = [
  ["venus", Body.Venus],
  ["marte", Body.Mars],
  ["jupiter", Body.Jupiter],
  ["saturno", Body.Saturn],
];

/** Direção (cena) de um corpo visto da estação, a partir do vetor geocêntrico EQJ em UA. */
function fromStation(m: number[], geo: Vector, obs: Vector): Vec3 {
  return normalize(apply(m, [geo.x - obs.x, geo.y - obs.y, geo.z - obs.z]));
}

/** Só a direção do Sol (cena) — barato, usado para achar quando a estação entra e sai da sombra. */
export function sunDirAt(date: Date): Vec3 {
  return normalize(apply(eqjToScene(date), GeoVector(Body.Sun, date, true)));
}

/** O céu inteiro num instante. Leva ~1 ms: chame a cada poucos segundos, nunca por quadro. */
export function skyAt(date: Date): Sky {
  const m = eqjToScene(date);
  const obs = ObserverVector(date, station, false);
  const sunGeo = GeoVector(Body.Sun, date, true);
  const sunDir = fromStation(m, sunGeo, obs);

  const moonGeo = GeoVector(Body.Moon, date, true);
  const moonDir = fromStation(m, moonGeo, obs);
  const auToEr = KM_PER_AU / EARTH_RADIUS_KM;
  const geo = apply(m, [moonGeo.x * auToEr, moonGeo.y * auToEr, moonGeo.z * auToEr]);
  const distanceKm = Math.hypot(moonGeo.x - obs.x, moonGeo.y - obs.y, moonGeo.z - obs.z) * KM_PER_AU;
  const phase = MoonPhase(date);

  const planets: Planet[] = PLANETS.map(([key, body]) => ({
    key,
    dir: fromStation(m, GeoVector(body, date, true), obs),
    mag: Illumination(body, date).mag,
  }));

  const above = sunAboveLimb(sunDir);
  return {
    time: date.getTime(),
    eqjToScene: m,
    sun: { dir: sunDir },
    moon: {
      dir: moonDir,
      geo,
      distanceKm,
      radius: Math.asin(MOON_RADIUS_KM / distanceKm) / RAD,
      fraction: Illumination(Body.Moon, date).phase_fraction,
      phase,
      phaseKey: moonPhaseKey(phase),
    },
    planets,
    north: normalize([m[2]!, m[5]!, m[8]!]),
    station: { sunAboveLimb: above, light: stationLight(above) },
  };
}

// ---- próximos acontecimentos (para o painel "Agora no espaço") --------------------------------

export type EclipseKind = "penumbral" | "partial" | "annular" | "total";

export interface Upcoming {
  lunar: { kind: EclipseKind; peak: Date; /** Lua acima do horizonte de São Paulo no pico. */ visibleHere: boolean; /** Acontecendo agora. */ now: boolean };
  solar: { kind: EclipseKind; peak: Date; lat?: number; lon?: number };
  /** Próxima lua nova e próxima lua cheia. */
  newMoon: Date;
  fullMoon: Date;
  /** Próxima troca de luz na estação (entra na sombra da Terra ou volta ao Sol). */
  stationChange: { at: Date; toLight: boolean } | null;
}

/** Busca os próximos eclipses e fases. Mais caro (dezenas de ms): chame ao abrir o painel, no máximo a cada minuto. */
export function upcoming(date: Date): Upcoming {
  // Começa um pouco antes para pegar um eclipse lunar em andamento (a fase penumbral dura até ~3 h).
  let lunar = SearchLunarEclipse(new Date(date.getTime() - 4 * 3600_000));
  const half = (l: typeof lunar) => l.sd_penum * 60_000;
  let now = Math.abs(lunar.peak.date.getTime() - date.getTime()) <= half(lunar);
  if (!now && lunar.peak.date.getTime() < date.getTime()) {
    lunar = NextLunarEclipse(lunar.peak);
    now = false;
  }
  const lunarDir = normalize(apply(eqjToScene(lunar.peak.date), GeoVector(Body.Moon, lunar.peak.date, true)));
  const solar = SearchGlobalSolarEclipse(date);

  let q = SearchMoonQuarter(date);
  let newMoon: Date | null = null;
  let fullMoon: Date | null = null;
  for (let i = 0; i < 6 && (!newMoon || !fullMoon); i++) {
    if (q.quarter === 0 && !newMoon) newMoon = q.time.date;
    if (q.quarter === 2 && !fullMoon) fullMoon = q.time.date;
    q = NextMoonQuarter(q);
  }

  return {
    lunar: { kind: lunar.kind as EclipseKind, peak: lunar.peak.date, visibleHere: lunarDir[1] > 0, now },
    solar: {
      kind: solar.kind as EclipseKind,
      peak: solar.peak.date,
      ...(solar.latitude !== undefined ? { lat: solar.latitude } : {}),
      ...(solar.longitude !== undefined ? { lon: solar.longitude } : {}),
    },
    newMoon: newMoon ?? date,
    fullMoon: fullMoon ?? date,
    stationChange: nextLightChange(date),
  };
}

/**
 * Próximo instante em que a estação entra na sombra da Terra ou volta ao Sol (até 36 h à frente).
 * Passos de 5 min e depois bissecção até ~10 s.
 */
export function nextLightChange(date: Date): { at: Date; toLight: boolean } | null {
  const lit = (t: number) => sunAboveLimb(sunDirAt(new Date(t))) > 0;
  const t0 = date.getTime();
  const start = lit(t0);
  const step = 5 * 60_000;
  for (let t = t0 + step; t <= t0 + 36 * 3600_000; t += step) {
    if (lit(t) !== start) {
      let a = t - step;
      let b = t;
      while (b - a > 10_000) {
        const mid = (a + b) / 2;
        if (lit(mid) === start) a = mid;
        else b = mid;
      }
      return { at: new Date(b), toLight: !start };
    }
  }
  return null;
}
