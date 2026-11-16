import { QUIZ_LETTERS, grupoPlaces, grupoRank, type QuizState } from "@infinity/world";
import { OPTION_STYLE } from "./quizParts.tsx";
import { T } from "./strings.ts";

/**
 * Telão do Auditório durante o Quiz Show: desenhado num canvas (vira textura na cena, nas duas lentes).
 * Layout pensado para ser lido de longe: pouco texto, fonte grande, uma cor de destaque por vez.
 */

export const SCREEN_W = 1288;
export const SCREEN_H = 700;

const NAVY = "#00112A";
const CARD = "#0A2547";
const OFF = "#F2F0EF";
const SLATE = "#8A93A3";
const SIGNAL = "#00B7FF";
const ORANGE = "#EE5C29";
const OK = "#2BC48A";
const WARN = "#F2B134";

const DISPLAY = (w: number, px: number) => `${w} ${px}px NORD, "Arial Black", sans-serif`;
const SANS = (w: number, px: number) => `${w} ${px}px Geist, "Segoe UI", sans-serif`;

let sparkle: HTMLImageElement | null = null;
let sparkleReady = false;
function sparkleImg(onLoad: () => void): HTMLImageElement | null {
  if (!sparkle && typeof Image !== "undefined") {
    sparkle = new Image();
    sparkle.onload = () => {
      sparkleReady = true;
      onLoad();
    };
    sparkle.src = "/brand/sparkle.svg";
  }
  return sparkleReady ? sparkle : null;
}

/** Quebra o texto em linhas que cabem na largura (no máximo `max` linhas, com reticências). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    let last = kept[max - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[max - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/** Texto numa linha, encolhendo a fonte até caber. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number, font: (px: number) => string, px: number, min = 14): void {
  let size = px;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > width) {
    size -= 2;
    ctx.font = font(size);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glyph(ctx: CanvasRenderingContext2D, i: number, cx: number, cy: number, r: number): void {
  const s = OPTION_STYLE[i]!;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  if (s.shape === "tri") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
    ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
  } else if (s.shape === "dia") {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
  } else if (s.shape === "cir") ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  else ctx.roundRect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5, r * 0.18);
  ctx.closePath();
  ctx.fill();
}

function background(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, "#04193A");
  g.addColorStop(1, NAVY);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // grade discreta de "estúdio"
  ctx.strokeStyle = "rgba(70,175,227,0.06)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= SCREEN_W; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, SCREEN_H);
    ctx.stroke();
  }
  for (let y = 0; y <= SCREEN_H; y += 56) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SCREEN_W, y);
    ctx.stroke();
  }
}

/** Cabeçalho: marca do Quiz Show e, à direita, o contexto. */
function header(ctx: CanvasRenderingContext2D, right: string, redraw: () => void): void {
  const img = sparkleImg(redraw);
  if (img) ctx.drawImage(img, 44, 34, 46, 46);
  ctx.fillStyle = OFF;
  ctx.font = DISPLAY(900, 30);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(T.quiz.title.toUpperCase(), img ? 104 : 44, 58);
  ctx.fillStyle = SLATE;
  ctx.font = DISPLAY(500, 24);
  ctx.textAlign = "right";
  ctx.fillText(right, SCREEN_W - 44, 58);
}

function timer(ctx: CanvasRenderingContext2D, left: number, total: number, y: number): void {
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  roundRect(ctx, 44, y, SCREEN_W - 88, 14, 7);
  ctx.fillStyle = "rgba(242,240,239,0.1)";
  ctx.fill();
  roundRect(ctx, 44, y, Math.max(14, (SCREEN_W - 88) * f), 14, 7);
  ctx.fillStyle = left < 5000 ? WARN : SIGNAL;
  ctx.fill();
}

export function paintQuizScreen(ctx: CanvasRenderingContext2D, s: QuizState, left: number, redraw: () => void): void {
  ctx.save();
  background(ctx);
  const active = s.players.filter((p) => !p.away);
  const q = s.question;
  const ctxLabel = q ? T.quiz.question(q.n, q.total).toUpperCase() : (s.pack?.title ?? "").toUpperCase();
  header(ctx, ctxLabel, redraw);

  if (s.phase === "lobby") lobby(ctx, s, active.map((p) => p.name));
  else if (s.phase === "ready" && q) ready(ctx, q.text, left);
  else if ((s.phase === "question" || s.phase === "reveal") && q) question(ctx, s, left, active.length);
  else if (s.phase === "final") final(ctx, s);
  ctx.restore();
}

