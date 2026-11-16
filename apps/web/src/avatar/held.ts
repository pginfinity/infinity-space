import * as THREE from "three";
import type { HeldItem } from "@infinity/world";
import { Builder, C, T, clear, lit, mix, poly, type Mold } from "../scene/furniture/core.ts";

/**
 * Itens que o avatar segura (café, chá, água, suco, pipoca, papel, microfone, troféu, flor, regador).
 * Modelos procedurais pequenos, no mesmo estilo dos móveis (cel shading com cor por vértice).
 * A geometria e o material de cada item são montados uma vez e compartilhados por todos os avatares.
 *
 * Referencial: origem no centro da mão; +Y para cima, +Z para a frente do avatar, +X para a esquerda
 * dele (a mão direita fica em -X, então o corpo do item vai um pouco para +X). A animação mantém o
 * item de pé, então estes eixos valem no mundo (girados só pelo yaw do avatar).
 */

type Parts = Mold["parts"];

const BUILD: Record<HeldItem, (b: Builder) => void> = {
  coffee(b) {
    // caneca da casa: branca com faixa laranja, café com um coração de espuma
    b.push(-0.012, -0.022, 0.05);
    b.lathe(C.offwhite, [[0, 0], [0.05, 0], [0.056, 0.012], [0.056, 0.115], [0.05, 0.115], [0, 0.108]], 0, 0, 0, { seg: 16 });
    b.cyl(C.orange, 0.0575, 0.026, 0, 0.06, 0, { seg: 16 });
    b.cyl(C.woodDark, 0.049, 0.006, 0, 0.106, 0, { seg: 14 });
    b.sph(C.cream, 0.016, 0, 0.11, 0.008, { sy: 0.25, seg: 8 });
    b.torus(C.offwhite, 0.03, 0.011, -0.058, 0.06, 0, { ry: Math.PI / 2, seg: 10, tseg: 6 });
    b.pop();
  },
  tea(b) {
    // copo de vidro com chá âmbar e o saquinho pendurado pela borda
    b.push(-0.012, -0.022, 0.05);
    b.lathe(clear(C.offwhite, 0.35), [[0, 0], [0.045, 0], [0.054, 0.12], [0, 0.12]], 0, 0, 0, { seg: 16 });
    b.lathe("#B8661F", [[0, 0.004], [0.043, 0.004], [0.05, 0.095], [0, 0.095]], 0, 0, 0, { seg: 14 });
    b.cyl(lit("#E0A050"), 0.05, 0.004, 0, 0.096, 0, { seg: 14 });
    b.rod(C.offwhite, 0.0025, 0.03, 0.098, 0.03, 0.045, 0.12, 0.045, { seg: 4 });
    b.rod(C.offwhite, 0.0025, 0.045, 0.12, 0.045, 0.06, 0.06, 0.06, { seg: 4 });
    b.box(C.signal, 0.03, 0.036, 0.006, 0.062, 0.045, 0.062, { r: 0.002, ry: 0.8 });
    b.pop();
  },
  water(b) {
    // copinho de papel do bebedouro, com a água azul aparecendo
    b.push(-0.012, -0.022, 0.05);
    b.lathe(C.offwhite, [[0, 0], [0.032, 0], [0.05, 0.11], [0.046, 0.11], [0, 0.104]], 0, 0, 0, { seg: 14 });
    b.cyl(C.signal, 0.044, 0.014, 0, 0.085, 0, { rt: 0.047, seg: 14 });
    b.cyl(lit("#9ED8F5"), 0.045, 0.004, 0, 0.098, 0, { seg: 14 });
    b.pop();
  },
  juice(b) {
    // copo alto de suco de laranja com canudo e rodela na borda
    b.push(-0.012, -0.035, 0.05);
    b.lathe(clear(C.offwhite, 0.3), [[0, 0], [0.04, 0], [0.047, 0.15], [0, 0.15]], 0, 0, 0, { seg: 14 });
    b.lathe("#F29A2E", [[0, 0.005], [0.038, 0.005], [0.044, 0.125], [0, 0.125]], 0, 0, 0, { seg: 14 });
    b.cyl(lit("#FFC46B"), 0.044, 0.004, 0, 0.126, 0, { seg: 14 });
    b.rod(C.offwhite, 0.006, -0.01, 0.04, 0.0, 0.02, 0.2, -0.012, { seg: 6 });
    b.rod(C.red, 0.0062, 0.0, 0.1, -0.004, 0.012, 0.15, -0.008, { seg: 6 });
    b.cyl(C.gold, 0.03, 0.008, -0.04, 0.14, 0.02, { rz: Math.PI / 2, rx: 0.3, seg: 12 });
    b.cyl(lit("#FFE7A0"), 0.024, 0.009, -0.04, 0.14, 0.02, { rz: Math.PI / 2, rx: 0.3, seg: 12 });
    b.pop();
  },
  popcorn(b) {
    // caixinha listrada com pipoca transbordando
    b.push(-0.012, -0.03, 0.055);
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const a = (i / stripes) * Math.PI * 2;
      b.cyl(i % 2 ? C.offwhite : C.red, 0.05, 0.12, 0, 0.06, 0, { rt: 0.062, seg: 4, ts: a, tl: (Math.PI * 2) / stripes, open: true });
    }
    b.cyl(C.offwhite, 0.05, 0.004, 0, 0.002, 0, { seg: 8 });
    const pop = [
      [0, 0.13, 0, 0.032],
      [0.03, 0.125, 0.02, 0.026],
      [-0.03, 0.124, 0.015, 0.027],
      [0.02, 0.122, -0.03, 0.026],
      [-0.025, 0.126, -0.025, 0.025],
      [0.008, 0.155, 0.01, 0.024],
      [-0.012, 0.15, -0.012, 0.022],
      [0.04, 0.115, -0.005, 0.02],
    ] as const;
    pop.forEach(([x, y, z, r], i) => b.sph(i % 3 === 0 ? "#FFF3C4" : C.cream, r, x, y, z, { seg: 7 }));
    b.pop();
  },
  paper(b) {
    // folha com o texto virado para quem segura (linhas e um cabeçalho em azul)
    b.push(0.03, 0.05, 0.05, { rx: -0.25 });
    b.box(C.offwhite, 0.15, 0.2, 0.006, 0, 0, 0, { r: 0 });
    b.box(C.signal, 0.09, 0.016, 0.008, -0.02, 0.07, 0, { r: 0 });
    for (let i = 0; i < 5; i++) b.box(C.slate, i === 4 ? 0.06 : 0.11, 0.008, 0.008, i === 4 ? -0.025 : 0, 0.035 - i * 0.025, 0, { r: 0 });
    b.box(mix(C.offwhite, C.slate, 0.2), 0.04, 0.04, 0.0065, 0.055, -0.08, 0.0, { r: 0, rz: 0.785 });
    b.pop();
  },
  microphone(b) {
    // microfone de mão: cabo escuro, anel azul e a grade de metal
    b.push(0.02, 0, 0.03);
    b.cyl(C.graphite, 0.018, 0.16, 0, 0.02, 0, { rt: 0.026, seg: 12 });
    b.cyl(C.signal, 0.028, 0.014, 0, 0.105, 0, { seg: 12 });
    b.sph(T.steel, 0.045, 0, 0.145, 0, { seg: 12 });
    b.sph(T.steelDark, 0.03, 0, 0.16, 0.022, { seg: 8, sy: 0.6 });
    b.pop();
  },
  trophy(b) {
    // troféu dourado com base de madeira
    b.push(0.035, -0.05, 0.045);
    b.box(C.woodDark, 0.09, 0.04, 0.09, 0, 0.02, 0, { r: 0.008 });
    b.box(C.gold, 0.06, 0.012, 0.004, 0, 0.022, 0.046, { r: 0 });
    b.cyl(C.gold, 0.012, 0.06, 0, 0.07, 0, { seg: 8 });
    b.lathe(C.gold, [[0, 0], [0.02, 0], [0.065, 0.06], [0.07, 0.11], [0.058, 0.11], [0, 0.04]], 0, 0.1, 0, { seg: 16 });
    for (const s of [-1, 1]) b.torus(C.gold, 0.03, 0.009, s * 0.068, 0.17, 0, { arc: Math.PI, rz: -s * Math.PI / 2, seg: 10, tseg: 5 });
    b.cyl(lit("#FFE7A0"), 0.05, 0.004, 0, 0.207, 0, { seg: 14 });
    b.pop();
  },
  flower(b) {
    // uma flor de haste comprida, com folha e miolo
    b.push(0.01, -0.06, 0.03);
    b.rod(C.leaf, 0.006, 0, 0, 0, 0.01, 0.28, 0.02, { seg: 6 });
    b.at(0.004, 0.12, 0.008, { rz: -0.9 }, () => b.front(C.leafLight, poly([[0, 0], [0.025, 0.03], [0.012, 0.075], [0, 0.085], [-0.01, 0.05]]), 0.006, 0, 0, 0));
    b.push(0.01, 0.285, 0.02, { rx: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.sph(i % 2 ? C.pink : mix(C.pink, C.offwhite, 0.3), 0.03, Math.cos(a) * 0.032, 0, Math.sin(a) * 0.032, { sx: 1, sy: 0.35, sz: 0.7, ry: -a, seg: 8 });
    }
    b.sph(C.gold, 0.02, 0, 0.008, 0, { sy: 0.6, seg: 8 });
    b.pop();
    b.pop();
  },
  "watering-can"(b) {
    // regador pendurado pela alça de cima, bico para a frente
    b.push(0, -0.13, 0.02);
    const body = C.sky;
    b.lathe(body, [[0, 0], [0.07, 0], [0.078, 0.02], [0.078, 0.11], [0.06, 0.13], [0, 0.13]], 0, -0.06, 0, { seg: 16, sz: 0.8 });
    b.lathe(C.navy, [[0.0795, 0], [0.0795, 0.016]], 0, -0.045, 0, { seg: 16, sz: 0.8 });
    b.torus(C.navy, 0.065, 0.011, 0, 0.12, -0.005, { arc: Math.PI, seg: 12, tseg: 6 });
    b.rod(body, 0.012, 0, -0.04, 0.05, 0, 0.09, 0.2, { rt: 0.008, seg: 8 });
    b.cyl(C.navy, 0.018, 0.02, 0, 0.098, 0.208, { rx: 0.9, rt: 0.026, seg: 10 });
    b.torus(body, 0.05, 0.01, 0, 0.02, -0.075, { arc: Math.PI * 0.9, ry: Math.PI / 2, rz: 0.3, seg: 10, tseg: 5 });
    b.pop();
  },
};

