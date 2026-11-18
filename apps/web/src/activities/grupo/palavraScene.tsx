import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PAL_ID, type Lens, type PalState, type Vec2 } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { WORD_BOARD, wordBoardFaceMatrix } from "../../scene/furniture/grupo.ts";
import { lit } from "../../scene/materials.ts";
import { world } from "../../world/world.ts";
import { burst } from "./fx.tsx";
import { deadlineOf } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Painel de letras da Palavra secreta no mundo: o feltro mostra, em letrinhas brancas, o convite, o
 * placar dos times, de quem é a vez e o tempo. Nunca a palavra (todo mundo vê o painel). Nas duas lentes.
 */

const W = 512;
const H = Math.round((W * WORD_BOARD.h) / WORD_BOARD.w);
const FELT = "#171B23";
const LETTER = "#F2F0EF";
const DIM = "rgba(242,240,239,0.55)";
const ORANGE = "#EE5C29";
/** Cor de cada time (Pulsar, Quasar). O cooperativo usa a primeira. */
export const PAL_TEAM_COLORS = ["#00B7FF", "#F2B134"];

function boardObject() {
  return world().map.objects.find((o) => o.type === "word-board");
}

/** Onde o painel está (sons posicionais). */
export function palBoardPos(): Vec2 {
  return boardObject()?.pos ?? { x: -7.3, z: 5.45 };
}

/** Ponto de chegada do painel (para "ir até lá"). */
export function palBoardPoint(): Vec2 {
  const o = boardObject();
  return o?.interact?.point ?? o?.pos ?? { x: -7.3, z: 6.25 };
}

export function PalavraScene({ lens }: { lens: Lens }) {
  const obj = useMemo(boardObject, []);
  const phase = useAct<PalState>(PAL_ID)?.phase;
  const seenFinal = useRef(phase === "final");
  useEffect(() => {
    if (phase === "final" && !seenFinal.current && obj) burst({ x: obj.pos.x, z: obj.pos.z + 0.9 }, 2.3, 1.8);
    seenFinal.current = phase === "final";
  }, [phase, obj]);
  if (!obj) return null;
  return <FeltFace lens={lens} />;
}

