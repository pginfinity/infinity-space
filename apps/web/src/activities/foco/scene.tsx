import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FOCO_ID, FOCO_TABLE_ID, FOCO_FOCUS_MS, focoNow, vivoLocalToWorld, type FocoState, type Lens } from "@infinity/world";
import { actState, useAct } from "../registry.ts";
import { serverNow } from "../../net/session.ts";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { glow } from "../../scene/materials.ts";
import { Html } from "../../scene/Html.tsx";
import { FOCO_CLOCK } from "../../scene/furniture/foco.ts";
import { PHASE_COLOR, fmt } from "./hud.tsx";
import { T } from "./strings.ts";

/**
 * O relógio da mesa de foco no mundo, igual nas duas lentes: um anel de progresso flutuando sobre o
 * suporte da mesa (sempre de frente para a câmera), com o tempo que falta no meio. Azul no foco, verde na pausa,
 * cinza pausado. No 2D, onde o texto do anel vira poucos pixels, uma etiqueta nítida aparece para quem
 * está perto (como as etiquetas das salas).
 */

const R_IN = FOCO_CLOCK.r - 0.05;
const R_OUT = FOCO_CLOCK.r;
const SEGS = 72;
/** Quantos passos o anel tem (redesenha a geometria só quando muda de passo). */
const STEPS = 240;

function anchor(): THREE.Vector3 | null {
  const t = world().map.objects.find((o) => o.id === FOCO_TABLE_ID);
  if (!t) return null;
  const p = vivoLocalToWorld(t, FOCO_CLOCK.x, FOCO_CLOCK.z);
  return new THREE.Vector3(p.x, FOCO_CLOCK.y, p.z);
}

/** Texto do meio do anel: o tempo e a fase (canvas próprio, redesenhado só quando muda). */
class Face {
  readonly canvas = document.createElement("canvas");
  readonly tex: THREE.CanvasTexture;
  private last = "";

  constructor() {
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  draw(time: string, phase: string, color: string, dim: boolean): void {
    const key = `${time}|${phase}|${color}|${dim}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.canvas.getContext("2d")!;
    const s = this.canvas.width;
    g.clearRect(0, 0, s, s);
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    g.fillStyle = "rgba(0,17,42,0.88)";
    g.fill();
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = dim ? "#8A93A3" : "#F2F0EF";
    g.font = '700 74px Geist, system-ui, sans-serif';
    g.fillText(time, s / 2, s / 2 + 16);
    g.fillStyle = color;
    g.font = '600 26px Geist, system-ui, sans-serif';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "3px";
    g.fillText(phase.toUpperCase(), s / 2, s / 2 + 62);
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
  }
}

export function FocoScene({ lens }: { lens: Lens }) {
  const at = useMemo(anchor, []);
  const group = useRef<THREE.Group>(null);
  const built = useMemo(() => {
    const face = new Face();
    const faceMat = glow("#FFFFFF").clone();
    faceMat.map = face.tex;
    faceMat.transparent = true;
    faceMat.side = THREE.DoubleSide;
    // Materiais próprios (cópias): os de glow() são compartilhados e aqui precisam das duas faces.
    const own = (c: string, o = 1) => {
      const m = glow(c, o).clone();
      m.side = THREE.DoubleSide;
      return m;
    };
    const mats = Object.fromEntries(Object.entries(PHASE_COLOR).map(([k, c]) => [k, own(c)])) as Record<keyof typeof PHASE_COLOR, THREE.MeshBasicMaterial>;
    const track = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, SEGS), own("#8A93A3", 0.35));
    const prog = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, SEGS, 1, Math.PI / 2, 0.0001), mats.focus);
    prog.position.z = 0.002;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R_IN - 0.006, 48), faceMat);
    disc.position.z = -0.001;
    track.renderOrder = prog.renderOrder = 3;
    return { face, faceMat, mats, track, prog, disc, step: -1 };
  }, []);

  useEffect(
    () => () => {
      built.face.dispose();
      built.faceMat.dispose();
      (built.track.material as THREE.Material).dispose();
      for (const m of Object.values(built.mats)) m.dispose();
      built.track.geometry.dispose();
      built.prog.geometry.dispose();
      built.disc.geometry.dispose();
    },
    [built],
  );

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g || !at) return;
    // Sempre de frente para a câmera (no 2D isométrico, um círculo perfeito).
    g.quaternion.copy(camera.quaternion);
    const s = actState<FocoState>(FOCO_ID);
    const ph = s ? focoNow(s, serverNow()) : null;
    const paused = !!s && s.pausedAt !== null;
    const key = !ph || paused ? "paused" : ph.phase;
    const color = PHASE_COLOR[key];
    built.face.draw(ph ? fmt(ph.left) : fmt(FOCO_FOCUS_MS), ph ? (paused ? T.paused : T.phase(ph.phase)) : T.phase("focus"), color, !ph || paused);
    // Anel: cresce no sentido horário a partir do topo.
    const step = ph ? Math.round(ph.progress * STEPS) : 0;
    if (built.prog.material !== built.mats[key]) built.prog.material = built.mats[key];
    if (step !== built.step) {
      built.step = step;
      const len = Math.max(0.0001, (step / STEPS) * Math.PI * 2);
      built.prog.geometry.dispose();
      built.prog.geometry = new THREE.RingGeometry(R_IN, R_OUT, SEGS, 1, Math.PI / 2 - len, len);
      built.prog.visible = step > 0;
    }
  });

  if (!at) return null;
  return (
    <>
      <group ref={group} position={at}>
        <primitive object={built.track} />
        <primitive object={built.prog} />
        <primitive object={built.disc} />
      </group>
      {lens === "2d" && <NearLabel at={at} />}
    </>
  );
}

/** Etiqueta nítida do relógio no 2D, para quem está a até 7 m da mesa e com a mesa em uso. */
function NearLabel({ at }: { at: THREE.Vector3 }) {
  const state = useAct<FocoState>(FOCO_ID);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNear(Math.hypot(self.x - at.x, self.z - at.z) < 7), 400);
    return () => window.clearInterval(id);
  }, [at]);
  if (!near || !state || state.startAt === null) return null;
  return (
    <Html position={[at.x, at.y + FOCO_CLOCK.r + 0.22, at.z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
      <LabelText />
    </Html>
  );
}

function LabelText() {
  const el = useRef<HTMLSpanElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => {
      const s = actState<FocoState>(FOCO_ID);
      const ph = s ? focoNow(s, serverNow()) : null;
      if (!ph || !s || !el.current || !dot.current) return;
      const paused = s.pausedAt !== null;
      el.current.textContent = `${paused ? T.paused : T.phase(ph.phase)} · ${fmt(ph.left)}`;
      dot.current.style.background = paused ? PHASE_COLOR.paused : PHASE_COLOR[ph.phase];
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-space/80 px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-[0.06em] text-offwhite shadow-lg backdrop-blur-sm" data-foco-label>
      <span ref={dot} className="size-1.5 rounded-full" aria-hidden />
      <span ref={el} />
    </div>
  );
}
