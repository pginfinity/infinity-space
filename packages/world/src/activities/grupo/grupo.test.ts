import { describe, expect, it } from "vitest";
import { grupoClean, grupoEditDistance, grupoFold, grupoPlaces, grupoRank, grupoRng } from "./common.ts";
import {
  QUIZ_MAX_POINTS,
  QUIZ_MIN_POINTS,
  quizCleanQuestion,
  quizCleanTitle,
  quizDeal,
  quizGameLength,
  quizPoints,
  quizSanitizeBank,
  quizSummaries,
} from "./quiz.ts";
import { quizSeedBank } from "./quizSeed.ts";
import {
  DRAW_H,
  DRAW_W,
  DRAW_WORDS,
  drawCheckGuess,
  drawCleanPoints,
  drawDrawerPoints,
  drawGuessPoints,
  drawHint,
  drawLetterIndexes,
  drawPickChoices,
  drawRevealCount,
} from "./draw.ts";
import { STOP_LETTERS, stopCleanCategories, stopDrawLetter, stopFitsLetter, stopScore, stopVotesNeeded } from "./stop.ts";

describe("grupo: utilidades", () => {
  it("limpa textos: controle, espaços repetidos e corte", () => {
    expect(grupoClean("  oi\u0000  \n tudo   bem ", 40)).toBe("oi tudo bem");
    expect(grupoClean("abcdef", 3)).toBe("abc");
    expect(grupoClean(42, 10)).toBe("");
  });

  it("compara sem acento, caixa nem pontuação", () => {
    expect(grupoFold("  São-Paulo! ")).toBe("sao paulo");
    expect(grupoFold("Ação")).toBe(grupoFold("acao"));
  });

  it("distância de edição com corte", () => {
    expect(grupoEditDistance("girafa", "girafa")).toBe(0);
    expect(grupoEditDistance("girafa", "jirafa")).toBe(1);
    expect(grupoEditDistance("elefante", "elefnate")).toBe(2);
    expect(grupoEditDistance("casa", "abacaxi", 2)).toBe(3);
  });

  it("placar: mais pontos primeiro e empates dividem a posição", () => {
    const r = grupoRank([{ n: "a", score: 10 }, { n: "b", score: 30 }, { n: "c", score: 10 }]);
    expect(r.map((x) => x.n)).toEqual(["b", "a", "c"]);
    expect(grupoPlaces([30, 10, 10, 5])).toEqual([1, 2, 2, 4]);
  });
});

