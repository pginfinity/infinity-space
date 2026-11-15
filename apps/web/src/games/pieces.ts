/**
 * Peças de xadrez desenhadas para o Infinity Space (traço próprio, geométrico).
 * Caixa 100 × 100, base em y = 90. Os mesmos caminhos servem ao SVG do painel e ao canvas da textura.
 * `body`: partes preenchidas (com contorno); `detail`: traços de detalhe na cor do contorno.
 */

export interface PieceArt {
  body: string[];
  detail?: string[];
}

const BASE = "M22 90 L78 90 L78 86 Q78 79 71 79 L29 79 Q22 79 22 86 Z";

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

export const PIECE_ART: Record<"p" | "n" | "b" | "r" | "q" | "k", PieceArt> = {
  p: {
    body: [
      "M41 49 L59 49 Q60 66 70 79 L30 79 Q40 66 41 49 Z",
      "M36 46 Q36 41 41 41 L59 41 Q64 41 64 46 Q64 51 59 51 L41 51 Q36 51 36 46 Z",
      circle(50, 29, 12.5),
      BASE,
    ],
  },
  r: {
    body: [
      "M36 41 L64 41 L66 72 L34 72 Z",
      "M28 72 L72 72 L73 79 L27 79 Z",
      "M32 35 L68 35 L64 42 L36 42 Z",
      "M29 15 L39 15 L39 22 L45 22 L45 15 L55 15 L55 22 L61 22 L61 15 L71 15 L71 35 L29 35 Z",
      BASE,
    ],
  },
  b: {
    body: [
      "M41 57 L59 57 Q60 69 69 79 L31 79 Q40 69 41 57 Z",
      "M35 52 Q35 48 39 48 L61 48 Q65 48 65 52 Q65 57 61 57 L39 57 Q35 57 35 52 Z",
      "M50 18 C63 27 68 38 63 48 L37 48 C32 38 37 27 50 18 Z",
      circle(50, 14, 5.5),
      BASE,
    ],
    detail: ["M56 28 L46 39", "M44 44 L56 44"],
  },
  n: {
    body: [
      "M31 79 C30 67 35 60 43 54 C38 54 33 56 28 58 C21 60 16 55 18 49 C20 42 28 35 34 29 C37 26 39 21 42 15 L48 22 C53 18 58 17 63 19 C75 25 81 41 79 57 C78 67 75 74 73 79 Z",
      BASE,
    ],
    detail: ["M63 26 C71 34 75 46 73 62", "M26 51 L30 50"],
  },
  q: {
    body: [
      "M35 62 L65 62 Q66 72 72 79 L28 79 Q34 72 35 62 Z",
      "M29 54 L71 54 L68 62 L32 62 Z",
      "M29 55 L20 29 L33 42 L36 23 L44 40 L50 19 L56 40 L64 23 L67 42 L80 29 L71 55 Z",
      circle(20, 27, 4.5),
      circle(36, 21, 4.5),
      circle(50, 16, 4.5),
      circle(64, 21, 4.5),
      circle(80, 27, 4.5),
      BASE,
    ],
  },
  k: {
    body: [
      "M35 61 L65 61 Q66 72 72 79 L28 79 Q34 72 35 61 Z",
      "M29 53 L71 53 L68 61 L32 61 Z",
      "M30 53 C24 40 31 29 42 30 C47 30.5 50 34 50 38 C50 34 53 30.5 58 30 C69 29 76 40 70 53 Z",
      "M46.5 8 L53.5 8 L53.5 14 L59 14 L59 20.5 L53.5 20.5 L53.5 31 L46.5 31 L46.5 20.5 L41 20.5 L41 14 L46.5 14 Z",
      BASE,
    ],
  },
};

/** Cores das peças: brancas em off-white com contorno navy; pretas em navy profundo com contorno claro. */
export const PIECE_COLORS = {
  w: { fill: "#F7F4EF", stroke: "#0B1C36", detail: "#0B1C36" },
  b: { fill: "#0D1D38", stroke: "#DCE3EC", detail: "#DCE3EC" },
} as const;

/** Desenha uma peça num canvas 2D, ocupando o quadrado (x, y, size). */
export function drawPiece(ctx: CanvasRenderingContext2D, type: keyof typeof PIECE_ART, color: "w" | "b", x: number, y: number, size: number): void {
  const art = PIECE_ART[type];
  const c = PIECE_COLORS[color];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 3.2;
  for (const d of art.body) {
    const p = new Path2D(d);
    ctx.fillStyle = c.fill;
    ctx.fill(p);
    ctx.strokeStyle = c.stroke;
    ctx.stroke(p);
  }
  ctx.strokeStyle = c.detail;
  for (const d of art.detail ?? []) ctx.stroke(new Path2D(d));
  ctx.restore();
}
