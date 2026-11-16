import { describe, expect, it } from "vitest";
import { fold, rank, score } from "./search.ts";

describe("busca da paleta", () => {
  it("ignora acento, maiúsculas e pontuação", () => {
    expect(fold("Sala Órbita")).toBe("sala orbita");
    expect(fold("  Produto & Design ")).toBe("produto design");
    expect(fold("Café & Copa")).toBe("cafe copa");
  });

  it("acha sem acento e por começo de palavra", () => {
    expect(score({ label: "Ir até Sala Órbita" }, "orbita")).toBeGreaterThan(0);
    expect(score({ label: "Ir até Sala Órbita" }, "órb")).toBeGreaterThan(0);
    expect(score({ label: "Chamar João" }, "chamar joao")).toBeGreaterThan(0);
    expect(score({ label: "Chamar João" }, "ch jo")).toBeGreaterThan(0);
    expect(score({ label: "Chamar João" }, "seguir joao")).toBe(0);
  });

  it("palavras-chave também acham, com nota menor", () => {
    const a = { label: "Ligar microfone", keywords: "mic audio voz" };
    const b = { label: "Mic de teste" };
    expect(score(a, "mic")).toBeGreaterThan(0);
    expect(rank([a, b], "mic")[0]).toBe(b);
  });

  it("trecho no meio só com 3 letras ou mais", () => {
    expect(score({ label: "Jukebox" }, "ke")).toBe(0);
    expect(score({ label: "Jukebox" }, "keb")).toBeGreaterThan(0);
  });

  it("ordena: começo do rótulo primeiro, estável entre iguais", () => {
    const items = [{ label: "Ir até Ana" }, { label: "Ana Paula" }, { label: "Chamar Ana" }, { label: "Bruno" }];
    const r = rank(items, "ana");
    expect(r.map((x) => x.label)).toEqual(["Ana Paula", "Ir até Ana", "Chamar Ana"]);
    expect(rank(items, "").length).toBe(4);
  });
});