describe("Quiz Show", () => {
  it("acerto instantâneo vale o máximo; no fim do tempo, o mínimo; erro vale zero", () => {
    expect(quizPoints(true, 0, 20_000)).toBe(QUIZ_MAX_POINTS);
    expect(quizPoints(true, 20_000, 20_000)).toBe(QUIZ_MIN_POINTS);
    expect(quizPoints(true, 10_000, 20_000)).toBe(750);
    expect(quizPoints(false, 0, 20_000)).toBe(0);
    // quem responde mais rápido ganha mais
    expect(quizPoints(true, 3000, 20_000)).toBeGreaterThan(quizPoints(true, 9000, 20_000));
    // tempo fora do intervalo não passa dos limites
    expect(quizPoints(true, -500, 20_000)).toBe(QUIZ_MAX_POINTS);
    expect(quizPoints(true, 99_999, 20_000)).toBe(QUIZ_MIN_POINTS);
  });

  it("pacotes iniciais: três temas com ~20 perguntas válidas e o da Infinity vazio", () => {
    const bank = quizSeedBank();
    const s = quizSummaries(bank);
    expect(s.map((p) => p.title)).toEqual(["Tecnologia e IA", "Conhecimentos gerais", "Brasil", "Cultura Infinity"]);
    for (const p of s.slice(0, 3)) expect(p.count).toBeGreaterThanOrEqual(20);
    expect(s[3]!.count).toBe(0);
    for (const p of bank.packs)
      for (const q of p.questions) {
        expect(typeof quizCleanQuestion(q, q.id)).toBe("object");
      }
    // a resposta certa não fica sempre na mesma letra
    const letters = new Set(bank.packs[0]!.questions.map((q) => q.correct));
    expect(letters.size).toBeGreaterThan(2);
    // o banco salvo e relido continua igual
    expect(quizSanitizeBank(JSON.parse(JSON.stringify(bank)))).toEqual(bank);
  });

  it("confere perguntas: texto, 4 alternativas diferentes e uma certa", () => {
    const ok = quizCleanQuestion({ text: "  Quanto é 2 + 2?  ", options: ["4", "3", "5", "22"], correct: 0 });
    expect(ok).toMatchObject({ text: "Quanto é 2 + 2?", correct: 0 });
    expect(quizCleanQuestion({ text: "oi", options: ["a", "b", "c", "d"], correct: 0 })).toBe("text");
    expect(quizCleanQuestion({ text: "Pergunta boa?", options: ["a", "b", "c"], correct: 0 })).toBe("options");
    expect(quizCleanQuestion({ text: "Pergunta boa?", options: ["a", "b", "c", " "], correct: 0 })).toBe("options");
    expect(quizCleanQuestion({ text: "Pergunta boa?", options: ["Ação", "acao", "c", "d"], correct: 0 })).toBe("duplicate");
    expect(quizCleanQuestion({ text: "Pergunta boa?", options: ["a", "b", "c", "d"], correct: 4 })).toBe("correct");
    expect(quizCleanQuestion({ text: "Pergunta boa?", options: ["a", "b", "c", "d"], correct: "1" })).toBe("correct");
    expect(quizCleanTitle(" x ")).toBeNull();
    expect(quizCleanTitle("Onboarding")).toBe("Onboarding");
  });

  it("sorteio da partida: quantidade pedida e a certa acompanha a alternativa", () => {
    const qs = quizSeedBank().packs[2]!.questions;
    const dealt = quizDeal(qs, 5, grupoRng(7));
    expect(dealt).toHaveLength(5);
    for (const d of dealt) {
      const orig = qs.find((q) => q.id === d.id)!;
      expect(d.options[d.correct]).toBe(orig.options[orig.correct]);
      expect([...d.options].sort()).toEqual([...orig.options].sort());
    }
    expect(quizDeal(qs, 0, grupoRng(1))).toHaveLength(qs.length);
    expect(quizGameLength(10, 4)).toBe(4);
  });

  it("banco estragado no disco é limpo em vez de quebrar", () => {
    expect(quizSanitizeBank(null)).toBeNull();
    const b = quizSanitizeBank({ packs: [{ id: "a", title: "Pacote", questions: [{ text: "x" }, { id: "q1", text: "Pergunta válida?", options: ["1", "2", "3", "4"], correct: 2 }] }, { id: "a", title: "Repetido" }, { title: "Sem id" }] });
    expect(b!.packs).toHaveLength(1);
    expect(b!.packs[0]!.questions).toHaveLength(1);
  });
});

