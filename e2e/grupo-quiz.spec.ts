import { expect, test, type Page } from "./setup.ts";
import { actState, enter, send, shot, walk, zoneOf } from "./grupo-comum.ts";

/**
 * Quiz Show no Auditório: a Helena apresenta do púlpito; Ana, Bruno e Caio entram pela plateia,
 * respondem juntos e o placar acompanha quem acerta mais rápido. Termina no pódio.
 */

interface QuizState {
  phase: string;
  players: Array<{ id: string; name: string; score: number; gain: number }>;
  question: { n: number; total: number } | null;
}

const LECTERN = { x: 23.25, z: 14.6 };

/** Garante o quiz fechado (sobras de testes anteriores na mesma sala). */
async function resetQuiz(host: Page) {
  for (let i = 0; i < 3; i++) {
    const s = await actState<QuizState>(host, "quiz");
    if (s.phase === "idle") return;
    await send(host, "quiz", "end");
    await host.waitForTimeout(300);
  }
}

test("Quiz Show: apresentador, três jogadores, pontos por velocidade e pódio", async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await enter(browser, "Helena", "2d");
  const ana = await enter(browser, "Ana", "3d");
  const bruno = await enter(browser, "Bruno", "2d");
  const caio = await enter(browser, "Caio", "2d", { width: 420, height: 860 });
  const players = [ana, bruno, caio];

  // A Helena vai ao púlpito; o botão de interação vira o do Quiz Show.
  await walk(host, LECTERN, 0.5);
  await resetQuiz(host);
  await expect(host.getByText("Púlpito · Quiz Show").first()).toBeVisible({ timeout: 8000 });
  await host.keyboard.press("KeyE");
  const hostPanel = host.getByRole("dialog", { name: "Quiz Show" });
  await expect(hostPanel.getByRole("button", { name: "Começar o quiz" })).toBeVisible({ timeout: 10_000 });
  await expect(hostPanel.getByRole("button", { name: "Começar o quiz" })).toBeDisabled();

  // A plateia entra pelo chip do auditório.
  const spots = [
    { x: 20.2, z: 15.4 },
    { x: 20.2, z: 17.0 },
    { x: 20.2, z: 18.6 },
  ];
  await Promise.all(players.map((p, i) => walk(p, spots[i]!)));
  for (const p of players) expect(await zoneOf(p)).toBe("auditorio");
  for (const p of players) {
    await p.getByRole("button", { name: "Entrar no quiz" }).click();
    await expect(p.getByText("Você está no quiz!")).toBeVisible({ timeout: 8000 });
  }

  // Configuração: pacote Brasil, 5 perguntas, 15 s.
  await hostPanel.getByRole("radio", { name: /Brasil/ }).click();
  await hostPanel.getByRole("radiogroup", { name: "Perguntas" }).getByRole("radio", { name: "5", exact: true }).click();
  await hostPanel.getByRole("radiogroup", { name: "Tempo por pergunta" }).getByRole("radio", { name: "15s" }).click();
  await expect(hostPanel.getByText("3 pessoas no quiz")).toBeVisible();
  await host.waitForTimeout(400);
  await shot(host, "grupo-quiz-lobby-apresentador");
  await shot(caio, "grupo-quiz-lobby-celular");

  await hostPanel.getByRole("button", { name: "Começar o quiz" }).click();

  for (let n = 1; n <= 5; n++) {
    // Pergunta aparece sozinha ("prepare-se") e depois as alternativas.
    for (const p of players) await expect(p.locator("[data-quiz-option]")).toHaveCount(4, { timeout: 12_000 });
    // O gabarito só aparece no painel do apresentador.
    const correctItem = hostPanel.locator("li", { has: host.getByLabel("Certa") });
    await expect(correctItem).toHaveCount(1, { timeout: 5000 });
    const items = hostPanel.locator("ul li");
    let correct = -1;
    for (let i = 0; i < 4; i++) if ((await items.nth(i).getByLabel("Certa").count()) > 0) correct = i;
    expect(correct).toBeGreaterThanOrEqual(0);
    for (const p of players) expect(await p.getByLabel("Certa").count()).toBe(0);
    const wrong = (correct + 1) % 4;

    if (n === 1) {
      await shot(host, "grupo-quiz-pergunta-apresentador");
      await shot(bruno, "grupo-quiz-pergunta-jogador");
    }
    // Ana responde certo na hora; Bruno certo, mais devagar; Caio erra (pelo teclado).
    await ana.locator(`[data-quiz-option="${correct}"]`).click();
    await bruno.waitForTimeout(1500);
    await bruno.locator(`[data-quiz-option="${correct}"]`).click();
    await expect(bruno.getByText("Resposta enviada. Aguarde o resultado.")).toBeVisible();
    await caio.locator("[data-quiz-option]").first().focus();
    await caio.keyboard.press(`Digit${wrong + 1}`);

    // Todos responderam: revela sozinho.
    await expect(ana.locator('[data-quiz-result="right"]')).toBeVisible({ timeout: 8000 });
    await expect(bruno.locator('[data-quiz-result="right"]')).toBeVisible();
    await expect(caio.locator('[data-quiz-result="wrong"]')).toBeVisible();
    if (n === 1) {
      const s = await actState<QuizState>(host, "quiz");
      const [a, b, c] = ["Ana", "Bruno", "Caio"].map((nm) => s.players.find((p) => p.name === nm)!);
      expect(a!.gain).toBeGreaterThan(b!.gain);
      expect(b!.gain).toBeGreaterThan(0);
      expect(c!.gain).toBe(0);
      await ana.waitForTimeout(700);
      await shot(ana, "grupo-quiz-revelacao-3d");
      await shot(caio, "grupo-quiz-revelacao-celular");
      await shot(host, "grupo-quiz-revelacao-apresentador");
    }
    await hostPanel.getByRole("button", { name: n < 5 ? "Próxima pergunta" : "Ver placar final" }).click();
  }

  // Pódio para todo mundo, com a Ana em primeiro.
  await expect(ana.getByText("Você venceu!")).toBeVisible({ timeout: 8000 });
  await expect(bruno.getByText("Ana venceu o Quiz Show!")).toBeVisible();
  await expect(host.locator("[data-podium]")).toBeVisible();
  await ana.waitForTimeout(900);
  await shot(ana, "grupo-quiz-podio-3d");
  await shot(bruno, "grupo-quiz-podio-jogador");
  // No 2D, girando a câmera (Q), o telão aparece de frente.
  await bruno.keyboard.press("Escape");
  await bruno.keyboard.press("KeyQ");
  await bruno.waitForTimeout(1200);
  await shot(bruno, "grupo-quiz-telao-2d");

  await hostPanel.getByRole("button", { name: "Fechar a sala" }).click();
  await expect.poll(async () => (await actState<QuizState>(host, "quiz")).phase).toBe("idle");
});