function lobby(ctx: CanvasRenderingContext2D, s: QuizState, names: string[]): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = OFF;
  fit(ctx, (s.pack?.title ?? T.quiz.title).toUpperCase(), SCREEN_W - 160, (px) => DISPLAY(900, px), 84);
  ctx.fillText((s.pack?.title ?? T.quiz.title).toUpperCase(), SCREEN_W / 2, 230);
  ctx.fillStyle = SIGNAL;
  ctx.font = SANS(600, 36);
  ctx.fillText(T.quiz.screenJoin, SCREEN_W / 2, 296);
  // contador de jogadores
  ctx.fillStyle = OFF;
  ctx.font = DISPLAY(900, 64);
  ctx.fillText(String(names.length), SCREEN_W / 2, 398);
  ctx.fillStyle = SLATE;
  ctx.font = SANS(500, 26);
  ctx.fillText(T.quiz.screenPlayers(names.length), SCREEN_W / 2, 436);
  // nomes em grade (até 4 colunas x 4 linhas)
  const cols = 4;
  const cw = 270;
  const shown = names.slice(0, 16);
  shown.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const rowCount = Math.min(cols, shown.length - r * cols);
    const x0 = SCREEN_W / 2 - (rowCount * cw) / 2 + c * cw;
    const y = 480 + r * 52;
    roundRect(ctx, x0 + 8, y, cw - 16, 40, 20);
    ctx.fillStyle = "rgba(242,240,239,0.07)";
    ctx.fill();
    ctx.fillStyle = OFF;
    fit(ctx, n, cw - 40, (px) => SANS(600, px), 22);
    ctx.textAlign = "center";
    ctx.fillText(n, x0 + cw / 2, y + 28);
  });
  if (names.length > 16) {
    ctx.fillStyle = SLATE;
    ctx.font = SANS(500, 22);
    ctx.fillText(`+${names.length - 16}`, SCREEN_W / 2, 690);
  }
}

function ready(ctx: CanvasRenderingContext2D, text: string, left: number): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = OFF;
  ctx.font = SANS(700, 60);
  const lines = wrap(ctx, text, SCREEN_W - 200, 3);
  const y0 = 330 - ((lines.length - 1) * 74) / 2;
  lines.forEach((l, i) => ctx.fillText(l, SCREEN_W / 2, y0 + i * 74));
  // contagem do "prepare-se"
  const n = Math.max(1, Math.ceil(left / 1000));
  ctx.beginPath();
  ctx.arc(SCREEN_W / 2, 560, 54, 0, Math.PI * 2);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = SIGNAL;
  ctx.stroke();
  ctx.fillStyle = OFF;
  ctx.font = DISPLAY(900, 52);
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), SCREEN_W / 2, 562);
}

