import * as THREE from "three";
import type { MesasItem, ObjectType } from "@infinity/world";
import { Builder, C, T, lit, mix, type Mold } from "../../scene/furniture/core.ts";

/**
 * Objetos pessoais da mesa: catálogo próprio de peças pequenas, no mesmo estilo dos móveis (cel
 * shading com cor por vértice). Cada objeto é montado uma vez (geometria e material compartilhados)
 * e desenhado com InstancedMesh por todas as mesas.
 *
 * Referencial: base em y = 0, centrado, frente para +Z (o lado de quem senta).
 */

type Parts = Mold["parts"];

const BUILD: Record<MesasItem, (b: Builder) => void> = {
  caneca(b) {
    // caneca azul-marinho com faixa celeste e café
    b.cyl(C.navy, 0.042, 0.095, 0, 0.0475, 0, { seg: 14 });
    b.cyl(C.sky, 0.0435, 0.02, 0, 0.06, 0, { seg: 14 });
    b.cyl(C.woodDark, 0.035, 0.008, 0, 0.093, 0, { seg: 12 });
    b.torus(C.navy, 0.028, 0.01, 0.045, 0.05, 0, { seg: 10, tseg: 6 });
  },
  vasinho(b) {
    // vaso de barro com três flores rosadas
    b.lathe("#C9774A", [[0, 0], [0.036, 0], [0.046, 0.07], [0.04, 0.07], [0, 0.064]], 0, 0, 0, { seg: 12 });
    b.cyl(C.woodDark, 0.039, 0.006, 0, 0.066, 0, { seg: 12 });
    for (const [x, z, h] of [[0, 0, 0.13], [0.022, 0.012, 0.11], [-0.02, -0.01, 0.115]] as const) {
      b.rod(C.leaf, 0.004, 0, 0.066, 0, x, h, z, { seg: 5 });
      b.sph(C.pink, 0.02, x, h, z, { sy: 0.75, seg: 8 });
      b.sph(C.gold, 0.008, x, h + 0.012, z, { seg: 6 });
    }
    b.sph(C.leafLight, 0.016, 0.024, 0.08, -0.012, { sx: 1.4, sy: 0.5, seg: 6 });
  },
  cacto(b) {
    // cacto num vasinho branco, com um braço e uma florzinha
    b.lathe(C.offwhite, [[0, 0], [0.034, 0], [0.04, 0.055], [0, 0.055]], 0, 0, 0, { seg: 12 });
    b.cyl(C.woodDark, 0.036, 0.005, 0, 0.055, 0, { seg: 10 });
    b.cyl(C.green, 0.022, 0.09, 0, 0.1, 0, { seg: 10 });
    b.sph(C.green, 0.022, 0, 0.145, 0, { seg: 10 });
    b.cyl(C.green, 0.011, 0.04, 0.028, 0.11, 0, { seg: 8 });
    b.cyl(C.green, 0.011, 0.024, 0.02, 0.095, 0, { rz: Math.PI / 2, seg: 8 });
    b.sph(C.green, 0.011, 0.028, 0.13, 0, { seg: 8 });
    b.sph(C.pink, 0.01, 0, 0.168, 0, { seg: 6 });
  },
  "porta-retrato"(b) {
    // moldura de madeira inclinada com uma paisagem (céu, morro e sol)
    b.push(0, 0, 0.01, { rx: -0.22 });
    b.box(C.wood, 0.12, 0.15, 0.016, 0, 0.075, 0, { r: 0.005 });
    b.box(lit("#8FD3F4"), 0.096, 0.07, 0.004, 0, 0.1, 0.009, { r: 0 });
    b.box(lit(C.leafLight), 0.096, 0.056, 0.004, 0, 0.043, 0.009, { r: 0 });
    b.sph(lit(C.gold), 0.012, 0.024, 0.11, 0.011, { sz: 0.3, seg: 8 });
    b.pop();
    b.box(C.woodDark, 0.012, 0.11, 0.012, 0, 0.055, -0.035, { rx: 0.45, r: 0.004 });
  },
  boneco(b) {
    // astronauta de brinquedo: traje branco, capacete com visor escuro e mochila celeste
    b.box(C.offwhite, 0.05, 0.06, 0.036, 0, 0.055, 0, { r: 0.016 });
    for (const s of [-1, 1]) {
      b.box(C.offwhite, 0.02, 0.03, 0.024, s * 0.013, 0.015, 0, { r: 0.008 });
      b.box(C.offwhite, 0.016, 0.04, 0.018, s * 0.034, 0.06, 0, { r: 0.007, rz: s * 0.25 });
    }
    b.sph(C.offwhite, 0.034, 0, 0.115, 0, { seg: 12 });
    b.sph(C.navy, 0.024, 0, 0.117, 0.014, { sy: 0.8, sz: 0.7, seg: 10 });
    b.sph(lit(C.sky), 0.006, -0.008, 0.124, 0.03, { seg: 6 });
    b.box(C.sky, 0.04, 0.045, 0.018, 0, 0.06, -0.025, { r: 0.008 });
    b.box(C.orange, 0.014, 0.008, 0.004, 0.011, 0.07, 0.019, { r: 0 });
  },
  fones(b) {
    // fones de ouvido deitados: duas conchas e o arco
    for (const s of [-1, 1]) {
      b.puck(C.graphite, 0.034, 0.03, s * 0.05, 0, 0, { seg: 14 });
      b.cyl(C.signal, 0.026, 0.006, s * 0.05, 0.032, 0, { seg: 12 });
    }
    b.torus(C.graphite, 0.05, 0.008, 0, 0.022, -0.012, { arc: Math.PI, rx: -Math.PI / 2 + 0.25, seg: 14, tseg: 6 });
  },
  livros(b) {
    // pilha de três livros, um deles mais torto
    const stack: [string, number, number, number][] = [
      [C.navy, 0.15, 0.2, 0],
      [C.orange, 0.14, 0.19, 0.22],
      [C.cream, 0.13, 0.17, -0.12],
    ];
    let y = 0;
    for (const [col, w, d, ry] of stack) {
      const h = 0.026;
      b.at(0, y, 0, { ry }, () => {
        b.box(col, w, h, d, 0, h / 2, 0, { r: 0.004 });
        b.box(C.offwhite, w - 0.01, h * 0.7, 0.008, 0, h / 2, d / 2 - 0.002, { r: 0 });
      });
      y += h;
    }
  },
  cubo(b) {
    // cubo de quebra-cabeça 3x3, peças coloridas nas faces visíveis
    const s = 0.058;
    b.box(C.ink, s, s, s, 0, s / 2, 0, { r: 0.006 });
    const cols = [C.offwhite, C.gold, C.red, C.signal, C.green, C.orange];
    const t = s / 3;
    const f = t * 0.82;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const u = (i - 1) * t;
        const v = (j - 1) * t;
        const k = (i * 3 + j) % cols.length;
        b.box(cols[k]!, f, 0.004, f, u, s + 0.001, v, { r: 0.002 });
        b.box(cols[(k + 2) % cols.length]!, f, f, 0.004, u, s / 2 + v, s / 2 + 0.001, { r: 0.002 });
        b.box(cols[(k + 4) % cols.length]!, 0.004, f, f, s / 2 + 0.001, s / 2 + v, u, { r: 0.002 });
        b.box(cols[(k + 1) % cols.length]!, 0.004, f, f, -s / 2 - 0.001, s / 2 + v, u, { r: 0.002 });
      }
    }
  },
  luminaria(b) {
    // luminária cogumelo: base e haste claras, cúpula acesa em tom quente
    b.puck(C.offwhite, 0.04, 0.016, 0, 0, 0, { seg: 14 });
    b.cyl(C.offwhite, 0.009, 0.09, 0, 0.06, 0, { seg: 8 });
    b.lathe(lit(T.warm), [[0, 0], [0.058, 0], [0.05, 0.03], [0.03, 0.052], [0, 0.058]], 0, 0.1, 0, { seg: 16 });
    b.cyl(lit("#FFF4DC"), 0.052, 0.004, 0, 0.1, 0, { seg: 14 });
  },
  globo(b) {
    // globo terrestre de mesa: oceano celeste, continentes verdes, meridiano dourado
    b.puck(C.woodDark, 0.04, 0.014, 0, 0, 0, { seg: 14 });
    b.cyl(C.gold, 0.006, 0.04, 0, 0.032, 0, { seg: 6 });
    b.push(0, 0.1, 0, { rz: 0.4 });
    b.sph(C.sky, 0.05, 0, 0, 0, { seg: 14 });
    b.sph(C.green, 0.024, 0.03, 0.022, 0.022, { sx: 1.2, sy: 0.8, sz: 0.5, seg: 8 });
    b.sph(C.green, 0.02, -0.032, -0.012, 0.026, { sx: 0.9, sy: 1.4, sz: 0.5, seg: 8 });
    b.sph(C.green, 0.016, -0.01, 0.03, -0.036, { sx: 1.3, sz: 0.6, seg: 8 });
    b.torus(C.gold, 0.058, 0.004, 0, 0, 0, { ry: Math.PI / 2, arc: Math.PI * 1.2, rz: -0.6, seg: 18, tseg: 4 });
    b.pop();
  },
  foguete(b) {
    // foguetinho de coleção num pedestal: corpo claro, janela celeste, aletas vermelhas
    b.puck(C.graphite, 0.034, 0.012, 0, 0, 0, { seg: 12 });
    b.cyl(C.graphite, 0.005, 0.03, 0, 0.026, 0, { seg: 6 });
    b.lathe(C.offwhite, [[0, 0], [0.022, 0], [0.026, 0.05], [0.024, 0.09], [0.014, 0.12], [0, 0.135]], 0, 0.035, 0, { seg: 14 });
    b.cyl(lit(C.sky), 0.01, 0.004, 0, 0.11, 0.024, { rx: Math.PI / 2, seg: 10 });
    b.cyl(C.red, 0.0262, 0.012, 0, 0.12, 0, { rt: 0.022, seg: 14 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box(C.red, 0.004, 0.04, 0.03, Math.sin(a) * 0.026, 0.05, Math.cos(a) * 0.026, { ry: a, r: 0.001 });
    }
    b.cyl(lit("#FFB061"), 0.014, 0.01, 0, 0.03, 0, { rt: 0.02, seg: 10 });
  },
  gatinho(b) {
    // gatinho de pelúcia sentado, caramelo com focinho claro
    const fur = "#D9A25B";
    b.sph(fur, 0.042, 0, 0.042, 0, { sy: 1.05, sz: 0.85, seg: 12 });
    b.sph(fur, 0.034, 0, 0.1, 0.008, { seg: 12 });
    for (const s of [-1, 1]) {
      b.cyl(fur, 0.0005, 0.024, s * 0.02, 0.135, 0.004, { rt: 0.013, rz: -s * 0.25, seg: 4 });
      b.sph(C.ink, 0.0045, s * 0.012, 0.106, 0.038, { seg: 6 });
      b.sph(C.cream, 0.012, s * 0.02, 0.012, 0.03, { seg: 8 });
    }
    b.sph(C.cream, 0.014, 0, 0.09, 0.034, { sy: 0.7, seg: 8 });
    b.sph(C.pink, 0.004, 0, 0.097, 0.044, { seg: 5 });
    b.rod(fur, 0.009, 0.03, 0.012, -0.03, 0.055, 0.06, -0.04, { seg: 6 });
  },
};

