import * as THREE from "three";
import { describe, expect, it } from "vitest";
import data from "../../../public/space/constelacoes.json";
import pt from "../../i18n/pt-BR.json";
import { behindDeck, constellationGeometry, type ConstellationData } from "./constellations.ts";

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

describe("nome de constelação atrás da estação", () => {
  const cam = (pos: [number, number, number], at: [number, number, number]) => {
    const c = new THREE.PerspectiveCamera(60, 16 / 10, 0.1, 500);
    c.position.set(...pos);
    c.lookAt(...at);
    c.updateMatrixWorld();
    return c;
  };

  it("3D por cima do casco: o centro (piso) tapa, o alto da tela é céu", () => {
    const c = cam([0, 6, 14], [0, 1, 0]);
    expect(behindDeck(c, 0.5, 0.5)).toBe(true);
    expect(behindDeck(c, 0.5, 0.02)).toBe(false);
  });

  it("3D com a câmera dentro do deck (zoom perto): parede tapa, o que sai pelo topo aberto é céu", () => {
    expect(behindDeck(cam([0, 2, 3], [0, 2, -10]), 0.5, 0.5)).toBe(true);
    expect(behindDeck(cam([0, 2, 3], [0, 12, 2]), 0.5, 0.5)).toBe(false);
  });

  it("2D isométrico: a estação no centro tapa, o canto fora do deck é céu", () => {
    const o = new THREE.OrthographicCamera(-60, 60, 35, -35, 0.1, 500);
    o.position.set(30, 30, 30);
    o.lookAt(0, 0, 0);
    o.updateMatrixWorld();
    expect(behindDeck(o, 0.5, 0.5)).toBe(true);
    expect(behindDeck(o, 0, 0)).toBe(false);
  });
});
