import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Céu de estrelas em volta da estação. */
export function Starfield({ count = 2600, radius = 320 }: { count?: number; radius?: number }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const tint = [new THREE.Color("#FFFFFF"), new THREE.Color("#CFE6FF"), new THREE.Color("#FFE2CC")];
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      // Mais estrelas acima do horizonte, algumas abaixo (a estação flutua no espaço).
      const y = u * 0.8 + 0.15;
      pos.set([Math.cos(th) * s * radius, y * radius, Math.sin(th) * s * radius], i * 3);
      const c = tint[Math.floor(rnd() * tint.length)]!.clone().multiplyScalar(0.55 + rnd() * 0.45);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [count, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors transparent opacity={0.95} depthWrite={false} />
    </points>
  );
}
