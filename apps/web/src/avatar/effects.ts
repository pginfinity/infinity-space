import * as THREE from "three";

/**
 * Efeitos visuais de avatar que as atividades podem ligar (só no cliente, para quem está vendo).
 * Ex.: o Impostor deixa quem foi congelado como um fantasma translúcido.
 */

export interface AvatarEffect {
  /** Silhueta translúcida azulada, sem item na mão, etiqueta esmaecida. */
  ghost?: boolean;
}

const effects = new Map<string, AvatarEffect>();
let version = 0;

/** Liga, muda ou (com null) desliga o efeito de um avatar. Chame à vontade: só conta se mudar. */
export function setAvatarEffect(id: string, effect: AvatarEffect | null): void {
  const cur = effects.get(id);
  if (!effect || !Object.values(effect).some(Boolean)) {
    if (cur) {
      effects.delete(id);
      version++;
    }
    return;
  }
  if (cur && cur.ghost === effect.ghost) return;
  effects.set(id, { ...effect });
  version++;
}

/** Desliga um efeito em todos os avatares (ex.: fim da partida). */
export function clearAvatarEffect(key: keyof AvatarEffect): void {
  for (const [id, e] of effects) {
    if (!e[key]) continue;
    const next = { ...e, [key]: false };
    if (Object.values(next).some(Boolean)) effects.set(id, next);
    else effects.delete(id);
    version++;
  }
}

export function avatarEffect(id: string): AvatarEffect | undefined {
  return effects.get(id);
}

/** Muda sempre que algum efeito muda (para quem desenha checar barato a cada quadro). */
export function avatarEffectsVersion(): number {
  return version;
}

/** Material único do fantasma (os do boneco são compartilhados por cor: não dá para mexer neles). */
export const GHOST_MATERIAL = new THREE.MeshBasicMaterial({ color: "#8FD0FF", transparent: true, opacity: 0.32, depthWrite: false });

const originals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

/** Aplica ou tira o fantasma num boneco já montado. */
export function applyGhost(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (on) {
      if (!originals.has(m)) originals.set(m, m.material);
      m.material = GHOST_MATERIAL;
    } else {
      const orig = originals.get(m);
      if (orig) {
        m.material = orig;
        originals.delete(m);
      }
    }
  });
}
