import { TRUCO_RANKS, checkersIsKing, checkersOwner, trucoRank, trucoSuit, type DominoLink } from "@infinity/world";
import { CARD, CHECKER, CHECKER_CROWN, SUIT_COLOR, SUIT_INK, TILE } from "./palette.ts";

/**
 * Arte própria das cartas, pedras e peças, desenhada no canvas. O painel (canvas no DOM) e o tampo das
 * mesas (textura do mundo, nas duas lentes) usam as mesmas funções, então a mesa e o painel batem.
 *
 * Baralho espanhol em traço limpo: ouros (moeda), espadas (espada), copas (taça) e paus (bastão),
 * cada naipe na sua cor. Nada copiado de baralho comercial.
 */

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// ---------------------------------------------------------------- naipes

/** Desenha o símbolo do naipe centrado em (cx, cy), com altura `s`. 0 ouros, 1 espadas, 2 copas, 3 paus. */
export function drawSuit(ctx: Ctx, suit: number, cx: number, cy: number, s: number): void {
  const color = SUIT_COLOR[suit] ?? SUIT_COLOR[0];
  const ink = SUIT_INK[suit] ?? SUIT_INK[0];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = color;
  if (suit === 0) {
    // Ouros: moeda com aro e um sol de oito raios no meio.
    ctx.beginPath();
    ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
    ctx.lineWidth = 0.03;
    ctx.stroke();
    ctx.lineWidth = 0.04;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.12, Math.sin(a) * 0.12);
      ctx.lineTo(Math.cos(a) * 0.22, Math.sin(a) * 0.22);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  } else if (suit === 1) {
    // Espadas: espada reta de ponta para cima, guarda larga e pomo redondo.
    ctx.beginPath();
    ctx.moveTo(0, -0.48);
    ctx.lineTo(0.075, -0.36);
    ctx.lineTo(0.075, 0.15);
    ctx.lineTo(-0.075, 0.15);
    ctx.lineTo(-0.075, -0.36);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.38);
    ctx.lineTo(0, 0.1);
    ctx.lineWidth = 0.018;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    rr(ctx, -0.27, 0.14, 0.54, 0.09, 0.045);
    ctx.fill();
    ctx.fillStyle = color;
    rr(ctx, -0.055, 0.22, 0.11, 0.18, 0.02);
    ctx.fill();
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.44, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  } else if (suit === 2) {
    // Copas: taça de bojo largo, haste com nó e pé.
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.3);
    ctx.lineTo(0.36, -0.3);
    ctx.quadraticCurveTo(0.37, 0.08, 0.06, 0.14);
    ctx.lineTo(0.06, 0.27);
    ctx.quadraticCurveTo(0.22, 0.31, 0.25, 0.42);
    ctx.lineTo(-0.25, 0.42);
    ctx.quadraticCurveTo(-0.22, 0.31, -0.06, 0.27);
    ctx.lineTo(-0.06, 0.14);
    ctx.quadraticCurveTo(-0.37, 0.08, -0.36, -0.3);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.045;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -0.3, 0.36, 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 0.11, 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    // brilho no bojo
    ctx.beginPath();
    ctx.moveTo(-0.24, -0.16);
    ctx.quadraticCurveTo(-0.22, 0.0, -0.1, 0.06);
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.stroke();
  } else {
    // Paus: bastão de madeira, fino embaixo e largo em cima, com nós de galho cortado.
    ctx.beginPath();
    ctx.moveTo(-0.06, 0.46);
    ctx.lineTo(0.06, 0.46);
    ctx.lineTo(0.14, -0.28);
    ctx.quadraticCurveTo(0.16, -0.47, 0, -0.48);
    ctx.quadraticCurveTo(-0.16, -0.47, -0.14, -0.28);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.045;
    ctx.stroke();
    const knot = (x: number, y: number, dir: number) => {
      ctx.beginPath();
      ctx.ellipse(x + dir * 0.06, y, 0.06, 0.035, dir * -0.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 0.035;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + dir * 0.1, y - 0.015, 0.022, 0.03, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
    };
    knot(0.11, -0.12, 1);
    knot(-0.09, 0.06, -1);
    knot(0.07, 0.24, 1);
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.38);
    ctx.lineTo(-0.03, -0.2);
    ctx.moveTo(0.03, -0.02);
    ctx.lineTo(0.02, 0.14);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cartas

/** Quantos símbolos cada valor tem (figuras: 0). Ordem de TRUCO_RANKS. */
const PIPS = [4, 5, 6, 7, 0, 0, 0, 1, 2, 3];
const LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.18],
    [0.5, 0.82],
  ],
  3: [
    [0.5, 0.14],
    [0.5, 0.5],
    [0.5, 0.86],
  ],
  4: [
    [0.26, 0.18],
    [0.74, 0.18],
    [0.26, 0.82],
    [0.74, 0.82],
  ],
  5: [
    [0.26, 0.16],
    [0.74, 0.16],
    [0.5, 0.5],
    [0.26, 0.84],
    [0.74, 0.84],
  ],
  6: [
    [0.26, 0.14],
    [0.74, 0.14],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.26, 0.86],
    [0.74, 0.86],
  ],
  7: [
    [0.26, 0.12],
    [0.74, 0.12],
    [0.5, 0.31],
    [0.26, 0.5],
    [0.74, 0.5],
    [0.26, 0.88],
    [0.74, 0.88],
  ],
};

