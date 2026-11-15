import * as THREE from "three";
import {
  C4_COLS,
  C4_EMPTY,
  C4_ROWS,
  GAMES,
  TTT_EMPTY,
  chessBoard,
  chessKingSquare,
  type BaseState,
  type ChessState,
  type Connect4State,
  type GameSnapshot,
  type TicTacToeState,
} from "@infinity/world";
import { useApp } from "../state/store.ts";
import { tableKind } from "./api.ts";
import { drawPiece } from "./pieces.ts";
import { C4_FRAME, CHESS_DARK, CHESS_LIGHT, DISC, TTT_COLOR } from "./palette.ts";

/**
 * Textura do tampo das mesas de jogo: o estado da partida visto de cima, para quem passa ver o jogo.
 *
 * - Canvas quadrado de 512 px; o tabuleiro ocupa o centro (o Lig 4, mais largo que alto, fica com faixas em cima e embaixo).
 * - Xadrez: brancas embaixo (v = 0). Lig 4: a grade "deitada", linha de cima no topo da imagem.
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
