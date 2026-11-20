#!/usr/bin/env node
/**
 * Monta `apps/web/public/avatar/kit.glb` a partir do pacote Kenney Mini Characters 2.0 (CC0,
 * https://kenney.nl/assets/mini-characters).
 *
 * Todos os personagens do pacote usam o mesmo esqueleto de 7 ossos, então dá para recortar cada
 * peça (cabelo, tronco, mangas, calça, sapato, boné...) de um personagem e vestir em qualquer outro.
 * O kit guarda um esqueleto, as animações que o Space usa e as peças já recortadas. Cada peça é uma
 * malha com um primitivo por papel de cor (skin, hair, top, top2, bottom, shoes, acc, fixed); o
 * `extras` do primitivo diz a peça e o papel. Nos papéis tingidos, COLOR_0 guarda só o sombreado
 * relativo (cinza; 1 = cor escolhida pela pessoa); em `fixed`, a cor de verdade (linear).
 *
 * Só roda na máquina de quem desenvolve, com o pacote baixado do site da Kenney:
 *   node scripts/avatar-kit.mjs "<pasta Models/GLB format do pacote>"
 * O arquivo baixado é dado, não código: este script só lê GLB e PNG, nada de dentro dele é executado.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) {
  console.error('Uso: node scripts/avatar-kit.mjs "<pasta Models/GLB format do Kenney Mini Characters>"');
  process.exit(1);
}
const OUT = join(root, "apps/web/public/avatar/kit.glb");

// ---------- leitura de GLB e PNG ----------

function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`não é GLB: ${path}`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const binAt = 20 + jsonLen;
  const bin = b.subarray(binAt + 8, binAt + 8 + b.readUInt32LE(binAt));
  return { json, bin };
}

const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READ = {
  5120: ["getInt8", 1, 127],
  5121: ["getUint8", 1, 255],
  5122: ["getInt16", 2, 32767],
  5123: ["getUint16", 2, 65535],
  5125: ["getUint32", 4, 0],
  5126: ["getFloat32", 4, 0],
};

/** Lê um accessor como Float64Array plano (count * componentes). */
function accessor(g, i) {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const n = NCOMP[a.type];
  const [fn, size, max] = READ[a.componentType];
  const stride = bv.byteStride || size * n;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++)
    for (let c = 0; c < n; c++) {
      const v = dv[fn](k * stride + c * size, true);
      out[k * n + c] = a.normalized && max ? Math.max(v / max, -1) : v;
    }
  return out;
}

function readPng(path) {
  const b = readFileSync(path);
  let w = 0, h = 0, type = 0;
  const idat = [];
  for (let at = 8; at < b.length; ) {
    const len = b.readUInt32BE(at);
    const kind = b.toString("ascii", at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("PNG fora do esperado (8 bits, sem entrelaçamento)");
      type = data[9];
    } else if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type];
  if (!bpp) throw new Error(`PNG com tipo de cor ${type} não suportado`);
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * bpp);
  const row = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)];
    for (let x = 0; x < row; x++) {
      const v = raw[y * (row + 1) + 1 + x];
      const a = x >= bpp ? px[y * row + x - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * row + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * row + x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = up;
      else if (f === 3) p = (a + up) >> 1;
      else if (f === 4) {
        const e = a + up - c, pa = Math.abs(e - a), pb = Math.abs(e - up), pc = Math.abs(e - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      px[y * row + x] = (v + p) & 255;
    }
  }
  return { w, h, bpp, px };
}

// ---------- cores ----------

const tex = readPng(join(SRC, "Textures", "colormap.png"));
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Cor linear do texel na coordenada UV (origem no topo, como no glTF). */
function texel(u, v) {
  const x = Math.min(tex.w - 1, Math.max(0, Math.floor(u * tex.w)));
  const y = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h)));
  const i = (y * tex.w + x) * tex.bpp;
  return [lin(tex.px[i] / 255), lin(tex.px[i + 1] / 255), lin(tex.px[i + 2] / 255)];
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** A paleta da Kenney é uma grade de 16x4 amostras (32x128 px); a de índice ímpar é um degradê vertical. */
const swatchOf = (u, v) => Math.floor(Math.min(0.999, v) * 4) * 16 + Math.floor(Math.min(0.999, u) * 16);
const swatchCenter = (s) => texel(((s % 16) + 0.5) / 16, (Math.floor(s / 16) + 0.5) / 4);
const hexLin = (hex) => [1, 3, 5].map((k) => lin(parseInt(hex.slice(k, k + 2), 16) / 255));

