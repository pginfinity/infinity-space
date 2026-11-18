import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FloorStyle, MapDef } from "@infinity/world";
import { lit } from "./materials.ts";

/**
 * Pisos com textura desenhada em canvas (carpete, tábuas, ladrilho, mármore, neon).
 * As UVs vêm das coordenadas do mundo, então o padrão é contínuo entre salas vizinhas do mesmo piso.
 */

interface FloorSpec {
  /** Quantos metros um ladrilho da textura cobre. */
  meters: number;
  draw(g: CanvasRenderingContext2D, s: number): void;
  emissive?: boolean;
}

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function speckle(g: CanvasRenderingContext2D, s: number, color: string, n: number, alpha: number, seed: number): void {
  const r = rnd(seed);
  g.fillStyle = color;
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) g.fillRect(r() * s, r() * s, 2, 2);
  g.globalAlpha = 1;
}

function grid(g: CanvasRenderingContext2D, s: number, cells: number, color: string, width: number, alpha = 1): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.globalAlpha = alpha;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * s;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, s);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(s, p);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function planks(g: CanvasRenderingContext2D, s: number, base: string, dark: string, light: string, seed: number): void {
  const r = rnd(seed);
  const rows = 8;
  const h = s / rows;
  for (let i = 0; i < rows; i++) {
    const offset = r() * s;
    g.fillStyle = r() > 0.5 ? base : light;
    g.fillRect(0, i * h, s, h);
    g.fillStyle = dark;
    g.fillRect(0, i * h, s, 2);
    for (let k = 0; k < 2; k++) g.fillRect((offset + k * s * 0.55) % s, i * h, 2, h);
    // Veios.
    g.globalAlpha = 0.18;
    for (let k = 0; k < 3; k++) g.fillRect(r() * s, i * h + 3 + r() * (h - 6), s * 0.3, 1);
    g.globalAlpha = 1;
  }
}

const SPECS: Record<FloorStyle, FloorSpec> = {
  "carpet-navy": { meters: 2, draw: (g, s) => (fill(g, s, "#1C3156"), speckle(g, s, "#2A4570", 900, 0.5, 3), grid(g, s, 4, "#16284A", 2, 0.6)) },
  "carpet-graphite": { meters: 2, draw: (g, s) => (fill(g, s, "#2B303A"), speckle(g, s, "#3A414E", 900, 0.5, 5), grid(g, s, 4, "#232831", 2, 0.6)) },
  "carpet-warm": { meters: 2, draw: (g, s) => (fill(g, s, "#7B5148"), speckle(g, s, "#8E6257", 900, 0.5, 7), grid(g, s, 4, "#6A443C", 2, 0.5)) },
  "wood-light": { meters: 2, draw: (g, s) => planks(g, s, "#D6B68A", "#B8946A", "#DDBF95", 11) },
  "wood-warm": { meters: 2, draw: (g, s) => planks(g, s, "#A5734C", "#7E5537", "#AE7C54", 13) },
  "tile-white": { meters: 1.2, draw: (g, s) => (fill(g, s, "#E9E6E1"), speckle(g, s, "#D9D5CF", 300, 0.6, 17), grid(g, s, 2, "#CFCAC3", 3)) },
  "tile-dark": { meters: 1.2, draw: (g, s) => (fill(g, s, "#1D2533"), speckle(g, s, "#253042", 300, 0.6, 19), grid(g, s, 2, "#2E3A50", 3)) },
  concrete: { meters: 3, draw: (g, s) => (fill(g, s, "#9AA1AB"), speckle(g, s, "#8A919B", 1500, 0.5, 23)) },
  "neon-grid": { meters: 2, draw: (g, s) => (fill(g, s, "#16102B"), grid(g, s, 4, "#9B8CFF", 3, 0.85)), emissive: true },
  marble: {
    meters: 3,
    draw: (g, s) => {
      fill(g, s, "#E4DED6");
      const r = rnd(29);
      g.strokeStyle = "#CFC8C0";
      g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        let x = r() * s;
        let y = 0;
        g.moveTo(x, y);
        while (y < s) {
          x += (r() - 0.5) * 30;
          y += 12 + r() * 20;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      grid(g, s, 2, "#E0DAD3", 2);
    },
  },
  stage: { meters: 2, draw: (g, s) => planks(g, s, "#3E2C24", "#2A1D18", "#46332A", 31) },
  line: { meters: 1, draw: (g, s) => fill(g, s, "#00B7FF"), emissive: true },
};

function fill(g: CanvasRenderingContext2D, s: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(0, 0, s, s);
}

const texCache = new Map<FloorStyle, THREE.CanvasTexture>();
function floorTexture(style: FloorStyle): THREE.CanvasTexture {
  let t = texCache.get(style);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  SPECS[style].draw(c.getContext("2d")!, 256);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(style, t);
  return t;
}

/** Malhas de piso, uma por estilo. */
export function buildFloors(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  group.name = "floors";
  const byStyle = new Map<FloorStyle, THREE.BufferGeometry[]>();
  for (const f of map.floors) {
    const shape = new THREE.Shape(f.polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const elev = f.elevation ?? 0;
    let g: THREE.BufferGeometry = elev > 0.05 ? new THREE.ExtrudeGeometry(shape, { depth: elev, bevelEnabled: false }) : new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    if (elev <= 0.05) g.translate(0, elev, 0);
    g = g.index ? g.toNonIndexed() : g;
    // UV pelas coordenadas do mundo.
    const meters = SPECS[f.style].meters;
    const pos = g.attributes.position!;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / meters;
      uv[i * 2 + 1] = -pos.getZ(i) / meters;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const list = byStyle.get(f.style) ?? [];
    list.push(g);
    byStyle.set(f.style, list);
  }
  for (const [style, list] of byStyle) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    const tex = floorTexture(style);
    const material = SPECS[style].emissive
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : lit({ map: tex }, false);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `floor:${style}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
