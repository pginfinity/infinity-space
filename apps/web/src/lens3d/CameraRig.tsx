import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { dirOfYaw } from "@infinity/world";
import { self } from "../world/registry.ts";
import { setHeading, walkTo } from "../engine/movement.ts";
import { wallUniforms } from "../scene/walls.ts";

const MIN_DIST = 2.6;
const MAX_DIST = 22;
const MIN_PITCH = 0.18;
const MAX_PITCH = 1.38;

/**
 * Câmera em terceira pessoa atrás do avatar. Arrastar gira (horizontal) e inclina (vertical),
 * rolagem aproxima, clique sem arrastar no chão anda até o ponto, Q/E giram pelo teclado.
 */
export function CameraRig() {
  const { camera, gl } = useThree();
  const st = useRef({ yaw: self.yaw, pitch: 0.74, dist: 9, tx: self.x, tz: self.z, keys: new Set<string>() });

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean; id: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; dist: number } | null = null;

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), dist: s.dist };
        drag = null;
        return;
      }
      drag = { x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch, moved: false, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        s.dist = THREE.MathUtils.clamp((pinch.dist * pinch.d) / Math.hypot(a!.x - b!.x, a!.y - b!.y), MIN_DIST, MAX_DIST);
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) {
        s.yaw = drag.yaw + dx * 0.0055;
        s.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.004, MIN_PITCH, MAX_PITCH);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.id === e.pointerId && !drag.moved && e.button === 0) {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(floor, hit)) walkTo({ x: hit.x, z: hit.z });
      }
      if (drag?.id === e.pointerId) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      s.dist = THREE.MathUtils.clamp(s.dist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST);
    };
    const keydown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyQ" || e.code === "KeyR") s.keys.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => s.keys.delete(e.code);
    const blur = () => s.keys.clear();
    const context = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", context);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    el.style.touchAction = "none";
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", context);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const s = st.current;
    if (s.keys.has("KeyQ")) s.yaw -= dt * 1.8;
    if (s.keys.has("KeyR")) s.yaw += dt * 1.8;
    const k = 1 - Math.exp(-dt * 10);
    s.tx += (self.x - s.tx) * k;
    s.tz += (self.z - s.tz) * k;
    const f = dirOfYaw(s.yaw);
    const horiz = Math.cos(s.pitch) * s.dist;
    camera.position.set(s.tx - f.x * horiz, 1.3 + Math.sin(s.pitch) * s.dist, s.tz - f.z * horiz);
    camera.lookAt(s.tx, 1.15, s.tz);
    wallUniforms.uCam.value.copy(camera.position);
    wallUniforms.uTarget.value.set(self.x, 1.0, self.z);
    setHeading(s.yaw);
  });

  return null;
}