const cache = new Map<string, Parts>();

/** Geometria e material de um objeto (montados uma vez e compartilhados: não descartar). */
export function itemParts(item: MesasItem): Parts {
  let p = cache.get(item);
  if (!p) {
    const b = new Builder();
    BUILD[item](b);
    p = b.finish().parts;
    cache.set(item, p);
  }
  return p;
}

/**
 * Plaquinha da mesa (ocupada ou fixa): bloquinho de mesa com a frente inclinada.
 * `face` recebe a cor da instância; `base` fica escura.
 */
export function plateParts(): { face: Parts; base: Parts } {
  let face = cache.get("@placa-face");
  let base = cache.get("@placa-base");
  if (!face || !base) {
    const bf = new Builder();
    // duas faces inclinadas que se encontram no alto (cavalete), legível dos dois lados
    bf.box(C.offwhite, 0.17, 0.066, 0.01, 0, 0.044, 0.011, { rx: -0.32, r: 0.003 });
    bf.box(C.offwhite, 0.17, 0.066, 0.01, 0, 0.044, -0.011, { rx: 0.32, r: 0.003 });
    face = bf.finish().parts;
    const bb = new Builder();
    bb.box(C.graphite, 0.18, 0.012, 0.05, 0, 0.006, 0, { r: 0.004 });
    // filete escuro no meio da face (lembra um nome escrito, legível como "plaquinha" no pixel art)
    bb.box(mix(C.graphite, C.navy, 0.5), 0.11, 0.012, 0.004, 0, 0.046, 0.0175, { rx: -0.32, r: 0 });
    bb.box(mix(C.graphite, C.navy, 0.5), 0.11, 0.012, 0.004, 0, 0.046, -0.0175, { rx: 0.32, r: 0 });
    base = bb.finish().parts;
    cache.set("@placa-face", face);
    cache.set("@placa-base", base);
  }
  return { face, base };
}