describe("Desenhe e adivinhe", () => {
  it("lista própria com ~300 palavras sem repetição", () => {
    const all = [...DRAW_WORDS.facil, ...DRAW_WORDS.medio, ...DRAW_WORDS.dificil];
    expect(all.length).toBeGreaterThanOrEqual(290);
    expect(new Set(all.map(grupoFold)).size).toBe(all.length);
    for (const w of all) expect(w).toBe(w.trim());
  });

  it("acerto ignora acento, caixa e espaços; perto vira 'quase'", () => {
    expect(drawCheckGuess("Girafa", "girafa")).toBe("correct");
    expect(drawCheckGuess("  AVIAO ", "avião")).toBe("correct");
    expect(drawCheckGuess("arcoiris", "arco-íris")).toBe("correct");
    expect(drawCheckGuess("cachoro quente", "cachorro-quente")).toBe("close");
    expect(drawCheckGuess("jirafa", "girafa")).toBe("close");
    expect(drawCheckGuess("elefnate", "elefante")).toBe("close");
    expect(drawCheckGuess("leao", "leão")).toBe("correct");
    // palavra curta não tem "quase"
    expect(drawCheckGuess("sal", "sol")).toBe("wrong");
    expect(drawCheckGuess("cavalo", "girafa")).toBe("wrong");
    expect(drawCheckGuess("", "girafa")).toBe("wrong");
  });

  it("pontos: mais cedo vale mais, primeiro ganha bônus, difícil multiplica", () => {
    const early = drawGuessPoints(70_000, 80_000, 1, "facil");
    const late = drawGuessPoints(10_000, 80_000, 1, "facil");
    expect(early).toBeGreaterThan(late);
    expect(drawGuessPoints(40_000, 80_000, 0, "facil")).toBe(drawGuessPoints(40_000, 80_000, 1, "facil") + 50);
    expect(drawGuessPoints(40_000, 80_000, 1, "dificil")).toBe(2 * drawGuessPoints(40_000, 80_000, 1, "facil"));
    expect(drawDrawerPoints("medio")).toBeGreaterThan(drawDrawerPoints("facil"));
  });

  it("dica esconde letras e mostra espaços e hífens", () => {
    expect(drawHint("arco-íris", new Set())).toBe("____-____");
    expect(drawHint("pôr do sol", new Set([0]))).toBe("p__ __ ___");
    expect(drawLetterIndexes("pé de")).toEqual([0, 1, 3, 4]);
    expect(drawRevealCount(0.3, 9)).toBe(0);
    expect(drawRevealCount(0.6, 9)).toBe(1);
    expect(drawRevealCount(0.8, 9)).toBe(2);
    expect(drawRevealCount(0.9, 3)).toBe(1);
    expect(drawRevealCount(0.9, 2)).toBe(0);
  });

  it("três opções, uma de cada dificuldade, sem repetir as usadas", () => {
    const used = new Set(DRAW_WORDS.facil.slice(1));
    const c = drawPickChoices(used, grupoRng(3));
    expect(c.map((x) => x.level)).toEqual(["facil", "medio", "dificil"]);
    expect(c[0]!.word).toBe(DRAW_WORDS.facil[0]);
  });

  it("traços: só inteiros dentro do quadro, em pares e com limite", () => {
    expect(drawCleanPoints([1.4, 2.6, -5, 9999])).toEqual([1, 3, 0, DRAW_H]);
    expect(drawCleanPoints([DRAW_W + 10, 0])).toEqual([DRAW_W, 0]);
    expect(drawCleanPoints([1, 2, 3])).toBeNull();
    expect(drawCleanPoints([1, "2"])).toBeNull();
    expect(drawCleanPoints(new Array(400).fill(1))).toBeNull();
    expect(drawCleanPoints("nada")).toBeNull();
  });
});

describe("Stop", () => {
  it("sem letras difíceis e sorteio sem repetir", () => {
    for (const l of ["K", "W", "Y", "X", "Z", "Q"]) expect(STOP_LETTERS).not.toContain(l);
    const used: string[] = [];
    const rand = grupoRng(9);
    for (let i = 0; i < STOP_LETTERS.length; i++) used.push(stopDrawLetter(used, rand));
    expect(new Set(used).size).toBe(STOP_LETTERS.length);
  });

  it("resposta precisa começar com a letra (acento não importa)", () => {
    expect(stopFitsLetter("Ágata", "A")).toBe(true);
    expect(stopFitsLetter("  elefante", "E")).toBe(true);
    expect(stopFitsLetter("Banana", "A")).toBe(false);
    expect(stopFitsLetter("A", "A")).toBe(false);
    expect(stopFitsLetter("", "A")).toBe(false);
  });

  it("pontos 10 / 5 / 0: única, repetida, vazia ou anulada", () => {
    const answers = [
      ["Ana", "Amapá", "Anta", ""],
      ["ana", "Argentina", "Abelha", "Bola"],
      ["Alice", "Amapa", "Anta", "Avião"],
    ];
    const annulled = [
      [false, false, false, false],
      [false, false, true, false],
      [false, false, false, false],
    ];
    expect(stopScore(answers, "A", annulled)).toEqual([
      [5, 5, 5, 0],
      [5, 10, 0, 0],
      [10, 5, 5, 10],
    ]);
  });

  it("anular pede maioria dos outros jogadores", () => {
    expect(stopVotesNeeded(2)).toBe(1);
    expect(stopVotesNeeded(3)).toBe(2);
    expect(stopVotesNeeded(4)).toBe(2);
    expect(stopVotesNeeded(5)).toBe(3);
  });

  it("categorias: limpa, tira repetidas e exige pelo menos 3", () => {
    expect(stopCleanCategories(["Nome", " nome ", "Cor", "", "Animal"])).toEqual(["Nome", "Cor", "Animal"]);
    expect(stopCleanCategories(["Nome", "Cor"])).toBeNull();
    expect(stopCleanCategories("x")).toBeNull();
  });
});
