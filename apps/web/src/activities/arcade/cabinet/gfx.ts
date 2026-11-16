import { PX, SCREEN_W, pad, pixelText } from "./pixel.ts";

/** Desenho de pixel nítido para os fliperamas (sem antisserrilhado: tudo em retângulos inteiros). */

/** Disco cheio nítido. */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const R = Math.max(0, Math.round(r));
  if (R === 0) {
    ctx.fillRect(x0, y0, 1, 1);
    return;
  }
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(R * R - dy * dy) + 0.35);
    ctx.fillRect(x0 - w, y0 + dy, w * 2 + 1, 1);
  }
}

/** Sprite a partir de linhas de texto: cada caractere é uma cor da paleta (espaço/ponto = vazio). */
export interface Sprite {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}

const spriteCache = new Map<string, Sprite>();

export function sprite(rows: readonly string[], palette: Record<string, string>): Sprite {
  const key = rows.join("|") + JSON.stringify(palette);
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = palette[ch];
      if (!c) return;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    });
  });
  const s = { w, h, canvas };
  spriteCache.set(key, s);
  return s;
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, cx: number, cy: number, flipX = false): void {
  const x = Math.round(cx - s.w / 2);
  const y = Math.round(cy - s.h / 2);
  if (!flipX) {
    ctx.drawImage(s.canvas, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x + s.w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, 0, 0);
  ctx.restore();
}

/** Campo de estrelas fixo (posições pseudoaleatórias), com cintilar leve. */
export function stars(ctx: CanvasRenderingContext2D, t: number, seed: number, n: number, speed = 0, h = 256): void {
  let a = seed;
  for (let i = 0; i < n; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const x = a % SCREEN_W;
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const y0 = a % h;
    const y = Math.floor((y0 + t * speed * (1 + (i % 3) * 0.6)) % h);
    const tw = (i + Math.floor(t * 3)) % 9 === 0;
    ctx.fillStyle = i % 7 === 0 ? PX.sky : tw ? PX.white : PX.dim;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Placar padrão: pontos à esquerda, vidas à direita, rótulo no meio. */
export function hud(ctx: CanvasRenderingContext2D, score: number, lives: number, label: string, life: Sprite | null): void {
  ctx.fillStyle = PX.black;
  ctx.fillRect(0, 0, SCREEN_W, 12);
  ctx.fillStyle = PX.navy;
  ctx.fillRect(0, 12, SCREEN_W, 1);
  pixelText(ctx, pad(score), 4, 3, { color: PX.white });
  pixelText(ctx, label, SCREEN_W / 2, 3, { color: PX.sky, align: "center" });
  if (life) for (let i = 0; i < Math.min(5, lives); i++) ctx.drawImage(life.canvas, SCREEN_W - 4 - (i + 1) * (life.w + 2), Math.round(6 - life.h / 2));
}

/** Faixa de aviso no meio da tela (ONDA 2, FASE LIMPA...). */
export function banner(ctx: CanvasRenderingContext2D, text: string, y: number, color: string = PX.gold): void {
  ctx.fillStyle = "rgba(2, 11, 24, 0.75)";
  ctx.fillRect(0, y - 4, SCREEN_W, 15);
  pixelText(ctx, text, SCREEN_W / 2, y, { color, align: "center" });
}
