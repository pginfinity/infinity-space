import { ANIMS, INTERP_DELAY_MS, angleDelta, type Anim, type Emote } from "@infinity/world";

/** Emote em andamento por pessoa (id → emote e quando começou, em performance.now()). */
const emotes = new Map<string, { e: Emote; at: number }>();
/** Duração de cada emote, em ms. */
export const EMOTE_MS: Record<Emote, number> = { wave: 2200, dance: 6000, clap: 2400, cheer: 2000, point: 2000, think: 3000, laugh: 2200, heart: 2400 };

export function playEmote(id: string, e: Emote): void {
  emotes.set(id, { e, at: performance.now() });
}

export function stopEmote(id: string): void {
  emotes.delete(id);
}

/** Emote ativo da pessoa, com o progresso em segundos. */
export function currentEmote(id: string, now = performance.now()): { e: Emote; t: number } | null {
  const cur = emotes.get(id);
  if (!cur) return null;
  const elapsed = now - cur.at;
  if (elapsed > EMOTE_MS[cur.e]) {
    emotes.delete(id);
    return null;
  }
  return { e: cur.e, t: elapsed / 1000 };
}

/**
 * Posições em tempo real, fora do React: as lentes leem daqui a cada quadro sem causar re-render.
 */

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  anim: Anim;
}

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
  anim: number;
}

const remote = new Map<string, Sample[]>();

/** A própria pose, controlada pelo motor de movimento. */
export const self: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };

export function setSelf(x: number, z: number, yaw = self.yaw): void {
  self.x = x;
  self.z = z;
  self.yaw = yaw;
}

export function pushRemote(id: string, x: number, z: number, yaw: number, anim: number, t = performance.now()): void {
  let buf = remote.get(id);
  if (!buf) {
    buf = [];
    remote.set(id, buf);
  }
  buf.push({ t, x, z, yaw, anim });
  // Guarda só o último segundo.
  while (buf.length > 2 && buf[0]!.t < t - 1000) buf.shift();
}

export function removeRemote(id: string): void {
  remote.delete(id);
}

export function clearRemote(): void {
  remote.clear();
}

export function remoteIds(): IterableIterator<string> {
  return remote.keys();
}

/** Pose interpolada de um avatar remoto, desenhada um pouco no passado para ficar suave. */
export function sampleRemote(id: string, now = performance.now(), out: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" }): Pose | null {
  const buf = remote.get(id);
  if (!buf || buf.length === 0) return null;
  const rt = now - INTERP_DELAY_MS;
  let a = buf[0]!;
  let b = buf[buf.length - 1]!;
  if (rt <= a.t) b = a;
  else if (rt >= b.t) a = b;
  else {
    for (let i = 1; i < buf.length; i++) {
      if (buf[i]!.t >= rt) {
        a = buf[i - 1]!;
        b = buf[i]!;
        break;
      }
    }
  }
  const span = b.t - a.t;
  const k = span > 0 ? (rt - a.t) / span : 1;
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  out.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * k;
  // Parado há um tempo: mostra a animação de parado mesmo se o último pacote dizia "andando".
  const stale = rt - buf[buf.length - 1]!.t > 400;
  out.anim = stale && b.anim !== ANIMS.indexOf("sit") ? "idle" : (ANIMS[b.anim] ?? "idle");
  return out;
}
