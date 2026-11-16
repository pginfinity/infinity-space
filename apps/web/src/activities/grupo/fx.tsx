import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec2 } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";

/**
 * Efeitos compartilhados dos jogos de grupo: chuva de confete no fim de uma partida (quiz no palco,
 * desenho na sala, Stop no Café). Um InstancedMesh só, com até três chuvas ao mesmo tempo.
 */

const PER = 140;
const SLOTS = 3;
const N = PER * SLOTS;
const LIFE = 4.5;
const COLORS = ["#EE5C29", "#00B7FF", "#F2F0EF", "#46AFE3", "#ECE6DF", "#F2B134"].map((c) => new THREE.Color(c));

interface Burst {
  at: Vec2;
  y: number;
  spread: number;
  started: number;
}
const pending: Burst[] = [];

/** Solta confete em `at` (altura `y`), espalhando por `spread` metros. */
export function burst(at: Vec2, y = 2.2, spread = 1.2): void {
  pending.push({ at, y, spread, started: 0 });
}

function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), age: -1 })), []);
  const slot = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      m.setColorAt(i, COLORS[i % COLORS.length]!);
      m.setMatrixAt(i, hidden);
    }
    m.count = N;
    m.visible = false;
  }, [hidden]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    while (pending.length) {
      const b = pending.shift()!;
      const base = (slot.current % SLOTS) * PER;
      slot.current++;
      for (let i = base; i < base + PER; i++) {
        const q = parts[i]!;
        q.p.set(b.at.x + (Math.random() - 0.5) * b.spread, b.y, b.at.z + (Math.random() - 0.5) * b.spread);
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 2.2;
        q.v.set(Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s);
        q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        q.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        q.age = 0;
      }
    }
    const k = Math.min(dt, 1 / 20);
    let alive = 0;
    for (let i = 0; i < N; i++) {
      const q = parts[i]!;
      if (q.age < 0) continue;
      q.age += dt;
      if (q.age > LIFE) {
        q.age = -1;
        m.setMatrixAt(i, hidden);
        continue;
      }
      alive++;
      q.v.y -= 7 * k;
      q.v.multiplyScalar(1 - 1.6 * k);
      q.p.addScaledVector(q.v, k);
      if (q.p.y < 0.02) {
        q.p.y = 0.02;
        q.v.set(0, 0, 0);
      }
      q.r.x += q.w.x * k;
      q.r.y += q.w.y * k;
      q.r.z += q.w.z * k;
      tmp.position.copy(q.p);
      tmp.rotation.copy(q.r);
      tmp.scale.setScalar(q.age > LIFE - 0.6 ? (LIFE - q.age) / 0.6 : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.visible = alive > 0;
    if (alive > 0 || m.visible) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
      <planeGeometry args={[0.09, 0.05]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

export const fxClient: ActivityClient = {
  name: "grupo/efeitos",
  Scene: Confetti,
};