function question(ctx: CanvasRenderingContext2D, s: QuizState, left: number, players: number): void {
  const q = s.question!;
  const reveal = s.phase === "reveal" ? s.reveal : null;
  // pergunta
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = OFF;
  ctx.font = SANS(700, 44);
  const lines = wrap(ctx, q.text, SCREEN_W - 88 - (reveal ? 0 : 150), 3);
  lines.forEach((l, i) => ctx.fillText(l, 44, 150 + i * 54));
  // segundos à direita
  if (!reveal) {
    const sec = Math.ceil(left / 1000);
    ctx.beginPath();
    ctx.arc(SCREEN_W - 104, 150, 52, 0, Math.PI * 2);
    ctx.fillStyle = CARD;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = sec <= 5 ? WARN : SIGNAL;
    ctx.stroke();
    ctx.fillStyle = OFF;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = DISPLAY(900, 44);
    ctx.fillText(String(sec), SCREEN_W - 104, 152);
  }
  // alternativas 2x2
  const top = 330;
  const gw = (SCREEN_W - 88 - 20) / 2;
  const gh = 118;
  const total = reveal ? Math.max(1, reveal.counts.reduce((a, b) => a + b, 0)) : 1;
  q.options.forEach((opt, i) => {
    const x = 44 + (i % 2) * (gw + 20);
    const y = top + Math.floor(i / 2) * (gh + 18);
    const ok = reveal && i === reveal.correct;
    ctx.globalAlpha = reveal && !ok ? 0.45 : 1;
    roundRect(ctx, x, y, gw, gh, 22);
    ctx.fillStyle = CARD;
    ctx.fill();
    if (reveal) {
      const f = (reveal.counts[i] ?? 0) / total;
      ctx.save();
      roundRect(ctx, x, y, gw, gh, 22);
      ctx.clip();
      ctx.fillStyle = ok ? "rgba(43,196,138,0.22)" : "rgba(242,240,239,0.06)";
      ctx.fillRect(x, y, gw * f, gh);
      ctx.restore();
    }
    if (ok) {
      roundRect(ctx, x, y, gw, gh, 22);
      ctx.lineWidth = 6;
      ctx.strokeStyle = OK;
      ctx.stroke();
    }
    glyph(ctx, i, x + 58, y + gh / 2, 26);
    ctx.fillStyle = SLATE;
    ctx.font = DISPLAY(700, 24);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(QUIZ_LETTERS[i]!, x + 98, y + gh / 2 + 1);
    ctx.fillStyle = OFF;
    fit(ctx, opt, gw - (reveal ? 230 : 170), (px) => SANS(600, px), 38, 20);
    ctx.fillText(opt, x + 134, y + gh / 2 + 1);
    if (reveal) {
      ctx.textAlign = "right";
      ctx.font = DISPLAY(900, 38);
      ctx.fillStyle = ok ? OK : OFF;
      ctx.fillText(String(reveal.counts[i] ?? 0), x + gw - 30, y + gh / 2 + 2);
    }
    ctx.globalAlpha = 1;
  });
  // rodapé: tempo e respostas, ou os três primeiros
  if (!reveal) {
    timer(ctx, left, s.duration, 640);
    ctx.fillStyle = SLATE;
    ctx.font = SANS(600, 24);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(T.quiz.screenAnswered(s.answered, players), SCREEN_W - 44, 626);
  } else {
    const ranked = grupoRank(s.players).slice(0, 3);
    const places = grupoPlaces(ranked.map((p) => p.score));
    ctx.textBaseline = "middle";
    ranked.forEach((p, i) => {
      const x = 44 + i * ((SCREEN_W - 88) / 3);
      const w = (SCREEN_W - 88) / 3 - 16;
      roundRect(ctx, x, 618, w, 56, 16);
      ctx.fillStyle = i === 0 ? "rgba(238,92,41,0.16)" : "rgba(242,240,239,0.06)";
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = i === 0 ? ORANGE : SLATE;
      ctx.font = DISPLAY(900, 26);
      ctx.fillText(`${places[i]}º`, x + 18, 647);
      ctx.fillStyle = OFF;
      fit(ctx, p.name, w - 210, (px) => SANS(600, px), 26);
      ctx.fillText(p.name, x + 70, 647);
      ctx.textAlign = "right";
      ctx.font = DISPLAY(700, 24);
      ctx.fillText(String(p.score), x + w - 18, 647);
      if (p.gain) {
        ctx.fillStyle = OK;
        ctx.font = SANS(600, 20);
        ctx.fillText(`+${p.gain}`, x + w - 18 - ctx.measureText(String(p.score)).width - 70, 647);
      }
    });
  }
}

function final(ctx: CanvasRenderingContext2D, s: QuizState): void {
  const ranked = grupoRank(s.players);
  const places = grupoPlaces(ranked.map((p) => p.score));
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = OFF;
  ctx.font = DISPLAY(900, 56);
  ctx.fillText(T.quiz.final.toUpperCase(), SCREEN_W / 2, 170);
  // pódio: 2º, 1º, 3º
  const slots = [1, 0, 2];
  const heights = [230, 170, 130];
  const bw = 290;
  slots.forEach((idx, k) => {
    const p = ranked[idx];
    if (!p) return;
    const place = places[idx]!;
    const h = heights[Math.min(2, place - 1)]!;
    const x = SCREEN_W / 2 - (bw * 3 + 40) / 2 + k * (bw + 20);
    const y = 640 - h;
    roundRect(ctx, x, y, bw, h, 18);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (place === 1) {
      // momento especial: o gradiente da marca no primeiro lugar
      g.addColorStop(0, "#EC5C2A");
      g.addColorStop(0.55, "#432932");
      g.addColorStop(1, "#071734");
    } else {
      g.addColorStop(0, "#123563");
      g.addColorStop(1, CARD);
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = OFF;
    ctx.font = DISPLAY(900, 60);
    ctx.fillText(`${place}º`, x + bw / 2, y + 80);
    ctx.font = DISPLAY(700, 30);
    ctx.fillText(String(p.score), x + bw / 2, y + 124);
    fit(ctx, p.name, bw - 20, (px) => SANS(700, px), 34);
    ctx.fillText(p.name, x + bw / 2, y - 20);
  });
  const rest = ranked.slice(3, 9);
  ctx.font = SANS(500, 22);
  ctx.fillStyle = SLATE;
  if (rest.length) ctx.fillText(rest.map((p, i) => `${places[i + 3]}º ${p.name} ${p.score}`).join("   ·   "), SCREEN_W / 2, 684);
}
