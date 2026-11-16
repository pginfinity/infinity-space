import { PX, SCREEN_H, SCREEN_W, pixelText, rng } from "./pixel.ts";
import { banner, hud, sprite, type Sprite } from "./gfx.ts";
import { CAB_DT, type CabGame, type CabInput } from "./types.ts";

/**
 * ESTILHAÇO: rebata o cristal e quebre as placas. Cada fase é desenhada por semente (simétrica),
 * com placas comuns, reforçadas (duas batidas), de metal (não quebram) e explosivas (levam as vizinhas).
 * Cápsulas que caem: LARGO (rebatedor maior), MULTI (três cristais), LENTO, LASER (Espaço atira) e VIDA.
 * Placas seguidas sem voltar ao rebatedor rendem bônus de sequência.
 */

export const COLS = 12;
export const ROWS = 10;
export const BW = 16;
export const BH = 7;
const X0 = (SCREEN_W - COLS * BW) / 2;
const Y0 = 30;
const LEFT = 4;
const RIGHT = SCREEN_W - 4;
const TOP = 16;
const PAD_Y = 236;
const PAD_H = 5;
const BALL = 2;
const SPEED0 = 118;
const SPEED_MAX = 215;

/** Tipos de placa: 0 vazio, 1 comum, 2 reforçada, 3 metal, 4 explosiva, 5 reforçada já rachada. */
export type Brick = 0 | 1 | 2 | 3 | 4 | 5;
type Cap = "largo" | "multi" | "lento" | "laser" | "vida";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
}

/** Fase `level` desenhada pela semente: padrões espelhados com metal e explosivas espalhados. */
export function makeLevel(level: number, seed: number): Brick[] {
  const r = rng(seed * 31 + level * 977);
  const grid = new Array<Brick>(COLS * ROWS).fill(0);
  const rows = Math.min(ROWS, 5 + Math.floor(level / 2));
  const kind = (level - 1) % 5;
  const half = COLS / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < half; x++) {
      let on: boolean;
      if (kind === 0) on = true;
      else if (kind === 1) on = (x + y) % 2 === 0 || y < 2;
      else if (kind === 2) on = Math.abs(x - half + 0.5) + Math.abs(y - rows / 2) <= rows / 2 + 2;
      else if (kind === 3) on = y % 3 !== 2;
      else on = r() < 0.72;
      if (!on) continue;
      let b: Brick = 1;
      const k = r();
      if (level >= 2 && k < 0.12 + level * 0.015) b = 2;
      else if (level >= 3 && k > 0.95 - Math.min(0.06, level * 0.006)) b = 3;
      else if (k > 0.88) b = 4;
      grid[y * COLS + x] = b;
      grid[y * COLS + (COLS - 1 - x)] = b;
    }
  }
  // metal nunca fecha a fase sozinho: garante bastante placa quebrável
  if (grid.filter((b) => b !== 0 && b !== 3).length < 12) for (let x = 0; x < COLS; x++) grid[x] = 1;
  return grid;
}

export class Estilhaco implements CabGame {
  readonly id = "estilhaco" as const;
  score = 0;
  lives = 3;
  level = 1;
  over = false;
  sounds: string[] = [];

  private readonly r: () => number;
  private readonly seed: number;
  grid: Brick[];
  pad = { x: SCREEN_W / 2, w: 32 };
  balls: Ball[] = [];
  private caps: Array<{ x: number; y: number; kind: Cap }> = [];
  private bolts: Array<{ x: number; y: number }> = [];
  private timers: Record<"largo" | "lento" | "laser", number> = { largo: 0, lento: 0, laser: 0 };
  private chain = 0;
  private laserCd = 0;
  private bannerT = 1.6;
  private bannerText = "FASE 1";
  private lastMouse: number | null = null;
  private flashes: Array<{ i: number; t: number }> = [];

  constructor(seed: number) {
    this.seed = seed;
    this.r = rng(seed);
    this.grid = makeLevel(1, seed);
    this.resetBall();
  }

  private resetBall(): void {
    this.balls = [{ x: this.pad.x, y: PAD_Y - BALL - 1, vx: 0, vy: 0, stuck: true }];
  }

  private speed(): number {
    const base = Math.min(SPEED_MAX, SPEED0 + (this.level - 1) * 9);
    return this.timers.lento > 0 ? base * 0.68 : base;
  }