// ---------- esqueleto (igual em todos os personagens) ----------

const BONES = ["root", "leg-left", "leg-right", "torso", "arm-left", "arm-right", "head"];
const PARENT = [-1, 0, 0, 0, 3, 3, 3];
const base = readGlb(join(SRC, "character-male-d.glb"));
const nodeByName = new Map(base.json.nodes.map((n, i) => [n.name, i]));
const T = BONES.map((b) => base.json.nodes[nodeByName.get(b)].translation ?? [0, 0, 0]);
const BIND = T.map((_, i) => {
  const w = [0, 0, 0];
  for (let k = i; k >= 0; k = PARENT[k]) for (let c = 0; c < 3; c++) w[c] += T[k][c];
  return w;
});

// ---------- peças ----------

/** Olhos e boca desenhados na geometria: o Space desenha o rosto numa textura (expressões). */
const isFace = (c) => Math.abs(c[2] - 0.16) < 0.002 && Math.abs(c[0]) < 0.125 && c[1] > 0.39 && c[1] < 0.53;
const ARMS = ["arm-left", "arm-right"];
const LEGS = ["leg-left", "leg-right"];
/** Encolhe/estica em volta do eixo de cada perna, para a bota vestir por fora da calça. */
const legScale = (k) => (p) => {
  const cx = p[0] > 0 ? 0.083 : -0.083;
  return [cx + (p[0] - cx) * k, p[1], -0.024 + (p[2] + 0.024) * k];
};
/** Cinto esticado para baixo e aberto em sino: vira saia. */
const skirt = (p) => {
  const y = 0.215 - (0.215 - p[1]) * 3;
  const k = 1 + (0.215 - y) * 0.9;
  return [p[0] * k, y, -0.029 + (p[2] + 0.029) * k];
};

/**
 * Cada peça junta partes de personagens do pacote: `src` (personagem), `mesh` (body/head), `bones`
 * (filtro por osso), `sw` (amostras da paleta), `role` e `mult` (sombreado extra), `where` (filtro
 * pelo centro do triângulo) e `xform` (ajuste de posição). `glb` lê um modelo solto (óculos) e o
 * prende na cabeça em `at` (o deslocamento que põe os óculos do pacote onde o male-e os usa). `box` gera caixas simples [cx, cy, cz, lx, ly, lz] presas ao osso `bone`.
 */
