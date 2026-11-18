import * as THREE from "three";
import {
  C4_COLS,
  C4_EMPTY,
  C4_ROWS,
  GAMES,
  TTT_EMPTY,
  DOMINO_TILES,
  chessBoard,
  chessKingSquare,
  checkersDark,
  type BaseState,
  type CheckersState,
  type ChessState,
  type Connect4State,
  type DominoState,
  type GameSnapshot,
  type TicTacToeState,
  type TrucoState,
} from "@infinity/world";
import { useApp } from "../state/store.ts";
import { tableKind } from "./api.ts";
import { drawPiece } from "./pieces.ts";
import { C4_FRAME, CHECKERS_DARK, CHECKERS_LIGHT, CHESS_DARK, CHESS_LIGHT, DISC, DOMINO_WOOD, FELT, TTT_COLOR } from "./palette.ts";
import { SNAKE_ROW, dominoSnake, drawCard, drawCardBack, drawChecker, drawTile, drawTileBack } from "./tableArt.ts";

/**
 * Textura do tampo das mesas de jogo: o estado da partida visto de cima, para quem passa ver o jogo.
 *
 * - Canvas quadrado de 512 px; o tabuleiro ocupa o centro (o Lig 4, mais largo que alto, fica com faixas em cima e embaixo).
 * - Xadrez: brancas embaixo (v = 0). Lig 4: a grade "deitada", linha de cima no topo da imagem.
 * - Damas: Claras embaixo. Dominó e truco: o lugar 0 embaixo, o 1 à direita, o 2 em cima e o 3 à esquerda
 *   (como as cadeiras: sul, leste, norte, oeste). As mãos aparecem viradas para baixo; cada pessoa desenha
 *   a partir da própria visão do estado, então nada escondido vai parar na textura.
 * - Uma textura por mesa, compartilhada e viva enquanto o app estiver aberto (assina a store e se redesenha sozinha).
 *   Não precisa (nem deve) chamar dispose: se chamar, o three recria na próxima renderização.
 * - Para o 2D (Pixi): use `boardCanvas(table)` como fonte e `onBoardRedraw` para avisar a textura do Pixi.
 */

const SIZE = 512;

interface Entry {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry>();

export function boardTexture(table: string): THREE.CanvasTexture {
  return entry(table).texture;
}

/** O canvas por trás da textura (para quem desenha com outra biblioteca, como o Pixi do 2D). */
export function boardCanvas(table: string): HTMLCanvasElement {
  return entry(table).canvas;
}

/** Avisa quando o desenho da mesa mudou. Devolve a função para parar de ouvir. */
export function onBoardRedraw(table: string, fn: () => void): () => void {
  const e = entry(table);
  e.listeners.add(fn);
  return () => e.listeners.delete(fn);
}

function entry(table: string): Entry {
  const found = cache.get(table);
  if (found) return found;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = `mesa:${table}`;
  const e: Entry = { canvas, texture, listeners: new Set() };
  cache.set(table, e);

  const redraw = (snap: GameSnapshot | undefined) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawTable(ctx, snap?.kind ?? tableKind(table), snap?.state as BaseState | undefined);
    texture.needsUpdate = true;
    for (const fn of e.listeners) fn();
  };
  redraw(useApp.getState().games[table]);
  useApp.subscribe((s, prev) => {
    if (s.games[table] !== prev.games[table]) redraw(s.games[table]);
  });
  return e;
}

/** Desenha a partida (ou o tabuleiro arrumado, se ainda não chegou estado do servidor). */
function drawTable(ctx: CanvasRenderingContext2D, kind: string | null, state: BaseState | undefined): void {
  const s = state ?? (kind ? GAMES[kind]?.create() : undefined);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#0A2547";
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (kind === "chess" && s) drawChess(ctx, s as ChessState);
  else if (kind === "connect4" && s) drawConnect4(ctx, s as Connect4State);
  else if (kind === "tictactoe" && s) drawTicTacToe(ctx, s as TicTacToeState);
  else if (kind === "checkers" && s) drawCheckers(ctx, s as CheckersState);
  else if (kind === "domino") drawDomino(ctx, s as DominoState | undefined);
  else if (kind === "truco") drawTruco(ctx, s as TrucoState | undefined);
}