  step(input: CabInput): void {
    if (this.over) return;
    const dt = CAB_DT;
    this.bannerT = Math.max(0, this.bannerT - dt);
    for (const k of Object.keys(this.timers) as Array<keyof typeof this.timers>) this.timers[k] = Math.max(0, this.timers[k] - dt);
    this.flashes = this.flashes.filter((f) => (f.t -= dt) > 0);
    this.pad.w = this.timers.largo > 0 ? 48 : 32;

    // rebatedor: teclado ou mouse
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (ix) this.pad.x += ix * 170 * dt;
    else if (input.mouseX !== null && input.mouseX !== this.lastMouse) this.pad.x = input.mouseX;
    this.lastMouse = input.mouseX;
    this.pad.x = Math.min(RIGHT - this.pad.w / 2, Math.max(LEFT + this.pad.w / 2, this.pad.x));

    if (input.firePressed) {
      const stuck = this.balls.filter((b) => b.stuck);
      for (const b of stuck) this.launch(b);
    }
    this.laserCd -= dt;
    if (this.timers.laser > 0 && input.fire && this.laserCd <= 0 && !this.balls.some((b) => b.stuck)) {
      this.laserCd = 0.28;
      this.bolts.push({ x: this.pad.x - this.pad.w / 2 + 2, y: PAD_Y - 2 }, { x: this.pad.x + this.pad.w / 2 - 2, y: PAD_Y - 2 });
      this.sounds.push("cab-shoot");
    }

    for (const b of this.balls) {
      if (b.stuck) {
        b.x = this.pad.x;
        b.y = PAD_Y - BALL - 1;
        continue;
      }
      // dois subpassos: o cristal rápido não atravessa placa
      for (let k = 0; k < 2; k++) this.moveBall(b, dt / 2);
    }
    const before = this.balls.length;
    this.balls = this.balls.filter((b) => b.y < SCREEN_H + 4);
    if (before && !this.balls.length) this.loseLife();

    for (const z of this.bolts) z.y -= 260 * dt;
    this.bolts = this.bolts.filter((z) => {
      if (z.y < TOP) return false;
      const i = this.brickAt(z.x, z.y);
      if (i < 0) return true;
      this.hitBrick(i);
      return false;
    });

    for (const c of this.caps) c.y += 48 * dt;
    this.caps = this.caps.filter((c) => {
      if (c.y >= PAD_Y - 3 && c.y <= PAD_Y + PAD_H + 3 && Math.abs(c.x - this.pad.x) <= this.pad.w / 2 + 4) {
        this.catchCap(c.kind);
        return false;
      }
      return c.y < SCREEN_H + 6;
    });

    if (!this.grid.some((b) => b !== 0 && b !== 3)) this.nextLevel();
  }

  private launch(b: Ball): void {
    b.stuck = false;
    const s = this.speed();
    const off = (this.r() - 0.5) * 0.5;
    b.vx = s * Math.sin(off);
    b.vy = -s * Math.cos(off);
    this.sounds.push("cab-bounce");
  }

  private moveBall(b: Ball, dt: number): void {
    // eixo x
    b.x += b.vx * dt;
    if (b.x < LEFT + BALL) {
      b.x = LEFT + BALL;
      b.vx = Math.abs(b.vx);
      this.sounds.push("cab-wall");
    } else if (b.x > RIGHT - BALL) {
      b.x = RIGHT - BALL;
      b.vx = -Math.abs(b.vx);
      this.sounds.push("cab-wall");
    }
    let i = this.brickTouch(b);
    if (i >= 0) {
      b.x -= b.vx * dt;
      b.vx = -b.vx;
      this.hitBrick(i);
    }
    // eixo y
    b.y += b.vy * dt;
    if (b.y < TOP + BALL) {
      b.y = TOP + BALL;
      b.vy = Math.abs(b.vy);
      this.sounds.push("cab-wall");
    }
    i = this.brickTouch(b);
    if (i >= 0) {
      b.y -= b.vy * dt;
      b.vy = -b.vy;
      this.hitBrick(i);
    }
    // rebatedor: o ângulo depende de onde o cristal pegou
    if (b.vy > 0 && b.y + BALL >= PAD_Y && b.y - BALL <= PAD_Y + PAD_H && Math.abs(b.x - this.pad.x) <= this.pad.w / 2 + BALL) {
      const u = Math.max(-1, Math.min(1, (b.x - this.pad.x) / (this.pad.w / 2)));
      const a = u * 1.05;
      const s = Math.max(this.speed(), Math.min(SPEED_MAX, Math.hypot(b.vx, b.vy)));
      b.vx = s * Math.sin(a);
      b.vy = -s * Math.cos(a);
      b.y = PAD_Y - BALL - 0.5;
      this.chain = 0;
      this.sounds.push("cab-bounce");
    }
  }