/** Enfeite das figuras: coroa (rei), diadema (dama) e boina com pena (valete). */
function drawFigureMark(ctx: Ctx, rank: string, cx: number, cy: number, s: number, ink: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.07;
  ctx.fillStyle = CHECKER_CROWN;
  ctx.beginPath();
  if (rank === "K") {
    ctx.moveTo(-0.45, 0.3);
    ctx.lineTo(-0.45, -0.2);
    ctx.lineTo(-0.22, 0.05);
    ctx.lineTo(0, -0.35);
    ctx.lineTo(0.22, 0.05);
    ctx.lineTo(0.45, -0.2);
    ctx.lineTo(0.45, 0.3);
    ctx.closePath();
  } else if (rank === "Q") {
    ctx.moveTo(-0.42, 0.3);
    ctx.quadraticCurveTo(-0.4, -0.05, 0, -0.12);
    ctx.quadraticCurveTo(0.4, -0.05, 0.42, 0.3);
    ctx.closePath();
  } else {
    ctx.ellipse(0, 0.12, 0.42, 0.2, 0, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (rank === "Q") {
    for (const x of [-0.24, 0, 0.24]) {
      ctx.beginPath();
      ctx.arc(x, x === 0 ? -0.24 : -0.12, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (rank === "J") {
    ctx.beginPath();
    ctx.moveTo(0.2, -0.06);
    ctx.quadraticCurveTo(0.45, -0.45, 0.62, -0.42);
    ctx.stroke();
  }
  ctx.restore();
}

/** Carta de frente. `card` = naipe * 10 + valor (ver TRUCO_RANKS). */
export function drawCard(ctx: Ctx, card: number, x: number, y: number, w: number, h: number): void {
  const suit = trucoSuit(card);
  const rank = TRUCO_RANKS[trucoRank(card)] ?? "4";
  const ink = SUIT_INK[suit] ?? SUIT_INK[0];
  ctx.save();
  rr(ctx, x, y, w, h, w * 0.09);
  ctx.fillStyle = CARD.face;
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.strokeStyle = CARD.edge;
  ctx.stroke();
  // filete interno na cor do naipe
  rr(ctx, x + w * 0.06, y + w * 0.06, w - w * 0.12, h - w * 0.12, w * 0.05);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // índice nos cantos
  const corner = (flip: boolean) => {
    ctx.save();
    if (flip) {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
    } else ctx.translate(x, y);
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(w * 0.24)}px Geist, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(rank, w * 0.17, h * 0.13);
    drawSuit(ctx, suit, w * 0.17, h * 0.13 + w * 0.22, w * 0.17);
    ctx.restore();
  };
  corner(false);
  corner(true);

  // miolo
  const n = PIPS[trucoRank(card)] ?? 0;
  const ax = x + w * 0.3;
  const ay = y + h * 0.16;
  const aw = w * 0.4;
  const ah = h * 0.68;
  if (n === 1) drawSuit(ctx, suit, x + w / 2, y + h / 2, w * 0.5);
  else if (n > 1) {
    const size = Math.min(w * (n > 5 ? 0.2 : 0.24), ah / (n > 3 ? 3.4 : n + 0.6));
    for (const [u, v] of LAYOUT[n] ?? []) drawSuit(ctx, suit, ax + u * aw, ay + v * ah, size);
  } else {
    // Figura: painel com a cor do naipe, enfeite e o naipe grande.
    rr(ctx, x + w * 0.27, y + h * 0.17, w * 0.46, h * 0.66, w * 0.06);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = SUIT_COLOR[suit] ?? SUIT_COLOR[0];
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, w * 0.015);
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawFigureMark(ctx, rank, x + w / 2, y + h * 0.33, w * 0.26, ink);
    drawSuit(ctx, suit, x + w / 2, y + h * 0.6, w * 0.34);
  }
  ctx.restore();
}

/** Verso da carta: navy com treliça e um losango no centro (sem logo, sem repetição da estrela). */
export function drawCardBack(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  rr(ctx, x, y, w, h, w * 0.09);
  ctx.fillStyle = CARD.back;
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();
  const ix = x + w * 0.09;
  const iy = y + w * 0.09;
  const iw = w - w * 0.18;
  const ih = h - w * 0.18;
  rr(ctx, ix, iy, iw, ih, w * 0.05);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = CARD.backLine;
  ctx.lineWidth = Math.max(1, w * 0.03);
  const step = w * 0.16;
  for (let d = -ih; d < iw + ih; d += step) {
    ctx.beginPath();
    ctx.moveTo(ix + d, iy);
    ctx.lineTo(ix + d + ih, iy + ih);
    ctx.moveTo(ix + d, iy + ih);
    ctx.lineTo(ix + d + ih, iy);
    ctx.stroke();
  }
  ctx.restore();
  rr(ctx, ix, iy, iw, ih, w * 0.05);
  ctx.strokeStyle = CARD.backRim;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // losango central
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = w * 0.17;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.3);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r * 1.3);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = CARD.back;
  ctx.fill();
  ctx.strokeStyle = "#00B7FF";
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- dominó

/** Posição dos pontos (0 a 6) numa metade quadrada, em frações do lado. */
const DOTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.27, 0.22],
    [0.73, 0.22],
    [0.27, 0.5],
    [0.73, 0.5],
    [0.27, 0.78],
    [0.73, 0.78],
  ],
};

