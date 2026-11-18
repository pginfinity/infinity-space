import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Download, ImageUp, LoaderCircle, X } from "lucide-react";
import { useFrame, useThree, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import {
  angleDelta,
  yawOf,
  PHOTO_ASPECT,
  PHOTO_ID,
  PHOTO_KIND,
  photoInFrame,
  photoRig,
  type PhotoCountdown,
  type PhotoRig,
  type PhotoShot,
  type PhotoState,
  type PhotoTicket,
  type Vec2,
} from "@infinity/world";
import { actState, sendAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { wallUniforms } from "../../scene/walls.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { deferScene, focusSoon, nameOf, useEscape } from "./shared.tsx";
import { noise, tone } from "./synth.ts";
import { T } from "./strings.ts";
import { postToWall, saveTicket, useWallPost } from "./photoUpload.ts";

/**
 * Cabine de fotos do Marketing Studio. Perto do tripé (ou já na frente do fundo), E liga o timer
 * de 5 s para todo mundo na cabine. No fim, cada participante gera no próprio navegador a foto do
 * ponto de vista da câmera (render fora da tela, estilo 3D, 1600×1200) com a moldura da marca, e
 * pode baixar o PNG ou pôr no mural da copa (photoUpload.ts). Só nesse caso a imagem vai para o
 * servidor, e ela é só a cena: avatares e móveis, sem câmera nem tela de ninguém (ver renderView).
 */

interface PhotoUi {
  countdown: { name: string; start: number; ms: number; key: number } | null;
  flash: number;
  photo: { url: string; file: string; names: string; shot: string } | null;
  busy: boolean;
}
const usePhotoUi = create<PhotoUi>(() => ({ countdown: null, flash: 0, photo: null, busy: false }));

let rigCache: PhotoRig | null | undefined;
function rig(): PhotoRig | null {
  if (rigCache === undefined) {
    const objs = world().map.objects;
    const backdrop = objs.find((o) => o.type === "backdrop");
    const tripod = objs.find((o) => o.type === "camera-tripod");
    rigCache = backdrop && tripod ? photoRig(backdrop, tripod) : null;
  }
  return rigCache;
}

function frameCenter(r: PhotoRig): Vec2 {
  const f = r.frame;
  return { x: (f[0]!.x + f[2]!.x) / 2, z: (f[0]!.z + f[2]!.z) / 2 };
}

/** Está na cabine (no quadro ou por perto do tripé)? */
function inBooth(r: PhotoRig): boolean {
  return photoInFrame(r, self) || Math.hypot(self.x - r.tripod.x, self.z - r.tripod.z) < 4.5;
}

/** Acesso ao renderizador da lente atual (preenchido pela cena). */
let r3f: (() => RootState) | null = null;
/** Disparos lidos pela cena (luz do ring light). */
const timeline = { countdownAt: -1, ms: 0, shotAt: -1 };

export const photoBooth: ActivityClient = {
  name: "escritorio/cabine",
  kinds: [PHOTO_KIND],
  targets: () => {
    const r = rig();
    if (!r || actState<PhotoState>(PHOTO_ID)?.phase === "countdown") return [];
    const run = () => sendAct(PHOTO_ID, "start");
    const list: DynamicTarget[] = [{ key: "cabine:tripe", point: r.tripod, radius: 1.8, label: T.photo.target, run }];
    if (photoInFrame(r, self)) list.push({ key: "cabine:quadro", point: { x: self.x, z: self.z }, radius: 0.5, label: T.photo.target, run });
    return list;
  },
  onEvent: (e) => {
    const r = rig();
    if (!r) return;
    const now = performance.now();
    if (e.ev === "countdown") {
      const d = e.data as PhotoCountdown;
      timeline.countdownAt = now;
      timeline.ms = d.ms;
      if (!inBooth(r)) return;
      usePhotoUi.setState({ countdown: { name: d.name, start: now, ms: d.ms, key: now } });
      for (let i = 0; i < Math.round(d.ms / 1000); i++) window.setTimeout(() => sfx("photo-tick", { at: r.tripod, range: 10, volume: 0.5 }), i * 1000);
    } else if (e.ev === "shot") {
      timeline.shotAt = now;
      const d = e.data as PhotoShot;
      if (inBooth(r)) {
        usePhotoUi.setState({ flash: now });
        sfx("photo-shutter", { at: r.tripod, range: 12, volume: 0.8 });
      }
      const me = useApp.getState().selfId;
      if (me && d.ids.includes(me)) void develop(r, d.ids, d.shot);
    } else if (e.ev === "ticket") {
      const d = e.data as PhotoTicket;
      if (typeof d?.shot === "string" && typeof d.ticket === "string") saveTicket(d.shot, d.ticket);
    }
  },
  Overlay: PhotoOverlay,
  Scene: PhotoScene,
};

// ---- a foto -------------------------------------------------------------------------------

const PHOTO_W = 1600;
const PHOTO_H = Math.round(PHOTO_W / PHOTO_ASPECT);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

/** Lista "Ana, Bruno e Caio". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Linear → sRGB para 8 bits (a foto sai em linear do alvo de render; a tela codifica em sRGB). */
let srgbLut: Uint8Array | null = null;
function srgb(): Uint8Array {
  if (srgbLut) return srgbLut;
  srgbLut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    srgbLut[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
  return srgbLut;
}

/**
 * Renderiza a cena do ponto de vista da câmera do tripé e devolve os pixels em sRGB (de baixo para cima).
 * O alvo é marcado como "de saída" (isXRRenderTarget) para o three aplicar o mesmo tone mapping da tela;
 * com espaço de cor linear, ele guarda RGBA8 e o MSAA resolve sem conflito de formato. O sRGB vem depois.
 */
function renderView(r: PhotoRig): Uint8Array | null {
  const st = r3f?.();
  if (!st) return null;
  const { gl, scene } = st;
  const rt = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
  (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  const cam = new THREE.PerspectiveCamera(r.camera.fov, PHOTO_ASPECT, 0.05, 400);
  cam.position.set(r.camera.pos.x, r.camera.pos.y, r.camera.pos.z);
  cam.lookAt(r.camera.target.x, r.camera.target.y, r.camera.target.z);
  cam.updateMatrixWorld();
  // O tripé fica entre a câmera virtual e a turma: sai da foto (e o brilho do flash também).
  // Privacidade: nada de vídeo de verdade na foto (uma TV com a tela de alguém, por exemplo), porque
  // ela pode ir para o mural da copa. Hoje nenhuma tela aparece no quadro, mas a regra não depende disso.
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.visible && (o.name.startsWith("mobilia:camera-tripod:") || o.name === "cabine:brilho" || hasVideo(o))) hidden.push(o);
  });
  for (const o of hidden) o.visible = false;
  // Paredes inteiras na foto (o 2D corta a altura; o 3D vaza em volta de você).
  const cut = wallUniforms.uCut.value;
  const see = wallUniforms.uSee.value;
  wallUniforms.uCut.value = 100;
  wallUniforms.uSee.value = 0;
  const prev = gl.getRenderTarget();
  try {
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, cam);
    const px = new Uint8Array(PHOTO_W * PHOTO_H * 4);
    gl.readRenderTargetPixels(rt, 0, 0, PHOTO_W, PHOTO_H, px);
    const lut = srgb();
    for (let i = 0; i < px.length; i += 4) {
      px[i] = lut[px[i]!]!;
      px[i + 1] = lut[px[i + 1]!]!;
      px[i + 2] = lut[px[i + 2]!]!;
      px[i + 3] = 255;
    }
    return px;
  } finally {
    gl.setRenderTarget(prev);
    for (const o of hidden) o.visible = true;
    wallUniforms.uCut.value = cut;
    wallUniforms.uSee.value = see;
    rt.dispose();
  }
}

