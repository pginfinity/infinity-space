import * as THREE from "three";
import { apply, eqjToScene, raDecToEqj, type Sky } from "../astro/astro.ts";
import { activeShowers, meteorsInMinute, ratePerMinute, SHOWERS, type Meteor, type ShowerKey } from "../astro/meteors.ts";

/**
 * Meteoros no céu: até SLOTS riscos ao mesmo tempo, numa geometria só, reaproveitada a cada quadro.
 * Quais meteoros caem em cada minuto vem de `meteorsInMinute` (semente = número do minuto, taxa calculada
 * no começo do minuto): o mesmo céu para todo mundo no mesmo instante.
 */

const SLOTS = 8;
const RADIANTS = SHOWERS.map((s) => raDecToEqj(s.ra, s.dec));
const DEG = Math.PI / 180;
/** Só em desenvolvimento: `?meteoros=20` multiplica a taxa, para conferir o desenho sem esperar. */
const BOOST = import.meta.env.DEV && typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("meteoros")) || 1 : 1;

/** Cor da cabeça por chuva (as rápidas puxam para o verde-azulado, as lentas para o amarelado). */
const TINT: Record<ShowerKey | "esporadico", [number, number, number]> = {
  quadrantidas: [0.8, 0.9, 1],
  liridas: [0.9, 0.95, 1],
  etaAquaridas: [0.72, 1, 0.86],
  perseidas: [0.85, 0.93, 1],
  orionidas: [0.72, 1, 0.86],
  leonidas: [0.7, 1, 0.82],
  geminideas: [1, 0.92, 0.74],
  ursideas: [0.9, 0.95, 1],
  esporadico: [1, 0.95, 0.88],
};

export class MeteorLayer {
  readonly geometry = new THREE.BufferGeometry();
  private readonly tail = new Float32Array(SLOTS * 12);
  private readonly head = new Float32Array(SLOTS * 12);
  private readonly color = new Float32Array(SLOTS * 16);
  private lists = new Map<number, Meteor[]>();
  private drawn = 0;
  // temporários (nada alocado por quadro)
  private readonly r = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly north = new THREE.Vector3();

  constructor() {
    const side = new Float32Array(SLOTS * 4);
    const end = new Float32Array(SLOTS * 4);
    const index: number[] = [];
    for (let i = 0; i < SLOTS; i++) {
      // cauda (end 0) e cabeça (end 1), dos dois lados da linha
      side.set([-1, 1, -1, 1], i * 4);
      end.set([0, 0, 1, 1], i * 4);
      const k = i * 4;
      index.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
    const g = this.geometry;
    g.setIndex(index);
    g.setAttribute("aTail", new THREE.BufferAttribute(this.tail, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aHead", new THREE.BufferAttribute(this.head, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    // `position` só para o three saber quantos vértices há.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SLOTS * 12), 3));
    g.setDrawRange(0, 0);
  }

  /** Meteoros que começam no minuto (taxa medida no começo dele, igual para todos). */
  private minute(m: number): Meteor[] {
    let list = this.lists.get(m);
    if (list) return list;
    const t = m * 60_000;
    const rot = eqjToScene(new Date(t));
    const rates = SHOWERS.map(() => 0);
    for (const a of activeShowers(t)) {
      const alt = Math.asin(Math.max(-1, Math.min(1, apply(rot, RADIANTS[a.index]!)[1]))) / DEG;
      rates[a.index] = ratePerMinute(a.shower, a.activity, alt) * BOOST;
    }
    list = meteorsInMinute(m, rates);
    this.lists.set(m, list);
    // Só guarda o minuto atual e o anterior (um meteoro dura menos de 2 s).
    for (const k of this.lists.keys()) if (k < m - 1) this.lists.delete(k);
    return list;
  }

  update(now: number, sky: Sky, a: THREE.Vector3, b: THREE.Vector3): void {
    const m = Math.floor(now / 60_000);
    let n = 0;
    for (let mm = m - 1; mm <= m; mm++) {
      const list = this.minute(mm);
      for (let i = 0; i < list.length && n < SLOTS; i++) {
        const x = list[i]!;
        const p = (now - x.t0) / x.dur;
        if (p < 0 || p >= 1) continue;
        this.place(x, p, sky, a, b);
        this.write(n, a, b, x, p);
        n++;
      }
    }
    if (n === 0 && this.drawn === 0) return;
    this.drawn = n;
    this.geometry.setDrawRange(0, n * 6);
    const g = this.geometry.attributes;
    g.aTail!.needsUpdate = true;
    g.aHead!.needsUpdate = true;
    g.aColor!.needsUpdate = true;
  }

  /** Cauda (a) e cabeça (b) do meteoro no instante p (0 a 1 da vida dele). */
  private place(x: Meteor, p: number, sky: Sky, a: THREE.Vector3, b: THREE.Vector3): void {
    const { r, u, v, w, north } = this;
    north.set(sky.north[0], sky.north[1], sky.north[2]);
    let d0: number;
    if (x.sporadic) {
      // Ponto de partida sorteado no céu (um pouco abaixo do horizonte até o zênite) e rumo qualquer.
      const alt = Math.asin(-0.3 + 1.3 * x.sporadic.u);
      const az = x.sporadic.az;
      r.set(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
      u.set(0, 1, 0).cross(r);
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize();
      v.crossVectors(r, u);
      w.copy(u).multiplyScalar(Math.cos(x.sporadic.heading)).addScaledVector(v, Math.sin(x.sporadic.heading));
      d0 = 0;
    } else {
      // Sai do radiante: começa a dist0 graus dele e se afasta pela direção `around`.
      const e = RADIANTS[x.shower]!;
      const m = sky.eqjToScene;
      r.set(m[0]! * e[0] + m[1]! * e[1] + m[2]! * e[2], m[3]! * e[0] + m[4]! * e[1] + m[5]! * e[2], m[6]! * e[0] + m[7]! * e[1] + m[8]! * e[2]);
      u.crossVectors(r, north);
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize();
      v.crossVectors(r, u);
      w.copy(u).multiplyScalar(Math.cos(x.around)).addScaledVector(v, Math.sin(x.around));
      d0 = x.dist0 * DEG;
    }
    const dh = d0 + x.length * DEG * p;
    const dt = Math.max(d0, dh - x.length * DEG * 0.55);
    b.copy(r).multiplyScalar(Math.cos(dh)).addScaledVector(w, Math.sin(dh));
    a.copy(r).multiplyScalar(Math.cos(dt)).addScaledVector(w, Math.sin(dt));
  }

  private write(slot: number, a: THREE.Vector3, b: THREE.Vector3, x: Meteor, p: number): void {
    const tint = TINT[x.shower >= 0 ? SHOWERS[x.shower]!.key : "esporadico"];
    // Acende rápido, apaga mais devagar; os mais brilhantes passam do branco (tone mapping cuida).
    const life = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.15)), 0.6);
    const alpha = x.bright * life * 2.4;
    for (let k = 0; k < 4; k++) {
      const o = (slot * 4 + k) * 3;
      this.tail[o] = a.x;
      this.tail[o + 1] = a.y;
      this.tail[o + 2] = a.z;
      this.head[o] = b.x;
      this.head[o + 1] = b.y;
      this.head[o + 2] = b.z;
      const c = (slot * 4 + k) * 4;
      this.color[c] = tint[0];
      this.color[c + 1] = tint[1];
      this.color[c + 2] = tint[2];
      this.color[c + 3] = alpha;
    }
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
