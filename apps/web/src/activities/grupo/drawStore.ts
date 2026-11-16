import { create } from "zustand";
import { DRAW_COLORS, DRAW_H, DRAW_POINTS_PER_MSG, DRAW_SIZES, DRAW_W, drawActId, type MapObject, type Vec2, type DrawBegin, type DrawCanvas, type DrawChoices, type DrawPoints, type DrawState, type DrawStroke, type DrawWord } from "@infinity/world";
import { actState, sendAct } from "../registry.ts";
import { world } from "../../world/world.ts";

/**
 * Desenho de cada quadro no cliente, fora do React: os traços chegam por eventos (dezenas por segundo)
 * e o painel e o quadro do mundo leem daqui a cada quadro, comparando a versão.
 */

export interface Board {
  canvas: number;
  strokes: DrawStroke[];
  /** Muda a cada alteração. */
  version: number;
  /** Muda quando a mudança não é "acrescentar no fim" (desfazer, limpar, sincronizar). */
  epoch: number;
}

const boards = new Map<string, Board>();

export function board(id: string): Board {
  let b = boards.get(id);
  if (!b) {
    b = { canvas: -1, strokes: [], version: 0, epoch: 0 };
    boards.set(id, b);
  }
  return b;
}

function reset(b: Board, canvas: number, strokes: DrawStroke[] = []): void {
  b.canvas = canvas;
  b.strokes = strokes;
  b.version++;
  b.epoch++;
}

/** Aplica um evento de desenho do servidor. Os traços da própria pessoa já foram desenhados aqui. */
export function applyDrawEvent(id: string, ev: string, data: unknown, mine: boolean): void {
  const b = board(id);
  switch (ev) {
    case "begin": {
      const d = data as DrawBegin;
      if (d.canvas !== b.canvas) reset(b, d.canvas);
      if (mine && b.strokes.some((s) => s.s === d.s)) return;
      b.strokes.push({ s: d.s, c: d.c, w: d.w, p: [...d.p] });
      b.version++;
      break;
    }
    case "pts": {
      const d = data as DrawPoints;
      if (d.canvas !== b.canvas || mine) return;
      const s = b.strokes[b.strokes.length - 1];
      if (!s || s.s !== d.s) return;
      s.p.push(...d.p);
      b.version++;
      break;
    }
    case "undo":
      if (mine) return;
      b.strokes.pop();
      b.version++;
      b.epoch++;
      break;
    case "clear":
      reset(b, (data as { canvas: number }).canvas);
      break;
    case "canvas": {
      const d = data as DrawCanvas;
      // Resposta atrasada de um "sync": se o desenho local já está igual ou à frente (quem desenha), fica o local.
      if (d.canvas === b.canvas && b.strokes.length >= d.strokes.length) return;
      reset(
        b,
        d.canvas,
        d.strokes.map((s) => ({ ...s, p: [...s.p] })),
      );
      break;
    }
  }
}

// ---- pedido de sincronização (uma vez por desenho) -------------------------------------------

const asked = new Map<string, number>();
/** Se o desenho local está desatualizado, pede o inteiro ao servidor (com uma folga para os eventos chegarem). */
export function ensureSynced(id: string): void {
  const st = actState<DrawState>(id);
  if (!st || st.phase === "idle") return;
  const b = board(id);
  if (b.canvas === st.canvas || asked.get(id) === st.canvas) return;
  asked.set(id, st.canvas);
  window.setTimeout(() => {
    const now = actState<DrawState>(id);
    if (now && board(id).canvas !== now.canvas) sendAct(id, "sync");
  }, 350);
}

// ---- estado só desta pessoa -----------------------------------------------------------------

interface DrawLocal {
  word: (DrawWord & { id: string }) | null;
  choices: (DrawChoices & { id: string }) | null;
  /** Último "quase!" recebido (chave muda a cada aviso). */
  close: { id: string; text: string; key: number } | null;
  color: number;
  size: number;
  /** Efeitos: alguém acertou, fim de jogo. */
  fxFinal: Record<string, number>;
}
export const useDrawLocal = create<DrawLocal>(() => ({ word: null, choices: null, close: null, color: 0, size: 1, fxFinal: {} }));

// ---- desenho local (quem desenha) -----------------------------------------------------------

/** Traço em andamento: pontos ainda não enviados saem em lotes a cada ~40 ms. */
interface Live {
  id: string;
  canvas: number;
  stroke: DrawStroke;
  sentBegin: boolean;
  pending: number[];
}
let live: Live | null = null;
let seq = Math.floor(Math.random() * 1e6);
let timer = 0;

export function strokeStart(id: string, x: number, y: number): void {
  strokeEnd();
  const b = board(id);
  const st = actState<DrawState>(id);
  if (!st) return;
  if (b.canvas !== st.canvas) reset(b, st.canvas);
  const { color, size } = useDrawLocal.getState();
  const stroke: DrawStroke = { s: ++seq, c: color, w: size, p: [q(x, DRAW_W), q(y, DRAW_H)] };
  b.strokes.push(stroke);
  b.version++;
  live = { id, canvas: st.canvas, stroke, sentBegin: false, pending: [...stroke.p] };
  flush();
  timer = window.setInterval(flush, 40);
}

