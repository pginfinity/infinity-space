import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("../../net/session.ts", () => ({ serverNow: () => Date.now() }));

const { getSky } = await import("../astro/live.ts");
const { SKY_VP } = await import("./camera.ts");
const { LIMB_Y, pickSky, skyRay } = await import("./pick.ts");

const W = 1600;
const H = 1000;

/** Aponta a "câmera do céu" para a direção d (como updateSkyCamera faz com a câmera da lente). */
function aim(d: THREE.Vector3): void {
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 10);
  cam.lookAt(d);
  cam.updateMatrixWorld();
  SKY_VP.value.copy(cam.projectionMatrix).multiply(new THREE.Matrix4().extractRotation(cam.matrixWorld).transpose());
}

describe("clique no céu", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 19, 15)); // meio-dia em São Paulo: Sol alto
  });
  afterAll(() => vi.useRealTimers());

  it("o centro da tela olhando para o Sol é o Sol; o raio volta na mesma direção", () => {
    const sun = new THREE.Vector3(...getSky().sun.dir);
    aim(sun);
    expect(pickSky(W / 2, H / 2, W, H)?.target).toEqual({ kind: "sol" });
    const r = skyRay(W / 2, H / 2, W, H);
    expect(new THREE.Vector3(...r).dot(sun)).toBeCloseTo(1, 4);
    // longe do Sol (canto) não é o Sol
    expect(pickSky(40, 40, W, H)?.target.kind).not.toBe("sol");
  });

  it("abaixo da borda da Terra é a Terra (e nada do céu atrás dela)", () => {
    aim(new THREE.Vector3(0.05, -1, 0.02).normalize());
    const p = pickSky(W / 2, H / 2, W, H);
    expect(p?.target).toEqual({ kind: "terra" });
    expect(p!.dir[1]).toBeLessThan(LIMB_Y);
  });
});
