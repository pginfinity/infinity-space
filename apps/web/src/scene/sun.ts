import * as THREE from "three";

/**
 * Sol de verdade sobre Florianópolis: a estação fica "em cima" da cidade, então o pedaço da Terra
 * que se vê lá embaixo tem a luz do horário real (dia, fim de tarde, noite com as luzes das cidades).
 * Conta astronômica simplificada (hora solar + declinação pela data), precisa o bastante para o céu.
 */

const LAT = (-27.6 * Math.PI) / 180;
const LON = -48.55;

export interface SunState {
  /** Altura do Sol no céu de Florianópolis, em graus (negativo = abaixo do horizonte). */
  altitude: number;
  /** Direção do Sol no referencial (Leste, Norte, Cima) do lugar. */
  enu: THREE.Vector3;
}

export function sunAt(date: Date = new Date()): SunState {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - start) / 86_400_000;
  // Declinação solar (aprox.): -23,44° no início do ano e +23,44° no meio.
  const decl = ((-23.44 * Math.PI) / 180) * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solar = utcHours + LON / 15;
  const H = ((solar - 12) / 24) * 2 * Math.PI;
  const e = -Math.cos(decl) * Math.sin(H);
  const n = Math.cos(LAT) * Math.sin(decl) - Math.sin(LAT) * Math.cos(decl) * Math.cos(H);
  const u = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  return { altitude: (Math.asin(Math.max(-1, Math.min(1, u))) * 180) / Math.PI, enu: new THREE.Vector3(e, n, u) };
}

/**
 * Converte a direção local do Sol para o referencial da Terra (esfera sem rotação):
 * `up` é a direção do centro da Terra até a estação; o norte do lugar segue o norte do escritório (-z).
 */
export function sunOnEarth(enu: THREE.Vector3, up: THREE.Vector3): THREE.Vector3 {
  // Norte = projeção de (0, 0, -1) no plano tangente; leste = norte × cima (Leste, Norte, Cima).
  const n0 = new THREE.Vector3(0, 0, -1);
  const north = n0.clone().addScaledVector(up, -n0.dot(up)).normalize();
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  return new THREE.Vector3().addScaledVector(east, enu.x).addScaledVector(north, enu.y).addScaledVector(up, enu.z).normalize();
}

/** Cor e força da luz principal do escritório para a altura do Sol (sutil: o escritório tem luz própria). */
export function officeLight(altitude: number): { color: THREE.Color; intensity: number; sky: number } {
  const day = new THREE.Color("#FFF1DE");
  const golden = new THREE.Color("#FFD9AE");
  const night = new THREE.Color("#E3EAFF");
  if (altitude >= 12) return { color: day, intensity: 1.7, sky: 1.15 };
  if (altitude >= -2) {
    const k = (altitude + 2) / 14; // 0 no pôr do sol, 1 com o Sol alto
    return { color: golden.clone().lerp(day, k), intensity: 1.55 + 0.15 * k, sky: 1.08 + 0.07 * k };
  }
  const k = Math.min(1, (-2 - altitude) / 10); // escurece até a noite
  return { color: golden.clone().lerp(night, k), intensity: 1.55 - 0.2 * k, sky: 1.08 - 0.08 * k };
}
