import { describe, expect, it } from "vitest";
import data from "../../../public/space/constelacoes.json";
import pt from "../../i18n/pt-BR.json";
import { constellationGeometry, type ConstellationData } from "./constellations.ts";

const d = data as unknown as ConstellationData;
const names = pt.espaco.constelacoes as Record<string, string>;
const stars = pt.espaco.astro.estrelas as Record<string, Record<string, string>>;

describe("constelações", () => {
  it("toda figura tem nome em pt-BR e traços completos (4 números por traço)", () => {
    for (const [key, l] of Object.entries(d.linhas)) {
      expect(names[key], key).toBeTruthy();
      expect(l.length % 4, key).toBe(0);
      expect(l.length).toBeGreaterThan(0);
    }
  });

  it("toda estrela com nome tem cartão completo e posição válida", () => {
    for (const [key, [ra, dec, mag]] of Object.entries(d.estrelas)) {
      for (const f of ["name", "sub", "dist", "fact"]) expect(stars[key]?.[f], `${key}.${f}`).toBeTruthy();
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(24);
      expect(Math.abs(dec)).toBeLessThanOrEqual(90);
      expect(mag).toBeLessThan(6); // a olho nu (a Sigma do Oitante, polo sul, tem 5,5)
    }
  });

  it("geometria: um vetor unitário por ponta, um centro por figura", () => {
    const g = constellationGeometry(d);
    const pts = Object.values(d.linhas).reduce((n, l) => n + l.length / 2, 0);
    expect(g.position.length).toBe(pts * 3);
    for (let i = 0; i < g.position.length; i += 3) expect(Math.hypot(g.position[i]!, g.position[i + 1]!, g.position[i + 2]!)).toBeCloseTo(1, 5);
    expect(g.centers.map((c) => c.key)).toEqual(Object.keys(d.linhas));
  });
});