/**
 * Pedra de dominó de frente. Mais larga que alta: `a` à esquerda e `b` à direita; mais alta que larga:
 * `a` em cima e `b` embaixo.
 */
export function drawTile(ctx: Ctx, a: number, b: number, x: number, y: number, w: number, h: number): void {
  const horizontal = w >= h;
  const side = horizontal ? Math.min(w / 2, h) : Math.min(w, h / 2);
  ctx.save();
  rr(ctx, x, y, w, h, side * 0.16);
  ctx.fillStyle = TILE.face;
  ctx.fill();
  ctx.lineWidth = Math.max(1, side * 0.05);
  ctx.strokeStyle = TILE.edge;
  ctx.stroke();
  // divisória
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x + w / 2, y + h * 0.16);
    ctx.lineTo(x + w / 2, y + h * 0.84);
  } else {
    ctx.moveTo(x + w * 0.16, y + h / 2);
    ctx.lineTo(x + w * 0.84, y + h / 2);
  }
  ctx.lineWidth = Math.max(1, side * 0.045);
  ctx.strokeStyle = TILE.line;
  ctx.stroke();
  ctx.fillStyle = TILE.pip;
  const r = side * 0.085;
  const half = (n: number, hx: number, hy: number) => {
    for (const [u, v] of DOTS[n] ?? []) {
      // Na pedra deitada, os pontos giram junto (o 6 fica em duas fileiras de três).
      const px = horizontal ? hx + v * side : hx + u * side;
      const py = horizontal ? hy + u * side : hy + v * side;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  if (horizontal) {
    half(a, x + (w / 2 - side) / 2, y + (h - side) / 2);
    half(b, x + w / 2 + (w / 2 - side) / 2, y + (h - side) / 2);
  } else {
    half(a, x + (w - side) / 2, y + (h / 2 - side) / 2);
    half(b, x + (w - side) / 2, y + h / 2 + (h / 2 - side) / 2);
  }
  ctx.restore();
}

/** Pedra virada para baixo. */
export function drawTileBack(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const side = Math.min(w, h);
  ctx.save();
  rr(ctx, x, y, w, h, side * 0.18);
  ctx.fillStyle = TILE.back;
  ctx.fill();
  ctx.lineWidth = Math.max(1, side * 0.08);
  ctx.strokeStyle = TILE.backRim;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, side * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = TILE.backRim;
  ctx.fill();
  ctx.restore();
}

/** Pedra na fileira: retângulo em "células" (meia pedra = 1) e os números na ordem do desenho. */
export interface TilePlace {
  link: DominoLink;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Número desenhado à esquerda (ou em cima) e à direita (ou embaixo). */
  first: number;
  second: number;
}

/** Altura de uma fileira da cobrinha, em células (cabe a bucha em pé). */
export const SNAKE_ROW = 2.3;

/**
 * Cobrinha: a fileira da mesa em linhas de `cols` células, indo e voltando, para caber num quadro.
 * Pedras comuns ficam deitadas (2 × 1); buchas, em pé (1 × 2), como na mesa de verdade.
 */
export function dominoSnake(chain: readonly DominoLink[], cols: number): { places: TilePlace[]; rows: number } {
  const places: TilePlace[] = [];
  let row = 0;
  let dir = 1;
  let cursor = 0;
  for (const link of chain) {
    const double = link.a === link.b;
    const w = double ? 1 : 2;
    const room = dir > 0 ? cols - cursor : cursor;
    if (room < w) {
      row++;
      dir = -dir;
      cursor = dir > 0 ? 0 : cols;
    }
    const x = dir > 0 ? cursor : cursor - w;
    cursor += dir * w;
    const y = row * SNAKE_ROW + (double ? 0 : 0.5);
    places.push({ link, x, y, w, h: double ? 2 : 1, first: dir > 0 ? link.a : link.b, second: dir > 0 ? link.b : link.a });
  }
  return { places, rows: chain.length ? row + 1 : 0 };
}

// ---------------------------------------------------------------- damas

/** Peça de damas vista de cima, centrada em (cx, cy), raio r. Dama ganha a coroa dourada. */
export function drawChecker(ctx: Ctx, piece: number, cx: number, cy: number, r: number): void {
  const owner = checkersOwner(piece);
  if (owner < 0) return;
  const c = CHECKER[owner as 0 | 1];
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.12, r, r * 0.98, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = c.rim;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.05, r * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.05, r * 0.6, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = c.ring;
  ctx.stroke();
  if (checkersIsKing(piece)) {
    ctx.translate(cx, cy - r * 0.05);
    ctx.scale(r, r);
    ctx.beginPath();
    ctx.moveTo(-0.42, 0.26);
    ctx.lineTo(-0.42, -0.2);
    ctx.lineTo(-0.2, 0.02);
    ctx.lineTo(0, -0.34);
    ctx.lineTo(0.2, 0.02);
    ctx.lineTo(0.42, -0.2);
    ctx.lineTo(0.42, 0.26);
    ctx.closePath();
    ctx.fillStyle = CHECKER_CROWN;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = owner === 0 ? "#9A6A10" : "#2A1E05";
    ctx.stroke();
  }
  ctx.restore();
}
