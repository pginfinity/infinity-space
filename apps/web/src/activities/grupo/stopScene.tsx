import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STOP_ID, grupoRank, type Lens, type StopState, type Vec2 } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { STOP_BOARD, stopBoardFaceMatrix } from "../../scene/furniture/grupo.ts";
import { world } from "../../world/world.ts";
import { burst } from "./fx.tsx";
import { deadlineOf } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Cavalete do Stop no mundo: o quadro-negro mostra, em giz, o convite, a letra sorteada, o tempo
 * e o placar. Sempre visível (é o ponto de entrada do jogo no Café), nas duas lentes.
 */

const W = 420;
const H = Math.round((W * STOP_BOARD.h) / STOP_BOARD.w);
const CHALK = "rgba(242,240,239,0.92)";
const CHALK_DIM = "rgba(242,240,239,0.55)";
const CHALK_ORANGE = "#F28A5C";

function boardObject() {
  return world().map.objects.find((o) => o.type === "stop-board");
}

/** Onde o cavalete está (sons posicionais). */
export function stopBoardPos(): Vec2 {
  return boardObject()?.pos ?? { x: -4.4, z: 13.25 };
}

export function StopScene({ lens }: { lens: Lens }) {
  const obj = useMemo(boardObject, []);
  const phase = useAct<StopState>(STOP_ID)?.phase;
  const seenFinal = useRef(phase === "final");
  useEffect(() => {
    if (phase === "final" && !seenFinal.current && obj) burst({ x: obj.pos.x, z: obj.pos.z + 0.8 }, 2.2, 1.6);
    seenFinal.current = phase === "final";
  }, [phase, obj]);
  if (!obj) return null;
  return <ChalkFace lens={lens} />;
}

