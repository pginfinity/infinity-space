import { describe, expect, it } from "vitest";
import { isSoftwareRenderer, medianFps } from "./perfWatch.ts";

describe("desempenho do computador", () => {
  it("mediana de quadros por segundo ignora travadas isoladas", () => {
    const dts = [...Array(50).fill(1 / 60), 0.4, 0.3];
    expect(medianFps(dts)).toBeCloseTo(60, 0);
    expect(medianFps(Array(30).fill(1 / 20))).toBeCloseTo(20, 5);
    expect(medianFps([])).toBe(0);
  });

  it("reconhece desenho por software", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
  });
});
