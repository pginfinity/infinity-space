import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, Images, Trash2, X } from "lucide-react";
import * as THREE from "three";
import {
  PHOTOWALL_ID,
  PHOTOWALL_KIND,
  PHOTOWALL_MAX,
  PHOTOWALL_RANGE,
  photoWallUrl,
  type MapObject,
  type PhotoWallPosted,
  type PhotoWallState,
  type WallPhoto,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { toon } from "../../scene/materials.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { PHOTOWALL_FELT, PHOTOWALL_FELT_COLOR } from "../../scene/furniture/escritorio.ts";
import { useWallVisible } from "../../scene/wallFacing.ts";
import { deferScene, focusSoon, selfNear, useEscape } from "./shared.tsx";
import { markPosted } from "./photoUpload.ts";
import { noise, tone } from "./synth.ts";
import { T } from "./strings.ts";

/**
 * Mural de fotos da copa (Café & Copa): as fotos da cabine que alguém do grupo pôs no mural.
 * No mundo, as fotos aparecem penduradas em três varais (textura, nas duas lentes); perto do
 * mural, E abre a galeria com as fotos grandes, a data, baixar e "Tirar do mural" (qualquer
 * pessoa perto pode tirar, e a foto sai do disco do servidor).
 */

const useWallUi = create<{ open: boolean }>(() => ({ open: false }));

let wallObj: MapObject | null | undefined;
function wall(): MapObject | null {
  if (wallObj === undefined) wallObj = world().map.objects.find((o) => o.type === "photo-wall") ?? null;
  return wallObj;
}

const photosNow = () => actState<PhotoWallState>(PHOTOWALL_ID)?.photos ?? [];

export const photoWall: ActivityClient = {
  name: "escritorio/mural-fotos",
  kinds: [PHOTOWALL_KIND],
  objects: ["photo-wall"],
  label: () => T.photoWall.actionCount(photosNow().length),
  use: () => {
    useApp.getState().togglePeople(false);
    useWallUi.setState({ open: true });
  },
  onEvent: (e) => {
    if (e.ev === "posted") {
      const d = e.data as PhotoWallPosted;
      if (typeof d?.shot === "string") markPosted(d.shot);
    }
  },
  Overlay: WallOverlay,
  Scene: deferScene(WallScene, 1400),
};

/** "18 de novembro de 2026 · 14:32" */
function when(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "18/11 14:32" (miniaturas). */
function whenShort(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Lista "Ana, Bruno e Caio". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function fileName(p: WallPhoto): string {
  const d = new Date(p.at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `infinity-space-mural-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${p.type === "png" ? "png" : "jpg"}`;
}

// ---- galeria (HUD) ------------------------------------------------------------------------

function WallOverlay() {
  const open = useWallUi((s) => s.open);
  return <AnimatePresence>{open && <Gallery />}</AnimatePresence>;
}

function Gallery() {
  const state = useAct<PhotoWallState>(PHOTOWALL_ID);
  // Mais nova primeiro.
  const photos = useMemo(() => [...(state?.photos ?? [])].reverse(), [state]);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => useWallUi.setState({ open: false });
  // Se a foto escolhida sai do mural (alguém tirou), fica a que estava no mesmo lugar da lista.
  const lastIndex = useRef(0);
  const found = photos.findIndex((p) => p.id === sel);
  const index = found >= 0 ? found : Math.min(lastIndex.current, Math.max(0, photos.length - 1));
  const cur = photos[index] ?? null;
  useEffect(() => {
    lastIndex.current = index;
  }, [index]);

  useEffect(() => focusSoon(closeBtn.current), []);
  useEscape(close);
  // Longe do mural, a galeria fecha (o servidor também recusa tirar foto de longe).
  useEffect(() => {
    const id = window.setInterval(() => {
      const o = wall();
      if (o?.interact && !selfNear(o.interact.point, PHOTOWALL_RANGE + 0.8)) close();
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => setConfirm(false), [cur?.id]);

  const go = (k: number) => {
    if (!photos.length) return;
    setSel(photos[(index + k + photos.length) % photos.length]!.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute left-1/2 top-1/2 z-30 flex max-h-[calc(100vh-120px)] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-panel)]"
      role="dialog"
      aria-label={T.photoWall.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
        e.stopPropagation();
      }}
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Images className="size-4 text-slate" aria-hidden />
          <div>
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{T.photoWall.title}</h2>
            <p className="text-[11px] text-slate">{T.photoWall.count(photos.length, PHOTOWALL_MAX)}</p>
          </div>
        </div>
        <button ref={closeBtn} type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close}>
          <X className="size-4" />
        </button>
      </header>

      {!cur ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-offwhite">{T.photoWall.empty}</p>
          <p className="mt-1 text-xs text-slate">{T.photoWall.emptyHint}</p>
        </div>
      ) : (
        <>
          <figure className="relative flex min-h-0 flex-1 flex-col gap-2 px-4 pt-4">
            <div className="relative flex min-h-0 items-center justify-center">
              <img
                key={cur.id}
                src={photoWallUrl(cur)}
                alt={T.photoWall.alt(joinNames(cur.names))}
                width={cur.w}
                height={cur.h}
                data-photo={cur.id}
                className="max-h-[52vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label={T.photoWall.prev}
                    className="absolute left-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-deep/70 text-offwhite hover:bg-deep/90"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label={T.photoWall.next}
                    className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-deep/70 text-offwhite hover:bg-deep/90"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-sm text-offwhite">{when(cur.at)}</p>
                {cur.names.length > 0 && <p className="truncate text-xs text-slate">{T.photoWall.with(joinNames(cur.names))}</p>}
              </div>
              {confirm ? (
                <div className="flex items-center gap-2" role="group" aria-label={T.photoWall.remove}>
                  <span className="text-xs text-offwhite/85">{T.photoWall.confirm}</span>
                  <button type="button" onClick={() => setConfirm(false)} className="rounded-xl px-3 py-1.5 text-sm text-slate hover:bg-offwhite/8 hover:text-offwhite">
                    {T.cancel}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => sendAct(PHOTOWALL_ID, "remove", { id: cur.id })}
                    className="flex items-center gap-1.5 rounded-xl border border-danger/60 px-3 py-1.5 text-sm font-medium text-offwhite hover:bg-danger/15"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {T.photoWall.confirmYes}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirm(true)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-slate hover:bg-offwhite/8 hover:text-offwhite"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {T.photoWall.remove}
                  </button>
                  <a
                    href={photoWallUrl(cur)}
                    download={fileName(cur)}
                    className="flex items-center gap-2 rounded-xl bg-orange px-4 py-1.5 text-sm font-semibold text-offwhite hover:brightness-110"
                  >
                    <Download className="size-4" aria-hidden />
                    {T.photoWall.download}
                  </a>
                </div>
              )}
            </figcaption>
          </figure>
          <ul className="flex gap-2 overflow-x-auto px-4 pb-4 pt-3" aria-label={T.photoWall.title}>
            {photos.map((p) => (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSel(p.id)}
                  aria-label={T.photoWall.thumb(whenShort(p.at))}
                  aria-pressed={p.id === cur.id}
                  className={`block overflow-hidden rounded-md transition-opacity ${p.id === cur.id ? "ring-2 ring-signal ring-offset-2 ring-offset-space" : "opacity-60 hover:opacity-100"}`}
                >
                  <img src={photoWallUrl(p)} alt="" loading="lazy" className="h-14 w-auto" />
                </button>
              </li>
            ))}
          </ul>
          {photos.length >= PHOTOWALL_MAX - 2 && <p className="-mt-2 px-4 pb-3 text-center text-[11px] text-slate/80">{T.photoWall.oldest(PHOTOWALL_MAX)}</p>}
        </>
      )}
    </motion.div>
  );
}

// ---- mural no mundo (textura) -------------------------------------------------------------

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * PHOTOWALL_FELT.h) / PHOTOWALL_FELT.w);
const COLS = 4;
/** Varais (altura no canvas): alinhados com os ganchos do modelo (0,3 m entre eles). */
const LINES = [70, 262, 454];
const PHOTO_W = 206;
const THUMB_W = 280;

