import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DRAW_H, DRAW_W, grupoRank, type DrawState, type Lens } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { burst } from "./fx.tsx";
import { StrokePainter, board, drawBoards, ensureSynced, useDrawLocal } from "./drawStore.ts";
import { T } from "./strings.ts";

/**
 * Quadros brancos no mundo: enquanto há jogo, o quadro mostra o desenho ao vivo (traços por eventos)
 * e uma faixa com a rodada e a dica. Igual nas duas lentes.
 */
export function DrawScene({ lens }: { lens: Lens }) {
  return (
    <>
      {drawBoards().map((b) => (
        <BoardSlot key={b.id} id={b.id} lens={lens} />
      ))}
    </>
  );
}

function BoardSlot({ id, lens }: { id: string; lens: Lens }) {
  const phase = useAct<DrawState>(id)?.phase;
  const fx = useDrawLocal((l) => l.fxFinal[id] ?? 0);
  const seen = useRef(fx);
  const info = drawBoards().find((b) => b.id === id)!;
  useEffect(() => {
    if (fx === seen.current) return;
    seen.current = fx;
    burst(info.front, 2.4, 1.4);
  }, [fx, info]);
  if (!phase || phase === "idle") return null;
  return <BoardTexture id={id} lens={lens} />;
}

const TW = 1000;
const TH = 536;
const NAVY = "#0B1A33";

function BoardTexture({ id, lens }: { id: string; lens: Lens }) {
  const info = drawBoards().find((b) => b.id === id)!;
  const { canvas, art, painter, tex } = useMemo(() => {
    const k = lens === "2d" ? 0.5 : 0.8;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(TW * k);
    canvas.height = Math.round(TH * k);
    const art = document.createElement("canvas");
    art.width = canvas.width;
    art.height = canvas.height;
    const painter = new StrokePainter(art);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return { canvas, art, painter, tex };
  }, [lens]);
  const matrix = useMemo(() => objectMatrix(info.object).multiply(new THREE.Matrix4().makeTranslation(0, 0.555, 0.026)), [info]);
  const last = useRef({ state: null as DrawState | null, version: -1, epoch: -1 });

  useEffect(() => () => tex.dispose(), [tex]);

  useFrame(() => {
    const st = actState<DrawState>(id);
    if (!st) return;
    const b = board(id);
    const l = last.current;
    if (l.state === st && l.version === b.version && l.epoch === b.epoch) return;
    if (l.state?.canvas !== st.canvas) ensureSynced(id);
    l.state = st;
    l.version = b.version;
    l.epoch = b.epoch;
    const showArt = st.phase === "drawing" || st.phase === "turnEnd" || st.phase === "choosing";
    if (showArt) painter.paint(b.canvas === st.canvas ? b : { canvas: st.canvas, strokes: [], version: -2, epoch: -2 });
    compose(canvas, art, st, showArt);
    tex.needsUpdate = true;
  });

  return (
    <mesh matrixAutoUpdate={false} matrix={matrix} renderOrder={2} name={`desenho:${id}`}>
      <planeGeometry args={[1.88, 1.0]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** Junta o desenho e os textos do quadro (faixa de baixo, avisos). */
function compose(canvas: HTMLCanvasElement, art: HTMLCanvasElement, s: DrawState, showArt: boolean): void {
  const ctx = canvas.getContext("2d")!;
  const k = canvas.width / TW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (showArt) ctx.drawImage(art, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const drawer = s.players.find((p) => p.id === s.drawer);

  if (s.phase === "lobby") {
    ctx.fillStyle = NAVY;
    ctx.font = `900 64px NORD, "Arial Black", sans-serif`;
    ctx.fillText(T.draw.boardIdle.toUpperCase(), TW / 2, 200);
    ctx.font = `600 34px Geist, sans-serif`;
    ctx.fillStyle = "#00B7FF";
    ctx.fillText(T.draw.boardJoin, TW / 2, 280);
    ctx.fillStyle = "#5B6577";
    ctx.font = `500 30px Geist, sans-serif`;
    ctx.fillText(T.draw.boardWaiting(s.players.filter((p) => !p.away).length), TW / 2, 340);
    doodles(ctx);
    return;
  }
  if (s.phase === "final") {
    const top = grupoRank(s.players)[0];
    ctx.fillStyle = NAVY;
    ctx.font = `900 60px NORD, "Arial Black", sans-serif`;
    ctx.fillText(T.draw.final.toUpperCase(), TW / 2, 200);
    if (top && top.score > 0) {
      ctx.fillStyle = "#EE5C29";
      ctx.font = `700 46px Geist, sans-serif`;
      ctx.fillText(T.draw.winner(top.name), TW / 2, 290);
    }
    doodles(ctx);
    return;
  }
  // Faixa de baixo: rodada, quem desenha e a dica (nunca a palavra antes da hora).
  const band = 70;
  ctx.fillStyle = "rgba(11,26,51,0.88)";
  ctx.fillRect(0, TH - band, TW, band);
  ctx.fillStyle = "#F2F0EF";
  ctx.textAlign = "left";
  ctx.font = `600 26px Geist, sans-serif`;
  const who = s.phase === "choosing" ? T.draw.choosing(drawer?.name ?? "") : T.draw.drawing(drawer?.name ?? "");
  ctx.fillText(`${T.draw.round(Math.min(s.round, s.rounds), s.rounds)} · ${who}`, 24, TH - band / 2);
  ctx.textAlign = "right";
  if (s.phase === "drawing") {
    ctx.font = `700 34px NORD, "Arial Black", sans-serif`;
    ctx.fillText(s.hint.split("").join(" "), TW - 24, TH - band / 2 + 2);
  }
  if (s.phase === "turnEnd" && s.word) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(11,26,51,0.9)";
    ctx.fillRect(0, TH / 2 - 70, TW, 120);
    ctx.fillStyle = "#F2F0EF";
    ctx.font = `500 26px Geist, sans-serif`;
    ctx.fillText(T.draw.wordWas, TW / 2, TH / 2 - 40);
    ctx.font = `900 54px NORD, "Arial Black", sans-serif`;
    ctx.fillText(s.word.toUpperCase(), TW / 2, TH / 2 + 12);
  }
}

/** Rabiscos de canto (quadro com cara de usado quando não há desenho). */
function doodles(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#00B7FF";
  ctx.beginPath();
  ctx.moveTo(90, 440);
  ctx.quadraticCurveTo(140, 380, 200, 430);
  ctx.quadraticCurveTo(250, 470, 300, 410);
  ctx.stroke();
  ctx.strokeStyle = "#EE5C29";
  ctx.beginPath();
  ctx.arc(860, 120, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#2BC48A";
  ctx.beginPath();
  ctx.moveTo(760, 440);
  ctx.lineTo(800, 400);
  ctx.lineTo(840, 440);
  ctx.lineTo(880, 400);
  ctx.stroke();
}

export const DRAW_ASPECT = DRAW_W / DRAW_H;
