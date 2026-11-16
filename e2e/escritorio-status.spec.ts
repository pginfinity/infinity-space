import { expect, test } from "./setup.ts";
import { SHOTS, enter, selfId, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Status no avatar: a Ana escolhe "Almoço" pelo chip, o Bruno escreve um status livre;
 * os dois veem os balões acima das cabeças, nas duas lentes. Limpar apaga o balão.
 */
test("status curto vira balão acima da cabeça, nas duas lentes", async ({ browser }) => {
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);
  const ida = await selfId(a);
  const idb = await selfId(b);

  // Bruno fica de frente para a Ana, a uns 2 m.
  const pa = await a.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
  await walk(b, { x: pa.x + 1.6, z: pa.z + 2.2 }, 0.8);

  // Ana: chip → atalho "Almoço".
  await a.getByRole("button", { name: "Definir status" }).click();
  const pop = a.getByRole("dialog", { name: "Seu status" });
  await expect(pop).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/escritorio-status-escolha.png` });
  await pop.getByRole("button", { name: /Almoço/ }).click();
  await expect(pop).toBeHidden();

  // Bruno: texto livre (Enter usa).
  await b.getByRole("button", { name: "Definir status" }).click();
  await b.getByLabel("Escreva um status").fill("Revisando PR até 15h");
  await b.keyboard.press("Enter");

  // Todo mundo recebe o status; o balão aparece (visível) nas duas telas.
  for (const p of [a, b]) {
    await expect.poll(() => p.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.note, ida)).toBe("🍽️ Almoço");
    await expect.poll(() => p.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.note, idb)).toBe("Revisando PR até 15h");
    for (const id of [ida, idb]) {
      await expect(p.locator(`[data-status-balloon="${id}"]`)).toBeVisible({ timeout: 10_000 });
    }
  }
  await expect(a.locator(`[data-status-balloon="${ida}"]`)).toContainText("Almoço");
  await expect(a.getByRole("button", { name: /Status: 🍽️ Almoço/ })).toBeVisible();

  // O balão fica acima da cabeça (acima do ponto da etiqueta de nome, perto do avatar na tela).
  const box = await a.locator(`[data-status-balloon="${ida}"]`).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(450);
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThan(120);

  await a.waitForTimeout(800);
  await a.screenshot({ path: `${SHOTS}/escritorio-status-2d.png` });
  await b.waitForTimeout(800);
  await b.screenshot({ path: `${SHOTS}/escritorio-status-3d.png` });

  // Com emote, o balão sobe para não cobrir o emoji.
  const before = (await a.locator(`[data-status-balloon="${ida}"]`).boundingBox())!.y;
  await a.keyboard.press("Digit3");
  await a.waitForTimeout(500);
  const during = (await a.locator(`[data-status-balloon="${ida}"]`).boundingBox())!.y;
  expect(during).toBeLessThan(before - 12);

  // Limpar apaga para todos.
  await a.getByRole("button", { name: /Status: 🍽️ Almoço/ }).click();
  await a.getByRole("button", { name: "Limpar status" }).click();
  await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.note ?? "", ida)).toBe("");
  await expect(b.locator(`[data-status-balloon="${ida}"]`)).toHaveCount(0);
});