function ChalkFace({ lens }: { lens: Lens }) {
  const obj = useMemo(boardObject, [])!;
  const { canvas, tex } = useMemo(() => {
    const k = lens === "2d" ? 0.6 : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return { canvas, tex };
  }, [lens]);
  const matrix = useMemo(() => objectMatrix(obj).multiply(stopBoardFaceMatrix()), [obj]);
  const last = useRef({ state: undefined as StopState | undefined, sec: -1, fonts: 0 });
  const fonts = useRef(0);

  useEffect(() => {
    void document.fonts?.ready.then(() => fonts.current++);
    return () => tex.dispose();
  }, [tex]);

  useFrame(() => {
    const st = actState<StopState>(STOP_ID);
    const timed = st && (st.phase === "playing" || st.phase === "review");
    const sec = timed ? Math.ceil(Math.max(0, deadlineOf(st) - performance.now()) / 1000) : -1;
    const l = last.current;
    if (l.state === st && l.sec === sec && l.fonts === fonts.current) return;
    l.state = st;
    l.sec = sec;
    l.fonts = fonts.current;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    paint(ctx, st, sec);
    tex.needsUpdate = true;
  });

  return (
    <mesh matrixAutoUpdate={false} matrix={matrix} renderOrder={2} name="stop:quadro">
      <planeGeometry args={[STOP_BOARD.w - 0.02, STOP_BOARD.h - 0.02]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** Lousa: fundo com manchas de giz apagado e textos com leve tremor (cara de giz). */
function paint(ctx: CanvasRenderingContext2D, s: StopState | undefined, sec: number): void {
  ctx.fillStyle = "#22302C";
  ctx.fillRect(0, 0, W, H);
  // manchas de giz apagado (fixas: semente pelo tamanho)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(242,240,239,0.035)";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(rnd() * W, rnd() * H, 40 + rnd() * 80, 14 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  chalk(ctx, "STOP", W / 2, 62, `900 64px NORD, "Arial Black", sans-serif`, CHALK);
  line(ctx, 70, 104, W - 70, 104);
  const phase = s?.phase ?? "idle";
  const players = s?.players.filter((p) => !p.away) ?? [];

  if (phase === "idle" || phase === "lobby") {
    chalk(ctx, T.stop.sub, W / 2, 138, `600 24px Geist, sans-serif`, CHALK_DIM);
    // letras soltas, como um cardápio de giz
    const letters = ["A", "M", "R", "C", "P", "B"];
    letters.forEach((l, i) => chalk(ctx, l, 86 + (i % 3) * 124, 230 + Math.floor(i / 3) * 104, `900 58px NORD, "Arial Black", sans-serif`, i === 1 ? CHALK_ORANGE : CHALK_DIM));
    if (phase === "lobby") chalk(ctx, T.stop.boardLobby(players.length), W / 2, 470, `600 26px Geist, sans-serif`, CHALK);
    chalk(ctx, T.stop.boardJoin, W / 2, phase === "lobby" ? 516 : 486, `600 24px Geist, sans-serif`, phase === "lobby" ? CHALK_ORANGE : CHALK);
    return;
  }
  if (phase === "final") {
    const top = grupoRank(s!.players)[0];
    chalk(ctx, T.stop.final, W / 2, 160, `700 30px Geist, sans-serif`, CHALK_DIM);
    if (top) chalk(ctx, top.name, W / 2, 250, `800 40px Geist, sans-serif`, CHALK_ORANGE);
    standings(ctx, s!, 320);
    return;
  }
  chalk(ctx, T.stop.round(s!.round, s!.rounds), W / 2, 136, `600 22px Geist, sans-serif`, CHALK_DIM);
  // letra da rodada num círculo de giz
  const showLetter = phase !== "spin";
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(W / 2, 262, 92, 0.15, Math.PI * 2 - 0.1);
  ctx.stroke();
  chalk(ctx, showLetter ? (s!.letter ?? "?") : "?", W / 2, 268, `900 120px NORD, "Arial Black", sans-serif`, showLetter ? CHALK_ORANGE : CHALK_DIM);
  if (phase === "playing" && sec >= 0) {
    const m = Math.floor(sec / 60);
    chalk(ctx, `${m}:${String(sec % 60).padStart(2, "0")}`, W / 2, 410, `800 52px Geist, sans-serif`, sec <= 10 ? CHALK_ORANGE : CHALK);
  } else if (phase === "stopping") chalk(ctx, `${T.stop.stop}`, W / 2, 410, `900 52px NORD, "Arial Black", sans-serif`, CHALK_ORANGE);
  else if (phase === "review") chalk(ctx, T.stop.review, W / 2, 410, `700 36px Geist, sans-serif`, CHALK);
  else if (phase === "results") standings(ctx, s!, 400);
  if (phase === "playing" || phase === "stopping" || phase === "review")
    players.slice(0, 4).forEach((p, i) => {
      chalk(ctx, p.name, 120, 480 + i * 34, `600 22px Geist, sans-serif`, CHALK_DIM, "left");
      chalk(ctx, phase === "review" ? (p.ready ? "ok" : "…") : `${p.filled}/${s!.categories.length}`, W - 60, 480 + i * 34, `700 22px Geist, sans-serif`, CHALK, "right");
    });
}

function standings(ctx: CanvasRenderingContext2D, s: StopState, y0: number): void {
  grupoRank(s.players)
    .slice(0, 5)
    .forEach((p, i) => {
      chalk(ctx, `${i + 1}. ${p.name}`, 70, y0 + i * 38, `600 24px Geist, sans-serif`, i === 0 ? CHALK : CHALK_DIM, "left");
      chalk(ctx, String(p.score), W - 70, y0 + i * 38, `800 24px Geist, sans-serif`, CHALK, "right");
    });
}

function chalk(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "center"): void {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  // duas passadas levemente deslocadas: traço de giz, não de impressora
  ctx.globalAlpha = 0.45;
  ctx.fillText(text, x + 1.2, y + 0.8);
  ctx.globalAlpha = 1;
  ctx.fillText(text, x, y);
}

function line(ctx: CanvasRenderingContext2D, x0: number, y: number, x1: number, y1: number): void {
  ctx.strokeStyle = CHALK_DIM;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + 6, x1, y1);
  ctx.stroke();
}