function FeltFace({ lens }: { lens: Lens }) {
  const obj = useMemo(boardObject, [])!;
  const { canvas, tex, mat } = useMemo(() => {
    const k = lens === "2d" ? 0.6 : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    // Feltro iluminado pela sala, com as letrinhas acesas o bastante para ler na sombra.
    const mat = lit({ map: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.55 });
    mat.emissiveMap = tex;
    return { canvas, tex, mat };
  }, [lens]);
  const matrix = useMemo(() => objectMatrix(obj).multiply(wordBoardFaceMatrix()), [obj]);
  const last = useRef({ state: undefined as PalState | undefined, sec: -1, fonts: 0 });
  const fonts = useRef(0);

  useEffect(() => {
    void document.fonts?.ready.then(() => fonts.current++);
    return () => {
      tex.dispose();
      mat.dispose();
    };
  }, [tex, mat]);

  useFrame(() => {
    const st = actState<PalState>(PAL_ID);
    const sec = st && (st.phase === "playing" || st.phase === "ready") ? Math.ceil(Math.max(0, deadlineOf(st) - performance.now()) / 1000) : -1;
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
    <mesh matrixAutoUpdate={false} matrix={matrix} renderOrder={2} material={mat} name="palavra:painel">
      <planeGeometry args={[WORD_BOARD.w - 0.02, WORD_BOARD.h - 0.02]} />
    </mesh>
  );
}

const NORD = (w: number, px: number) => `${w} ${px}px NORD, "Arial Black", sans-serif`;
const GEIST = (w: number, px: number) => `${w} ${px}px Geist, sans-serif`;

/** Feltro com os sulcos horizontais e o texto do momento. */
function paint(ctx: CanvasRenderingContext2D, s: PalState | undefined, sec: number): void {
  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, W, H);
  // sulcos do feltro (onde as letrinhas encaixam)
  for (let y = 10; y < H; y += 14) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(0, y + 2, W, 1);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const phase = s?.phase ?? "idle";
  const active = s?.players.filter((p) => !p.away) ?? [];

  if (phase === "idle" || phase === "lobby") {
    if (phase === "idle") {
      letters(ctx, T.pal.boardTitle[0]!, W / 2, 104, NORD(900, 66), LETTER);
      letters(ctx, T.pal.boardTitle[1]!, W / 2, 184, NORD(900, 66), ORANGE);
      letters(ctx, T.pal.boardTagline, W / 2, 262, GEIST(600, 22), DIM);
      letters(ctx, T.pal.boardJoin, W / 2, 330, GEIST(700, 25), LETTER);
      return;
    }
    letters(ctx, `${T.pal.boardTitle[0]} ${T.pal.boardTitle[1]}`, W / 2, 58, NORD(900, 34), LETTER);
    letters(ctx, T.pal.boardAtTable(active.length), W / 2, 152, NORD(900, 56), ORANGE);
    if (active.length >= 4) {
      const n = [0, 1].map((t) => active.filter((p) => p.team === t).length);
      letters(ctx, `${s!.teams[0]?.name.toUpperCase()} ${n[0]}  ·  ${n[1]} ${s!.teams[1]?.name.toUpperCase()}`, W / 2, 232, GEIST(700, 24), DIM);
    }
    letters(ctx, T.pal.boardEnter, W / 2, 322, GEIST(700, 25), LETTER);
    return;
  }

  if (phase === "final") {
    letters(ctx, T.pal.boardFinal, W / 2, 50, NORD(900, 28), DIM);
    if (s!.coop) {
      letters(ctx, s!.teams[0]!.name.toUpperCase(), W / 2, 150, NORD(900, 48), LETTER);
      letters(ctx, T.pal.boardCoop(s!.teams[0]!.score), W / 2, 250, NORD(900, 58), ORANGE);
      return;
    }
    const w = s!.winner;
    letters(ctx, w === null ? T.pal.boardTie : T.pal.boardWinner(s!.teams[w]!.name.toUpperCase()), W / 2, 128, NORD(900, 46), ORANGE);
    scores(ctx, s!, 280, false);
    return;
  }

  // ready, playing, turnEnd
  letters(ctx, `${T.pal.boardTitle[0]} ${T.pal.boardTitle[1]}`, W / 2, 30, NORD(900, 20), DIM);
  scores(ctx, s!, 130, true);
  const giver = s!.players.find((p) => p.id === s!.giver);
  if (phase === "playing" && sec >= 0) {
    const m = Math.floor(sec / 60);
    letters(ctx, `${m}:${String(sec % 60).padStart(2, "0")}`, W / 2, 272, NORD(900, 80), sec <= 10 ? ORANGE : LETTER);
  } else if (phase === "ready") letters(ctx, T.pal.boardReady, W / 2, 272, NORD(900, 46), LETTER);
  else if (phase === "turnEnd") {
    const team = s!.teams[s!.team];
    const g = s!.gain;
    letters(ctx, `${T.pal.boardTurnEnd}  ${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g)}`, W / 2, 268, NORD(900, 46), LETTER);
    if (team && !s!.coop) letters(ctx, team.name.toUpperCase(), W / 2, 346, GEIST(700, 28), PAL_TEAM_COLORS[s!.team]!);
    return;
  }
  if (giver) letters(ctx, T.pal.boardGives(giver.name.toUpperCase()), W / 2, 352, GEIST(700, 28), DIM, W - 40);
}

/** Placar: dois times lado a lado (o da vez marcado) ou o time único no centro. */
function scores(ctx: CanvasRenderingContext2D, s: PalState, y: number, mark: boolean): void {
  if (s.coop || s.teams.length < 2) {
    const t = s.teams[0]!;
    letters(ctx, t.name.toUpperCase(), W / 2, y - 58, GEIST(700, 28), PAL_TEAM_COLORS[0]!);
    letters(ctx, String(t.score), W / 2, y + 8, NORD(900, 84), LETTER);
    return;
  }
  [0, 1].forEach((i) => {
    const t = s.teams[i]!;
    const x = i === 0 ? W * 0.27 : W * 0.73;
    letters(ctx, t.name.toUpperCase(), x, y - 58, GEIST(700, 28), PAL_TEAM_COLORS[i]!);
    letters(ctx, String(t.score), x, y + 8, NORD(900, 84), LETTER);
    if (mark && s.team === i) {
      // setinha de "vez deste time" embaixo do placar
      ctx.fillStyle = PAL_TEAM_COLORS[i]!;
      ctx.beginPath();
      ctx.moveTo(x - 13, y + 74);
      ctx.lineTo(x + 13, y + 74);
      ctx.lineTo(x, y + 61);
      ctx.closePath();
      ctx.fill();
    }
  });
  letters(ctx, "×", W / 2, y + 4, NORD(900, 40), DIM);
}

/** Texto em "letrinhas de feltro": leve sombra embaixo e corte de largura. */
function letters(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, maxW = W - 36): void {
  ctx.font = font;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(text, x + 1.5, y + 2, maxW);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxW);
}
