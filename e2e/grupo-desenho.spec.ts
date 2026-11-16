import { expect, test, type Page } from "./setup.ts";
import { actState, enter, inkPixels, scribble, shot, walkNear, zoneOf } from "./grupo-comum.ts";

/**
 * Desenhe e adivinhe no quadro da Sala Órbita: Ana abre pelo quadro (E), Bruno entra pelo convite.
 * Cada um desenha uma vez; o outro vê o desenho ao vivo, recebe "quase!" e acerta. Termina no pódio.
 */

interface DrawState {
  phase: string;
  drawer: string | null;
  players: Array<{ id: string; name: string; score: number }>;
}

async function boardId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const h = (window as unknown as { __infinity: { world(): { map: { objects: Array<{ id: string; type: string; zoneId?: string }> } } } }).__infinity;
    const o = h.world().map.objects.find((x) => x.type === "whiteboard" && x.zoneId === "orbita")!;
    return `desenho-${o.id}`;
  });
}

/** Quem desenha escolhe a palavra e lê qual é. */
async function chooseWord(page: Page): Promise<string> {
  const choice = page.locator('[data-draw-choice="0"]');
  await expect(choice).toBeVisible({ timeout: 10_000 });
  await choice.click();
  const el = page.locator("[data-draw-word]");
  await expect(el).toBeVisible({ timeout: 5000 });
  return (await el.getAttribute("data-draw-word"))!;
}

/** Um chute quase certo: troca a última letra (para palavras de 4+ letras). */
function nearMiss(word: string): string | null {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return null;
  const last = word.at(-1)!;
  return word.slice(0, -1) + (last === "x" ? "z" : "x");
}

test("Desenhe e adivinhe: desenho ao vivo, 'quase!', acerto e pódio", async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = await enter(browser, "Ana", "2d");
  const bruno = await enter(browser, "Bruno", "3d");
  const id = await boardId(ana);

  // Ana vai até o quadro; Bruno entra na sala.
  await walkNear(ana, { x: -21, z: 1.88 }, 0.4);
  await walkNear(bruno, { x: -23.5, z: -2.6 });
  expect(await zoneOf(ana)).toBe("orbita");
  expect(await zoneOf(bruno)).toBe("orbita");
  await expect.poll(async () => (await actState<DrawState>(ana, id))?.phase, { timeout: 15_000 }).toBe("idle");

  await expect(ana.getByText("Desenhe e adivinhe").first()).toBeVisible({ timeout: 8000 });
  await ana.keyboard.press("KeyE");
  const panelA = ana.getByRole("dialog", { name: "Desenhe e adivinhe" });
  await expect(panelA.getByRole("button", { name: "Começar" })).toBeVisible({ timeout: 8000 });

  await bruno.getByRole("button", { name: "Entrar no Desenhe e adivinhe" }).click();
  const panelB = bruno.getByRole("dialog", { name: "Desenhe e adivinhe" });
  await expect(panelB.getByText("Ana", { exact: true })).toBeVisible({ timeout: 8000 });

  await panelA.getByRole("radiogroup", { name: "Rodadas" }).getByRole("radio", { name: "1", exact: true }).click();
  await ana.waitForTimeout(300);
  await shot(ana, "grupo-desenho-lobby");
  await panelA.getByRole("button", { name: "Começar" }).click();

  // Vez da Ana: escolhe a palavra (Bruno só vê "escolhendo").
  await expect(panelB.getByText("Ana está escolhendo a palavra…").first()).toBeVisible({ timeout: 8000 });
  await expect(ana.locator('[data-draw-choice="2"]')).toBeVisible({ timeout: 8000 });
  await ana.waitForTimeout(400);
  await shot(ana, "grupo-desenho-escolha");
  const wordA = await chooseWord(ana);
  expect(await bruno.locator("[data-draw-word]").count()).toBe(0);

  await scribble(ana, "[data-draw-canvas]");
  // O desenho chega ao Bruno ao vivo.
  await expect.poll(() => inkPixels(bruno, "[data-draw-canvas]"), { timeout: 8000 }).toBeGreaterThan(200);

  const guess = panelB.getByRole("textbox", { name: "Chute" });
  await guess.fill("zzzz");
  await guess.press("Enter");
  await expect(panelA.getByText("zzzz")).toBeVisible({ timeout: 5000 });
  const near = nearMiss(wordA);
  if (near) {
    await bruno.waitForTimeout(600);
    await guess.fill(near);
    await guess.press("Enter");
    await expect(panelB.getByText(/Quase! Tente de novo\./)).toBeVisible({ timeout: 5000 });
    // O "quase" não aparece para quem desenha.
    expect(await panelA.getByText(near, { exact: true }).count()).toBe(0);
  }
  await shot(ana, "grupo-desenho-desenhando");
  await shot(bruno, "grupo-desenho-chutando-3d");
  await bruno.waitForTimeout(600);
  await guess.fill(wordA.toUpperCase());
  await guess.press("Enter");

  // Todos acertaram: fim da vez com a palavra revelada; os dois pontuam.
  await expect(panelA.getByText("A palavra era").first()).toBeVisible({ timeout: 5000 });
  await expect(panelB.getByText("A palavra era").first()).toBeVisible();
  let s = await actState<DrawState>(ana, id);
  expect(s.players.every((p) => p.score > 0)).toBe(true);

  // O quadro do mundo mostra o desenho: Bruno fecha o painel e olha (3D); Ana gira a câmera (2D).
  await bruno.keyboard.press("Escape");
  // Gira a câmera 3D de frente para o quadro (arrastando).
  await bruno.mouse.move(1150, 640);
  await bruno.mouse.down();
  await bruno.mouse.move(580, 600, { steps: 12 });
  await bruno.mouse.up();
  await bruno.waitForTimeout(700);
  await shot(bruno, "grupo-desenho-quadro-3d");
  await ana.keyboard.press("Escape");
  await ana.keyboard.press("KeyR");
  await ana.waitForTimeout(1200);
  await shot(ana, "grupo-desenho-quadro-2d");
  await ana.keyboard.press("KeyQ");

  // Vez do Bruno (o painel abre sozinho para quem vai desenhar).
  await expect(panelB.locator('[data-draw-choice="0"]')).toBeVisible({ timeout: 12_000 });
  const wordB = await chooseWord(bruno);
  await scribble(bruno, "[data-draw-canvas]");
  // Ana está no quadro: o botão de interação (E) volta ao jogo.
  await expect(ana.getByText("Voltar ao desenho").first()).toBeVisible();
  await ana.keyboard.press("KeyE");
  const guessA = panelA.getByRole("textbox", { name: "Chute" });
  await guessA.fill(wordB);
  await guessA.press("Enter");

  // Fim de jogo: pódio para os dois.
  await expect(panelA.locator("[data-podium]")).toBeVisible({ timeout: 15_000 });
  await expect(panelB.locator("[data-podium]")).toBeVisible();
  s = await actState<DrawState>(ana, id);
  expect(s.phase).toBe("final");
  await ana.waitForTimeout(800);
  await shot(ana, "grupo-desenho-podio");

  await panelA.getByRole("button", { name: "Sair do jogo" }).click();
  await panelB.getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await actState<DrawState>(ana, id)).phase).toBe("idle");
});
