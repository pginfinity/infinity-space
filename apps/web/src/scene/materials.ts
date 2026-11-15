import * as THREE from "three";

/**
 * Direção de arte: "estação espacial aconchegante" em cel shading.
 * Todo objeto usa toonMaterial(): sombreamento em faixas (4 tons), cores chapadas, poucos brilhos.
 * Combina com o 2D isométrico em pixel art (o mesmo mundo renderizado em baixa resolução).
 */

let gradient: THREE.DataTexture | null = null;

/** Rampa de 4 tons do cel shading. */
function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const tones = new Uint8Array([90, 150, 205, 255]);
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  /** Brilho próprio (telas, neon, LEDs). 0 = nenhum. */
  emissive?: number;
  /** Cor do brilho (padrão: a própria cor). */
  emissiveColor?: string;
  opacity?: number;
  side?: THREE.Side;
}

/** Material padrão de todo objeto. Reaproveitado por cor e opções (não descartar à toa). */
export function toon(color: string, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `toon:${color}:${opts.emissive ?? 0}:${opts.emissiveColor ?? ""}:${opts.opacity ?? 1}:${opts.side ?? 0}`;
  let m = cache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: gradientMap(),
      ...(opts.emissive ? { emissive: new THREE.Color(opts.emissiveColor ?? color), emissiveIntensity: opts.emissive } : {}),
      ...(opts.opacity !== undefined && opts.opacity < 1 ? { transparent: true, opacity: opts.opacity, depthWrite: false } : {}),
      side: opts.side ?? THREE.FrontSide,
    });
    cache.set(key, m);
  }
  return m;
}

/** Material que brilha sem sombreamento (telas ligadas, neon, LEDs). */
export function glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `glow:${color}:${opacity}`;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}) });
    cache.set(key, m);
  }
  return m;
}

/** Paleta base, derivada da marca. Use estas cores antes de inventar outras. */
export const PALETTE = {
  navy: "#0A2547",
  navyDeep: "#00112A",
  space: "#020B18",
  orange: "#EE5C29",
  signal: "#00B7FF",
  sky: "#46AFE3",
  offwhite: "#F2F0EF",
  cream: "#ECE6DF",
  slate: "#8A93A3",
  graphite: "#2A2F3A",
  ink: "#14161C",
  woodLight: "#D9B98C",
  wood: "#A8774E",
  woodDark: "#5E3D27",
  leather: "#3B2A22",
  metal: "#9AA3B2",
  green: "#3FAE7A",
  leaf: "#2F9E74",
  leafLight: "#4CC28E",
  gold: "#E8B44A",
  red: "#E0483B",
  pink: "#E85D9A",
  lilac: "#9B8CFF",
} as const;
