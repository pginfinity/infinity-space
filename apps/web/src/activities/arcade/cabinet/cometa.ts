import { PX, SCREEN_H, SCREEN_W, pixelText, rng } from "./pixel.ts";
import { banner, disc, hud, stars } from "./gfx.ts";
import { CAB_DT, type CabGame, type CabInput } from "./types.ts";

/**
 * CAUDA DE COMETA: o cometa anda numa grade de órbitas em volta de um planeta.
 * Cada órbita tem casas do mesmo tamanho, então as de dentro têm menos casas e dão a volta mais rápido.
 * ← e → viram o cometa (para a esquerda e a direita de quem pilota). Poeira estelar faz a cauda crescer;
 * a estrela dourada vale mais e some rápido. Bater no planeta, sair da última órbita, num asteroide
 * ou na própria cauda acaba a partida.
 */

export const RINGS = 8;
const R0 = 24;
const DR = 11;
export const CX = SCREEN_W / 2;
export const CY = 140;
/** Casas de cada órbita (o mesmo comprimento de arco em todas). */
export const SECTORS = Array.from({ length: RINGS }, (_, i) => Math.round((2 * Math.PI * (R0 + i * DR)) / DR));

/** Direção do cometa: 0 horário, 1 para fora, 2 anti-horário, 3 para dentro. */
export type Dir = 0 | 1 | 2 | 3;
/** Virar à esquerda de quem pilota, para cada direção (à direita é o inverso). */
const LEFT: Record<Dir, Dir> = { 0: 1, 1: 2, 2: 3, 3: 0 };
const RIGHT: Record<Dir, Dir> = { 0: 3, 3: 2, 2: 1, 1: 0 };

export interface Cell {
  r: number;
  s: number;
}

const key = (c: Cell) => c.r * 100 + c.s;

/** Leva a casa `s` da órbita `from` para a casa no mesmo ângulo da órbita `to`. */
export function remap(s: number, from: number, to: number): number {
  const a = (s + 0.5) / SECTORS[from]!;
  return Math.floor(a * SECTORS[to]!) % SECTORS[to]!;
}

/** Próxima casa (null = bateu no planeta ou saiu da última órbita). */
export function advance(c: Cell, dir: Dir): Cell | null {
  if (dir === 0) return { r: c.r, s: (c.s + 1) % SECTORS[c.r]! };
  if (dir === 2) return { r: c.r, s: (c.s - 1 + SECTORS[c.r]!) % SECTORS[c.r]! };
  const r = c.r + (dir === 1 ? 1 : -1);
  if (r < 0 || r >= RINGS) return null;
  return { r, s: remap(c.s, c.r, r) };
}

/** Centro da casa na tela. */
export function cellXY(c: Cell): [number, number] {
  const rad = R0 + c.r * DR;
  const a = ((c.s + 0.5) / SECTORS[c.r]!) * Math.PI * 2 - Math.PI / 2;
  return [CX + Math.cos(a) * rad, CY + Math.sin(a) * rad];
}

export class Cometa implements CabGame {
  readonly id = "cometa" as const;
  score = 0;
  lives = 1;
  level = 1;
  over = false;
  sounds: string[] = [];

  private readonly r: () => number;
  body: Cell[] = [];
  dir: Dir = 0;
  private turns: Dir[] = [];
  private clock = 0;
  private grow = 0;
  dust: Cell | null = null;
  private gold: { c: Cell; ttl: number } | null = null;
  rocks: Cell[] = [];
  private eaten = 0;
  private bannerT = 0;
  private flash = 0;

  constructor(seed: number) {
    this.r = rng(seed);
    const r = 4;
    for (let i = 0; i < 4; i++) this.body.push({ r, s: (10 - i + SECTORS[r]!) % SECTORS[r]! });
    this.placeDust();
  }

  /** Segundos por casa: acelera a cada nível. */
  interval(): number {
    return Math.max(0.075, 0.2 - (this.level - 1) * 0.012);
  }

  private occupied(): Set<number> {
    const s = new Set<number>();
    for (const c of this.body) s.add(key(c));
    for (const c of this.rocks) s.add(key(c));
    return s;
  }

  private freeCell(minDist = 0): Cell {
    const occ = this.occupied();
    const head = this.body[0]!;
    for (let tries = 0; tries < 400; tries++) {
      const r = Math.floor(this.r() * RINGS);
      const c = { r, s: Math.floor(this.r() * SECTORS[r]!) };
      if (occ.has(key(c)) || (this.dust && key(this.dust) === key(c))) continue;
      const [x, y] = cellXY(c);
      const [hx, hy] = cellXY(head);
      if (Math.hypot(x - hx, y - hy) < minDist) continue;
      return c;
    }
    return { r: 0, s: 0 };
  }

  private placeDust(): void {
    this.dust = this.freeCell(30);
  }

  step(input: CabInput): void {
    if (this.over) return;
    this.bannerT = Math.max(0, this.bannerT - CAB_DT);
    this.flash = Math.max(0, this.flash - CAB_DT);
    if (input.leftPressed && this.turns.length < 2) this.turns.push(LEFT[this.turns.at(-1) ?? this.dir]);
    if (input.rightPressed && this.turns.length < 2) this.turns.push(RIGHT[this.turns.at(-1) ?? this.dir]);
    if (this.gold) {
      this.gold.ttl -= CAB_DT;
      if (this.gold.ttl <= 0) this.gold = null;
    }
    this.clock += CAB_DT;
    if (this.clock < this.interval()) return;
    this.clock = 0;
    this.move();
  }

