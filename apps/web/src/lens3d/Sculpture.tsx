import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec2 } from "@infinity/world";
import { SPARKLE, SPARKLE_STOPS } from "../brand/sparkle.ts";

/** A estrela da Infinity em 3D, flutuando no centro do átrio, com o gradiente oficial. */
export function Sculpture({ pos, size = 3.1 }: { pos: Vec2; size?: number }) {
  const star = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(() => buildStar(size), [size]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!star.current) return;
    star.current.rotation.y = t * 0.18;
    star.current.position.y = 2.45 + Math.sin(t * 0.8) * 0.08;
  });

  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.95, 1.05, 0.5, 48]} />
        <meshStandardMaterial color="#0D2547" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.92, 0.022, 12, 96]} />
        <meshBasicMaterial color="#5FD0FF" />
      </mesh>
      <mesh ref={star} geometry={geometry} material={material} position={[0, 2.45, 0]} />
      <pointLight position={[0, 2.5, 0]} color="#9BDBFF" intensity={10} distance={11} decay={2} />
    </group>
  );
}

function buildStar(size: number): { geometry: THREE.ExtrudeGeometry; material: THREE.MeshStandardMaterial } {
  const shape = new THREE.Shape();
  const [sx, sy] = SPARKLE.start;
  shape.moveTo(sx * size, -sy * size);
  for (const [c1x, c1y, c2x, c2y, x, y] of SPARKLE.curves) {
    shape.bezierCurveTo(c1x * size, -c1y * size, c2x * size, -c2y * size, x * size, -y * size);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 3,
    curveSegments: 28,
  });
  geometry.center();

  // Gradiente oficial ao longo do eixo x da estrela (laranja à esquerda, azul à direita).
  const pos = geometry.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const stops = SPARKLE_STOPS.map((s) => ({ offset: s.offset, color: new THREE.Color(s.color) }));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getX(i) / size + 0.5) * 0.9 + (pos.getY(i) / size) * 0.15 + 0.05, 0, 1);
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1]!.offset < t) k++;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    c.copy(a.color).lerp(b.color, (t - a.offset) / (b.offset - a.offset));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.25,
    emissive: new THREE.Color("#0A1A33"),
    emissiveIntensity: 0.6,
  });
  return { geometry, material };
}
