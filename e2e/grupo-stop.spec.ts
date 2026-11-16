import { expect, test, type Page } from "./setup.ts";
import { actState, enter, shot, walkNear, zoneOf } from "./grupo-comum.ts";

/**
 * Stop no Café: Ana abre a mesa pelo cavalete (E) e ajusta as categorias; Bruno entra pelo convite.
 * Letra sorteada, STOP só com tudo preenchido, validação por voto e pontos 10/5/0.
 */

interface StopState {
  phase: string;
  letter: string | null;
  categories: string[];
  players: Array<{ id: string; name: string; score: number; filled: number }>;
  points: Record<string, number[]> | null;
}

const BOARD = { x: -4.4, z: 14.1 };

async function fill(page: Page, answers: string[]) {
  for (const [i, a] of answers.entries()) {
    const input = page.locator(`[data-stop-input="${i}"]`);
    await input.fill(a);
  }
}

test("Stop: categorias, letra, STOP, votação e placar 10/5/0", async ({ browser }) => {
  test.setTimeout(200_000);
  const ana = await enter(browser, "Ana", "2d");
  const bruno = await enter(browser, "Bruno", "3d");

  await walkNear(ana, BOARD, 0.5);
  await walkNear(bruno, { x: -6.0, z: 17.6 });
  expect(await zoneOf(ana)).toBe("cafe");
  expect(await zoneOf(bruno)).toBe("cafe");
  await expect.poll(async () => (await actState<StopState>(ana, "stop")).phase, { timeout: 15_000 }).toBe("idle");
  await shot(ana, "grupo-stop-cavalete-2d");

  // Ana abre a mesa pelo cavalete.
  await expect(ana.getByText("Jogar Stop").first()).toBeVisible({ timeout: 8000 });
  await ana.keyboard.press("KeyE");
  const panelA = ana.getByRole("dialog", { name: "Stop" });
  await expect(panelA.getByRole("button", { name: "Começar" })).toBeVisible({ timeout: 8000 });

  // Bruno entra pelo convite.
  await bruno.getByRole("button", { name: "Stop no Café" }).click();
  const panelB = bruno.getByRole("dialog", { name: "Stop" });
  await expect(panelB.getByText("Ana", { exact: true })).toBeVisible({ timeout: 8000 });

  // As categorias ficam salvas de uma partida para outra: volta ao padrão antes de mexer.
  await panelA.getByRole("button", { name: "Padrão" }).click();
  await expect.poll(async () => (await actState<StopState>(ana, "stop")).categories.length).toBe(10);
  // Categorias mais curtas para o teste: tira seis e acrescenta uma sugestão.
  for (const c of ["Objeto", "Cor", "Marca", "Profissão", "Comida", "Filme/Série"]) {
    await panelA.getByRole("button", { name: `Tirar ${c}` }).click();
    await ana.waitForTimeout(150);
  }
  await panelA.getByRole("button", { name: "Esporte" }).click();
  await panelA.getByRole("radiogroup", { name: "Rodadas" }).getByRole("radio", { name: "1", exact: true }).click();
  await panelA.getByRole("radiogroup", { name: "Tempo" }).getByRole("radio", { name: "60s" }).click();
  await expect.poll(async () => (await actState<StopState>(ana, "stop")).categories.length).toBe(5);
  await expect(panelB.getByText("Esporte")).toBeVisible();
  await ana.waitForTimeout(300);
  await shot(ana, "grupo-stop-lobby");

  await panelA.getByRole("button", { name: "Começar" }).click();
  await expect(panelB.getByText("Sorteando a letra…")).toBeVisible({ timeout: 5000 });
  await bruno.waitForTimeout(900);
  await shot(bruno, "grupo-stop-roleta-3d");
  await expect(ana.locator("[data-stop-input]")).toHaveCount(5, { timeout: 8000 });
  const L = (await actState<StopState>(ana, "stop")).letter!;
  const w = (rest: string) => `${L}${rest}`;

  // Bruno deixa uma vazia e escreve uma fora da letra: STOP desabilitado para ele.
  await fill(bruno, [w("ia"), w("ima"), "Zzebra", w("aranja"), ""]);
  await expect(panelB.getByRole("button", { name: "STOP!" })).toBeDisabled();
  await expect(panelB.getByText(`Não começa com ${L}`)).toBeVisible();
  await fill(ana, [w("ia"), w("ondres"), w("obo"), w("imão"), w("ateral")]);
  await expect.poll(async () => (await actState<StopState>(bruno, "stop")).players.find((p) => p.name === "Ana")?.filled, { timeout: 5000 }).toBe(5);
  await shot(ana, "grupo-stop-rodada");
  await shot(bruno, "grupo-stop-rodada-3d");
  await panelA.getByRole("button", { name: "STOP!" }).click();
  await expect(panelB.getByText("Ana gritou STOP!")).toBeVisible({ timeout: 5000 });
  await shot(bruno, "grupo-stop-grito");

  // Validação: Bruno anula o animal da Ana; os dois ficam prontos.
  await expect(panelB.getByText("Validação")).toBeVisible({ timeout: 8000 });
  await panelB.getByRole("button", { name: new RegExp(`Anular: ${w("obo")} \\(Ana\\)`) }).click();
  await expect(panelA.locator('[data-stop-answer="Ana:2"]').getByText("Anulada")).toBeVisible({ timeout: 5000 });
  await shot(ana, "grupo-stop-validacao");
  await panelA.getByRole("button", { name: "Pronto" }).click();
  await panelB.getByRole("button", { name: "Pronto" }).click();

  // Resultado: nome repetido (5), cidade e fruta únicas (10), animal anulado / fora da letra (0), vazia (0).
  await expect(panelA.getByText("Resultado da rodada")).toBeVisible({ timeout: 8000 });
  const s = await actState<StopState>(ana, "stop");
  const id = (n: string) => s.players.find((p) => p.name === n)!.id;
  expect(s.points![id("Ana")]).toEqual([5, 10, 0, 10, 10]);
  expect(s.points![id("Bruno")]).toEqual([5, 10, 0, 10, 0]);
  await ana.waitForTimeout(300);
  await shot(ana, "grupo-stop-resultado");

  await panelA.getByRole("button", { name: "Ver placar final" }).click();
  await expect(panelA.locator("[data-podium]")).toBeVisible({ timeout: 8000 });
  await expect(panelB.getByText("Ana venceu o Stop!")).toBeVisible();
  await ana.waitForTimeout(600);
  await shot(ana, "grupo-stop-podio");
  await ana.keyboard.press("Escape");
  await ana.waitForTimeout(500);
  await shot(ana, "grupo-stop-cavalete-final-2d");

  await panelB.getByRole("button", { name: "Sair do jogo" }).click();
  await ana.keyboard.press("KeyE");
  await panelA.getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await actState<StopState>(ana, "stop")).phase).toBe("idle");
});