/** Miniaturas já carregadas (id → canvas pequeno; a imagem grande é solta depois de desenhar). */
const thumbs = new Map<string, HTMLCanvasElement | "erro">();
const loading = new Set<string>();

function loadThumb(p: WallPhoto, done: () => void): void {
  if (thumbs.has(p.id) || loading.has(p.id)) return;
  loading.add(p.id);
  const img = new Image();
  img.decoding = "async";
  img.src = photoWallUrl(p);
  img
    .decode()
    .then(() => {
      const cv = document.createElement("canvas");
      cv.width = THUMB_W;
      cv.height = Math.max(1, Math.round((THUMB_W * img.naturalHeight) / Math.max(1, img.naturalWidth)));
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      thumbs.set(p.id, cv);
    })
    .catch(() => thumbs.set(p.id, "erro"))
    .finally(() => {
      loading.delete(p.id);
      done();
    });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Quantas fotos (com imagem) a última textura desenhou: para os testes de ponta a ponta. */
let drawnNow = 0;

/** Feltro, título, varais e as fotos penduradas (a mais nova no começo do primeiro varal). */
function drawWall(ctx: CanvasRenderingContext2D, photos: readonly WallPhoto[]): void {
  const W = TEX_W;
  const H = TEX_H;
  ctx.fillStyle = PHOTOWALL_FELT_COLOR;
  ctx.fillRect(0, 0, W, H);
  // textura do feltro: pontinhos fixos
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.09)";
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // título
  ctx.fillStyle = "rgba(242,240,239,0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 26px Geist, sans-serif";
  ctx.letterSpacing = "7px";
  ctx.fillText(T.photoWall.header, W / 2, 30);
  ctx.letterSpacing = "0px";
  // varais de barbante, com uma barriguinha (a mesma curva onde os pregadores se prendem)
  const sag = (x: number) => {
    const t = (x - 12) / (W - 24);
    return 36 * t * (1 - t);
  };
  ctx.strokeStyle = "#C9A27A";
  ctx.lineWidth = 2.5;
  for (const y of LINES) {
    ctx.beginPath();
    ctx.moveTo(12, y);
    ctx.quadraticCurveTo(W / 2, y + 18, W - 12, y);
    ctx.stroke();
  }
  const list = [...photos].reverse().slice(0, COLS * LINES.length);
  let drawn = 0;
  list.forEach((p, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const cx = (col + 0.5) * (W / COLS);
    const top = LINES[row]! + sag(cx);
    const r = hash(p.id);
    const thumb = thumbs.get(p.id);
    const w = PHOTO_W;
    const h = thumb && thumb !== "erro" ? Math.round((w * thumb.height) / thumb.width) : Math.round(w / 1.2);
    ctx.save();
    ctx.translate(cx, top + 6);
    ctx.rotate((r - 0.5) * 0.09);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    if (thumb && thumb !== "erro") {
      ctx.drawImage(thumb, -w / 2, 0, w, h);
      drawn++;
    } else {
      // ainda carregando (ou falhou): papel em branco
      ctx.fillStyle = "#F2F0EF";
      ctx.fillRect(-w / 2, 0, w, h);
    }
    ctx.shadowColor = "transparent";
    // pregador de madeira
    ctx.fillStyle = "#D9B98C";
    ctx.fillRect(-6, -12, 12, 26);
    ctx.fillStyle = "rgba(94,61,39,0.55)";
    ctx.fillRect(-1, -12, 2, 26);
    ctx.restore();
  });
  if (!list.length) {
    ctx.fillStyle = "rgba(242,240,239,0.6)";
    ctx.font = "500 24px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(T.photoWall.wallEmpty, W / 2, (LINES[1]! + LINES[2]!) / 2 - 10);
  }
  drawnNow = drawn;
}