test("Quiz Show: banco de perguntas editável do palco", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await enter(browser, "Helena", "2d");
  await walk(host, LECTERN, 0.5);
  await resetQuiz(host);
  await host.keyboard.press("KeyE");
  const panel = host.getByRole("dialog", { name: "Quiz Show" });
  await panel.getByRole("button", { name: "Editar perguntas" }).click();
  const editor = host.getByRole("dialog", { name: "Banco de perguntas" });
  await expect(editor.getByRole("tab", { name: /Tecnologia e IA/ })).toBeVisible({ timeout: 8000 });

  // Novo pacote.
  const title = `Onboarding ${Date.now() % 10000}`;
  await editor.getByRole("button", { name: "Novo pacote" }).click();
  await editor.getByRole("textbox", { name: "Nome do pacote" }).fill(title);
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(editor.getByRole("tab", { name: new RegExp(title) })).toHaveAttribute("aria-selected", "true", { timeout: 5000 });
  await expect(editor.getByText("Nenhuma pergunta ainda. Crie a primeira.")).toBeVisible();

  // Pergunta com alternativas repetidas é recusada; depois corrigida e salva.
  await editor.getByRole("button", { name: "Nova pergunta" }).click();
  const form = editor.getByRole("form", { name: "Nova pergunta" });
  await form.getByRole("textbox").first().fill("Qual é a cor de destaque da marca?");
  for (const [i, v] of ["Laranja", "Verde", "Verde", "Cinza"].entries()) await form.getByRole("textbox", { name: `Alternativa ${"ABCD"[i]}` }).fill(v);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(form.getByText("As alternativas precisam ser diferentes.")).toBeVisible();
  await form.getByRole("textbox", { name: "Alternativa C" }).fill("Roxo");
  await shot(host, "grupo-quiz-editor");
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(editor.getByRole("button", { name: /Editar: Qual é a cor de destaque da marca\?/ })).toBeVisible({ timeout: 5000 });
  await expect(editor.getByRole("tab", { name: new RegExp(`${title}\\s*1`) })).toBeVisible();

  // O pacote novo aparece para escolher no lobby e some ao apagar.
  await editor.getByRole("button", { name: "Apagar pacote" }).click();
  await editor.getByRole("button", { name: "Apagar", exact: true }).click();
  await expect(editor.getByRole("tab", { name: new RegExp(title) })).toHaveCount(0, { timeout: 5000 });
  await host.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await resetQuiz(host);
});
