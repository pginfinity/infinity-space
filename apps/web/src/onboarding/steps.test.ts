import { describe, expect, it } from "vitest";
import { currentStep, doneCount, markDone, parseProgress, serializeProgress, shouldAutoStart, STEPS, stepsFor, walked } from "./steps.ts";

describe("primeiros passos", () => {
  it("no celular a troca de lente sai da lista", () => {
    expect(stepsFor(false)).toEqual([...STEPS]);
    expect(stepsFor(true)).not.toContain("lente");
    expect(stepsFor(true)).toHaveLength(STEPS.length - 1);
  });

  it("o passo da vez é o primeiro que falta, em qualquer ordem que a pessoa fizer", () => {
    const list = stepsFor(false);
    expect(currentStep(list, [])).toBe("andar");
    let done = markDone([], "mic");
    expect(currentStep(list, done)).toBe("andar");
    done = markDone(done, "andar");
    expect(done).toEqual(["andar", "mic"]);
    expect(currentStep(list, done)).toBe("usar");
    expect(markDone(done, "mic")).toEqual(done);
    for (const s of list) done = markDone(done, s);
    expect(currentStep(list, done)).toBeNull();
    expect(doneCount(list, done)).toBe(list.length);
  });

  it("no celular termina sem precisar trocar de lente", () => {
    const list = stepsFor(true);
    let done: ReturnType<typeof markDone> = [];
    for (const s of list) done = markDone(done, s);
    expect(currentStep(list, done)).toBeNull();
    expect(doneCount(list, done)).toBe(list.length);
  });

  it("lê e grava o progresso, e ignora lixo", () => {
    const p = { phase: "steps" as const, done: markDone(markDone([], "chat"), "andar") };
    expect(parseProgress(serializeProgress(p))).toEqual(p);
    expect(parseProgress(null)).toEqual({ phase: "new", done: [] });
    expect(parseProgress("{")).toEqual({ phase: "new", done: [] });
    expect(parseProgress(JSON.stringify({ v: 2, phase: "done", done: [] }))).toEqual({ phase: "new", done: [] });
    expect(parseProgress(JSON.stringify({ v: 1, phase: "x", done: ["andar", "voar", 3] }))).toEqual({ phase: "new", done: ["andar"] });
  });

  it("abre sozinho só para quem nunca viu, e não no atalho de desenvolvimento", () => {
    expect(shouldAutoStart({ phase: "new", done: [] }, false)).toBe(true);
    expect(shouldAutoStart({ phase: "new", done: [] }, true)).toBe(false);
    expect(shouldAutoStart({ phase: "steps", done: [] }, false)).toBe(false);
    expect(shouldAutoStart({ phase: "done", done: [] }, false)).toBe(false);
  });

  it("andar conta a partir de 3 m", () => {
    expect(walked({ x: 0, z: 0 }, { x: 2, z: 2 })).toBe(false);
    expect(walked({ x: 0, z: 0 }, { x: 3, z: 0.5 })).toBe(true);
  });
});