const PIECES = {
  head: [{ src: "male-d", mesh: "head", sw: [37], role: "skin" }],

  // Cabelos.
  "hair-crop": [{ src: "male-d", mesh: "head", sw: [33], role: "hair" }],
  "hair-short": [{ src: "male-f", mesh: "head", sw: [55], role: "hair", where: (c) => !isFace(c) }],
  "hair-quiff": [{ src: "male-e", mesh: "head", sw: [35], role: "hair" }],
  /** Moicano: só a faixa do meio do espetado. */
  "hair-mohawk": [{ src: "male-d", mesh: "head", sw: [33], role: "hair", where: (c) => Math.abs(c[0]) < 0.07 }],
  "hair-flat": [{ src: "male-g", mesh: "head", sw: [51], role: "hair", where: (c) => !(c[1] < 0.39 || (c[1] < 0.456 && c[2] > 0.1)) }],
  "hair-knot": [{ src: "female-e", mesh: "head", sw: [55], role: "hair", where: (c) => !isFace(c) }],
  "hair-long": [{ src: "female-f", mesh: "head", sw: [35, 33], role: "hair" }],
  "hair-bun": [{ src: "female-d", mesh: "head", sw: [33], role: "hair" }],
  "hair-band": [
    { src: "female-c", mesh: "head", sw: [51], role: "hair" },
    { src: "female-c", mesh: "head", sw: [47], role: "fixed" },
  ],
  // O pacote não tem black power nem tranças: blocos no mesmo traço, sobre o cabelo curto.
  // Black power: volume acima da testa e atrás das orelhas (orelha, brinco, óculos e conchas do fone ficam à mostra).
  "hair-afro": [
    { src: "male-f", mesh: "head", sw: [55], role: "hair", where: (c) => !isFace(c) },
    { box: [[0, 0.675, -0.025, 0.45, 0.19, 0.39], [0, 0.785, -0.025, 0.36, 0.03, 0.31], [0, 0.5, -0.15, 0.43, 0.2, 0.16]], bone: "head", role: "hair" },
  ],
  // Tranças: uma de cada lado, atrás da orelha, até o ombro (por trás das mangas).
  "hair-braids": [
    { src: "male-f", mesh: "head", sw: [55], role: "hair", where: (c) => !isFace(c) },
    {
      box: [-1, 1].flatMap((s) => [
        [s * 0.185, 0.5, -0.15, 0.075, 0.11, 0.07],
        [s * 0.19, 0.39, -0.15, 0.068, 0.11, 0.064],
        [s * 0.195, 0.28, -0.15, 0.06, 0.11, 0.058],
      ]),
      bone: "head",
      role: "hair",
    },
    { box: [[-0.195, 0.205, -0.15, 0.05, 0.04, 0.05], [0.195, 0.205, -0.15, 0.05, 0.04, 0.05]], bone: "head", role: "acc" },
  ],
  /** Cabelo que aparece por baixo do boné e do gorro. */
  // sem o bigode que o male-c traz na mesma cor do cabelo (barba é escolha à parte)
  "hair-cap": [{ src: "male-c", mesh: "head", sw: [33], role: "hair", where: (c) => !(c[2] > 0.15 && c[1] < 0.47) }],
  "hair-beanie": [{ src: "soldier", mesh: "head", sw: [35], role: "hair" }],
  beard: [
    { src: "male-b", mesh: "head", sw: [33], role: "hair" },
    { src: "male-b", mesh: "head", sw: [35], role: "hair", mult: 0.7 },
  ],

  // Troncos (só o osso do tronco) e mangas (ossos dos braços).
  "torso-tee": [
    { src: "male-a", mesh: "body", bones: ["torso"], sw: [41], role: "top" },
    { src: "male-a", mesh: "body", bones: ["torso"], sw: [34], role: "skin" },
  ],
  "torso-hoodie": [
    { src: "soldier", mesh: "body", bones: ["torso"], sw: [41], role: "top" },
    { src: "soldier", mesh: "body", bones: ["torso"], sw: [53], role: "top2" },
    { src: "soldier", mesh: "body", bones: ["torso"], sw: [36], role: "skin" },
  ],
  "torso-blazer": [
    { src: "male-d", mesh: "body", bones: ["torso"], sw: [55], role: "top" },
    { src: "male-d", mesh: "body", bones: ["torso"], sw: [63], role: "top2" },
    { src: "male-d", mesh: "body", bones: ["torso"], sw: [47], role: "fixed" },
  ],
  "torso-polo": [
    { src: "female-c", mesh: "body", bones: ["torso"], sw: [17], role: "top" },
    { src: "female-c", mesh: "body", bones: ["torso"], sw: [63], role: "top2" },
    { src: "female-c", mesh: "body", bones: ["torso"], sw: [32], role: "skin" },
  ],
  "torso-vest": [
    { src: "male-g", mesh: "body", bones: ["torso"], sw: [33], role: "top" },
    { src: "male-g", mesh: "body", bones: ["torso"], sw: [53], role: "top2" },
  ],
  "torso-coat": [
    { src: "female-e", mesh: "body", bones: ["torso"], sw: [63], role: "top" },
    { src: "female-e", mesh: "body", bones: ["torso"], sw: [53], role: "top2" },
    { src: "female-e", mesh: "body", bones: ["torso"], sw: [33], role: "top2", mult: 0.8 },
  ],
  "arms-short": [
    { src: "male-a", mesh: "body", bones: ARMS, sw: [41], role: "top" },
    { src: "male-a", mesh: "body", bones: ARMS, sw: [35], role: "skin" },
  ],
  "arms-long": [
    { src: "male-b", mesh: "body", bones: ARMS, sw: [47], role: "top" },
    { src: "male-b", mesh: "body", bones: ARMS, sw: [37], role: "skin" },
  ],
  "arms-cuff": [
    { src: "male-d", mesh: "body", bones: ARMS, sw: [55], role: "top" },
    { src: "male-d", mesh: "body", bones: ARMS, sw: [63], role: "top2" },
    { src: "male-d", mesh: "body", bones: ARMS, sw: [37], role: "skin" },
  ],

  // Cintura, pernas e sapatos.
  waist: [{ src: "male-a", mesh: "body", bones: ["torso"], sw: [33], role: "bottom", mult: 0.8 }],
  skirt: [{ src: "male-a", mesh: "body", bones: ["torso"], sw: [33], role: "bottom", xform: skirt }],
  "legs-pants": [{ src: "male-b", mesh: "body", bones: LEGS, sw: [17], role: "bottom" }],
  "legs-shorts": [
    { src: "male-a", mesh: "body", bones: LEGS, sw: [17], role: "bottom" },
    { src: "male-a", mesh: "body", bones: LEGS, sw: [35], role: "skin" },
  ],
  "legs-jogger": [
    { src: "male-e", mesh: "body", bones: LEGS, sw: [49], role: "bottom" },
    { src: "male-e", mesh: "body", bones: LEGS, sw: [63], role: "bottom", mult: 0.85 },
  ],
  "legs-bare": [{ src: "male-a", mesh: "body", bones: LEGS, sw: [17, 35], role: "skin" }],
  "shoes-sneaker": [
    { src: "male-a", mesh: "body", bones: LEGS, sw: [49], role: "shoes" },
    { src: "male-a", mesh: "body", bones: LEGS, sw: [63], role: "fixed" },
  ],
  "shoes-boot": [
    { src: "raider", mesh: "body", bones: LEGS, sw: [35], role: "shoes", xform: legScale(1.04) },
    { src: "raider", mesh: "body", bones: LEGS, sw: [33], role: "shoes", mult: 0.55 },
  ],
  "shoes-social": [
    { src: "male-b", mesh: "body", bones: LEGS, sw: [33], role: "shoes" },
    { src: "male-b", mesh: "body", bones: LEGS, sw: [37], role: "shoes", mult: 0.6 },
  ],

  // Acessórios.
  // Óculos sem lente (as lentes do pacote são opacas e esconderiam os olhos e as expressões).
  glasses: [{ glb: "aid-glasses", at: [0, 0.436, 0.078], sw: [53], role: "acc" }],
  "glasses-square": [
    {
      box: [-1, 1].flatMap((s) => [
        [s * 0.072, 0.522, 0.168, 0.104, 0.014, 0.012],
        [s * 0.072, 0.444, 0.168, 0.104, 0.014, 0.012],
        [s * 0.026, 0.483, 0.168, 0.014, 0.092, 0.012],
        [s * 0.118, 0.483, 0.168, 0.014, 0.092, 0.012],
        [s * 0.172, 0.505, 0.08, 0.012, 0.014, 0.18],
      ]),
      bone: "head",
      role: "acc",
    },
  ],
  sunglasses: [{ glb: "aid-sunglasses", at: [0, 0.436, 0.078], role: "fixed" }],
  cap: [
    { src: "male-c", mesh: "head", sw: [17], role: "acc" },
    { src: "male-c", mesh: "head", sw: [55], role: "acc", mult: 0.55, where: (c) => !isFace(c) },
  ],
  beanie: [
    { src: "soldier", mesh: "head", sw: [41], role: "acc" },
    { src: "soldier", mesh: "head", sw: [33], role: "acc", mult: 0.7 },
  ],
  earrings: [{ src: "female-d", mesh: "head", sw: [63], role: "acc" }],
  backpack: [
    { src: "female-f", mesh: "body", bones: ["torso"], sw: [49], role: "acc" },
    { src: "female-f", mesh: "body", bones: ["torso"], sw: [53], role: "acc", mult: 0.7 },
  ],
  headphones: [
    // Conchas sobre as orelhas, hastes e arco por cima do cabelo mais alto (o coque fica atrás).
    { box: [[0.232, 0.47, -0.01, 0.05, 0.13, 0.12], [-0.232, 0.47, -0.01, 0.05, 0.13, 0.12]], bone: "head", role: "acc" },
    { box: [[0.215, 0.6, -0.01, 0.03, 0.17, 0.04], [-0.215, 0.6, -0.01, 0.03, 0.17, 0.04], [0, 0.7, -0.01, 0.46, 0.035, 0.04]], bone: "head", role: "acc", mult: 0.6 },
  ],
  watch: [
    { box: [[0.312, 0.288, 0.036, 0.022, 0.124, 0.154]], bone: "arm-left", role: "acc" },
    { box: [[0.312, 0.288, 0.115, 0.03, 0.05, 0.008]], bone: "arm-left", role: "fixed", color: "#C9D3DD" },
  ],
  /** Crachá Infinity no peito (frente da camiseta em z = 0,08; o app empurra conforme a roupa). */
  badge: [
    { box: [[0.055, 0.31, 0.083, 0.012, 0.07, 0.006]], bone: "torso", role: "fixed", color: "#0A2547" },
    { box: [[0.055, 0.245, 0.085, 0.07, 0.075, 0.008]], bone: "torso", role: "fixed", color: "#F2F0EF" },
    { box: [[0.055, 0.268, 0.0895, 0.07, 0.018, 0.002]], bone: "torso", role: "fixed", color: "#00B7FF" },
  ],
};