/** A malha mostra vídeo (câmera ou tela compartilhada)? */
function hasVideo(o: THREE.Object3D): boolean {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.material) return false;
  for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if ((m as THREE.MeshBasicMaterial).map instanceof THREE.VideoTexture) return true;
  return false;
}

/** Revela a foto: render + moldura da marca (estrela oficial, "Infinity Space", lugar e data). */
async function develop(r: PhotoRig, ids: string[], shot: string): Promise<void> {
  usePhotoUi.setState({ busy: true });
  try {
    // Espera o flash (e um quadro) para todo mundo estar parado na pose.
    await new Promise((ok) => window.setTimeout(ok, 60));
    const px = renderView(r);
    if (!px) throw new Error("sem renderizador");
    const pad = 44;
    const strip = 168;
    const cv = document.createElement("canvas");
    cv.width = PHOTO_W + pad * 2;
    cv.height = PHOTO_H + pad + strip;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#F2F0EF";
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Pixels do WebGL vêm de baixo para cima.
    const img = ctx.createImageData(PHOTO_W, PHOTO_H);
    const row = PHOTO_W * 4;
    for (let y = 0; y < PHOTO_H; y++) img.data.set(px.subarray((PHOTO_H - 1 - y) * row, (PHOTO_H - y) * row), y * row);
    ctx.putImageData(img, pad, pad);
    ctx.strokeStyle = "rgba(0,17,42,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(pad - 1, pad - 1, PHOTO_W + 2, PHOTO_H + 2);

    await Promise.all([document.fonts?.load("700 46px NORD"), document.fonts?.load("500 26px Geist")].map((p) => p?.catch(() => undefined)));
    const star = await loadImage("/brand/sparkle.svg").catch(() => null);
    const by = PHOTO_H + pad;
    const mid = by + strip / 2;
    let x = pad;
    if (star) {
      const h = 74;
      const w = (h * star.naturalWidth) / Math.max(1, star.naturalHeight) || h;
      ctx.drawImage(star, x, mid - h / 2, w, h);
      x += w + 22;
    }
    ctx.fillStyle = "#00112A";
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 46px NORD, 'Arial Black', sans-serif";
    ctx.fillText(T.photo.footer.toUpperCase(), x, mid + 4);
    const date = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    ctx.font = "500 26px Geist, sans-serif";
    ctx.fillStyle = "#5b6577";
    ctx.fillText(`${T.photo.place} · ${date}`, x, mid + 42);
    const names = joinNames(ids.map(nameOf));
    ctx.textAlign = "right";
    ctx.fillStyle = "#00112A";
    ctx.font = "600 28px Geist, sans-serif";
    let label = names;
    while (label.length > 4 && ctx.measureText(label).width > PHOTO_W * 0.45) label = `${label.slice(0, -2)}…`;
    ctx.fillText(label, cv.width - pad, mid + 12);

    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
    if (!blob) throw new Error("sem imagem");
    const old = usePhotoUi.getState().photo;
    if (old) URL.revokeObjectURL(old.url);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    usePhotoUi.setState({ photo: { url: URL.createObjectURL(blob), file: `infinity-space-${stamp}.png`, names, shot } });
  } catch (err) {
    console.error("[cabine] não deu para gerar a foto:", err);
    toast(T.photo.failed);
  } finally {
    usePhotoUi.setState({ busy: false });
  }
}