function drawCheckers(ctx: CanvasRenderingContext2D, s: CheckersState): void {
  const border = 16;
  const sq = (SIZE - border * 2) / 8;
  ctx.fillStyle = "#3E2A1C";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const xy = (i: number) => ({ x: border + (i % 8) * sq, y: border + Math.floor(i / 8) * sq });
  for (let i = 0; i < 64; i++) {
    const p = xy(i);
    ctx.fillStyle = checkersDark(i) ? CHECKERS_DARK : CHECKERS_LIGHT;
    ctx.fillRect(p.x, p.y, sq, sq);
  }
  if (s.last) {
    ctx.fillStyle = "rgba(0, 183, 255, 0.35)";
    for (const i of s.last.path) {
      const p = xy(i);
      ctx.fillRect(p.x, p.y, sq, sq);
    }
  }
  for (let i = 0; i < 64; i++) {
    const piece = s.board[i] ?? 0;
    if (!piece) continue;
    const p = xy(i);
    drawChecker(ctx, piece, p.x + sq / 2, p.y + sq / 2, sq * 0.4);
  }
}

/** Lado da mesa de cada lugar (0 sul/embaixo, 1 leste/direita, 2 norte/em cima, 3 oeste/esquerda). */
const SIDE_ANGLE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/** Desenha em volta do centro, girado para o lado do lugar: (0, +d) aponta para quem está sentado ali. */
function atSeat(ctx: CanvasRenderingContext2D, seat: number, fn: () => void): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(SIDE_ANGLE[seat] ?? 0);
  fn();
  ctx.restore();
}

function drawDomino(ctx: CanvasRenderingContext2D, s: DominoState | undefined): void {
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 40, SIZE / 2, SIZE / 2, SIZE * 0.72);
  g.addColorStop(0, DOMINO_WOOD.mid);
  g.addColorStop(1, DOMINO_WOOD.top);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, SIZE - 28, SIZE - 28);
  if (!s || s.active.length === 0) return;

  // Fileira em cobrinha no meio da mesa: pedras grandes enquanto cabem, apertando conforme a fileira cresce.
  const box = 360;
  let cols = 8;
  let snake = dominoSnake(s.chain, cols);
  let cell = box / (cols + 0.5);
  while (cols < 16 && Math.max(1, snake.rows) * SNAKE_ROW * cell > box) {
    cols += 2;
    snake = dominoSnake(s.chain, cols);
    cell = box / (cols + 0.5);
  }
  const { places, rows } = snake;
  const used = rows === 1 ? places.reduce((n, p) => n + p.w, 0) : cols;
  const ox = (SIZE - used * cell) / 2;
  const oy = (SIZE - Math.max(1, rows) * SNAKE_ROW * cell) / 2;
  for (const p of places) {
    const x = ox + p.x * cell;
    const y = oy + p.y * cell;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x + 2, y + 3, p.w * cell - 2, p.h * cell - 2);
    drawTile(ctx, p.first, p.second, x + 1, y + 1, p.w * cell - 2, p.h * cell - 2);
  }

  // Mãos na beira da mesa, viradas para baixo (no fim, à mostra para contar os pontos).
  for (const seat of s.active) {
    const n = s.counts[seat] ?? 0;
    const hand = s.over ? s.hands[seat] : null;
    const tw = 18;
    const th = 34;
    const gap = 3;
    const total = n * (tw + gap) - gap;
    atSeat(ctx, seat, () => {
      for (let i = 0; i < n; i++) {
        const x = -total / 2 + i * (tw + gap);
        const y = SIZE / 2 - 62;
        const tile = hand?.[i];
        const t = tile === undefined ? undefined : DOMINO_TILES[tile];
        if (t) drawTile(ctx, t[0], t[1], x, y, tw, th);
        else drawTileBack(ctx, x, y, tw, th);
      }
    });
  }

  // Monte (com 2 ou 3 pessoas), num canto.
  if (s.stockCount > 0) {
    const n = Math.min(s.stockCount, 14);
    for (let i = 0; i < n; i++) drawTileBack(ctx, 34 + (i % 7) * 9, 34 + Math.floor(i / 7) * 16 - (i % 7) * 0.5, 26, 14);
  }
}

