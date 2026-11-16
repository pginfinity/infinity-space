import { dirOfYaw, pointInPolygon, type Vec2 } from "../../geometry.ts";
import type { MapObject } from "../../map/types.ts";
import type { EscVec3 } from "./common.ts";

/**
 * Cabine de fotos do Marketing Studio (fundo infinito + ring light + câmera no tripé).
 * Alguém dispara o timer; no fim, cada participante gera a foto no próprio navegador, do ponto
 * de vista da câmera, com a moldura da marca. Nada de imagem guardada no servidor.
 */

export const PHOTO_ID = "cabine";
export const PHOTO_KIND = "photobooth";
/** Timer: dá tempo de quem apertou correr para a frente do fundo. */
export const PHOTO_COUNTDOWN_MS = 5000;
export const PHOTO_COOLDOWN_MS = 3000;
/** Quem está a até esta distância do tripé também recebe a foto (o fotógrafo). */
export const PHOTO_NEAR = 2.4;
/** Para disparar: perto do tripé ou dentro do quadro. */
export const PHOTO_START_RANGE = 2.6;
export const PHOTO_FOV = 44;
export const PHOTO_ASPECT = 4 / 3;

export interface PhotoState {
  phase: "idle" | "countdown";
}

/** Evento "countdown" (para todos; o cliente mostra só para quem está na cabine). */
export interface PhotoCountdown {
  name: string;
  ms: number;
}

/** Evento "shot" (para todos): quem sai na foto (e recebe a imagem). */
export interface PhotoShot {
  ids: string[];
}

export interface PhotoRig {
  /** Área no chão que aparece na foto (entre o fundo e o tripé). */
  frame: Vec2[];
  /** Ponto do tripé (para o fotógrafo e para disparar). */
  tripod: Vec2;
  /**
   * Câmera da foto: um pouco atrás do tripé (que sai da foto), na altura do peito, olhando para o
   * meio do quadro. Posição, alvo e abertura vertical (graus).
   */
  camera: { pos: EscVec3; target: EscVec3; fov: number };
}

/** Monta a cabine a partir do fundo e do tripé do mapa. */
export function photoRig(backdrop: MapObject, tripod: MapObject): PhotoRig {
  const f = dirOfYaw(backdrop.rot); // frente do fundo (para onde o papel desce)
  const side = { x: -f.z, z: f.x };
  const front = { x: backdrop.pos.x + f.x * 0.2, z: backdrop.pos.z + f.z * 0.2 };
  // Profundidade do quadro: do papel até meio metro antes do tripé.
  const toTripod = (tripod.pos.x - front.x) * f.x + (tripod.pos.z - front.z) * f.z;
  const depth = Math.max(1.2, toTripod - 0.55);
  const half = Math.max(1.2, backdrop.size.w / 2 + 0.3);
  const at = (s: number, d: number): Vec2 => ({ x: front.x + side.x * s + f.x * d, z: front.z + side.z * s + f.z * d });
  const frame = [at(-half, 0), at(half, 0), at(half, depth), at(-half, depth)];
  const tf = dirOfYaw(tripod.rot); // a lente aponta para a frente do tripé
  const lens = { x: tripod.pos.x - tf.x * 0.9, y: 1.35, z: tripod.pos.z - tf.z * 0.9 };
  const target = { x: front.x + f.x * 1.1, y: 0.95, z: front.z + f.z * 1.1 };
  return { frame, tripod: { ...tripod.pos }, camera: { pos: lens, target, fov: PHOTO_FOV } };
}

/** A pessoa (posição no chão) aparece na foto? */
export function photoInFrame(rig: PhotoRig, p: Vec2): boolean {
  return pointInPolygon(p, rig.frame);
}

/** Quem recebe a foto: quem está no quadro ou perto do tripé. */
export function photoParticipants(rig: PhotoRig, people: Iterable<[string, Vec2]>): string[] {
  const out: string[] = [];
  for (const [id, p] of people) {
    if (photoInFrame(rig, p) || Math.hypot(p.x - rig.tripod.x, p.z - rig.tripod.z) <= PHOTO_NEAR) out.push(id);
  }
  return out;
}
