/**
 * A estrela de quatro pontas da Infinity, extraída do arquivo oficial
 * (ID 2026 INFINITY/LOGO/ICON/ICON - GRADIENT.svg). Não redesenhar: o manual proíbe recriar o símbolo.
 * O caminho é convertido para curvas cúbicas absolutas, centralizado e normalizado (maior lado = 1).
 */

const PATH =
  "M2328,1370.4s-884.7-197.9-1157-40.7c-272.2,157.2-448.4,668.5-448.4,668.5,0,0,103.1-530.9-54.1-803.1C511.3,922.8,0,746.6,0,746.6c0,0,884.7,197.9,1157,40.7,272.2-157.2,448.4-668.5,448.4-668.5,0,0-103.1,530.9,54.1,803.2,157.2,272.2,668.5,448.4,668.5,448.4Z";

/** Gradiente oficial do símbolo: laranja → navy → azul. */
export const SPARKLE_STOPS = [
  { offset: 0, color: "#EC5C2A" },
  { offset: 0.2, color: "#C14F2C" },
  { offset: 0.4, color: "#432932" },
  { offset: 0.5, color: "#071734" },
  { offset: 0.6, color: "#1B4C72" },
  { offset: 0.8, color: "#368BBA" },
  { offset: 1, color: "#46AFE3" },
] as const;

export interface SparkleShape {
  start: [number, number];
  /** Cada curva: [c1x, c1y, c2x, c2y, x, y], em coordenadas com y para baixo (como no SVG). */
  curves: Array<[number, number, number, number, number, number]>;
}

function parse(d: string): SparkleShape {
  const tokens = d.match(/[MmCcSsZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let lastC2: [number, number] | null = null;
  let start: [number, number] = [0, 0];
  const curves: SparkleShape["curves"] = [];
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const tk = tokens[i]!;
    if (/[A-Za-z]/.test(tk)) {
      cmd = tk;
      i++;
      if (cmd === "Z" || cmd === "z") continue;
    }
    switch (cmd) {
      case "M":
        cx = num();
        cy = num();
        start = [cx, cy];
        lastC2 = null;
        break;
      case "C":
      case "c": {
        const rel = cmd === "c";
        const v = [num(), num(), num(), num(), num(), num()];
        const [x1, y1, x2, y2, x, y] = rel ? [cx + v[0]!, cy + v[1]!, cx + v[2]!, cy + v[3]!, cx + v[4]!, cy + v[5]!] : (v as [number, number, number, number, number, number]);
        curves.push([x1, y1, x2, y2, x, y]);
        lastC2 = [x2, y2];
        cx = x;
        cy = y;
        break;
      }
      case "S":
      case "s": {
        const rel = cmd === "s";
        const v = [num(), num(), num(), num()];
        const x1 = lastC2 ? 2 * cx - lastC2[0] : cx;
        const y1 = lastC2 ? 2 * cy - lastC2[1] : cy;
        const [x2, y2, x, y] = rel ? [cx + v[0]!, cy + v[1]!, cx + v[2]!, cy + v[3]!] : (v as [number, number, number, number]);
        curves.push([x1, y1, x2, y2, x, y]);
        lastC2 = [x2, y2];
        cx = x;
        cy = y;
        break;
      }
      default:
        i++;
    }
  }
  return { start, curves };
}

function normalize(s: SparkleShape): SparkleShape {
  const xs = [s.start[0], ...s.curves.flatMap((c) => [c[0], c[2], c[4]])];
  const ys = [s.start[1], ...s.curves.flatMap((c) => [c[1], c[3], c[5]])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = 1 / Math.max(maxX - minX, maxY - minY);
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const tx = (x: number) => (x - ox) * k;
  const ty = (y: number) => (y - oy) * k;
  return {
    start: [tx(s.start[0]), ty(s.start[1])],
    curves: s.curves.map((c) => [tx(c[0]), ty(c[1]), tx(c[2]), ty(c[3]), tx(c[4]), ty(c[5])]),
  };
}

export const SPARKLE: SparkleShape = normalize(parse(PATH));