const cache = new Map<HeldItem, Parts>();

function partsOf(item: HeldItem): Parts {
  let p = cache.get(item);
  if (!p) {
    const b = new Builder();
    BUILD[item](b);
    p = b.finish().parts;
    cache.set(item, p);
  }
  return p;
}

/** Ponta do bico do regador, no referencial da mão (para as gotas saírem do lugar certo). */
export const SPOUT_TIP = new THREE.Vector3(0, -0.03, 0.235);

/**
 * Escala de cada item: maior que o real, no espírito chibi (cabeça grande, mãos pequenas),
 * para o item ler bem também no pixel art do 2D.
 */
const SCALE: Partial<Record<HeldItem, number>> = { "watering-can": 1.35, paper: 1.3, flower: 1.3 };
export const HELD_SCALE = 1.55;
export function heldScale(item: HeldItem): number {
  return SCALE[item] ?? HELD_SCALE;
}

/** Um item pronto para pendurar na mão (geometria e material compartilhados: não descartar). */
export function heldModel(item: HeldItem): THREE.Group {
  const g = new THREE.Group();
  g.name = `held:${item}`;
  g.scale.setScalar(heldScale(item));
  for (const part of partsOf(item)) {
    const m = new THREE.Mesh(part.geometry, part.material);
    m.renderOrder = part.bucket === "t1" ? 0 : 2;
    g.add(m);
  }
  return g;
}

/**
 * O que está na mão de um avatar. Guarda um modelo por item já usado, então trocar de item
 * (café → regador → café) não aloca nada depois da primeira vez.
 */
export class HeldSlot {
  private readonly models = new Map<HeldItem, THREE.Group>();
  private current: HeldItem | null = null;

  constructor(private readonly hand: THREE.Object3D) {}

  get item(): HeldItem | null {
    return this.current;
  }

  show(item: HeldItem | null): void {
    if (item === this.current) return;
    if (this.current) this.models.get(this.current)!.visible = false;
    this.current = item;
    if (!item) return;
    let m = this.models.get(item);
    if (!m) {
      m = heldModel(item);
      this.models.set(item, m);
      this.hand.add(m);
    }
    m.visible = true;
  }
}