function WallScene() {
  const state = useAct<PhotoWallState>(PHOTOWALL_ID);
  const o = wall();
  const wallVisible = useWallVisible(o?.id);
  const [loaded, setLoaded] = useState(0);
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
    const geo = new THREE.PlaneGeometry(PHOTOWALL_FELT.w, PHOTOWALL_FELT.h);
    const place = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) };
    if (o) objectMatrix(o).multiply(new THREE.Matrix4().makeTranslation(PHOTOWALL_FELT.x, PHOTOWALL_FELT.y, PHOTOWALL_FELT.z)).decompose(place.p, place.q, place.s);
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

  // Carrega as fotos novas e solta as que saíram do mural.
  useEffect(() => {
    const photos = state?.photos ?? [];
    const ids = new Set(photos.map((p) => p.id));
    for (const id of [...thumbs.keys()]) if (!ids.has(id)) thumbs.delete(id);
    for (const p of photos) loadThumb(p, () => setLoaded((n) => n + 1));
    if (count.current !== null && photos.length > count.current && o?.interact) sfx("photowall-pin", { at: o.interact.point, range: 9, volume: 0.6 });
    count.current = photos.length;
  }, [state, o]);

  // Redesenha quando a lista muda, quando uma foto termina de carregar e quando a fonte chega.
  useEffect(() => {
    const photos = state?.photos ?? [];
    const draw = () => {
      drawWall(ctx, photos);
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.load("700 26px Geist").then(draw, () => undefined);
  }, [state, loaded, ctx, tex]);

  if (!o) return null;
  return <mesh name="mural-fotos:textura" geometry={geo} material={mat} position={place.p} quaternion={place.q} scale={place.s} visible={wallVisible} />;
}

// Gancho de testes, só em desenvolvimento: quantas fotos a textura do mural mostra agora.
if (import.meta.env.DEV) Object.assign(window, { __muralFotos: { drawn: () => drawnNow } });

// ---- sons de reserva ----------------------------------------------------------------------

/** Pregador prendendo a foto no varal: estalinho de madeira e um sopro de papel. */
registerSynth("photowall-pin", (c, out) => {
  tone(c, out, { freq: 900, to: 520, dur: 0.05, type: "triangle", gain: 0.16 });
  noise(c, out, { dur: 0.12, from: 3200, to: 1600, q: 0.9, gain: 0.22, attack: 0.004, delay: 0.03 });
});