const ROLES = ["skin", "hair", "top", "top2", "bottom", "shoes", "acc", "fixed"];

/** Malha de um personagem: posições, normais, UV, osso de cada vértice e índices. */
const cache = new Map();
function source(name, mesh) {
  const key = `${name}/${mesh}`;
  if (cache.has(key)) return cache.get(key);
  const g = readGlb(join(SRC, `character-${name}.glb`));
  const m = g.json.meshes.find((x) => x.name === `${mesh}-mesh`);
  if (!m) throw new Error(`${name} sem ${mesh}-mesh`);
  const pr = m.primitives[0];
  const skin = g.json.skins[g.json.nodes.find((n) => n.mesh === g.json.meshes.indexOf(m)).skin];
  const jointName = skin.joints.map((j) => g.json.nodes[j].name);
  const J = accessor(g, pr.attributes.JOINTS_0), W = accessor(g, pr.attributes.WEIGHTS_0);
  const n = J.length / 4;
  const bone = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    let best = 0;
    for (let c = 1; c < 4; c++) if (W[k * 4 + c] > W[k * 4 + best]) best = c;
    bone[k] = BONES.indexOf(jointName[J[k * 4 + best]]);
  }
  const out = { pos: accessor(g, pr.attributes.POSITION), nrm: accessor(g, pr.attributes.NORMAL), uv: accessor(g, pr.attributes.TEXCOORD_0), bone, idx: accessor(g, pr.indices) };
  cache.set(key, out);
  return out;
}

