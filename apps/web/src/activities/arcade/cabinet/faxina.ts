import { PX, SCREEN_H, SCREEN_W, pixelText, rng } from "./pixel.ts";
import { banner, disc, drawSprite, hud, sprite, stars, type Sprite } from "./gfx.ts";
import { CAB_DT, type CabGame, type CabInput } from "./types.ts";

/**
 * FAXINA ORBITAL: o rebocador da estação limpa a sucata que cai em órbita.
 * Sucata grande racha em duas médias, a média em duas pequenas. Satélites velhos cruzam a tela
 * e soltam cápsulas (escudo, tiro triplo, ímã). Acertos seguidos multiplicam os pontos (até ×4);
 * tiro perdido zera a sequência. Parafusos soltos valem pontos extras.
 */

const TOP = 14;
const SHIP_MIN_Y = 150;
const SHIP_MAX_Y = 232;
const SHIP_R = 5;
const SHIP_SPEED = 96;
const BULLET_SPEED = 235;
const RADIUS = [4, 7, 11] as const;
const POINTS = [30, 20, 10] as const;

type Power = "escudo" | "triplo" | "ima";

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 0 | 1 | 2;
  shape: number;
  spin: number;
  phase: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Drop {
  x: number;
  y: number;
  kind: "parafuso" | Power;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Sat {
  x: number;
  y: number;
  vx: number;
  hp: number;
  hitAt: number;
}

export class Faxina implements CabGame {
  readonly id = "faxina" as const;
  score = 0;
  lives = 3;
  level = 1;
  over = false;
  sounds: string[] = [];

  private readonly r: () => number;
  private t = 0;
  ship = { x: SCREEN_W / 2, y: 210, inv: 1.5, shield: false };
  private cooldown = 0;
  private powers: Record<Power, number> = { escudo: 0, triplo: 0, ima: 0 };
  debris: Debris[] = [];
  bullets: Bullet[] = [];
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private sat: Sat | null = null;
  private satTimer = 18;
  private spawn = 1;
  chain = 0;
  private cleared = 0;
  private bannerText = "ONDA 1";
  private bannerT = 2;

  constructor(seed: number) {
    this.r = rng(seed);
  }

  get mult(): number {
    return Math.min(4, 1 + Math.floor(this.chain / 5));
  }

  private quota(): number {
    return 10 + this.level * 4;
  }

  step(input: CabInput): void {
    if (this.over) return;
    const dt = CAB_DT;
    this.t += dt;
    this.bannerT = Math.max(0, this.bannerT - dt);
    for (const k of Object.keys(this.powers) as Power[]) this.powers[k] = Math.max(0, this.powers[k] - dt);

    // rebocador
    const s = this.ship;
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;
    s.x = Math.min(SCREEN_W - 7, Math.max(7, s.x + (ix / len) * SHIP_SPEED * dt));
    s.y = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, s.y + (iy / len) * SHIP_SPEED * dt));
    s.inv = Math.max(0, s.inv - dt);

    // tiro (segurar atira sozinho, com intervalo)
    this.cooldown -= dt;
    if (input.fire && this.cooldown <= 0) {
      const triple = this.powers.triplo > 0;
      this.cooldown = triple ? 0.2 : 0.16;
      this.bullets.push({ x: s.x, y: s.y - 6, vx: 0, vy: -BULLET_SPEED });
      if (triple) {
        this.bullets.push({ x: s.x - 3, y: s.y - 4, vx: -55, vy: -BULLET_SPEED * 0.97 });
        this.bullets.push({ x: s.x + 3, y: s.y - 4, vx: 55, vy: -BULLET_SPEED * 0.97 });
      }
      this.sounds.push("cab-shoot");
    }

    // sucata nova
    this.spawn -= dt;
    const max = Math.min(18, 5 + this.level * 2);
    if (this.spawn <= 0 && this.debris.length < max) {
      this.spawn = Math.max(0.42, 1.3 - this.level * 0.1) * (0.7 + this.r() * 0.6);
      const size = (this.r() < 0.25 + this.level * 0.03 ? 2 : this.r() < 0.6 ? 1 : 0) as 0 | 1 | 2;
      this.debris.push({
        x: 12 + this.r() * (SCREEN_W - 24),
        y: TOP - RADIUS[size],
        vx: (this.r() - 0.5) * 30,
        vy: 16 + this.level * 3.5 + this.r() * 14,
        size,
        shape: Math.floor(this.r() * 4),
        spin: 1.5 + this.r() * 3,
        phase: this.r() * 4,
      });
    }
    // satélite velho cruzando a tela
    this.satTimer -= dt;
    if (!this.sat && this.satTimer <= 0) {
      const fromLeft = this.r() < 0.5;
      this.sat = { x: fromLeft ? -10 : SCREEN_W + 10, y: 36 + this.r() * 40, vx: fromLeft ? 32 : -32, hp: 3, hitAt: -1 };
      this.satTimer = 22 + this.r() * 10;
    }
    if (this.sat) {
      this.sat.x += this.sat.vx * dt;
      if (this.sat.x < -16 || this.sat.x > SCREEN_W + 16) this.sat = null;
    }

    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < RADIUS[d.size] || d.x > SCREEN_W - RADIUS[d.size]) d.vx = -d.vx;
    }
    this.debris = this.debris.filter((d) => d.y < SCREEN_H + 14);

    // tiros
    const next: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < TOP || b.x < 0 || b.x > SCREEN_W) {
        this.chain = 0; // tiro perdido zera a sequência
        continue;
      }
      if (this.hitSat(b) || this.hitDebris(b)) continue;
      next.push(b);
    }
    this.bullets = next;

    // cápsulas e parafusos
    for (const p of this.drops) {
      p.y += 34 * dt;
      if (this.powers.ima > 0 && p.kind === "parafuso") {
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 80 && d > 0.1) {
          p.x += (dx / d) * 90 * dt;
          p.y += (dy / d) * 90 * dt;
        }
      }
    }
    this.drops = this.drops.filter((p) => {
      if (Math.hypot(p.x - s.x, p.y - s.y) < 8) {
        this.collect(p);
        return false;
      }
      return p.y < SCREEN_H + 6;
    });

    // batida
    if (s.inv <= 0) {
      for (const d of this.debris) {
        if (Math.hypot(d.x - s.x, d.y - s.y) < RADIUS[d.size] * 0.85 + SHIP_R) {
          this.burst(d.x, d.y, 10, PX.slate);
          d.y = SCREEN_H + 99;
          this.hurt();
          break;
        }
      }
    }

    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);

    if (this.cleared >= this.quota()) {
      this.cleared = 0;
      this.score += 100 * this.level;
      this.level++;
      this.bannerText = `ONDA ${this.level}`;
      this.bannerT = 2;
      this.sounds.push("cab-level");
    }
  }

  private hitDebris(b: Bullet): boolean {
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i]!;
      if (Math.hypot(d.x - b.x, d.y - b.y) > RADIUS[d.size] + 1.5) continue;
      this.debris.splice(i, 1);
      this.chain++;
      this.cleared++;
      this.score += POINTS[d.size] * this.mult;
      this.burst(d.x, d.y, 6 + d.size * 5, d.size === 2 ? PX.cream : PX.slate);
      this.sounds.push(d.size === 0 ? "cab-pop" : "cab-explode");
      if (d.size > 0) {
        const size = (d.size - 1) as 0 | 1;
        for (const side of [-1, 1]) this.debris.push({ ...d, size, vx: d.vx + side * (22 + this.r() * 18), vy: d.vy * 0.85 + 6, x: d.x + side * 3, shape: (d.shape + 1 + (side > 0 ? 1 : 0)) % 4 });
      }
      if (this.r() < 0.22) this.drops.push({ x: d.x, y: d.y, kind: "parafuso" });
      else if (d.size === 2 && this.r() < 0.07) this.drops.push({ x: d.x, y: d.y, kind: this.randomPower() });
      return true;
    }
    return false;
  }

  private hitSat(b: Bullet): boolean {
    const s = this.sat;
    if (!s || Math.abs(s.x - b.x) > 9 || Math.abs(s.y - b.y) > 5) return false;
    s.hp--;
    s.hitAt = this.t;
    this.sounds.push("cab-hit");
    if (s.hp <= 0) {
      this.score += 250 * this.mult;
      this.chain += 2;
      this.burst(s.x, s.y, 18, PX.signal);
      this.drops.push({ x: s.x, y: s.y, kind: this.randomPower() });
      this.sat = null;
      this.sounds.push("cab-explode");
    }
    return true;
  }

  private randomPower(): Power {
    const k = this.r();
    return k < 0.4 ? "escudo" : k < 0.75 ? "triplo" : "ima";
  }

  private collect(p: Drop): void {
    if (p.kind === "parafuso") {
      this.score += 25;
      this.sounds.push("cab-coin");
      return;
    }
    this.sounds.push("cab-power");
    if (p.kind === "escudo") this.ship.shield = true;
    else this.powers[p.kind] = p.kind === "triplo" ? 9 : 12;
  }

  private hurt(): void {
    this.chain = 0;
    if (this.ship.shield) {
      this.ship.shield = false;
      this.ship.inv = 1;
      this.sounds.push("cab-shield");
      return;
    }
    this.lives--;
    this.sounds.push("cab-death");
    this.burst(this.ship.x, this.ship.y, 22, PX.orange);
    if (this.lives <= 0) {
      this.over = true;
      return;
    }
    this.ship.inv = 2.2;
    this.powers.triplo = 0;
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n && this.sparks.length < 160; i++) {
      const a = this.r() * Math.PI * 2;
      const sp = 20 + this.r() * 60;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + this.r() * 0.45, color: i % 3 === 0 ? PX.gold : color });
    }
  }

  // ---------------------------------------------------------------- desenho

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = PX.black;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    stars(ctx, t, 7, 46, 6);
    stars(ctx, t, 31, 18, 18);
    planet(ctx);

    for (const p of this.drops) {
      if (p.kind === "parafuso") {
        ctx.fillStyle = PX.gold;
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
        ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
      } else {
        const c = p.kind === "escudo" ? PX.signal : p.kind === "triplo" ? PX.orange : PX.violet;
        const blink = Math.floor(t * 6) % 2 === 0;
        disc(ctx, p.x, p.y, 5, blink ? c : PX.navy);
        disc(ctx, p.x, p.y, 4, PX.night);
        pixelText(ctx, p.kind === "escudo" ? "E" : p.kind === "triplo" ? "T" : "I", p.x - 2, p.y - 3, { color: c });
      }
    }

    for (const d of this.debris) {
      const spr = debrisSprite(d.size, d.shape);
      const rot = Math.floor(t * d.spin + d.phase) % 4;
      ctx.save();
      ctx.translate(Math.round(d.x), Math.round(d.y));
      ctx.rotate((rot * Math.PI) / 2);
      ctx.drawImage(spr.canvas, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
      ctx.restore();
    }

    if (this.sat) {
      const hit = t - this.sat.hitAt < 0.1;
      drawSprite(ctx, satSprite(hit), this.sat.x, this.sat.y);
    }

    ctx.fillStyle = PX.signal;
    for (const b of this.bullets) {
      ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 4);
      ctx.fillStyle = PX.white;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
      ctx.fillStyle = PX.signal;
    }

    const s = this.ship;
    if (!this.over && (s.inv <= 0 || Math.floor(t * 12) % 2 === 0)) {
      drawSprite(ctx, shipSprite(), s.x, s.y);
      // chama do motor
      if (Math.floor(t * 20) % 2 === 0) {
        ctx.fillStyle = PX.signal;
        ctx.fillRect(Math.round(s.x) - 3, Math.round(s.y) + 4, 1, 2);
        ctx.fillRect(Math.round(s.x) + 3, Math.round(s.y) + 4, 1, 2);
      }
      if (s.shield) {
        ctx.fillStyle = Math.floor(t * 8) % 2 ? PX.signal : PX.sky;
        for (let a = 0; a < 16; a++) ctx.fillRect(Math.round(s.x + Math.cos((a / 16) * Math.PI * 2) * 9), Math.round(s.y + Math.sin((a / 16) * Math.PI * 2) * 9), 1, 1);
      }
    }

    for (const p of this.sparks) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }

    hud(ctx, this.score, this.lives, `ONDA ${this.level}`, lifeSprite());
    if (this.mult > 1) pixelText(ctx, `×${this.mult}`, 44, 3, { color: PX.gold });
    let px = 4;
    for (const k of ["triplo", "ima"] as Power[]) {
      if (this.powers[k] <= 0) continue;
      const c = k === "triplo" ? PX.orange : PX.violet;
      ctx.fillStyle = c;
      ctx.fillRect(px, 15, Math.ceil((this.powers[k] / 12) * 30), 2);
      px += 34;
    }
    if (this.bannerT > 0) banner(ctx, this.bannerText, 110);
  }
}