  /** Anda uma casa (público para os testes). */
  move(): void {
    const t = this.turns.shift();
    if (t !== undefined) this.dir = t;
    const head = this.body[0]!;
    const next = advance(head, this.dir);
    if (!next) return this.crash();
    const hit = this.body.some((c, i) => key(c) === key(next) && !(i === this.body.length - 1 && this.grow === 0)) || this.rocks.some((c) => key(c) === key(next));
    if (hit) return this.crash();
    this.body.unshift(next);
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (this.dust && key(this.dust) === key(next)) {
      this.score += 10 * this.level;
      this.grow += 1;
      this.eaten++;
      this.sounds.push("cab-eat");
      this.placeDust();
      if (this.eaten % 6 === 0) this.levelUp();
      if (!this.gold && this.r() < 0.18) this.gold = { c: this.freeCell(20), ttl: 6 };
    } else if (this.gold && key(this.gold.c) === key(next)) {
      this.score += 50 * this.level;
      this.grow += 2;
      this.gold = null;
      this.flash = 0.3;
      this.sounds.push("cab-power");
    }
  }

  private levelUp(): void {
    this.level++;
    this.bannerT = 1.6;
    this.sounds.push("cab-level");
    // de 3 em diante aparece um asteroide por nível (longe da cabeça)
    if (this.level >= 3 && this.rocks.length < 10) this.rocks.push(this.freeCell(36));
  }

  private crash(): void {
    this.over = true;
    this.sounds.push("cab-death");
  }

  // ---------------------------------------------------------------- desenho

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = PX.black;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    stars(ctx, t, 11, 60, 0);
    // órbitas: pontinhos no centro de cada casa
    for (let r = 0; r < RINGS; r++) {
      ctx.fillStyle = r % 2 === 0 ? PX.navy : "#0D2B50";
      for (let s = 0; s < SECTORS[r]!; s++) {
        const [x, y] = cellXY({ r, s });
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    // borda da última órbita
    ctx.fillStyle = PX.dim;
    const outer = R0 + (RINGS - 0.5) * DR;
    for (let a = 0; a < 160; a++) ctx.fillRect(Math.round(CX + Math.cos((a / 160) * Math.PI * 2) * outer), Math.round(CY + Math.sin((a / 160) * Math.PI * 2) * outer), 1, 1);
    // planeta
    disc(ctx, CX, CY, R0 - 7, "#1B4C72");
    disc(ctx, CX - 2, CY - 2, R0 - 10, "#2A6FA8");
    ctx.fillStyle = PX.green;
    ctx.fillRect(CX - 7, CY - 4, 6, 3);
    ctx.fillRect(CX + 2, CY + 3, 5, 2);
    // asteroides
    for (const c of this.rocks) {
      const [x, y] = cellXY(c);
      disc(ctx, x, y, 3, PX.dim);
      ctx.fillStyle = PX.slate;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1);
    }
    // poeira e estrela dourada
    if (this.dust) {
      const [x, y] = cellXY(this.dust);
      const tw = Math.floor(t * 5) % 2 === 0;
      ctx.fillStyle = tw ? PX.white : PX.gold;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      ctx.fillStyle = PX.gold;
      if (tw) {
        ctx.fillRect(Math.round(x) - 3, Math.round(y), 1, 1);
        ctx.fillRect(Math.round(x) + 2, Math.round(y) - 1, 1, 1);
      }
    }
    if (this.gold && (this.gold.ttl > 1.5 || Math.floor(t * 10) % 2 === 0)) {
      const [x, y] = cellXY(this.gold.c);
      ctx.fillStyle = PX.gold;
      ctx.fillRect(Math.round(x) - 3, Math.round(y), 7, 1);
      ctx.fillRect(Math.round(x), Math.round(y) - 3, 1, 7);
      ctx.fillStyle = PX.white;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // cometa: cabeça brilhante e a cauda afinando e esfriando
    const n = this.body.length;
    const tailColors = [PX.white, PX.cream, PX.sky, PX.signal, "#1B6FB0", PX.navy];
    for (let i = n - 1; i >= 0; i--) {
      const [x, y] = cellXY(this.body[i]!);
      const k = i / Math.max(1, n - 1);
      const color = tailColors[Math.min(tailColors.length - 1, Math.floor(k * tailColors.length))]!;
      disc(ctx, x, y, i === 0 ? 4 : Math.max(1, 3 - k * 2.4), i === 0 ? (this.flash > 0 ? PX.gold : PX.orange) : color);
    }
    if (n) {
      const [hx, hy] = cellXY(this.body[0]!);
      disc(ctx, hx, hy, 2, PX.white);
      // seta discreta indicando para onde vai
      const ahead = advance(this.body[0]!, this.turns[0] ?? this.dir);
      if (ahead && !this.over) {
        const [ax, ay] = cellXY(ahead);
        ctx.fillStyle = PX.orange;
        ctx.fillRect(Math.round(hx + (ax - hx) * 0.55), Math.round(hy + (ay - hy) * 0.55), 1, 1);
      }
    }
    hud(ctx, this.score, 0, `NÍVEL ${this.level}`, null);
    pixelText(ctx, `${n}`, SCREEN_W - 4, 3, { color: PX.orange, align: "right" });
    if (this.bannerT > 0) banner(ctx, `NÍVEL ${this.level}`, 236);
  }
}