/** Modelo solto (sem esqueleto), preso à cabeça. */
function looseSource(name, at) {
  const g = readGlb(join(SRC, `${name}.glb`));
  const pr = g.json.meshes[0].primitives[0];
  const pos = accessor(g, pr.attributes.POSITION);
  for (let k = 0; k < pos.length; k += 3) for (let c = 0; c < 3; c++) pos[k + c] += at[c];
  return { pos, nrm: accessor(g, pr.attributes.NORMAL), uv: accessor(g, pr.attributes.TEXCOORD_0), bone: new Int8Array(pos.length / 3).fill(BONES.indexOf("head")), idx: accessor(g, pr.indices) };
}

function boxes(list, bone) {
  const pos = [], nrm = [], idx = [];
  const FACES = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [cx, cy, cz, lx, ly, lz] of list) {
    const h = [lx / 2, ly / 2, lz / 2];
    for (const [n, a, b] of FACES) {
      const v0 = pos.length / 3;
      for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [cx, cy, cz];
        for (let c = 0; c < 3; c++) p[c] += (n[c] + a[c] * sa + b[c] * sb) * h[c];
        pos.push(...p);
        nrm.push(...n);
      }
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    }
  }
  return { pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), uv: null, bone: new Int8Array(pos.length / 3).fill(BONES.indexOf(bone)), idx: Float64Array.from(idx) };
}

