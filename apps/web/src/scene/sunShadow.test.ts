import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { patchShadowFade, snapToTexels, stepSize, viewFootprint, type Footprint } from "./sunShadow.ts";

function persp(pos: [number, number, number], look: [number, number, number]): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
  c.position.set(...pos);
  c.lookAt(...look);
  c.updateMatrixWorld();
  return c;
}

describe("quadro de sombra", () => {
  it("no isométrico cobre o que aparece na tela, centrado onde a câmera olha", () => {
    const c = new THREE.OrthographicCamera(-720, 720, 450, -450, -400, 1200);
    c.zoom = 64;
    c.updateProjectionMatrix();
    const dir = new THREE.Vector3(1, Math.tan(THREE.MathUtils.degToRad(33)) * Math.SQRT2, 1).normalize();
    c.position.set(10, 0, -5).addScaledVector(dir, 120);
    c.lookAt(10, 0, -5);
    c.updateMatrixWorld();
    const f = viewFootprint(c, 30, {} as Footprint);
    expect(f.x).toBeCloseTo(10, 1);
    expect(f.z).toBeCloseTo(-5, 1);
    // 1440 × 900 px a 64 px/m: ~22,5 m de largura; o chão visto de lado estica a altura.
    expect(f.r).toBeGreaterThan(11);
    expect(f.r).toBeLessThan(20);
  });

  it("no 3D corta no alcance: olhando o horizonte, nada além de `reach` metros", () => {
    const c = persp([0, 2, 0], [0, 1.5, -100]);
    const f = viewFootprint(c, 30, {} as Footprint);
    expect(Math.hypot(f.x, f.z) + f.r).toBeLessThanOrEqual(30 * 1.6);
    expect(f.z).toBeLessThan(0); // à frente da câmera
  });

  it("no 3D olhando para baixo, o quadro fica em volta do ponto visto", () => {
    const c = persp([0, 10, 6], [0, 0, 0]);
    const f = viewFootprint(c, 30, {} as Footprint);
    expect(Math.hypot(f.x, f.z)).toBeLessThan(4);
    expect(f.r).toBeLessThan(20);
  });

  it("tamanho em degraus, sem trocar por pouco", () => {
    const a = stepSize(20, 0);
    expect(a).toBeGreaterThanOrEqual(20);
    expect(stepSize(19, a)).toBe(a);
    expect(stepSize(a * 0.7, a)).toBe(a);
    expect(stepSize(a * 1.01, a)).toBeGreaterThan(a);
    expect(stepSize(a * 0.4, a)).toBeLessThan(a);
  });

  it("encaixe na grade de texels: andar menos de um texel não move o quadro", () => {
    const dir = new THREE.Vector3(0.4, 0.7, 0.3).normalize();
    const texel = 0.02;
    const a = snapToTexels(new THREE.Vector3(3.001, 0, 4.002), dir, texel, new THREE.Vector3());
    const b = snapToTexels(new THREE.Vector3(3.004, 0, 4.001), dir, texel, new THREE.Vector3());
    // mesma posição vista do Sol (só a profundidade ao longo da luz pode diferir)
    const along = (v: THREE.Vector3) => v.clone().sub(dir.clone().multiplyScalar(v.dot(dir)));
    expect(along(a).distanceTo(along(b))).toBeLessThan(1e-9);
  });

  it("a sombra desvanece na borda do quadro (trecho do three corrigido)", () => {
    patchShadowFade();
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(chunk).toContain("shadowIntensity * shadowFade");
    // a de luz pontual fica intacta
    const point = chunk.slice(chunk.indexOf("getPointShadow"));
    expect(point).not.toContain("shadowFade");
  });
});