// ---- interface ------------------------------------------------------------------------------

function PhotoOverlay() {
  const cd = usePhotoUi((s) => s.countdown);
  const flash = usePhotoUi((s) => s.flash);
  const photo = usePhotoUi((s) => s.photo);
  const [digit, setDigit] = useState(5);
  useEffect(() => {
    if (!cd) return;
    const tick = () => {
      const el = performance.now() - cd.start;
      setDigit(Math.max(0, Math.ceil((cd.ms - el) / 1000)));
      if (el > cd.ms + 900) usePhotoUi.setState((s) => (s.countdown?.key === cd.key ? { countdown: null } : s));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [cd]);
  return (
    <>
      <AnimatePresence>
        {cd && (
          <motion.div
            key={cd.key}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass pointer-events-none absolute left-1/2 top-[16%] flex min-w-[240px] -translate-x-1/2 flex-col items-center rounded-3xl px-6 pb-4 pt-3"
            role="status"
            aria-live="assertive"
          >
            <p className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-slate">
              <Camera className="size-3.5" aria-hidden />
              {T.photo.title}
            </p>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={digit}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className={`my-1 font-display font-black leading-none tabular-nums ${digit > 0 ? "text-[80px] text-offwhite" : "py-4 text-[44px] text-orange"}`}
              >
                {digit > 0 ? digit : T.photo.smile}
              </motion.p>
            </AnimatePresence>
            <p className="max-w-[300px] text-center text-xs text-slate">{T.photo.by(cd.name)}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-offwhite/80">{T.photo.pose}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            className="pointer-events-none absolute inset-0 bg-offwhite"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            onAnimationComplete={() => usePhotoUi.setState((s) => (s.flash === flash ? { flash: 0 } : s))}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{photo && <PhotoCard key={photo.url} photo={photo} />}</AnimatePresence>
    </>
  );
}

function PhotoCard({ photo }: { photo: NonNullable<PhotoUi["photo"]> }) {
  const link = useRef<HTMLAnchorElement>(null);
  const close = () => {
    usePhotoUi.setState({ photo: null });
    URL.revokeObjectURL(photo.url);
  };
  useEscape(close);
  useEffect(() => focusSoon(link.current), []);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, rotate: -1.5 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="glass pointer-events-auto absolute left-1/2 top-1/2 z-30 flex w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[var(--radius-panel)] p-4"
      role="dialog"
      aria-label={T.photo.ready}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.1em]">
          <Camera className="size-4 text-slate" aria-hidden />
          {T.photo.ready}
        </p>
        <button type="button" onClick={close} aria-label={T.close} className="rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-4" />
        </button>
      </div>
      <img src={photo.url} alt={T.photo.alt(photo.names)} className="max-h-[58vh] w-full rounded-lg object-contain shadow-2xl" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={close} className="mr-auto rounded-xl px-3 py-2 text-sm text-slate hover:bg-offwhite/8 hover:text-offwhite">
          {T.close}
        </button>
        <WallButton photo={photo} />
        <a ref={link} href={photo.url} download={photo.file} className="flex items-center gap-2 rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110">
          <Download className="size-4" aria-hidden />
          {T.photo.download}
        </a>
      </div>
      <WallNote shot={photo.shot} />
    </motion.div>
  );
}

/** "Pôr no mural da copa": só aparece para quem tem o bilhete desta foto (quem saiu nela). */
function WallButton({ photo }: { photo: NonNullable<PhotoUi["photo"]> }) {
  const ticket = useWallPost((s) => s.tickets[photo.shot]);
  const status = useWallPost((s) => s.posts[photo.shot]?.status);
  if (!ticket) return null;
  const base = "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium";
  if (status === "posted" || status === "group") {
    return (
      <span className={`${base} text-offwhite/85`} role="status">
        <Check className="size-4 text-ok" aria-hidden />
        {status === "posted" ? T.photo.onWall : T.photo.onWallGroup}
      </span>
    );
  }
  const sending = status === "sending";
  return (
    <button
      type="button"
      onClick={() => void postToWall(photo.shot, photo.url)}
      disabled={sending}
      aria-busy={sending}
      className={`${base} border border-offwhite/15 text-offwhite hover:bg-offwhite/8 disabled:opacity-70`}
    >
      {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
      {sending ? T.photo.sending : T.photo.toWall}
    </button>
  );
}

/** Embaixo dos botões: o que acontece no mural (antes de enviar) ou o erro do envio. */
function WallNote({ shot }: { shot: string }) {
  const ticket = useWallPost((s) => s.tickets[shot]);
  const post = useWallPost((s) => s.posts[shot]);
  if (!ticket || post?.status === "posted" || post?.status === "group") return null;
  if (post?.status === "error") {
    return (
      <p className="text-right text-xs text-danger" role="alert">
        {T.photo.wallErrors[post.error ?? "mural"] ?? T.photo.wallErrors.mural}
      </p>
    );
  }
  return <p className="text-right text-[11px] text-slate">{T.photo.toWallHint}</p>;
}

// ---- no mundo: brilho do ring light -------------------------------------------------------

/** Guarda o acesso ao renderizador (para a foto) e monta o brilho do ring light depois. */
function PhotoScene() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    r3f = get;
    return () => {
      if (r3f === get) r3f = null;
    };
  }, [get]);
  return <DeferredHalo />;
}

