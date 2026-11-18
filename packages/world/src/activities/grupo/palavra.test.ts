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
  palDeckSize,
  palHintHit,
  palRole,
  palSplitTeams,
  palTotalTurns,
  palUsesTeams,
  palWinner,
  type PalState,
} from "./palavra.ts";
import {
  PAL_FORBIDDEN_COUNT,
  PAL_LABEL_MAX,
  PAL_MAX_CARDS,
  PAL_MAX_THEMES,
  PAL_WORD_MAX,
  palCardTaken,
  palCleanCard,
  palCleanLabel,
  palLabelTaken,
  palNewId,
  palSanitizeBank,
  palSeedBank,
  palSummaries,
  type PalBank,
} from "./palavraEdit.ts";

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
    const bank = palSeedBank();
    const deck = palDeck(bank, ["espaco"], grupoRng(3));
    expect(deck).toHaveLength(30);
    expect(deck.every((c) => c.theme === "espaco")).toBe(true);
    expect(palDeck(bank, ["espaco"], grupoRng(3)).map((c) => c.word)).toEqual(deck.map((c) => c.word));
    expect(palDeck(bank, [], grupoRng(1))).toHaveLength(150);
    // O baralho é uma cópia: mexer nele não mexe no banco.
    deck[0]!.forbidden.push("x");
    expect(bank.themes.every((t) => t.cards.every((c) => c.forbidden.length === 4))).toBe(true);
    const known = PAL_THEMES.map((t) => t.id);
    expect(palCleanThemes(["espaco", "xadrez", "brasil", "espaco"], known)).toEqual(["brasil", "espaco"]);
    expect(palCleanThemes(["xadrez"], known)).toBeNull();
    expect(palCleanThemes("espaco", known)).toBeNull();
    expect(palDeckSize(palSummaries(bank), ["espaco", "brasil"])).toBe(60);
  });

  it("dois times só com 4 pessoas ou mais e o modo escolhido", () => {
    expect(palUsesTeams(3, "teams")).toBe(false);
    expect(palUsesTeams(4, "teams")).toBe(true);
    expect(palUsesTeams(4, "coop")).toBe(false);
    expect(palUsesTeams(9, "coop")).toBe(false);
    expect(palTotalTurns([6], 2, true)).toBe(12);
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

describe("Palavra secreta: editor de cartas", () => {
  const ok = (word: string, ...forbidden: string[]) => ({ word, forbidden });

  it("banco inicial: os 5 temas com as 150 cartas, ids fixos e únicos, e sobrevive à limpeza", () => {
    const bank = palSeedBank();
    expect(bank.themes.map((t) => t.label)).toEqual(PAL_THEMES.map((t) => t.label));
    expect(bank.themes.flatMap((t) => t.cards)).toHaveLength(150);
    const ids = bank.themes.flatMap((t) => [t.id, ...t.cards.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    // Cada restauração dá os mesmos ids.
    expect(palSeedBank()).toEqual(bank);
    // As originais passam pelas mesmas regras do editor (nada se perde ao ler do disco).
    expect(palSanitizeBank(JSON.parse(JSON.stringify(bank)))).toEqual(bank);
    expect(palSummaries(bank).map((t) => t.count)).toEqual([30, 30, 30, 30, 30]);
  });

  it("carta: palavra, exatamente 4 proibidas, nada repetido nem igual a nome de time", () => {
    expect(palCleanCard(ok("  Foguete  ", "nave", "espaço", "lançar", "subir"))).toEqual({ word: "Foguete", forbidden: ["nave", "espaço", "lançar", "subir"] });
    expect(palCleanCard(ok("a", "b", "c", "d", "e"))).toBe("word");
    expect(palCleanCard(ok("!!", "b", "c", "d", "e"))).toBe("word");
    expect(palCleanCard(ok("Foguete", "nave", "espaço", "lançar"))).toBe("forbidden");
    expect(palCleanCard(ok("Foguete", "nave", "espaço", "lançar", "subir", "voar"))).toBe("forbidden");
    expect(palCleanCard(ok("Foguete", "nave", "espaço", "lançar", "  "))).toBe("forbidden");
    expect(palCleanCard({ word: "Foguete", forbidden: "nave" })).toBe("forbidden");
    expect(palCleanCard(null)).toBe("word");
    // Repetida entre si (sem acento e maiúscula) ou igual à palavra.
    expect(palCleanCard(ok("Foguete", "nave", "Espaço", "espaco", "subir"))).toBe("repeat");
    expect(palCleanCard(ok("Foguete", "nave", "FOGUETE", "lançar", "subir"))).toBe("repeat");
    // Nome de time aparece no placar para todos: não pode ser carta.
    expect(palCleanCard(ok("Pulsar", "estrela", "girar", "pulso", "luz"))).toBe("reserved");
    expect(palCleanCard(ok("Estrela", "nebulosa", "luz", "céu", "noite"))).toBe("reserved");
    // Corte de tamanho.
    const long = palCleanCard(ok("x".repeat(80), "a", "b", "c", "d"));
    expect(typeof long !== "string" && long.word.length).toBe(PAL_WORD_MAX);
    expect(PAL_FORBIDDEN_COUNT).toBe(4);
  });

  it("tema: nome com 2 letras ou mais, cortado no limite e sem repetir", () => {
    expect(palCleanLabel("  Filmes  ")).toBe("Filmes");
    expect(palCleanLabel("x")).toBeNull();
    expect(palCleanLabel(42)).toBeNull();
    expect(palCleanLabel("y".repeat(60))).toHaveLength(PAL_LABEL_MAX);
    const bank = palSeedBank();
    expect(palLabelTaken(bank, "espaco")).toBe(true);
    expect(palLabelTaken(bank, "ESPAÇO", "espaco")).toBe(false);
    expect(palLabelTaken(bank, "Filmes")).toBe(false);
  });

  it("carta repetida só conta dentro do mesmo tema; ids novos não colidem", () => {
    const bank = palSeedBank();
    const espaco = bank.themes.find((t) => t.id === "espaco")!;
    const lua = espaco.cards.find((c) => c.word === "Lua")!;
    expect(palCardTaken(espaco, "lua")).toBe(true);
    expect(palCardTaken(espaco, "LUA", lua.id)).toBe(false);
    expect(palCardTaken(bank.themes[0]!, "Lua")).toBe(false);
    const seq = [0.5, 0.5, 0.25];
    let i = 0;
    const id = palNewId(bank, "carta", () => seq[i++ % seq.length]!);
    expect(id).toMatch(/^carta-/);
    const taken: PalBank = { version: 1, themes: [{ id: "t", label: "Tema", cards: [{ id, word: "aa", forbidden: ["b", "c", "d", "e"] }] }] };
    i = 0;
    expect(palNewId(taken, "carta", () => seq[i++ % seq.length]!)).not.toBe(id);
  });

  it("banco do disco estragado: descarta o que não serve, respeita limites e não quebra", () => {
    expect(palSanitizeBank(null)).toBeNull();
    expect(palSanitizeBank({ themes: "x" })).toBeNull();
    expect(palSanitizeBank({ themes: [] })).toBeNull();
    const card = (id: unknown, word: string) => ({ id, word, forbidden: ["um", "dois", "tres", "quatro"] });
    const raw = {
      themes: [
        { id: "ok", label: "Certo", cards: [card("c1", "Lua"), card("c1", "Sol"), card(null, "Mar"), card("c4", "lua"), { id: "c5", word: "Rio", forbidden: ["a"] }] },
        { id: "ok", label: "Repetido", cards: [] },
        { id: "outro", label: "certo", cards: [] },
        { id: "MAIÚSCULA!", label: "Ruim", cards: [] },
        { id: "vazio", label: "x", cards: [] },
        { id: "sem-cartas", label: "Sem cartas" },
      ],
    };
    const bank = palSanitizeBank(raw)!;
    expect(bank.themes.map((t) => t.id)).toEqual(["ok", "sem-cartas"]);
    const words = bank.themes[0]!.cards.map((c) => c.word);
    expect(words).toEqual(["Lua", "Sol", "Mar"]);
    const ids = bank.themes[0]!.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("c1");
    // Limites de quantidade.
    const many = {
      themes: Array.from({ length: PAL_MAX_THEMES + 3 }, (_, t) => ({
        id: `t${t}`,
        label: `Tema ${t}`,
        cards: Array.from({ length: t === 0 ? PAL_MAX_CARDS + 10 : 1 }, (_, k) => card(`c${t}-${k}`, `palavra ${k}`)),
      })),
    };
    const big = palSanitizeBank(many)!;
    expect(big.themes).toHaveLength(PAL_MAX_THEMES);
    expect(big.themes[0]!.cards).toHaveLength(PAL_MAX_CARDS);
  });
});