/**
 * Bilhete (só no cliente da dona): papel dobrado sobre a mesa quando há recado novo.
 */
export function noteParts(): Parts {
  let p = cache.get("@bilhete");
  if (!p) {
    const b = new Builder();
    b.box(C.gold, 0.09, 0.004, 0.09, 0, 0.002, 0, { ry: 0.3, r: 0 });
    b.box(mix(C.gold, C.offwhite, 0.35), 0.09, 0.004, 0.04, 0.008, 0.012, -0.02, { ry: 0.3, rx: 0.5, r: 0 });
    p = b.finish().parts;
    cache.set("@bilhete", p);
  }
  return p;
}

/** Escala dos objetos: um pouco maior que o real (como os itens na mão), para ler no pixel art do 2D. */
export const ITEM_SCALE = 1.45;

export interface DeskLayout {
  /** Altura do tampo. */
  h: number;
  /** Lugares dos três objetos: [x, z, giro] no referencial da mesa (frente +Z = quem senta). */
  slots: [number, number, number][];
  /** Plaquinha: [x, z, giro]. */
  plate: [number, number, number];
  /** Bilhete de recado novo. */
  note: [number, number];
}

/**
 * Onde cada tipo de mesa tem espaço livre (sem bater no monitor, teclado, caneca e papéis do modelo).
 * Medidas tiradas de scene/furniture/work.ts.
 */
