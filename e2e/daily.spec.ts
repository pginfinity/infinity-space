import { expect, test, type Page } from "./setup.ts";

/** Daily na Sala Eclipse (a sala da daily): começar, ver quem fala, passar a vez e concluir. */

interface Hook {
  store: { getState(): { selfId: string | null; zoneName: string } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
}
type W = { __infinity: Hook };

async function enterEclipse(page: Page, name: string, at: { x: number; z: number }) {
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), at);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.store.getState().zoneName), { timeout: 30_000 }).toContain("Sala Eclipse");
}

test("daily do time: roda sorteada, passar a vez e concluir", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  // Na roda do tapete, na metade sul da sala.
  await enterEclipse(a, "Ana", { x: -21.9, z: 5.4 });
  await enterEclipse(b, "Bruno", { x: -20.1, z: 5.4 });

  await a.getByRole("button", { name: "Começar a daily" }).click();
  await a.getByRole("dialog", { name: "Começar a daily" }).getByRole("button", { name: "Começar" }).click();
  const cardA = a.getByRole("region", { name: "Daily" });
  const cardB = b.getByRole("region", { name: "Daily" });
  await expect(cardA).toBeVisible({ timeout: 10_000 });
  await expect(cardB).toBeVisible();
  await expect(cardA).toContainText("1 de 2");
  await a.screenshot({ path: "test-results/screens/v3-daily.png" });

  // Passa a vez (a Ana começou, então ela pode passar mesmo que não seja a vez dela).
  await cardA.getByRole("button", { name: "Passar a vez" }).click();
  await expect(cardB).toContainText("2 de 2");
  await cardA.getByRole("button", { name: "Concluir" }).click();
  for (const p of [a, b]) await expect(p.getByText("Daily concluída. Bom trabalho!")).toBeVisible({ timeout: 8000 });
  await expect(cardA).toHaveCount(0);
});
