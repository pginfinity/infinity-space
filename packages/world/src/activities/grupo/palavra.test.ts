import { describe, expect, it } from "vitest";
import { grupoFold, grupoRng } from "./common.ts";
import {
  PAL_CARDS,
  PAL_COOP_NAME,
  PAL_TEAM_NAMES,
  PAL_THEMES,
  palCardAudience,
  palCheckGuess,
  palCleanThemes,
  palDeck,
  palHintHit,
  palRole,
  palSplitTeams,
  palTotalTurns,
  palWinner,
  type PalState,
} from "./palavra.ts";

describe("Palavra secreta: conferência do chute", () => {
  it("ignora acento, maiúscula, pontuação e espaços", () => {
    expect(palCheckGuess("GUARDA CHUVA", "guarda-chuva")).toBe("correct");
    expect(palCheckGuess("  guarda-chuvá  ", "guarda-chuva")).toBe("correct");
    expect(palCheckGuess("guardachuva", "guarda-chuva")).toBe("correct");
    expect(palCheckGuess("Acaraje", "acarajé")).toBe("correct");
    expect(palCheckGuess("estacao   ESPACIAL!", "estação espacial")).toBe("correct");
    expect(palCheckGuess("Óculos", "óculos")).toBe("correct");
  });

  it("aceita artigo na frente e plural simples", () => {
    expect(palCheckGuess("a lua", "Lua")).toBe("correct");
    expect(palCheckGuess("os satélites", "satélite")).toBe("correct");
    expect(palCheckGuess("oculo", "óculos")).toBe("correct");
    // Artigo sozinho não vira palavra vazia.
    expect(palCheckGuess("a", "Lua")).toBe("wrong");
  });

  it("quase: uma letra errada ou a palavra no meio de uma frase", () => {
    expect(palCheckGuess("chuveir", "chuveiro")).toBe("close");
    expect(palCheckGuess("grampeadorr", "grampeador")).toBe("close");
    expect(palCheckGuess("é um foguete grande", "foguete")).toBe("close");
    expect(palCheckGuess("gato", "Lua")).toBe("wrong");
    expect(palCheckGuess("", "Lua")).toBe("wrong");
  });
});

describe("Palavra secreta: dica escrita que entrega a carta", () => {
  const card = (word: string) => PAL_CARDS.find((c) => c.word === word)!;

  it("barra palavra proibida, derivada e parte da palavra secreta", () => {
    expect(palHintHit("faz muito frio lá dentro", card("geladeira"))).toBe("frio");
    expect(palHintHit("dia chuvoso", card("nuvem"))).toBe("chuva");
    expect(palHintHit("dia chuvoso", card("guarda-chuva"))).toBe("guarda-chuva");
    expect(palHintHit("guarda alguma coisa", card("guarda-chuva"))).toBe("guarda-chuva");
    expect(palHintHit("Escova", card("escova de dente"))).toBe("escova de dente");
    expect(palHintHit("mande um email", card("e-mail"))).toBe("e-mail");
    expect(palHintHit("um cafezinho", card("cafezinho"))).toBe("cafezinho");
    expect(palHintHit("CAFÉ forte", card("cafezinho"))).toBe("café");
    expect(palHintHit("tem caixa de entrada", card("e-mail"))).toBe("caixa de entrada");
  });

  it("deixa passar dica limpa", () => {
    expect(palHintHit("você abre quando cai água do céu", card("guarda-chuva"))).toBeNull();
    expect(palHintHit("de manhã cedo", card("travesseiro"))).toBeNull();
    expect(palHintHit("", card("Lua"))).toBeNull();
  });
});

