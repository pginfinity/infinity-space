import { expect, test, type Page } from "./setup.ts";

/**
 * Gongo (atividade de referência): a Ana vai até o gongo do Comercial, toca com mensagem,
 * e o Bruno (em outra sala) vê a faixa de comemoração. O servidor recusa quem está longe.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  world(): { map: { objects: Array<{ type: string; pos: { x: number; z: number }; interact?: { point: { x: number; z: number } } }> } };
}
type W = { __infinity: Hook };

async function enter(page: Page, name: string) {
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
}

test("tocar o gongo comemora para todo mundo", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana");
  await enter(b, "Bruno");

  // Ana vai até o ponto de interação do gongo.
  const point = await a.evaluate(() => {
    const g = (window as unknown as W).__infinity.world().map.objects.find((o) => o.type === "gong")!;
    return g.interact!.point;
  });
  await a.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), point);
  await expect.poll(() => a.evaluate((p) => Math.hypot((window as unknown as W).__infinity.self.x - p.x, (window as unknown as W).__infinity.self.z - p.z), point), { timeout: 30_000 }).toBeLessThan(0.6);

  // O botão de interação vira "Tocar o gongo"; E abre o campo de mensagem.
  await expect(a.getByText("Tocar o gongo").first()).toBeVisible({ timeout: 5000 });
  await a.keyboard.press("KeyE");
  const dialog = a.getByRole("dialog", { name: "Tocar o gongo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Fechamos com a Acme!");
  await a.screenshot({ path: "test-results/screens/v3-gongo-campo.png" });
  await dialog.getByRole("button", { name: "Tocar" }).click();

  // Os dois veem a faixa, com a mensagem.
  for (const p of [a, b]) {
    await expect(p.getByText("Ana tocou o gongo!")).toBeVisible({ timeout: 10_000 });
    await expect(p.getByText("Fechamos com a Acme!")).toBeVisible();
  }
  await a.waitForTimeout(700);
  await a.screenshot({ path: "test-results/screens/v3-gongo-confete.png" });
});