const DeferredHalo = deferScene(RingHalo, 1300);

function RingHalo() {
  const r = rig();
  const halo = useRef<THREE.Mesh>(null);
  const place = useMemo(() => {
    const o = world().map.objects.find((x) => x.type === "ring-light");
    if (!o) return null;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    objectMatrix(o).multiply(new THREE.Matrix4().makeTranslation(0, 1.52, 0.05)).decompose(p, q, s);
    return { p, q };
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#FFF6E0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((_, dt) => {
    const now = performance.now();
    // Na contagem, quem está no quadro (parado) se vira para a câmera.
    if (r && timeline.countdownAt >= 0 && now - timeline.countdownAt < timeline.ms + 300 && self.anim === "idle" && photoInFrame(r, self)) {
      const want = yawOf({ x: r.camera.pos.x - self.x, z: r.camera.pos.z - self.z });
      self.yaw += angleDelta(self.yaw, want) * Math.min(1, dt * 10);
    }
    let k = 0;
    if (timeline.countdownAt >= 0) {
      const el = now - timeline.countdownAt;
      // Pisca a cada segundo da contagem.
      if (el < timeline.ms) k = 0.25 + 0.35 * Math.max(0, 1 - (el % 1000) / 450);
    }
    if (timeline.shotAt >= 0) {
      const el = now - timeline.shotAt;
      if (el < 500) k = Math.max(k, 1 - el / 500);
    }
    mat.opacity = k;
    if (halo.current) {
      halo.current.visible = k > 0.01;
      halo.current.scale.setScalar(1 + k * 0.6);
    }
  });

  if (!place) return null;
  return (
    <mesh ref={halo} name="cabine:brilho" position={place.p} quaternion={place.q} material={mat} visible={false}>
      <circleGeometry args={[0.42, 28]} />
    </mesh>
  );
}

// ---- sons de reserva ----------------------------------------------------------------------

/** Tique do timer. */
registerSynth("photo-tick", (c, out) => tone(c, out, { freq: 1320, dur: 0.07, type: "triangle", gain: 0.14 }));
/** Obturador: clique duplo e um sopro curto. */
registerSynth("photo-shutter", (c, out) => {
  noise(c, out, { dur: 0.05, from: 4200, to: 2400, q: 1.2, gain: 0.4, attack: 0.001 });
  noise(c, out, { dur: 0.08, from: 3000, to: 1500, q: 1.2, gain: 0.3, attack: 0.001, delay: 0.07 });
  tone(c, out, { freq: 220, to: 140, dur: 0.1, type: "triangle", gain: 0.12, delay: 0.02 });
});