/** Recorta uma parte: triângulos que passam nos filtros, com cor/sombreado por vértice. */
function cut(part) {
  const s = part.box ? boxes(part.box, part.bone) : part.glb ? looseSource(part.glb, part.at) : source(part.src, part.mesh);
  const boneOk = part.bones ? new Set(part.bones.map((b) => BONES.indexOf(b))) : null;
  const remap = new Map();
  const out = { pos: [], nrm: [], col: [], bone: [], idx: [] };
  const fixed = part.color ? hexLin(part.color) : null;
  for (let t = 0; t < s.idx.length; t += 3) {
    const tri = [s.idx[t], s.idx[t + 1], s.idx[t + 2]];
    const c = [0, 1, 2].map((k) => (s.pos[tri[0] * 3 + k] + s.pos[tri[1] * 3 + k] + s.pos[tri[2] * 3 + k]) / 3);
    if (s.uv) {
      const u = (s.uv[tri[0] * 2] + s.uv[tri[1] * 2] + s.uv[tri[2] * 2]) / 3;
      const v = (s.uv[tri[0] * 2 + 1] + s.uv[tri[1] * 2 + 1] + s.uv[tri[2] * 2 + 1]) / 3;
      const sw = swatchOf(u, v);
      if (part.sw && !part.sw.includes(sw)) continue;
    }
    if (boneOk && !tri.every((i) => boneOk.has(s.bone[i]))) continue;
    if (part.where && !part.where(c)) continue;
    for (const i of tri) {
      if (!remap.has(i)) {
        remap.set(i, out.bone.length);
        const p = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]];
        out.pos.push(...(part.xform ? part.xform(p) : p));
        out.nrm.push(s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]);
        out.bone.push(s.bone[i]);
        let col;
        if (fixed) col = fixed;
        else if (!s.uv) col = [part.mult ?? 1, part.mult ?? 1, part.mult ?? 1];
        else {
          const u = s.uv[i * 2], v = s.uv[i * 2 + 1];
          const tx = texel(u, v);
          if (part.role === "fixed") col = tx;
          else {
            const ref = lum(swatchCenter(swatchOf(u, v)));
            const k = Math.min(1.4, Math.max(0.6, ref > 0 ? lum(tx) / ref : 1)) * (part.mult ?? 1);
            col = [k, k, k];
          }
        }
        out.col.push(...col);
      }
      out.idx.push(remap.get(i));
    }
  }
  if (!out.idx.length) throw new Error(`parte vazia: ${JSON.stringify({ ...part, where: !!part.where, xform: !!part.xform })}`);
  return out;
}

// ---------- montagem do GLB ----------

const gltf = {
  asset: { version: "2.0", generator: "infinity-space scripts/avatar-kit.mjs (Kenney Mini Characters 2.0, CC0)" },
  scene: 0,
  scenes: [{ name: "avatar-kit", nodes: [0] }],
  nodes: [{ name: "avatar-kit", children: [1] }],
  meshes: [],
  materials: ROLES.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } })),
  skins: [],
  animations: [],
  accessors: [],
  bufferViews: [],
  buffers: [{ byteLength: 0 }],
};
const chunks = [];
let binLen = 0;
function addView(bytes, target) {
  const pad = (4 - (binLen % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad)), (binLen += pad);
  gltf.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  binLen += bytes.byteLength;
  return gltf.bufferViews.length - 1;
}
function addAccessor(arr, type, componentType, opts = {}) {
  const n = NCOMP[type];
  const acc = { bufferView: addView(arr, opts.target), componentType, count: arr.length / n, type };
  if (opts.normalized) acc.normalized = true;
  if (opts.minmax) {
    acc.min = Array.from({ length: n }, (_, c) => Math.min(...arr.filter((_, k) => k % n === c)));
    acc.max = Array.from({ length: n }, (_, c) => Math.max(...arr.filter((_, k) => k % n === c)));
  }
  gltf.accessors.push(acc);
  return gltf.accessors.length - 1;
}