  /** Placa que o cristal toca (índice) ou -1. */
  private brickTouch(b: Ball): number {
    for (const [dx, dy] of [
      [-BALL, -BALL],
      [BALL, -BALL],
      [-BALL, BALL],
      [BALL, BALL],
    ] as const) {
      const i = this.brickAt(b.x + dx, b.y + dy);
      if (i >= 0) return i;
    }
    return -1;
  }

  brickAt(x: number, y: number): number {
    const c = Math.floor((x - X0) / BW);
    const r = Math.floor((y - Y0) / BH);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    const i = r * COLS + c;
    return this.grid[i] ? i : -1;
  }

  private hitBrick(i: number): void {
    const b = this.grid[i]!;
    if (b === 3) {
      this.sounds.push("cab-metal");
      return;
    }
    if (b === 2) {
      this.grid[i] = 5;
      this.score += 5;
      this.flashes.push({ i, t: 0.12 });
      this.sounds.push("cab-hit");
      return;
    }
    this.breakBrick(i, b === 4);
  }

  private breakBrick(i: number, explosive: boolean): void {
    const b = this.grid[i]!;
    if (!b || b === 3) return;
    this.grid[i] = 0;
    this.chain++;
    this.score += (b === 5 ? 25 : b === 4 ? 15 : 10) + Math.min(40, this.chain * 2);
    this.flashes.push({ i, t: 0.15 });
    this.sounds.push(explosive ? "cab-explode" : "cab-brick");
    const cx = X0 + (i % COLS) * BW + BW / 2;
    const cy = Y0 + Math.floor(i / COLS) * BH + BH / 2;
    if (this.r() < 0.11) this.caps.push({ x: cx, y: cy, kind: this.randomCap() });
    if (explosive) {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = c + dx;
          const y = r + dy;
          if ((dx || dy) && x >= 0 && x < COLS && y >= 0 && y < ROWS) {
            const j = y * COLS + x;
            if (this.grid[j] === 4) this.breakBrick(j, true);
            else if (this.grid[j] && this.grid[j] !== 3) this.breakBrick(j, false);
          }
        }
    }
  }

  private randomCap(): Cap {
    const k = this.r();
    return k < 0.26 ? "largo" : k < 0.5 ? "multi" : k < 0.7 ? "lento" : k < 0.93 ? "laser" : "vida";
  }

  private catchCap(kind: Cap): void {
    this.sounds.push("cab-power");
    this.score += 20;
    if (kind === "vida") this.lives = Math.min(5, this.lives + 1);
    else if (kind === "multi") {
      const src = this.balls.find((b) => !b.stuck) ?? this.balls[0];
      if (!src) return;
      if (src.stuck) this.launch(src);
      const s = Math.hypot(src.vx, src.vy);
      for (const a of [-0.45, 0.45]) {
        const ang = Math.atan2(src.vx, -src.vy) + a;
        this.balls.push({ x: src.x, y: src.y, vx: s * Math.sin(ang), vy: -s * Math.abs(Math.cos(ang)), stuck: false });
      }
    } else this.timers[kind] = kind === "laser" ? 10 : 12;
  }

  private loseLife(): void {
    this.lives--;
    this.chain = 0;
    this.timers = { largo: 0, lento: 0, laser: 0 };
    this.caps = [];
    this.sounds.push("cab-death");
    if (this.lives <= 0) {
      this.over = true;
      return;
    }
    this.resetBall();
  }

  private nextLevel(): void {
    this.score += 500 * this.level;
    this.level++;
    this.grid = makeLevel(this.level, this.seed);
    this.caps = [];
    this.bolts = [];
    this.timers = { largo: 0, lento: 0, laser: 0 };
    this.bannerText = `FASE ${this.level}`;
    this.bannerT = 1.8;
    this.sounds.push("cab-level");
    this.resetBall();
  }

  // ---------------------------------------------------------------- desenho

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = PX.night;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // grade neon do chão do Arcade, bem apagada
    ctx.fillStyle = "#0E2246";
    for (let x = LEFT; x < RIGHT; x += 16) ctx.fillRect(x, TOP, 1, SCREEN_H - TOP);
    for (let y = TOP; y < SCREEN_H; y += 16) ctx.fillRect(LEFT, y, RIGHT - LEFT, 1);
    // paredes
    ctx.fillStyle = PX.violet;
    ctx.fillRect(LEFT - 2, TOP - 2, 2, SCREEN_H);
    ctx.fillRect(RIGHT, TOP - 2, 2, SCREEN_H);
    ctx.fillRect(LEFT - 2, TOP - 2, RIGHT - LEFT + 4, 2);

    const rowColors = [PX.red, PX.orange, PX.gold, PX.green, PX.sky, PX.signal, PX.violet, PX.pink, PX.cream, PX.slate];
    for (let i = 0; i < this.grid.length; i++) {
      const b = this.grid[i]!;
      if (!b) continue;
      const x = X0 + (i % COLS) * BW;
      const y = Y0 + Math.floor(i / COLS) * BH;
      const row = Math.floor(i / COLS);
      let c: string = rowColors[row % rowColors.length]!;
      if (b === 3) c = "#6B7689";
      if (b === 4) c = Math.floor(t * 4) % 2 ? PX.red : PX.orange;
      if (b === 2 || b === 5) c = PX.white;
      if (this.flashes.some((f) => f.i === i)) c = PX.white;
      ctx.fillStyle = c;
      ctx.fillRect(x + 1, y + 1, BW - 2, BH - 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 1, y + 1, BW - 2, 1);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x + 1, y + BH - 2, BW - 2, 1);
      if (b === 3) {
        ctx.fillStyle = PX.cream;
        ctx.fillRect(x + 2, y + 2, 1, 1);
        ctx.fillRect(x + BW - 3, y + 2, 1, 1);
      } else if (b === 2 || b === 5) {
        ctx.fillStyle = rowColors[row % rowColors.length]!;
        ctx.fillRect(x + 3, y + 2, BW - 6, BH - 4);
        if (b === 5) {
          ctx.fillStyle = PX.night;
          ctx.fillRect(x + 6, y + 1, 1, 2);
          ctx.fillRect(x + 7, y + 3, 1, 2);
          ctx.fillRect(x + 8, y + 4, 1, 2);
        }
      } else if (b === 4) {
        ctx.fillStyle = PX.gold;
        ctx.fillRect(x + 7, y + 2, 2, 3);
      }
    }

    for (const c of this.caps) {
      const col = c.kind === "largo" ? PX.signal : c.kind === "multi" ? PX.green : c.kind === "lento" ? PX.sky : c.kind === "laser" ? PX.red : PX.pink;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(c.x) - 7, Math.round(c.y) - 4, 15, 9);
      ctx.fillStyle = PX.night;
      ctx.fillRect(Math.round(c.x) - 6, Math.round(c.y) - 3, 13, 7);
      pixelText(ctx, c.kind === "largo" ? "L" : c.kind === "multi" ? "M" : c.kind === "lento" ? "S" : c.kind === "laser" ? "Z" : "♥", c.x - 2, c.y - 3, { color: col });
    }

    ctx.fillStyle = PX.red;
    for (const z of this.bolts) ctx.fillRect(Math.round(z.x), Math.round(z.y), 1, 4);

    // rebatedor
    const px = Math.round(this.pad.x - this.pad.w / 2);
    ctx.fillStyle = PX.signal;
    ctx.fillRect(px, PAD_Y, this.pad.w, PAD_H);
    ctx.fillStyle = PX.white;
    ctx.fillRect(px + 4, PAD_Y, this.pad.w - 8, PAD_H - 1);
    ctx.fillStyle = PX.slate;
    ctx.fillRect(px + 4, PAD_Y + PAD_H - 1, this.pad.w - 8, 1);
    if (this.timers.laser > 0) {
      ctx.fillStyle = PX.red;
      ctx.fillRect(px + 1, PAD_Y - 2, 2, 2);
      ctx.fillRect(px + this.pad.w - 3, PAD_Y - 2, 2, 2);
    }

    for (const b of this.balls) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 4, 4);
      drawCrystal(ctx, b.x, b.y);
    }

    hud(ctx, this.score, this.lives, `FASE ${this.level}`, lifeSprite());
    if (this.balls.some((b) => b.stuck) && !this.over && Math.floor(t * 2) % 2 === 0) pixelText(ctx, "ESPAÇO LANÇA", SCREEN_W / 2, 200, { color: PX.sky, align: "center" });
    if (this.bannerT > 0) banner(ctx, this.bannerText, 160);
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  ctx.fillStyle = PX.white;
  ctx.fillRect(cx - 1, cy - 2, 3, 5);
  ctx.fillRect(cx - 2, cy - 1, 5, 3);
  ctx.fillStyle = PX.sky;
  ctx.fillRect(cx, cy, 1, 1);
}

let lifeS: Sprite | null = null;
function lifeSprite(): Sprite {
  return (lifeS ??= sprite(["wwwww", "sssss"], { w: PX.white, s: PX.signal }));
}
