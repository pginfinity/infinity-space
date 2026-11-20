import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { SmilePlus, StickyNote, Trash2, X } from "lucide-react";
import * as THREE from "three";
import {
  BOARD_COLORS,
  BOARD_ID,
  BOARD_KIND,
  BOARD_MAX,
  BOARD_RANGE,
  BOARD_REACTIONS,
  BOARD_TEXT_MAX,
  boardOwnSalt,
  boardReactSalt,
  boardReactionCount,
  escTag,
  type BoardNote,
  type BoardReaction,
  type BoardState,
  type MapObject,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { world } from "../../world/world.ts";
import { toon } from "../../scene/materials.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { NOTICE_CORK } from "../../scene/furniture/escritorio.ts";
import { browserKey, deferScene, focusSoon, selfNear, timeAgo, useEscape } from "./shared.tsx";
import { noise, tone } from "./synth.ts";
import { T } from "./strings.ts";
import { useWallVisible } from "../../scene/wallFacing.ts";

/**
 * Mural de recados do Átrio: post-its para o time todo, com reações (uma por pessoa por recado).
 * No mundo, o mural mostra os recados mais novos numa textura (cores e trechos), nas duas lentes;
 * perto dele, E abre o painel para ler, reagir e escrever.
 */

const useBoardUi = create<{ open: boolean }>(() => ({ open: false }));

let boardObj: MapObject | null | undefined;
function board(): MapObject | null {
  if (boardObj === undefined) boardObj = world().map.objects.find((o) => o.type === "notice-board") ?? null;
  return boardObj;
}

const myOwn = (n: BoardNote) => escTag(browserKey(), boardOwnSalt(n.id)) === n.own;
const myVote = (n: BoardNote) => escTag(browserKey(), boardReactSalt(n.id));

export const noticeBoard: ActivityClient = {
  name: "escritorio/mural",
  kinds: [BOARD_KIND],
  objects: ["notice-board"],
  label: () => T.board.actionCount(actState<BoardState>(BOARD_ID)?.notes.length ?? 0),
  use: () => {
    useApp.getState().togglePeople(false);
    useBoardUi.setState({ open: true });
  },
  onEvent: (e) => {
    if (e.ev === "busy") toast(T.board.busy((e.data as { ms: number }).ms));
    if (e.ev === "posted") window.dispatchEvent(new Event("escritorio:mural-postado"));
  },
  Overlay: BoardOverlay,
  Scene: deferScene(BoardScene, 1100),
};

// ---- painel -------------------------------------------------------------------------------

function BoardOverlay() {
  const open = useBoardUi((s) => s.open);
  return <AnimatePresence>{open && <BoardPanel />}</AnimatePresence>;
}

function BoardPanel() {
  const state = useAct<BoardState>(BOARD_ID);
  const notes = useMemo(() => [...(state?.notes ?? [])].reverse(), [state]);
  const [text, setText] = useState("");
  const [color, setColor] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const area = useRef<HTMLTextAreaElement>(null);
  const close = () => useBoardUi.setState({ open: false });

  useEffect(() => focusSoon(area.current), []);
  useEscape(close);
  // Longe do mural, o painel fecha (o servidor também recusa).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const o = board();
      if (o?.interact && !selfNear(o.interact.point, BOARD_RANGE + 0.8)) close();
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  // Recado aceito: limpa o campo.
  useEffect(() => {
    const ok = () => setText("");
    window.addEventListener("escritorio:mural-postado", ok);
    return () => window.removeEventListener("escritorio:mural-postado", ok);
  }, []);

  const post = () => {
    if (!text.trim()) return;
    sendAct(BOARD_ID, "post", { key: browserKey(), text, color });
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute bottom-[228px] right-3 top-16 z-20 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)]"
      role="dialog"
      aria-label={T.board.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <StickyNote className="size-4 text-slate" aria-hidden />
          <div>
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{T.board.title}</h2>
            <p className="text-[11px] text-slate">{T.board.count(notes.length, BOARD_MAX)}</p>
          </div>
        </div>
        <button type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close}>
          <X className="size-4" />
        </button>
      </header>

      <form
        className="border-b border-offwhite/8 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <label htmlFor="esc-mural-texto" className="label-caps">
          {T.board.compose}
        </label>
        <textarea
          id="esc-mural-texto"
          ref={area}
          value={text}
          rows={3}
          maxLength={BOARD_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post();
          }}
          placeholder={T.board.placeholder}
          className="mt-1.5 w-full resize-none rounded-xl border border-offwhite/10 px-3 py-2 text-sm text-space placeholder:text-space/45 focus:border-signal focus:outline-none"
          style={{ background: BOARD_COLORS[color] }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label={T.board.color}>
            {BOARD_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === i}
                aria-label={T.board.colors[i]}
                title={T.board.colors[i]}
                onClick={() => setColor(i)}
                className={`size-6 rounded-md transition-transform hover:scale-110 ${color === i ? "ring-2 ring-offwhite ring-offset-2 ring-offset-space" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-slate">
              {text.length}/{BOARD_TEXT_MAX}
            </span>
            <button type="submit" disabled={!text.trim()} className="rounded-xl bg-orange px-4 py-1.5 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-40">
              {T.board.post}
            </button>
          </div>
        </div>
      </form>

      <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-label={T.board.title}>
        {notes.length === 0 && <li className="px-2 py-6 text-center text-xs text-slate">{T.board.empty}</li>}
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} now={now} />
        ))}
        {notes.length >= BOARD_MAX - 5 && <li className="px-2 pt-1 text-center text-[11px] text-slate/80">{T.board.oldest}</li>}
      </ul>
    </motion.aside>
  );
}

function NoteCard({ note, now }: { note: BoardNote; now: number }) {
  const [picking, setPicking] = useState(false);
  const mine = myOwn(note);
  const vote = myVote(note);
  const react = (e: BoardReaction) => {
    sendAct(BOARD_ID, "react", { key: browserKey(), id: note.id, emoji: e });
    setPicking(false);
  };
  const used = BOARD_REACTIONS.filter((e) => (note.r[e]?.length ?? 0) > 0);
  return (
    <li className="rounded-xl bg-deep/50 p-2.5" data-note={note.id}>
      <div className="flex gap-2.5">
        <span className="mt-0.5 w-1.5 shrink-0 self-stretch rounded-full" style={{ background: BOARD_COLORS[note.color] ?? BOARD_COLORS[0] }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line break-words text-sm leading-snug text-offwhite">{note.text}</p>
          <p className="mt-1 text-[11px] text-slate">
            {note.name}
            {mine && <span className="text-signal"> · {T.board.mine}</span>} · {timeAgo(note.at, now)}
          </p>
        </div>
        {mine && (
          <button
            type="button"
            onClick={() => sendAct(BOARD_ID, "remove", { key: browserKey(), id: note.id })}
            aria-label={T.board.remove}
            title={T.board.remove}
            className="self-start rounded-md p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 pl-4">
        {used.map((e) => {
          const list = note.r[e] ?? [];
          const on = list.includes(vote);
          return (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              aria-pressed={on}
              aria-label={T.board.reactions(e, list.length, on)}
              className={`flex h-6 items-center gap-1 rounded-full px-2 text-xs tabular-nums transition-colors ${on ? "bg-signal/18 text-offwhite ring-1 ring-signal/60" : "bg-offwhite/6 text-offwhite/85 hover:bg-offwhite/12"}`}
            >
              <span className="text-[13px] leading-none">{e}</span>
              {list.length}
            </button>
          );
        })}
        {picking ? (
          <span className="flex items-center gap-0.5 rounded-full bg-offwhite/8 px-1" role="group" aria-label={T.board.react}>
            {BOARD_REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => react(e)} aria-label={T.board.reactWith(e)} className="grid size-6 place-items-center rounded-full text-[14px] hover:bg-offwhite/12">
                {e}
              </button>
            ))}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={T.board.react}
            title={T.board.react}
            className="grid h-6 w-7 place-items-center rounded-full text-slate hover:bg-offwhite/8 hover:text-offwhite"
          >
            <SmilePlus className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

// ---- mural no mundo (textura) -------------------------------------------------------------

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * NOTICE_CORK.h) / NOTICE_CORK.w);
const COLS = 5;
const ROWS = 3;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Quebra o texto em linhas que cabem na largura (com reticências na última). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(" ").length;
  if (used < text.replace(/\s+/g, " ").length && lines.length) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/** Desenha a cortiça com os recados mais novos. */
function drawBoard(ctx: CanvasRenderingContext2D, notes: readonly BoardNote[]): void {
  const W = TEX_W;
  const H = TEX_H;
  // Cortiça com granulado fixo.
  ctx.fillStyle = "#C79A68";
  ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(120,80,40,0.16)" : "rgba(255,230,190,0.14)";
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const list = notes.slice(-COLS * ROWS).reverse();
  if (!list.length) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.03);
    ctx.fillStyle = "#F2F0EF";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillRect(-230, -70, 460, 140);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#0A2547";
    ctx.textAlign = "center";
    ctx.font = "700 34px Geist, sans-serif";
    ctx.fillText(T.board.title, 0, -8);
    ctx.font = "500 22px Geist, sans-serif";
    ctx.fillStyle = "#3d4a5c";
    ctx.fillText("Chegue perto e aperte E", 0, 30);
    ctx.restore();
    return;
  }
  const cw = W / COLS;
  const ch = H / ROWS;
  const size = Math.min(cw, ch) - 26;
  list.forEach((n, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const r = hash(n.id);
    const cx = col * cw + cw / 2 + (r - 0.5) * 14;
    const cy = row * ch + ch / 2 + (hash(n.id + "y") - 0.5) * 10;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((r - 0.5) * 0.12);
    ctx.shadowColor = "rgba(40,20,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = BOARD_COLORS[n.color] ?? BOARD_COLORS[0];
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.shadowColor = "transparent";
    // dobrinha no canto
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2 - 18);
    ctx.lineTo(size / 2 - 18, size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.fill();
    // tachinha
    ctx.fillStyle = ["#E0483B", "#00B7FF", "#0A2547"][Math.floor(r * 3)]!;
    ctx.beginPath();
    ctx.arc(0, -size / 2 + 12, 8, 0, Math.PI * 2);
    ctx.fill();
    // texto
    ctx.fillStyle = "#14213a";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "600 21px Geist, sans-serif";
    const lines = wrap(ctx, n.text, size - 24, 4);
    lines.forEach((l, k) => ctx.fillText(l, -size / 2 + 12, -size / 2 + 28 + k * 25));
    // autor e reações
    ctx.font = "500 15px Geist, sans-serif";
    ctx.fillStyle = "rgba(20,33,58,0.62)";
    ctx.textBaseline = "alphabetic";
    const name = n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name;
    ctx.fillText(name, -size / 2 + 12, size / 2 - 12);
    const total = boardReactionCount(n);
    if (total) {
      const top = BOARD_REACTIONS.reduce((a, e) => ((n.r[e]?.length ?? 0) > (n.r[a]?.length ?? 0) ? e : a), BOARD_REACTIONS[0]);
      ctx.textAlign = "right";
      ctx.font = "600 16px Geist, sans-serif";
      ctx.fillStyle = "rgba(20,33,58,0.8)";
      ctx.fillText(`${top} ${total}`, size / 2 - 10, size / 2 - 12);
    }
    ctx.restore();
  });
}

function BoardScene() {
  const state = useAct<BoardState>(BOARD_ID);
  const o = board();
  const wallVisible = useWallVisible(o?.id);
  const { tex, ctx, mat, geo, place } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = toon("#FFFFFF").clone();
    mat.map = tex;
    const geo = new THREE.PlaneGeometry(NOTICE_CORK.w, NOTICE_CORK.h);
    const place = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) };
    if (o) objectMatrix(o).multiply(new THREE.Matrix4().makeTranslation(NOTICE_CORK.x, NOTICE_CORK.y, NOTICE_CORK.z)).decompose(place.p, place.q, place.s);
    return { tex, ctx, mat, geo, place };
  }, [o]);
  const count = useRef<number | null>(null);

  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
      geo.dispose();
    },
    [tex, mat, geo],
  );

  // Redesenha quando os recados mudam (e de novo quando a fonte terminar de carregar).
  useEffect(() => {
    const notes = state?.notes ?? [];
    const draw = () => {
      drawBoard(ctx, notes);
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.load("600 21px Geist").then(draw, () => undefined);
    if (count.current !== null && notes.length > count.current && o?.interact) sfx("board-pin", { at: o.interact.point, range: 9, volume: 0.6 });
    count.current = notes.length;
  }, [state, ctx, tex, o]);

  if (!o) return null;
  return <mesh geometry={geo} material={mat} position={place.p} quaternion={place.q} scale={place.s} visible={wallVisible} />;
}

// ---- sons de reserva ----------------------------------------------------------------------

/** Tachinha entrando na cortiça. */
registerSynth("board-pin", (c, out) => {
  noise(c, out, { dur: 0.06, from: 2600, to: 1400, q: 1.5, gain: 0.35, attack: 0.002 });
  tone(c, out, { freq: 180, to: 110, dur: 0.12, type: "triangle", gain: 0.18, delay: 0.01 });
});