function drawTruco(ctx: CanvasRenderingContext2D, s: TrucoState | undefined): void {
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 30, SIZE / 2, SIZE / 2, SIZE * 0.72);
  g.addColorStop(0, FELT.center);
  g.addColorStop(1, FELT.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "rgba(242,240,239,0.18)";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, SIZE - 44, SIZE - 44);
  if (!s || s.active.length === 0) return;

  // Vira, deitada de lado perto do centro.
  ctx.save();
  ctx.translate(SIZE / 2 - 150, SIZE / 2 + 6);
  ctx.rotate(-0.12);
  drawCard(ctx, s.vira, -28, -41, 56, 82);
  ctx.restore();

  // Vaza: a carta de cada um à frente de quem jogou; com a mesa vazia, a última vaza apagadinha.
  const cards = s.table.length ? s.table : (s.prevTrick?.cards ?? []);
  ctx.globalAlpha = s.table.length ? 1 : 0.5;
  for (const p of cards) {
    atSeat(ctx, p.seat, () => {
      ctx.rotate(((p.card % 7) - 3) * 0.03);
      drawCard(ctx, p.card, -32, 6, 64, 94);
    });
  }
  ctx.globalAlpha = 1;

  // Mãos de cada um, viradas para baixo, em leque na beira.
  for (const seat of s.active) {
    const n = s.counts[seat] ?? 0;
    atSeat(ctx, seat, () => {
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate((i - (n - 1) / 2) * 26, SIZE / 2 - 50);
        ctx.rotate((i - (n - 1) / 2) * 0.18);
        drawCardBack(ctx, -18, -26, 36, 54);
        ctx.restore();
      }
    });
  }

  // Placar das duplas no canto: dupla 1 (lugares 1 e 3) em azul, dupla 2 em claro.
  const pill = (x: number, text: string, bg: string, fg: string) => {
    ctx.beginPath();
    ctx.roundRect(x, 30, 54, 40, 12);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = "700 26px Geist, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 27, 51);
  };
  pill(SIZE - 150, String(s.score[0]), "#0A2547", "#F2F0EF");
  pill(SIZE - 88, String(s.score[1]), "#F2F0EF", "#0A2547");

  // Pedido de truco no ar: o grito aparece escrito na mesa.
  if (s.raise) {
    const word = s.raise.to <= 3 ? "TRUCO!" : s.raise.to === 6 ? "SEIS!" : s.raise.to === 9 ? "NOVE!" : "DOZE!";
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-0.12);
    ctx.font = "900 64px Geist, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,17,42,0.85)";
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = "#F2F0EF";
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }
}

