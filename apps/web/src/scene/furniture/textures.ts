import * as THREE from "three";
import { PALETTE } from "../materials.ts";

/**
 * Texturas desenhadas em canvas: tela ociosa (TV), ranking e letreiro neon.
 * As fontes da marca (NORD) carregam sob demanda: desenha com a reserva e redesenha quando chegarem.
 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, font?: string, isDead?: () => boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (font && typeof document !== "undefined" && document.fonts) {
    void document.fonts
      .load(font)
      .then(() => {
        if (isDead?.()) return;
        ctx.clearRect(0, 0, w, h);
        draw(ctx, w, h);
        tex.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return tex;
}

/** Tela desligada/ociosa: escura, com um leve brilho azul. */
export function screenTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 144, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#051326");
    g.addColorStop(1, "#0B2A4D");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = ctx.createRadialGradient(w * 0.5, h * 0.55, 4, w * 0.5, h * 0.55, w * 0.55);
    r.addColorStop(0, "rgba(0,183,255,0.22)");
    r.addColorStop(1, "rgba(0,183,255,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
    // reflexo diagonal sutil
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.moveTo(w * 0.08, 0);
    ctx.lineTo(w * 0.36, 0);
    ctx.lineTo(w * 0.16, h);
    ctx.lineTo(-w * 0.12, h);
    ctx.closePath();
    ctx.fill();
  });
}

const FONT = '"NORD", "Arial Black", system-ui, sans-serif';

/** Painel de ranking: título e cinco barras coloridas. */
export function leaderboardTexture(): THREE.CanvasTexture {
  return canvasTexture(
    1024,
    480,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#071A33");
      g.addColorStop(1, "#0C2E55");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.offwhite;
      ctx.font = `700 46px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText("RANKING DO MÊS", 48, 52);
      ctx.fillStyle = PALETTE.signal;
      ctx.fillRect(48, 86, 120, 8);
      const rows = [
        { v: 0.94, bar: PALETTE.orange, medal: PALETTE.gold, label: "Comercial" },
        { v: 0.8, bar: PALETTE.signal, medal: "#C9D1DC", label: "Parcerias" },
        { v: 0.68, bar: PALETTE.sky, medal: PALETTE.wood, label: "Expansão" },
        { v: 0.52, bar: "#2C7FB8", medal: PALETTE.slate, label: "Inside Sales" },
        { v: 0.4, bar: "#2A5F92", medal: PALETTE.slate, label: "Novos negócios" },
      ];
      const top = 124;
      const rowH = (h - top - 24) / rows.length;
      rows.forEach((r, i) => {
        const y = top + i * rowH + rowH / 2;
        ctx.fillStyle = r.medal;
        ctx.beginPath();
        ctx.arc(76, y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.navyDeep;
        ctx.font = `700 26px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), 76, y + 2);
        ctx.textAlign = "left";
        const x0 = 330;
        const bw = (w - x0 - 60) * r.v;
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        roundRect(ctx, x0, y - 20, w - x0 - 60, 40, 20);
        ctx.fill();
        ctx.fillStyle = r.bar;
        roundRect(ctx, x0, y - 20, bw, 40, 20);
        ctx.fill();
        ctx.fillStyle = PALETTE.offwhite;
        ctx.font = `500 28px ${FONT}`;
        ctx.fillText(r.label, 120, y + 2);
      });
    },
    `700 46px ${FONT}`,
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(w, r * 2), h, r);
}

/** Letreiro neon: texto com halo na cor do accent e núcleo claro. Fundo transparente. */
export function neonTexture(text: string, color: string, aspect: number, isDead: () => boolean): THREE.CanvasTexture {
  const w = 1024;
  const h = Math.max(128, Math.round(w / Math.max(0.5, aspect)));
  const core = `#${new THREE.Color(color).lerp(new THREE.Color("#FFFFFF"), 0.7).getHexString()}`;
  return canvasTexture(
    w,
    h,
    (ctx) => {
      let size = h * 0.56;
      ctx.font = `500 ${size}px ${FONT}`;
      const mw = ctx.measureText(text).width;
      if (mw > w * 0.84) size *= (w * 0.84) / mw;
      ctx.font = `500 ${size}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      // Letras um pouco afastadas e contorno fino: a abertura estreita do "C" da NORD não fecha
      // (com contorno grosso, "ARCADE" virava "AROADE").
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(size * 0.05)}px`;
      const x = w / 2;
      const y = h / 2 + size * 0.04;
      // halo largo
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.6;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fillText(text, x, y);
      // tubo
      ctx.globalAlpha = 1;
      ctx.shadowBlur = size * 0.2;
      ctx.lineWidth = size * 0.045;
      ctx.strokeStyle = color;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      // núcleo claro
      ctx.shadowBlur = 0;
      ctx.lineWidth = size * 0.02;
      ctx.strokeStyle = core;
      ctx.strokeText(text, x, y);
    },
    `500 64px ${FONT}`,
    isDead,
  );
}