describe("Palavra secreta: banco, times e rodízio", () => {
  it("banco com 150 cartas originais, 30 por tema, sem repetir e com 3 ou 4 proibidas", () => {
    expect(PAL_CARDS).toHaveLength(150);
    for (const t of PAL_THEMES) expect(PAL_CARDS.filter((c) => c.theme === t.id)).toHaveLength(30);
    expect(new Set(PAL_CARDS.map((c) => grupoFold(c.word))).size).toBe(150);
    for (const c of PAL_CARDS) {
      expect(c.forbidden.length).toBeGreaterThanOrEqual(3);
      expect(c.forbidden.length).toBeLessThanOrEqual(4);
      // Proibida nunca é a própria palavra.
      for (const f of c.forbidden) expect(grupoFold(f)).not.toBe(grupoFold(c.word));
      // A palavra secreta é a primeira coisa que uma dica não pode dizer.
      expect(palHintHit(c.word, c)).toBe(c.word);
    }
    // Nome de time não é palavra do banco (senão o placar "entregaria" uma carta).
    const all = new Set(PAL_CARDS.flatMap((c) => [c.word, ...c.forbidden]).map(grupoFold));
    for (const n of [...PAL_TEAM_NAMES, PAL_COOP_NAME]) expect(all.has(grupoFold(n))).toBe(false);
  });

  it("baralho só com os temas escolhidos, embaralhado de forma reproduzível", () => {
    const deck = palDeck(["espaco"], grupoRng(3));
    expect(deck).toHaveLength(30);
    expect(deck.every((c) => c.theme === "espaco")).toBe(true);
    expect(palDeck(["espaco"], grupoRng(3)).map((c) => c.word)).toEqual(deck.map((c) => c.word));
    expect(palDeck([], grupoRng(1))).toHaveLength(150);
    expect(palCleanThemes(["espaco", "xadrez", "brasil", "espaco"])).toEqual(["brasil", "espaco"]);
    expect(palCleanThemes(["xadrez"])).toBeNull();
    expect(palCleanThemes("espaco")).toBeNull();
  });

  it("sorteia times equilibrados", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const teams = palSplitTeams(ids, grupoRng(7));
    const n0 = ids.filter((id) => teams.get(id) === 0).length;
    expect([2, 3]).toContain(n0);
    expect(ids.every((id) => teams.has(id))).toBe(true);
  });

  it("todo mundo dá dicas uma vez por rodada (o time menor repete dicador)", () => {
    expect(palTotalTurns([3], 1, true)).toBe(3);
    expect(palTotalTurns([2, 2], 1, false)).toBe(4);
    expect(palTotalTurns([3, 2], 2, false)).toBe(12);
  });

  it("papéis: dicador e time da vez chutam; o time adversário fiscaliza e vê a carta", () => {
    const players = [
      { id: "a", name: "Ana", team: 0 },
      { id: "b", name: "Bruno", team: 1 },
      { id: "c", name: "Caio", team: 0 },
      { id: "d", name: "Duda", team: 1, away: true },
    ];
    const s: Pick<PalState, "phase" | "coop" | "team" | "giver" | "players"> = { phase: "playing", coop: false, team: 0, giver: "a", players };
    expect(players.map((p) => palRole(s, p.id))).toEqual(["giver", "judge", "guesser", null]);
    expect(palCardAudience(s)).toEqual(["a", "b"]);
    // Cooperativo: só o dicador vê.
    expect(palCardAudience({ ...s, coop: true })).toEqual(["a"]);
    // Fora da vez, ninguém tem papel.
    expect(palRole({ ...s, phase: "lobby" }, "a")).toBeNull();
    expect(palCardAudience({ ...s, phase: "final" })).toEqual([]);
  });

  it("vencedor por pontos; empate e cooperativo não têm vencedor", () => {
    expect(palWinner([{ name: "Pulsar", score: 3 }, { name: "Quasar", score: 5 }])).toBe(1);
    expect(palWinner([{ name: "Pulsar", score: 4 }, { name: "Quasar", score: 4 }])).toBeNull();
    expect(palWinner([{ name: "Nebulosa", score: 9 }])).toBeNull();
  });
});
