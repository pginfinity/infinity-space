import * as THREE from "three";
import { LOOK } from "./look/looks.ts";

/**
 * Materiais de tudo no mundo. A direção de arte oficial é o visual **Cinema** (look/looks.ts): luz
 * física fosca (MeshStandardMaterial) com sombras do Sol, reflexos e gradação de cor. As funções
 * toon()/glow()/lit() escolhem o material pelo visual: no Cinema, toon() devolve um material físico;
 * nos visuais de comparação (`?visual=atual` em desenvolvimento), cel shading em faixas.
 * Aspereza e metal dos móveis saem da cor da paleta (furniture/core.ts, matOf); pisos e paredes passam
 * a aspereza em lit(…, surface).
 */

let gradient: THREE.DataTexture | null = null;

/**
 * Rampa do cel shading. Visual atual: 4 tons. Prévias de direção de arte (look/looks.ts):
 * "soft" usa uma rampa macia (guache) e "ink" 3 tons duros (quadrinho).
 */
function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const soft = LOOK.material === "soft";
  const tones = new Uint8Array(LOOK.material === "ink" ? [95, 175, 255] : soft ? [70, 98, 128, 158, 188, 214, 238, 255] : [90, 150, 205, 255]);
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
  gradient.magFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
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

/**
 * Material padrão de todo objeto. Reaproveitado por cor e opções (não descartar à toa).
 * Com uma prévia de visual de luz física ("standard"), devolve um MeshStandardMaterial fosco com a
 * mesma interface de cor (o tipo continua MeshToonMaterial para não espalhar mudanças: só cor,
 * emissivo, opacidade e lado são usados por quem chama).
 */
export function toon(color: string, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `toon:${color}:${opts.emissive ?? 0}:${opts.emissiveColor ?? ""}:${opts.opacity ?? 1}:${opts.side ?? 0}`;
  let m = cache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = lit({
      color,
      ...(opts.emissive ? { emissive: new THREE.Color(opts.emissiveColor ?? color), emissiveIntensity: opts.emissive } : {}),
      ...(opts.opacity !== undefined && opts.opacity < 1 ? { transparent: true, opacity: opts.opacity, depthWrite: false } : {}),
      side: opts.side ?? THREE.FrontSide,
    });
    cache.set(key, m);
  }
  return m;
}

/** Parâmetros comuns aos materiais iluminados (cor, textura, emissivo, transparência, lado). */
export type LitParams = Pick<THREE.MeshStandardMaterialParameters, "color" | "map" | "emissive" | "emissiveIntensity" | "transparent" | "opacity" | "depthWrite" | "side" | "alphaTest">;

/** Aspereza e metal na luz física (pisos, paredes); no cel shading não fazem nada. */
export interface Surface {
  rough?: number;
  metal?: number;
}

/**
 * Material iluminado no modelo do visual atual (cel shading ou luz física). Use no lugar de
 * `new THREE.MeshToonMaterial` para pisos, paredes e objetos novos. Não é reaproveitado: cada chamada cria um.
 * `toonRamp = false` mantém o sombreamento de 2 tons padrão do three no visual atual (pisos e paredes
 * sempre foram assim); nas prévias, todos usam a rampa do visual.
 */
export function lit(params: LitParams, toonRamp = true, surface: Surface = {}): THREE.MeshToonMaterial {
  if (LOOK.material === "standard") {
    return new THREE.MeshStandardMaterial({ ...params, roughness: surface.rough ?? LOOK.roughness ?? 0.8, metalness: surface.metal ?? 0 }) as unknown as THREE.MeshToonMaterial;
  }
  return new THREE.MeshToonMaterial({ ...params, gradientMap: toonRamp || LOOK.material !== "toon" ? gradientMap() : null });
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