// ---------------------------------------------------------------- arte

function planet(ctx: CanvasRenderingContext2D): void {
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H + 186;
  const R = 200;
  for (let y = SCREEN_H - 16; y < SCREEN_H; y++) {
    const dy = y - cy;
    if (Math.abs(dy) > R) continue;
    const w = Math.floor(Math.sqrt(R * R - dy * dy));
    ctx.fillStyle = y < SCREEN_H - 15 + 1 ? PX.sky : y < SCREEN_H - 13 ? "#1B4C72" : "#123A5E";
    ctx.fillRect(cx - w, y, w * 2, 1);
  }
  ctx.fillStyle = "#2BC48A";
  ctx.fillRect(cx - 60, SCREEN_H - 9, 22, 2);
  ctx.fillRect(cx + 30, SCREEN_H - 6, 30, 2);
  ctx.fillStyle = PX.white;
  ctx.fillRect(cx - 20, SCREEN_H - 11, 14, 1);
}

let shipS: Sprite | null = null;
function shipSprite(): Sprite {
  return (shipS ??= sprite(
    ["....w....", "...wsw...", "..owwwo..", ".ooosooo.", "ooonnnooo", "o.o...o.o", "..g...g.."],
    { o: PX.orange, w: PX.white, s: PX.sky, n: PX.navy, g: PX.slate },
  ));
}

