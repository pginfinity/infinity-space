import { expect, test, type Page } from "./setup.ts";
import { actState, enter, shot, walk, walkNear, type W } from "./grupo-comum.ts";

/**
 * Impostor na Estação com quatro pessoas no Átrio: papéis secretos, uma tarefa feita de verdade,
 * o infiltrado congela alguém, outra pessoa reporta, reunião com conversa e votação, e a tripulação vence.
 */

interface ImpState {
  phase: string;
  players: Array<{ id: string; name: string; alive: boolean }>;
  progress: { done: number; total: number };
  frozen: Array<{ id: string; x: number; z: number }>;
  final: { winner: string } | null;
}

const CONSOLE = { x: 5.4, z: 2.3 };

async function role(page: Page): Promise<string> {
  const card = page.locator("[data-imp-role]");
  await expect(card).toBeVisible({ timeout: 10_000 });
  return (await card.getAttribute("data-imp-role"))!;
}

async function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

test("Impostor na Estação: papéis, tarefa, congelar, reunião e vitória da tripulação", async ({ browser }) => {
  test.setTimeout(300_000);
  const names = ["Ana", "Bruno", "Caio", "Duda"];
  const pages = [await enter(browser, "Ana", "2d"), await enter(browser, "Bruno", "2d"), await enter(browser, "Caio", "2d"), await enter(browser, "Duda", "3d")];
  const [ana] = pages as [Page, Page, Page, Page];
  await expect.poll(async () => (await actState<ImpState>(ana, "impostor")).phase, { timeout: 20_000 }).toBe("idle");

  // Ana abre a sala pelo terminal; os outros entram pelo convite (todos chegam no Átrio).
  await walkNear(ana, CONSOLE, 0.5);
  await expect(ana.getByText("Impostor na Estação").first()).toBeVisible({ timeout: 8000 });
  await ana.keyboard.press("KeyE");
  const panel = (p: Page) => p.getByRole("dialog", { name: "Impostor na Estação" });
  await expect(panel(ana).getByRole("button", { name: "Começar" })).toBeDisabled({ timeout: 8000 });
  for (const p of pages.slice(1)) {
    await p.getByRole("button", { name: "Impostor na Estação" }).click();
    await expect(panel(p).getByText("Ana", { exact: true })).toBeVisible({ timeout: 8000 });
  }
  await shot(ana, "grupo-impostor-lobby");
  await panel(ana).getByRole("button", { name: "Começar" }).click();

  // Papéis secretos: um infiltrado, três na tripulação.
  const roles = await Promise.all(pages.map(role));
  expect(roles.filter((r) => r === "impostor")).toHaveLength(1);
  const imp = pages[roles.indexOf("impostor")]!;
  const crew = pages.filter((_, i) => roles[i] === "crew");
  const [c1, c2, c3] = crew as [Page, Page, Page];
  await shot(imp, "grupo-impostor-papel-infiltrado");
  await shot(c1, "grupo-impostor-papel-tripulacao");

  // c1 faz uma tarefa de verdade: anda até lá, aperta E e fica perto até terminar.
  const task = c1.locator("[data-imp-task]").first();
  const taskId = await task.getAttribute("data-imp-task");
  await task.getByRole("button", { name: /Ir até lá/ }).click();
  await expect(c1.getByRole("button", { name: /Tarefa: / })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => c1.evaluate(() => (window as unknown as { __infinity: { interact: { getState(): { target: unknown } } } }).__infinity.interact.getState().target !== null)).toBe(true);
  await c1.keyboard.press("Escape");
  await c1.keyboard.press("KeyE");
  await expect(c1.getByText("Fique perto até terminar")).toBeVisible({ timeout: 3000 });
  await shot(c1, "grupo-impostor-tarefa");
  await c1.getByRole("button", { name: "Voltar ao Impostor" }).click();
  await expect(c1.locator(`[data-imp-task="${taskId}"][data-done]`)).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await actState<ImpState>(ana, "impostor")).progress.done).toBe(1);

  // O infiltrado espera a recarga e congela c2 (que ficou parado no Átrio).
  await expect(imp.getByText(/Pronto para congelar/)).toBeVisible({ timeout: 25_000 });
  const c2Id = await selfId(c2);
  const c2Pos = await c2.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
  await imp.keyboard.press("Escape");
  const near = await walkNear(imp, { x: c2Pos.x + 0.6, z: c2Pos.z }, 0.5);
  void near;
  const c2Name = names[pages.indexOf(c2)]!;
  await expect(imp.getByText(`Congelar ${c2Name}`).first()).toBeVisible({ timeout: 8000 });
  await imp.keyboard.press("KeyE");
  await expect.poll(async () => (await actState<ImpState>(ana, "impostor")).frozen.map((f) => f.id)).toEqual([c2Id]);
  await expect(c2.getByText(/Você foi congelado/).first()).toBeVisible({ timeout: 5000 });
  await c3.keyboard.press("Escape");
  await c3.waitForTimeout(400);
  await shot(c3, "grupo-impostor-gelo");

  // c3 acha o bloco de gelo e reporta: reunião para todos.
  const f = (await actState<ImpState>(ana, "impostor")).frozen[0]!;
  await walkNear(c3, { x: f.x - 1.0, z: f.z }, 0.5);
  await expect(c3.getByText(`Reportar: ${c2Name} congelado`).first()).toBeVisible({ timeout: 8000 });
  await c3.keyboard.press("KeyE");
  for (const p of pages) await expect(panel(p).getByText("Reunião", { exact: true })).toBeVisible({ timeout: 8000 });
  const msg = panel(c3).getByRole("textbox", { name: "Mensagem da reunião" });
  await msg.fill("Vi alguém saindo do Átrio agora!");
  await msg.press("Enter");
  await expect(panel(c1).getByText("Vi alguém saindo do Átrio agora!")).toBeVisible({ timeout: 5000 });
  await expect(panel(c2).getByText("Congelados não votam.")).toBeVisible();
  await shot(c3, "grupo-impostor-reuniao");

  // Votação: duas pessoas da tripulação no infiltrado; o infiltrado pula.
  const impName = names[pages.indexOf(imp)]!;
  await panel(c1).getByRole("button", { name: `Votar em ${impName}` }).click();
  await panel(c3).getByRole("button", { name: `Votar em ${impName}` }).click();
  await panel(imp).getByRole("button", { name: "Pular" }).click();
  await expect(panel(c1).getByText("Era um infiltrado!")).toBeVisible({ timeout: 8000 });
  await expect(panel(c1).locator('[data-imp-final="crew"]')).toBeVisible({ timeout: 12_000 });
  await expect(panel(imp).getByText("A tripulação venceu!")).toBeVisible();
  await c1.waitForTimeout(500);
  await shot(c1, "grupo-impostor-vitoria");
  await shot(imp, "grupo-impostor-derrota");

  for (const p of pages) await panel(p).getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await actState<ImpState>(ana, "impostor")).phase).toBe("idle");
  void walk;
});
