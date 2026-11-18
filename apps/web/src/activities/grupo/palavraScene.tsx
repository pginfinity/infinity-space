import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clsx } from "clsx";
import { PAL_ID, PAL_TEAMS_FROM, palUsesTeams, type Lens, type PalState, type Vec2 } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { WORD_BOARD, wordBoardFaceMatrix } from "../../scene/furniture/grupo.ts";
import { lit } from "../../scene/materials.ts";
import { Html } from "../../scene/Html.tsx";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { burst } from "./fx.tsx";
import { deadlineOf, useLeft } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Painel de letras da Palavra secreta no mundo: o feltro mostra, em letrinhas brancas, o convite, o
 * placar dos times, de quem é a vez e o tempo. Nunca a palavra (todo mundo vê o painel). Nas duas lentes.
 * No 2D, onde o feltro vira poucos pixels e quem fica em pé na frente o tampa, uma etiqueta nítida
 * (HTML) acima do painel repete o placar e o tempo, por cima dos avatares.
 */

/** Altura da base da etiqueta do 2D: logo acima do balão no topo do painel (ela cresce para cima). */
const LABEL_Y = 2.12;
/** Até que distância do painel a etiqueta do 2D aparece. */
const LABEL_RANGE = 11;

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

function nearBoard(range: number): boolean {
  const p = palBoardPos();
  return Math.hypot(self.x - p.x, self.z - p.z) < range;
}

/** Você está a menos de `range` metros do painel? (Consultado 3x por segundo; só re-renderiza quando muda.) */
export function useNearBoard(range: number): boolean {
  const [is, setIs] = useState(() => nearBoard(range));
  useEffect(() => {
    const t = window.setInterval(() => setIs(nearBoard(range)), 330);
    return () => window.clearInterval(t);
  }, [range]);
  return is;
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
  return (
    <>
      <FeltFace lens={lens} />
      {lens === "2d" && <BoardLabel at={obj.pos} />}
    </>
  );
}

// ---- etiqueta do 2D -------------------------------------------------------------------------

/** Etiqueta acima do painel, no 2D, para quem está por perto e com a mesa aberta. */
function BoardLabel({ at }: { at: Vec2 }) {
  const near = useNearBoard(LABEL_RANGE);
  const open = useAct<PalState>(PAL_ID)?.phase !== "idle";
  if (!near || !open) return null;
  // Acima dos nomes dos avatares (que vão até 8), para ninguém em pé na frente tampar. Presa pela base
  // (cresce para cima) e numa linha só: não cobre o painel, os nomes de quem está na frente nem a
  // etiqueta da sala, que fica logo atrás do painel na vista padrão.
  return (
    <Html position={[at.x, LABEL_Y, at.z]} zIndexRange={[9, 9]} style={{ pointerEvents: "none", transform: "translate3d(-50%,-100%,0)" }}>
      <LabelBody />
    </Html>
  );
}

const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Placar, tempo e o momento da partida, numa linha (nunca a carta). Números em Geist: no NORD, o "1" vira um traço. */
function LabelBody() {
  const s = useAct<PalState>(PAL_ID);
  const timed = !!s && (s.phase === "playing" || s.phase === "ready");
  const left = useLeft(timed ? s : undefined);
  if (!s || s.phase === "idle") return null;
  const act = s.players.filter((p) => !p.away);
  const box = "flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-space/90 px-2 py-1 text-offwhite shadow-[0_8px_24px_-8px_rgb(0_0_0/0.75)] ring-1 ring-offwhite/15";

  if (s.phase === "lobby") {
    const mode = act.length >= PAL_TEAMS_FROM ? ` · ${palUsesTeams(act.length, s.mode) ? T.pal.labelTeams : T.pal.labelCoop}` : "";
    return (
      <div className={clsx(box, "px-2.5 py-1.5 leading-none")} data-pal-label="lobby">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em]">{T.pal.title}</span>
        <span className="text-[12px] font-medium text-offwhite/80">
          · {T.pal.labelAtTable(act.length)}
          {mode}
        </span>
      </div>
    );
  }

  const sec = Math.ceil(left / 1000);
  const giver = s.players.find((p) => p.id === s.giver)?.name;
  // O que vem depois do placar: o tempo (com quem dá as dicas) ou o momento da partida.
  let status: string | null = null;
  if (s.phase === "ready") status = T.pal.labelReady;
  else if (s.phase === "turnEnd") status = T.pal.labelTurnEnd(`${s.coop ? "" : `${s.teams[s.team]?.name ?? ""} `}${T.pal.turnGain(s.gain)}`);
  else if (s.phase === "final") status = s.coop ? T.pal.labelHits(s.teams[0]?.score ?? 0) : s.winner === null ? T.pal.tie : T.pal.winner(s.teams[s.winner]!.name);
  const turn = s.phase !== "final" && !s.coop;

  return (
    <div className={box} data-pal-label={s.phase}>
      {s.teams.map((t, i) => (
        <span key={i} className={clsx("flex items-center gap-1.5 rounded-lg px-1.5 py-1", turn && s.team === i ? "bg-offwhite/[0.1] ring-1 ring-offwhite/25" : "")} data-pal-label-team={i}>
          <span className="size-2 shrink-0 rounded-full" style={{ background: PAL_TEAM_COLORS[i] }} aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-offwhite/85">{t.name}</span>
          <span className="text-[16px] font-bold leading-none tabular-nums">{t.score}</span>
        </span>
      ))}
      {s.phase === "playing" && (
        <span className={clsx("rounded-md px-1.5 py-1 text-[14px] font-bold leading-none tabular-nums ring-1", sec <= 10 ? "bg-warn/15 text-warn ring-warn/40" : "bg-offwhite/[0.08] ring-offwhite/15")} data-pal-label-time>
          {fmtClock(sec)}
        </span>
      )}
      {status && <span className="rounded-md bg-offwhite/[0.08] px-1.5 py-1 text-[11px] font-semibold leading-none text-offwhite/90">{status}</span>}
      {(s.phase === "playing" || s.phase === "ready") && giver && <span className="max-w-[120px] truncate pr-1 text-[11px] font-medium text-offwhite/70">{T.pal.labelGives(giver)}</span>}
    </div>
  );
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
    if (palUsesTeams(active.length, s!.mode)) {
      const n = [0, 1].map((t) => active.filter((p) => p.team === t).length);
      letters(ctx, `${s!.teams[0]?.name.toUpperCase()} ${n[0]}  ·  ${n[1]} ${s!.teams[1]?.name.toUpperCase()}`, W / 2, 232, GEIST(700, 24), DIM);
    } else if (active.length >= PAL_TEAMS_FROM) letters(ctx, T.pal.boardAllTogether, W / 2, 232, GEIST(700, 24), DIM);
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
