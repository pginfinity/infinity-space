import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Telescope as TelescopeIcon, X } from "lucide-react";
import type { MapObject } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { self } from "../../world/registry.ts";
import { Space } from "../../scene/Space.tsx";
import { getSky } from "../../scene/astro/live.ts";
import { EARTH_ANGULAR_RADIUS } from "../../scene/astro/astro.ts";
import { SPACE } from "../../world/theme.ts";
import { T } from "./strings.ts";

/**
 * Telescópio da Diretoria: abre uma vista em tela cheia, com câmera lenta e cinematográfica
 * olhando o céu de verdade (a Lua, quando está acima da borda da Terra) e a Terra lá embaixo:
 * o mesmo espaço que se vê pelas janelas. Esc fecha.
 * Não mexe na câmera das lentes: é um Canvas próprio, só enquanto está aberto.
 */

interface TeleUi {
  open: boolean;
  /** De onde abriu (para fechar se a pessoa sair andando). */
  at: { x: number; z: number } | null;
}
const useTele = create<TeleUi>(() => ({ open: false, at: null }));

export const telescopeClient: ActivityClient = {
  name: "vivo/telescopio",
  objects: ["telescope"],
  label: () => T.telescope.action,
  use: (o: MapObject) => {
    sfx("vivo-telescope", { volume: 0.5 });
    useTele.setState({ open: true, at: { x: o.pos.x, z: o.pos.z } });
  },
  Overlay: TelescopeOverlay,
};

function TelescopeOverlay() {
  const open = useTele((s) => s.open);
  return <AnimatePresence>{open && <TelescopeView key="tele" />}</AnimatePresence>;
}

function TelescopeView() {
  const aim = useMemo(telescopeAim, []);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => useTele.setState({ open: false, at: null });
  useEffect(() => {
    closeBtn.current?.focus();
    // Esc fecha mesmo se o foco sair da janela do telescópio.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    // Andou para longe (clique no chão antes de abrir, reconexão): fecha.
    const t = window.setInterval(() => {
      const at = useTele.getState().at;
      if (at && Math.hypot(self.x - at.x, self.z - at.z) > 3) close();
    }, 500);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearInterval(t);
    };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute inset-0 z-50 bg-deep"
      role="dialog"
      aria-modal="true"
      aria-label={T.telescope.title}
      onKeyDown={(e) => {
        // Enquanto olha pelo telescópio, as teclas não andam com o avatar.
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 60, near: 1, far: 5000, position: [0, 24, 0] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          scene.background = new THREE.Color(SPACE);
        }}
      >
        <Space />
        <Cinematic aim={aim} />
      </Canvas>
      {/* ocular: escurece as bordas num círculo suave */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 50%, transparent 0, transparent 46%, rgb(2 11 24 / 0.6) 62%, rgb(2 11 24 / 0.95) 76%, #020B18 100%)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute left-1/2 top-6 flex -translate-x-1/2 flex-col items-center gap-1 text-center">
        <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-offwhite">
          <TelescopeIcon className="size-4 text-sky" aria-hidden />
          {T.telescope.title}
        </p>
        <p className="text-sm text-slate">{aim.moon ? T.telescope.captionMoon : T.telescope.caption}</p>
      </div>
      <button
        ref={closeBtn}
        type="button"
        onClick={close}
        aria-label={`${T.close} (Esc)`}
        className="glass absolute right-4 top-4 grid size-10 place-items-center rounded-full text-offwhite hover:border-offwhite/30"
      >
        <X className="size-5" />
      </button>
      <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate">{T.telescope.hint}</p>
    </motion.div>
  );
}

interface Aim {
  dir: THREE.Vector3;
  fov: number;
  moon: boolean;
}

/** Para onde o telescópio olha ao abrir: a Lua, se estiver acima da borda da Terra; senão, a borda do lado do Sol. */
function telescopeAim(): Aim {
  const sky = getSky();
  const moon = new THREE.Vector3(...sky.moon.dir);
  const fromNadir = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-moon.y, -1, 1)));
  if (fromNadir > EARTH_ANGULAR_RADIUS + 4) return { dir: moon, fov: 10, moon: true };
  const sun = new THREE.Vector3(...sky.sun.dir);
  const az = Math.atan2(sun.x, -sun.z);
  // ~4° acima da borda da Terra, no rumo do Sol
  const alt = THREE.MathUtils.degToRad(-(90 - EARTH_ANGULAR_RADIUS) + 4);
  return { dir: new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)), fov: 34, moon: false };
}

/**
 * Câmera lenta: aproxima devagar (como quem ajusta o foco) e passeia em volta do alvo. O passeio é proporcional ao
 * campo de visão (com a Lua de perto, mexe pouco para ela não sair do quadro).
 */
function Cinematic({ aim }: { aim: Aim }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const t0 = useRef(-1);
  const look = useMemo(() => new THREE.Vector3(), []);
  const yaw0 = Math.atan2(aim.dir.x, -aim.dir.z);
  const pitch0 = Math.asin(THREE.MathUtils.clamp(aim.dir.y, -1, 1));
  useFrame((state) => {
    if (t0.current < 0) t0.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - t0.current;
    const zoom = Math.min(1, t / 6);
    const ease = 1 - Math.pow(1 - zoom, 3);
    camera.fov = THREE.MathUtils.lerp(60, aim.fov, ease) * (1 + Math.sin(t * 0.05) * 0.03);
    camera.updateProjectionMatrix();
    const wander = THREE.MathUtils.degToRad(aim.fov * 0.18);
    const yaw = yaw0 + Math.sin(t * 0.021) * wander;
    const pitch = pitch0 + Math.sin(t * 0.033) * wander * 0.45;
    camera.position.set(0, 24, 0);
    look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(100).add(camera.position);
    camera.lookAt(look);
  });
  return null;
}
