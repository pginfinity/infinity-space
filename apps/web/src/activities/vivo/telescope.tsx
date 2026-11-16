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
import { SPACE } from "../../world/theme.ts";
import { T } from "./strings.ts";

/**
 * Telescópio da Diretoria: abre uma vista em tela cheia, com câmera lenta e cinematográfica
 * olhando a Terra e as estrelas (o mesmo espaço que se vê pelas janelas). Esc fecha.
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
        <Moon />
        <SunGlow />
        <Cinematic />
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
        <p className="text-sm text-slate">{T.telescope.caption}</p>
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

/**
 * Câmera lenta: gira devagar em volta, sobe e desce o olhar e aproxima um pouco no começo
 * (como quem ajusta o foco do telescópio).
 */
function Cinematic() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const t0 = useRef(-1);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    if (t0.current < 0) t0.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - t0.current;
    const yaw = 0.35 + t * 0.018;
    const pitch = THREE.MathUtils.degToRad(-21 + Math.sin(t * 0.07) * 6);
    const zoom = Math.min(1, t / 6);
    const ease = 1 - Math.pow(1 - zoom, 3);
    camera.fov = 62 - ease * 22 + Math.sin(t * 0.05) * 1.5;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(t * 0.03) * 6, 24 + Math.sin(t * 0.04) * 3, Math.cos(t * 0.025) * 6);
    look.set(camera.position.x + Math.sin(yaw) * Math.cos(pitch) * 100, camera.position.y + Math.sin(pitch) * 100, camera.position.z - Math.cos(yaw) * Math.cos(pitch) * 100);
    camera.lookAt(look);
  });
  return null;
}

/** Lua distante, com crateras desenhadas por ruído (sem textura baixada). */
function Moon() {
  const ref = useRef<THREE.Mesh>(null);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 48, 32);
    const m = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vN; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float n(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 p = normalize(vP);
          float maria = smoothstep(0.45, 0.6, n(p * 2.5));
          float crater = smoothstep(0.72, 0.8, n(p * 9.0)) * 0.35;
          vec3 col = mix(vec3(0.78, 0.78, 0.8), vec3(0.45, 0.46, 0.5), maria) - crater * 0.3;
          float light = clamp(dot(vN, uSun) * 1.1 + 0.05, 0.0, 1.0);
          gl_FragColor = vec4(col * light, 1.0);
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.01;
  });
  return <mesh ref={ref} geometry={geo} material={mat} position={[860, 120, -690]} scale={34} />;
}

/** Brilho suave do Sol, fora do quadro na maior parte do tempo. */
function SunGlow() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,244,224,1)");
    r.addColorStop(0.15, "rgba(255,226,180,0.55)");
    r.addColorStop(1, "rgba(255,226,180,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const dir = new THREE.Vector3(0.45, 0.55, 0.7).normalize().multiplyScalar(1400);
  return (
    <sprite position={dir} scale={[420, 420, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}