function drawChess(ctx: CanvasRenderingContext2D, s: ChessState): void {
  const border = 16;
  const sq = (SIZE - border * 2) / 8;
  // Moldura navy fina, como uma borda de tabuleiro de madeira.
  ctx.fillStyle = "#0B1C36";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const xy = (square: string) => ({ x: border + (square.charCodeAt(0) - 97) * sq, y: border + (8 - Number(square[1])) * sq });

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (f + r) % 2 === 0 ? CHESS_LIGHT : CHESS_DARK;
      ctx.fillRect(border + f * sq, border + r * sq, sq, sq);
    }
  }
  if (s.last) {
    ctx.fillStyle = "rgba(0, 183, 255, 0.38)";
    for (const square of [s.last.from, s.last.to]) {
      const p = xy(square);
      ctx.fillRect(p.x, p.y, sq, sq);
    }
  }
  const checked = s.check ? chessKingSquare(s.fen, s.turn === 0 ? "w" : "b") : null;
  if (checked) {
    const p = xy(checked);
    const g = ctx.createRadialGradient(p.x + sq / 2, p.y + sq / 2, 0, p.x + sq / 2, p.y + sq / 2, sq * 0.7);
    g.addColorStop(0, "rgba(255, 90, 78, 1)");
    g.addColorStop(0.45, "rgba(255, 90, 78, 0.6)");
    g.addColorStop(1, "rgba(255, 90, 78, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x, p.y, sq, sq);
  }
  for (const piece of chessBoard(s.fen)) {
    if (!piece) continue;
    const p = xy(piece.square);
    drawPiece(ctx, piece.type, piece.color, p.x + sq * 0.04, p.y + sq * 0.04, sq * 0.92);
  }
}

function drawConnect4(ctx: CanvasRenderingContext2D, s: Connect4State): void {
  const margin = 14;
  const cell = (SIZE - margin * 2) / C4_COLS;
  const w = cell * C4_COLS;
  const h = cell * C4_ROWS;
  const x0 = margin;
  const y0 = (SIZE - h) / 2;
  const rHole = cell * 0.39;
  const center = (col: number, row: number) => ({ x: x0 + col * cell + cell / 2, y: y0 + row * cell + cell / 2 });

  // Grade azul.
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, C4_FRAME.top);
  g.addColorStop(1, C4_FRAME.bottom);
  ctx.fillStyle = g;
  roundRect(ctx, x0 - 6, y0 - 6, w + 12, h + 12, 14);
  ctx.fill();

  const inLine = new Set((s.line ?? []).map((c) => c.row * C4_COLS + c.col));
  for (let row = 0; row < C4_ROWS; row++) {
    for (let col = 0; col < C4_COLS; col++) {
      const { x, y } = center(col, row);
      const who = s.grid[row * C4_COLS + col] ?? C4_EMPTY;
      ctx.beginPath();
      ctx.arc(x, y, rHole, 0, Math.PI * 2);
      if (who === C4_EMPTY) {
        ctx.fillStyle = C4_FRAME.hole;
        ctx.fill();
        continue;
      }
      const c = DISC[who === 1 ? 1 : 0];
      ctx.fillStyle = c.rim;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, rHole * 0.84, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      if (s.over && inLine.has(row * C4_COLS + col)) {
        ctx.beginPath();
        ctx.arc(x, y, rHole + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#F2F0EF";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
  }
}

function drawTicTacToe(ctx: CanvasRenderingContext2D, s: TicTacToeState): void {
  const m = 40;
  const cell = (SIZE - m * 2) / 3;
  ctx.strokeStyle = "rgba(242, 240, 239, 0.55)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(m + i * cell, m + 10);
    ctx.lineTo(m + i * cell, SIZE - m - 10);
    ctx.moveTo(m + 10, m + i * cell);
    ctx.lineTo(SIZE - m - 10, m + i * cell);
    ctx.stroke();
  }
  ctx.lineWidth = 18;
  s.grid.forEach((who, i) => {
    if (who === TTT_EMPTY) return;
    const x = m + (i % 3) * cell + cell / 2;
    const y = m + Math.floor(i / 3) * cell + cell / 2;
    const r = cell * 0.3;
    ctx.strokeStyle = TTT_COLOR[who === 1 ? 1 : 0];
    ctx.globalAlpha = s.over && s.line && !s.line.includes(i) ? 0.35 : 1;
    ctx.beginPath();
    if (who === 1) ctx.arc(x, y, r, 0, Math.PI * 2);
    else {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
