import { expect, test } from "./setup.ts";

/**
 * Computador fraco: o app sugere o modo leve uma vez. No teste a medição é simulada (?sugerirleve,
 * só em desenvolvimento): o cartão aparece, "Usar o modo leve" troca a qualidade e a sugestão não volta.
 */

type W = { __infinity: { store: { getState(): { selfId: string | null } } } };

test("sugere o modo leve uma vez e troca a qualidade", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem("infinity.qualidade.v1")) localStorage.setItem("infinity.qualidade.v1", "auto");
    } catch {
      /* sem armazenamento */
    }
  });
  const page = await ctx.newPage();
  await page.goto("/?nome=Leve&lente=2d&sugerirleve");
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });

  const card = page.getByRole("dialog", { name: "O escritório está pesado neste computador" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("18 quadros por segundo");
  await page.screenshot({ path: "test-results/screens/sugestao-leve.png" });
  await card.getByRole("button", { name: "Usar o modo leve" }).click();
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("infinity.qualidade.v1"))).toBe("leve");

  // Respondida, não volta (nem com a qualidade de volta no automático).
  await page.evaluate(() => localStorage.setItem("infinity.qualidade.v1", "auto"));
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(card).toBeHidden();
});