// Ossos: nó 1 = root, na mesma pose de repouso do pacote.
BONES.forEach((name, i) => {
  const node = { name, translation: T[i] };
  const kids = BONES.map((_, k) => k).filter((k) => PARENT[k] === i);
  if (kids.length) node.children = kids.map((k) => k + 1);
  gltf.nodes.push(node);
});
const ibm = new Float32Array(BONES.length * 16);
BIND.forEach((w, i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16);
});
gltf.skins.push({ joints: BONES.map((_, i) => i + 1), inverseBindMatrices: addAccessor(ibm, "MAT4", 5126) });

let verts = 0;
for (const [piece, parts] of Object.entries(PIECES)) {
  const byRole = new Map();
  for (const part of parts) {
    const c = cut(part);
    const acc = byRole.get(part.role) ?? { pos: [], nrm: [], col: [], bone: [], idx: [] };
    const off = acc.bone.length;
    acc.pos.push(...c.pos);
    acc.nrm.push(...c.nrm);
    acc.col.push(...c.col);
    acc.bone.push(...c.bone);
    acc.idx.push(...c.idx.map((i) => i + off));
    byRole.set(part.role, acc);
  }
  const primitives = [];
  for (const [role, m] of byRole) {
    const n = m.bone.length;
    verts += n;
    const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) (joints[k * 4] = m.bone[k]), (weights[k * 4] = 255);
    primitives.push({
      attributes: {
        POSITION: addAccessor(Float32Array.from(m.pos), "VEC3", 5126, { minmax: true, target: 34962 }),
        NORMAL: addAccessor(Float32Array.from(m.nrm), "VEC3", 5126, { target: 34962 }),
        COLOR_0: addAccessor(Float32Array.from(m.col), "VEC3", 5126, { target: 34962 }),
        JOINTS_0: addAccessor(joints, "VEC4", 5121, { target: 34962 }),
        WEIGHTS_0: addAccessor(weights, "VEC4", 5121, { normalized: true, target: 34962 }),
      },
      indices: addAccessor(Uint16Array.from(m.idx), "SCALAR", 5123, { target: 34963 }),
      material: ROLES.indexOf(role),
      extras: { piece, role },
    });
  }
  gltf.meshes.push({ name: piece, primitives });
  // nome do nó diferente do osso ("head" é osso e peça): o GLTFLoader renomearia um dos dois
  gltf.nodes.push({ name: `peca-${piece}`, mesh: gltf.meshes.length - 1, skin: 0 });
  gltf.nodes[0].children.push(gltf.nodes.length - 1);
}

// Animações: as do pacote que o Space usa; o resto (andar de cadeira de rodas, ataques...) fica de fora.
const CLIPS = ["idle", "walk", "sprint", "sit"];
for (const name of CLIPS) {
  const a = base.json.animations.find((x) => x.name === name);
  if (!a) throw new Error(`animação ${name} não encontrada`);
  const samplers = [], channels = [];
  for (const ch of a.channels) {
    const bone = BONES.indexOf(base.json.nodes[ch.target.node].name);
    if (bone < 0 || ch.target.path === "scale") continue;
    const s = a.samplers[ch.sampler];
    const input = Float32Array.from(accessor(base, s.input));
    samplers.push({
      input: addAccessor(input, "SCALAR", 5126, { minmax: true }),
      output: addAccessor(Float32Array.from(accessor(base, s.output)), ch.target.path === "rotation" ? "VEC4" : "VEC3", 5126),
      interpolation: s.interpolation ?? "LINEAR",
    });
    channels.push({ sampler: samplers.length - 1, target: { node: bone + 1, path: ch.target.path } });
  }
  gltf.animations.push({ name, samplers, channels });
}

const bin = Buffer.concat(chunks);
gltf.buffers[0].byteLength = bin.length;
let json = Buffer.from(JSON.stringify(gltf), "utf8");
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPad.length, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(binPad.length, 0x004e4942), binPad]));
console.log(`kit.glb: ${Object.keys(PIECES).length} peças, ${verts} vértices, ${CLIPS.length} animações, ${(12 + 16 + json.length + binPad.length) / 1024 | 0} KB`);
