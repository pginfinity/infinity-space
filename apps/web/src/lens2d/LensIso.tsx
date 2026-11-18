import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { yawOf } from "@infinity/world";
import { setWallView } from "../scene/wallFacing.ts";
import { SPACE } from "../world/theme.ts";
import { WorldScene } from "../scene/WorldScene.tsx";
import { LookPost } from "../scene/look/LookPost.tsx";
import { wallUniforms } from "../scene/walls.ts";
import { self } from "../world/registry.ts";
import { setHeading, walkTo } from "../engine/movement.ts";

/**
 * Lente 2D: o mesmo mundo em isométrico com cara de pixel art (estilo Habbo/SoWork).
 * Renderiza em resolução reduzida (cada "pixel" da arte = PIXEL pixels da tela) e amplia sem suavizar.
 * Paredes ficam baixinhas para enxergar dentro das salas.
 */

const PIXEL = 2;
const PITCH = THREE.MathUtils.degToRad(33);
const MIN_ZOOM = 26;
const MAX_ZOOM = 96;
const WALL_CUT = 1.0;

export default function LensIso() {
  useEffect(() => {
    wallUniforms.uCut.value = WALL_CUT;
    wallUniforms.uSee.value = 0;
    return () => {
      wallUniforms.uCut.value = 100;
    };
  }, []);

  return (
    <div className="absolute inset-0" aria-label="Escritório em 2D isométrico" role="application">
      <Canvas
        orthographic
        dpr={1 / PIXEL}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ zoom: initialZoom(), near: -400, far: 1200, position: [30, 30, 30] }}
        style={{ imageRendering: "pixelated" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          scene.background = new THREE.Color(SPACE);
        }}
      >
        <WorldScene lens="2d" />
        <IsoRig />
        <LookPost lens="2d" />
      </Canvas>
    </div>
  );
}

/** Zoom inicial: 64 px por metro no computador; mais afastado em telas pequenas, para ver a sala. */
function initialZoom(): number {
  return THREE.MathUtils.clamp(Math.min(window.innerWidth, window.innerHeight * 1.4) / 18, 34, 64);
}

/** Câmera isométrica que segue você, gira de 90 em 90° (Q/E) e encaixa na grade de pixels. */
function IsoRig() {
  const { camera, gl, size } = useThree();
  const st = useRef({ step: 0, yaw: Math.PI / 4, tx: self.x, tz: self.z, panX: 0, panZ: 0, follow: true });
  const wallStep = useRef(-1);

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const cam = camera as THREE.OrthographicCamera;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let drag: { x: number; y: number; panX: number; panZ: number; moved: boolean; id: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; zoom: number } | null = null;

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: cam.zoom };
        drag = null;
        return;
      }
      drag = { x: e.clientX, y: e.clientY, panX: s.panX, panZ: s.panZ, moved: false, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        cam.zoom = THREE.MathUtils.clamp((pinch.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.d, MIN_ZOOM, MAX_ZOOM);
        cam.updateProjectionMatrix();
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      s.follow = false;
      // Arrastar a tela move a câmera no plano do chão (eixos da tela projetados).
      const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
      const down = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      const k = 1 / cam.zoom;
      s.panX = drag.panX - (right.x * dx + down.x * dy / Math.sin(PITCH)) * k;
      s.panZ = drag.panZ - (right.z * dx + down.z * dy / Math.sin(PITCH)) * k;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.id === e.pointerId && !drag.moved && e.button === 0) {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, cam);
        if (ray.ray.intersectPlane(floor, hit) && walkTo({ x: hit.x, z: hit.z })) {
          s.follow = true;
          s.panX = 0;
          s.panZ = 0;
        }
      }
      if (drag?.id === e.pointerId) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      cam.updateProjectionMatrix();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyQ") s.step = (s.step + 3) % 4;
      if (e.code === "KeyR") s.step = (s.step + 1) % 4;
    };
    const recenter = () => {
      s.follow = true;
      s.panX = 0;
      s.panZ = 0;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("infinity:recenter", recenter);
    el.style.touchAction = "none";
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("infinity:recenter", recenter);
    };
  }, [camera, gl]);

  const tmp = useRef({ right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), target: new THREE.Vector3() });

  useFrame((_, dt) => {
    const s = st.current;
    const cam = camera as THREE.OrthographicCamera;
    // Gira suavemente até o ângulo escolhido.
    const goal = Math.PI / 4 + s.step * (Math.PI / 2);
    if (s.step !== wallStep.current) {
      wallStep.current = s.step;
      setWallView({ x: Math.sin(goal), z: Math.cos(goal) });
    }
    let d = goal - s.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.yaw += d * Math.min(1, dt * 8);

    if (s.follow) {
      const k = 1 - Math.exp(-dt * 9);
      s.tx += (self.x - s.tx) * k;
      s.tz += (self.z - s.tz) * k;
    }
    const tx = s.tx + s.panX;
    const tz = s.tz + s.panZ;

    // Direção da câmera: de cima, na diagonal.
    const dir = new THREE.Vector3(Math.sin(s.yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(s.yaw) * Math.cos(PITCH));
    const t = tmp.current;
    t.target.set(tx, 0, tz);

    // Encaixe na grade de pixels da arte: evita a imagem "tremendo" quando a câmera anda.
    t.fwd.copy(dir).negate();
    t.right.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    t.up.crossVectors(t.right, t.fwd).normalize();
    const texel = PIXEL / cam.zoom;
    const rx = Math.round(t.target.dot(t.right) / texel) * texel;
    const uy = Math.round(t.target.dot(t.up) / texel) * texel;
    const along = t.target.dot(t.fwd);
    const snapped = new THREE.Vector3().addScaledVector(t.right, rx).addScaledVector(t.up, uy).addScaledVector(t.fwd, along);

    cam.position.copy(snapped).addScaledVector(dir, 120);
    cam.lookAt(snapped);
    // "Para cima" no teclado = para onde a câmera olha no chão.
    setHeading(yawOf({ x: -dir.x, z: -dir.z }));
    void size;
  });

  return null;
}