export function strokeMove(x: number, y: number): void {
  if (!live) return;
  const p = live.stroke.p;
  const nx = q(x, DRAW_W);
  const ny = q(y, DRAW_H);
  const lx = p[p.length - 2]!;
  const ly = p[p.length - 1]!;
  // Pontos muito próximos não acrescentam nada (e pesam na rede).
  if (Math.hypot(nx - lx, ny - ly) < 2.5) return;
  p.push(nx, ny);
  live.pending.push(nx, ny);
  board(live.id).version++;
}

export function strokeEnd(): void {
  if (!live) return;
  flush();
  window.clearInterval(timer);
  live = null;
}

function flush(): void {
  if (!live || live.pending.length === 0) return;
  while (live.pending.length > 0) {
    const chunk = live.pending.splice(0, DRAW_POINTS_PER_MSG * 2);
    if (!live.sentBegin) {
      sendAct(live.id, "begin", { s: live.stroke.s, c: live.stroke.c, w: live.stroke.w, p: chunk });
      live.sentBegin = true;
    } else sendAct(live.id, "pts", { s: live.stroke.s, p: chunk });
  }
}

export function localUndo(id: string): void {
  strokeEnd();
  const b = board(id);
  if (!b.strokes.length) return;
  b.strokes.pop();
  b.version++;
  b.epoch++;
  sendAct(id, "undo");
}

function q(v: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(v)));
}

// ---- pintura --------------------------------------------------------------------------------

/** Pinta um traço com curvas suaves (quadráticas pelos pontos médios). `k` = pixels por unidade. */
export function paintStroke(ctx: CanvasRenderingContext2D, s: DrawStroke, k: number): void {
  const p = s.p;
  const w = (DRAW_SIZES[s.w] ?? 9) * k;
  ctx.strokeStyle = ctx.fillStyle = DRAW_COLORS[s.c] ?? "#0B1A33";
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.length < 4) {
    ctx.beginPath();
    ctx.arc(p[0]! * k, p[1]! * k, w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0]! * k, p[1]! * k);
  const n = p.length / 2;
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2]!;
    const y = p[i * 2 + 1]!;
    const mx = (x + p[i * 2 + 2]!) / 2;
    const my = (y + p[i * 2 + 3]!) / 2;
    ctx.quadraticCurveTo(x * k, y * k, mx * k, my * k);
  }
  ctx.lineTo(p[p.length - 2]! * k, p[p.length - 1]! * k);
  ctx.stroke();
}

/**
 * Pintor incremental: guarda os traços terminados numa camada e, a cada mudança, só acrescenta o
 * que é novo e repinta o traço em andamento. Desfazer/limpar refazem a camada.
 */
export class StrokePainter {
  private readonly layer: HTMLCanvasElement;
  private epoch = -1;
  private committed = 0;
  private version = -1;

  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly bg = "#FFFFFF",
  ) {
    this.layer = document.createElement("canvas");
  }

  /** Repinta se o quadro mudou (ou se `force`). Devolve se pintou. */
  paint(b: Board, force = false): boolean {
    const { target, layer } = this;
    if (layer.width !== target.width || layer.height !== target.height) {
      layer.width = target.width;
      layer.height = target.height;
      this.epoch = -1;
    }
    if (!force && b.version === this.version && b.epoch === this.epoch) return false;
    const k = target.width / DRAW_W;
    const lctx = layer.getContext("2d")!;
    if (b.epoch !== this.epoch) {
      lctx.fillStyle = this.bg;
      lctx.fillRect(0, 0, layer.width, layer.height);
      this.committed = 0;
      this.epoch = b.epoch;
    }
    const upto = Math.max(0, b.strokes.length - 1);
    for (let i = this.committed; i < upto; i++) paintStroke(lctx, b.strokes[i]!, k);
    this.committed = Math.max(this.committed, upto);
    const ctx = target.getContext("2d")!;
    ctx.drawImage(layer, 0, 0);
    const last = b.strokes[b.strokes.length - 1];
    if (last) paintStroke(ctx, last, k);
    this.version = b.version;
    return true;
  }
}

// ---- quadros do mapa ------------------------------------------------------------------------

interface BoardInfo {
  id: string;
  object: MapObject;
  /** Ponto em frente ao quadro, no chão (para a interação). */
  front: Vec2;
}

let boardsCache: BoardInfo[] | null = null;
export function drawBoards(): BoardInfo[] {
  if (!boardsCache) {
    boardsCache = world()
      .map.objects.filter((o) => o.type === "whiteboard")
      .map((o) => ({ id: drawActId(o.id), object: o, front: frontOf(o) }));
  }
  return boardsCache;
}


/** Ponto andável em frente a um objeto de parede (de preferência a 1 m; mesa no caminho, mais perto). */
export function frontOf(o: MapObject): Vec2 {
  const { nav } = world();
  // Frente do objeto: +Z do modelo, girado pelo yaw (yaw 0 = norte = -z).
  const f = { x: Math.sin(o.rot), z: -Math.cos(o.rot) };
  for (const d of [1, 0.8, 1.2, 0.6, 1.4, 0.5, 1.6]) {
    const p = { x: o.pos.x + f.x * d, z: o.pos.z + f.z * d };
    if (nav.isWalkable(p)) return p;
  }
  return nav.nearestWalkable({ x: o.pos.x + f.x, z: o.pos.z + f.z }, 2) ?? { x: o.pos.x + f.x, z: o.pos.z + f.z };
}