let lifeS: Sprite | null = null;
function lifeSprite(): Sprite {
  return (lifeS ??= sprite(["..w..", ".ooo.", "ooooo", "o.o.o"], { o: PX.orange, w: PX.white }));
}

const satS: Sprite[] = [];
function satSprite(hit: boolean): Sprite {
  const i = hit ? 1 : 0;
  return (satS[i] ??= sprite(
    ["bbbb.....bbbb", "bbbbgwwwgbbbb", "bbbb.wow.bbbb", "bbbbgwwwgbbbb", "bbbb..w..bbbb", "......w......"],
    hit ? { b: PX.white, g: PX.white, w: PX.white, o: PX.white } : { b: PX.signal, g: PX.slate, w: PX.cream, o: PX.orange },
  ));
}

const debrisCache = new Map<number, Sprite>();
/** Sucata: blocos irregulares gerados por semente (4 formas por tamanho). */
function debrisSprite(size: 0 | 1 | 2, shape: number): Sprite {
  const key = size * 10 + shape;
  const hit = debrisCache.get(key);
  if (hit) return hit;
  const R = RADIUS[size];
  const n = R * 2 + 1;
  const r = rng(1000 + key * 77);
  const ph = [r() * 6, r() * 6, r() * 6];
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const dx = x - R;
      const dy = y - R;
      const a = Math.atan2(dy, dx);
      const lim = R * (0.72 + 0.14 * Math.sin(a * 3 + ph[0]!) + 0.1 * Math.sin(a * 5 + ph[1]!));
      const d = Math.hypot(dx, dy);
      if (d > lim) row += ".";
      else if (d > lim - 1.1) row += "e";
      else if ((x * 7 + y * 13 + key) % 23 === 0) row += size === 2 ? "o" : "h";
      else if (dx + dy < -R * 0.4) row += "h";
      else row += "b";
    }
    rows.push(row);
  }
  const s = sprite(rows, { b: PX.slate, e: PX.dim, h: PX.cream, o: PX.orange });
  debrisCache.set(key, s);
  return s;
}
