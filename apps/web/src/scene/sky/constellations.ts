import * as THREE from "three";
import { create } from "zustand";
import i18n from "../../i18n/index.ts";
import { raDecToEqj, type Vec3 } from "../astro/astro.ts";
import { SKY_VP } from "./camera.ts";

/**
 * Constelações (linhas e nomes) e as estrelas com nome que abrem cartão ao clicar. Dados em
 * `public/space/constelacoes.json` (gerado por scripts/ceu/constelacoes.mjs, ~5 KB, baixa com o céu).
 * Ligar/desligar fica guardado neste navegador.
 */

export interface ConstellationData {
  /** Por constelação: traços em RA (h) / Dec (graus), 4 números por traço. */
  linhas: Record<string, number[]>;
  /** Estrelas com nome: [RA h, Dec graus, magnitude]. */
  estrelas: Record<string, [number, number, number]>;
}

const KEY = "infinity.constelacoes";

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useConstellations = create<{ on: boolean }>(() => ({ on: readOn() }));

export function toggleConstellations(): void {
  const on = !useConstellations.getState().on;
  useConstellations.setState({ on });
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // sem armazenamento (aba anônima): vale só nesta sessão
  }
}

let data: Promise<ConstellationData> | null = null;
let ready: ConstellationData | null = null;
/** Estrelas com nome já em vetores J2000 (para o clique). */
export const namedStars: Array<{ key: string; eqj: Vec3; mag: number }> = [];

export function loadConstellations(): Promise<ConstellationData> {
  data ??= fetch("/space/constelacoes.json")
    .then((r) => {
      if (!r.ok) throw new Error(`constelacoes.json: ${r.status}`);
      return r.json() as Promise<ConstellationData>;
    })
    .then((d) => {
      ready = d;
      for (const [key, [ra, dec, mag]] of Object.entries(d.estrelas)) namedStars.push({ key, eqj: raDecToEqj(ra, dec), mag });
      return d;
    })
    .catch((e: unknown) => {
      data = null; // tenta de novo na próxima montagem do céu
      throw e;
    });
  return data;
}

export function constellationsReady(): ConstellationData | null {
  return ready;
}

/** Posições (J2000) dos traços e o centro de cada constelação (onde vai o nome). */
export function constellationGeometry(d: ConstellationData): { position: Float32Array; centers: Array<{ key: string; eqj: THREE.Vector3 }> } {
  const pts: number[] = [];
  const centers: Array<{ key: string; eqj: THREE.Vector3 }> = [];
  for (const [key, l] of Object.entries(d.linhas)) {
    const c = new THREE.Vector3();
    for (let i = 0; i < l.length; i += 2) {
      const v = raDecToEqj(l[i]!, l[i + 1]!);
      pts.push(v[0], v[1], v[2]);
      c.x += v[0];
      c.y += v[1];
      c.z += v[2];
    }
    centers.push({ key, eqj: c.normalize() });
  }
  return { position: new Float32Array(pts), centers };
}

/**
 * Nomes das constelações por cima do canvas (texto de verdade, legível em qualquer tamanho). Posicionados
 * no `onAfterRender` das linhas, com a matriz do céu deste quadro; somem atrás da Terra e fora da tela.
 */
export class ConstellationLabels {
  private readonly box = document.createElement("div");
  private readonly items: Array<{ el: HTMLSpanElement; eqj: THREE.Vector3 }> = [];
  private readonly v = new THREE.Vector4();
  private readonly d = new THREE.Vector3();

  constructor(parent: HTMLElement, centers: Array<{ key: string; eqj: THREE.Vector3 }>) {
    this.box.className = "pointer-events-none absolute inset-0 overflow-hidden";
    this.box.dataset.ceu = "constelacoes";
    this.box.style.opacity = "0";
    this.box.setAttribute("aria-hidden", "true");
    for (const c of centers) {
      const el = document.createElement("span");
      el.className = "absolute left-0 top-0 whitespace-nowrap font-display text-[10px] uppercase tracking-[0.18em] text-sky/70";
      el.textContent = i18n.t(`espaco.constelacoes.${c.key}`);
      this.box.appendChild(el);
      this.items.push({ el, eqj: c.eqj });
    }
    parent.appendChild(this.box);
  }

  /** `rot`: J2000 → cena (a mesma matriz das estrelas); `w`/`h`: tamanho do canvas em px CSS. */
  place(rot: THREE.Matrix3, w: number, h: number, opacity: number): void {
    this.box.style.opacity = String(opacity);
    const vp = SKY_VP.value;
    for (const it of this.items) {
      const d = this.d.copy(it.eqj).applyMatrix3(rot);
      const below = d.y < -0.34;
      const p = this.v.set(d.x, d.y, d.z, 1).applyMatrix4(vp);
      const x = (p.x / p.w) * 0.5 + 0.5;
      const y = 0.5 - (p.y / p.w) * 0.5;
      const show = !below && p.w > 0 && x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05;
      it.el.style.display = show ? "" : "none";
      if (show) it.el.style.transform = `translate(${(x * w).toFixed(1)}px, ${(y * h).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  hide(): void {
    this.box.style.opacity = "0";
  }

  dispose(): void {
    this.box.remove();
  }
}
