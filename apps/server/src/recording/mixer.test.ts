import { describe, expect, it } from "vitest";
import { Mixer, RATE } from "./mixer.ts";

const block = (n: number, v: number) => new Int16Array(n).fill(v);

describe("mistura da gravação", () => {
  it("sem ninguém, sai silêncio contínuo", () => {
    const m = new Mixer();
    expect([...m.pull(960)].every((s) => s === 0)).toBe(true);
  });

  it("espera juntar folga antes de tocar uma voz", () => {
    const m = new Mixer();
    m.push("ana", block(960, 100)); // 20 ms: ainda não
    expect(m.pull(480)[0]).toBe(0);
    m.push("ana", block(1920, 100)); // agora 60 ms
    expect(m.pull(480)[0]).toBe(100);
  });

  it("soma vozes e corta no limite de 16 bits", () => {
    const m = new Mixer();
    m.push("ana", block(RATE / 10, 20000));
    m.push("bruno", block(RATE / 10, 20000));
    m.push("caio", block(RATE / 10, 5));
    const out = m.pull(960);
    expect(out[0]).toBe(32767);
    const m2 = new Mixer();
    m2.push("ana", block(RATE / 10, 300));
    m2.push("bruno", block(RATE / 10, -100));
    expect(m2.pull(960)[10]).toBe(200);
  });

  it("quando a voz esvazia entra silêncio, e volta depois de juntar de novo", () => {
    const m = new Mixer();
    m.push("ana", block(3000, 7));
    const a = m.pull(4000);
    expect(a[2999]).toBe(7);
    expect(a[3000]).toBe(0);
    m.push("ana", block(1000, 7));
    expect(m.pull(100)[0]).toBe(0); // ainda juntando
    m.push("ana", block(3000, 7));
    expect(m.pull(100)[0]).toBe(7);
  });

  it("descarta atraso acima de 1 s", () => {
    const m = new Mixer();
    m.push("ana", block(RATE * 3, 1));
    const out = m.pull(RATE + 10);
    expect(out[RATE - 1]).toBe(1);
    expect(out[RATE + 5]).toBe(0);
  });
});
