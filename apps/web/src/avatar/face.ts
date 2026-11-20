import * as THREE from "three";
import type { AvatarLook } from "@infinity/world";

/**
 * Rosto do avatar desenhado num canvas (olhos, sobrancelhas, boca, bochechas, barba).
 * Várias expressões por pessoa: o avatar troca de textura para piscar e reagir.
 */

export type Expression = "neutral" | "blink" | "happy" | "laugh" | "surprised" | "think" | "heart" | "wink";

const SIZE = 256;
const cache = new Map<string, THREE.CanvasTexture>();

/** Textura do rosto para um visual e uma expressão (em cache; compartilhada entre avatares iguais). */
export function faceTexture(look: AvatarLook, expr: Expression): THREE.CanvasTexture {
  const key = `${look.eyes}|${look.brows}|${look.mouth}|${look.facial}|${look.hairColor}|${look.skin}|${expr}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  draw(g, look, expr);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const INK = "#1B1714";

function draw(g: CanvasRenderingContext2D, look: AvatarLook, expr: Expression): void {
  g.clearRect(0, 0, SIZE, SIZE);
  g.lineCap = "round";
  g.lineJoin = "round";
  const cx = SIZE / 2;
  const eyeY = 122;
  const eyeDX = 40;

  // Bochechas rosadas.
  g.fillStyle = "rgba(255, 120, 130, 0.28)";
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 62, 158, 20, 12, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Barba (por baixo da boca).
  drawFacial(g, look, cx);

  // Olhos.
  for (const s of [-1, 1]) {
    const x = cx + s * eyeDX;
    const wink = expr === "wink" && s === 1;
    if (expr === "blink" || wink) arcEye(g, x, eyeY, false);
    else if (expr === "happy" || expr === "laugh") arcEye(g, x, eyeY, true);
    else if (expr === "heart") heart(g, x, eyeY, 17, "#E84A6F");
    else if (expr === "surprised") roundEye(g, x, eyeY, 13, 16, true);
    else if (expr === "think") roundEye(g, x + 3, eyeY - 5, 9, 12, true);
    else styledEye(g, look.eyes, x, eyeY, s);
  }

  // Sobrancelhas.
  if (look.brows !== 3) {
    g.strokeStyle = shade(look.hairColor, -0.25);
    g.lineWidth = look.brows === 1 ? 9 : 6;
    const lift = expr === "surprised" ? -10 : expr === "think" ? -6 : 0;
    for (const s of [-1, 1]) {
      const x = cx + s * eyeDX;
      g.beginPath();
      if (look.brows === 2) {
        g.moveTo(x - 16, eyeY - 26 + lift);
        g.quadraticCurveTo(x, eyeY - 40 + lift, x + 16, eyeY - 28 + lift);
      } else {
        const tilt = expr === "think" && s === -1 ? -5 : 0;
        g.moveTo(x - 15, eyeY - 30 + lift + tilt);
        g.lineTo(x + 15, eyeY - 32 + lift - tilt);
      }
      g.stroke();
    }
  }

  // Boca.
  const my = 176;
  g.strokeStyle = INK;
  g.fillStyle = "#7A2E2E";
  g.lineWidth = 6;
  if (expr === "laugh" || expr === "surprised" || expr === "heart") {
    g.beginPath();
    if (expr === "surprised") g.ellipse(cx, my + 2, 9, 12, 0, 0, Math.PI * 2);
    else {
      g.moveTo(cx - 22, my - 4);
      g.quadraticCurveTo(cx, my + 30, cx + 22, my - 4);
      g.closePath();
    }
    g.fill();
    g.stroke();
    if (expr !== "surprised") {
      g.fillStyle = "#F07A85";
      g.beginPath();
      g.ellipse(cx, my + 12, 9, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  if (expr === "think") {
    g.beginPath();
    g.moveTo(cx - 8, my + 4);
    g.lineTo(cx + 10, my + 1);
    g.stroke();
    return;
  }
  const style = expr === "happy" ? 1 : look.mouth;
  g.beginPath();
  if (style === 0) {
    g.moveTo(cx - 16, my - 2);
    g.quadraticCurveTo(cx, my + 14, cx + 16, my - 2);
    g.stroke();
  } else if (style === 1) {
    g.moveTo(cx - 20, my - 4);
    g.quadraticCurveTo(cx, my + 24, cx + 20, my - 4);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (style === 2) {
    g.moveTo(cx - 12, my + 2);
    g.lineTo(cx + 12, my + 2);
    g.stroke();
  } else {
    g.moveTo(cx - 16, my);
    g.quadraticCurveTo(cx - 8, my + 9, cx, my);
    g.quadraticCurveTo(cx + 8, my + 9, cx + 16, my);
    g.stroke();
  }
}

function styledEye(g: CanvasRenderingContext2D, style: number, x: number, y: number, side: number): void {
  switch (style) {
    case 0:
      roundEye(g, x, y, 9, 11, true);
      break;
    case 1:
      roundEye(g, x, y, 13, 17, true, true);
      break;
    case 2:
      arcEye(g, x, y, true);
      break;
    case 3: {
      roundEye(g, x, y + 3, 10, 8, true);
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x - 13, y - 2);
      g.lineTo(x + 13, y - 2);
      g.stroke();
      break;
    }
    case 4: {
      roundEye(g, x, y, 11, 14, true);
      g.strokeStyle = INK;
      g.lineWidth = 4;
      for (const k of [-1, 0, 1]) {
        g.beginPath();
        g.moveTo(x + side * 8 + k * 6, y - 12);
        g.lineTo(x + side * 13 + k * 8, y - 21);
        g.stroke();
      }
      break;
    }
    default: {
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(x, y, 14, 9, side * -0.18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#FFFFFF";
      g.beginPath();
      g.arc(x - 4, y - 3, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function roundEye(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, shine: boolean, big = false): void {
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  if (big) {
    g.fillStyle = "#2E5D8A";
    g.beginPath();
    g.ellipse(x, y + ry * 0.35, rx * 0.7, ry * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (shine) {
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.arc(x - rx * 0.32, y - ry * 0.35, Math.max(2.5, rx * 0.32), 0, Math.PI * 2);
    g.fill();
  }
}

/** Olho fechado: arco para cima (feliz) ou linha (piscando). */
function arcEye(g: CanvasRenderingContext2D, x: number, y: number, happy: boolean): void {
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  if (happy) {
    g.moveTo(x - 13, y + 4);
    g.quadraticCurveTo(x, y - 14, x + 13, y + 4);
  } else {
    g.moveTo(x - 12, y + 2);
    g.quadraticCurveTo(x, y + 8, x + 12, y + 2);
  }
  g.stroke();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.8);
  g.bezierCurveTo(x - s * 1.3, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.3, y - s * 0.1, x, y + s * 0.8);
  g.fill();
}

function drawFacial(g: CanvasRenderingContext2D, look: AvatarLook, cx: number): void {
  if (look.facial === 0) return;
  const c = shade(look.hairColor, -0.1);
  g.fillStyle = c;
  if (look.facial === 1 || look.facial === 4) {
    // Bigode (encorpado: o rosto do avatar novo é pequeno na cabeça quadrada).
    g.beginPath();
    g.moveTo(cx - 34, 174);
    g.quadraticCurveTo(cx - 18, 146, cx, 158);
    g.quadraticCurveTo(cx + 18, 146, cx + 34, 174);
    g.quadraticCurveTo(cx, 164, cx - 34, 174);
    g.fill();
  }
  if (look.facial === 4) {
    g.beginPath();
    g.ellipse(cx, 204, 14, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (look.facial === 2 || look.facial === 3) {
    g.globalAlpha = look.facial === 2 ? 0.55 : 1;
    g.beginPath();
    g.moveTo(cx - 92, 132);
    g.quadraticCurveTo(cx - 88, 214, cx, look.facial === 3 ? 238 : 224);
    g.quadraticCurveTo(cx + 88, 214, cx + 92, 132);
    g.lineTo(cx + 74, 140);
    g.quadraticCurveTo(cx + 60, 196, cx, 196);
    g.quadraticCurveTo(cx - 60, 196, cx - 74, 140);
    g.closePath();
    g.fill();
    // Bigode junto.
    g.beginPath();
    g.moveTo(cx - 26, 170);
    g.quadraticCurveTo(cx, 156, cx + 26, 170);
    g.quadraticCurveTo(cx, 164, cx - 26, 170);
    g.fill();
    g.globalAlpha = 1;
  }
}

/** Clareia (k > 0) ou escurece (k < 0) uma cor hex. */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color("#FFFFFF"), k);
  return `#${c.getHexString()}`;
}
