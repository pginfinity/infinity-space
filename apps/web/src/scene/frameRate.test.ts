import { describe, expect, it } from "vitest";
import { BLUR_MS, IDLE_AFTER_MS, IDLE_MS, frameInterval } from "./frameRate.ts";
import { WARMUP_S, WINDOW_S } from "./perfWatch.ts";

describe("quadros conforme o uso", () => {
  const base = { focused: true, idleFor: 0, moving: false, sharing: false };

  it("em uso desenha todo quadro; outra janela em foco, devagar", () => {
    expect(frameInterval(base)).toBe(0);
    expect(frameInterval({ ...base, focused: false })).toBe(BLUR_MS);
    expect(frameInterval({ ...base, focused: false, idleFor: IDLE_AFTER_MS })).toBe(BLUR_MS);
  });

  it("parado desacelera, menos com alguém andando ou tela compartilhada", () => {
    expect(frameInterval({ ...base, idleFor: IDLE_AFTER_MS - 1 })).toBe(0);
    expect(frameInterval({ ...base, idleFor: IDLE_AFTER_MS })).toBe(IDLE_MS);
    expect(frameInterval({ ...base, idleFor: IDLE_AFTER_MS, moving: true })).toBe(0);
    expect(frameInterval({ ...base, idleFor: IDLE_AFTER_MS, sharing: true })).toBe(0);
  });

  it("a medição do modo leve termina antes do freio de parado", () => {
    expect(IDLE_AFTER_MS).toBeGreaterThan((WARMUP_S + WINDOW_S) * 1000);
  });
});