export const LAYOUT: Partial<Record<ObjectType, DeskLayout>> = {
  desk: {
    h: 0.75,
    slots: [
      [-0.56, -0.17, 0.5],
      [0.57, 0.17, -0.5],
      [0.31, -0.28, -0.2],
    ],
    plate: [-0.55, 0.29, 0.15],
    note: [0.08, 0.28],
  },
  "desk-dual": {
    h: 0.75,
    slots: [
      [-0.52, 0.2, 0.5],
      [0.7, -0.03, -0.5],
      [-0.6, -0.04, 0.3],
    ],
    plate: [0.62, 0.3, -0.2],
    note: [0.12, 0.3],
  },
  "standing-desk": {
    h: 1.05,
    slots: [
      [-0.46, 0.15, 0.5],
      [0.52, 0.05, -0.5],
      [-0.3, -0.25, 0.2],
    ],
    plate: [0.45, 0.28, -0.15],
    note: [0.05, 0.25],
  },
  "exec-desk": {
    h: 0.76,
    slots: [
      [-0.82, -0.05, 0.5],
      [0.8, 0.05, -0.5],
      [-0.3, -0.31, 0.2],
    ],
    plate: [0.62, 0.37, -0.15],
    note: [-0.25, 0.38],
  },
};

const FALLBACK: DeskLayout = { h: 0.75, slots: [[-0.5, -0.15, 0.4], [0.5, 0.15, -0.4], [0.3, -0.25, 0]], plate: [-0.3, -0.28, 0], note: [0, 0.25] };

export function layoutOf(type: ObjectType): DeskLayout {
  return LAYOUT[type] ?? FALLBACK;
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Matriz local (no referencial da mesa) de um ponto do tampo, girado e escalado. */
export function localOn(x: number, y: number, z: number, ry: number, scale: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  return out.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, ry), _s.setScalar(scale));
}
