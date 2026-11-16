import { expect, test } from "./setup.ts";
import { SHOTS, enter, objectOf, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Mural de recados: a Ana prega um post-it, o Bruno vê no painel e reage; o mural no mundo mostra
 * os recados nas duas lentes; só a autora consegue tirar o recado (mesmo depois de recarregar).
 */
test("mural: pregar, reagir, ver no mundo e tirar o próprio recado", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);
  const board = await objectOf(a, "notice-board");
  const spot = board.interact!.point;
  await walk(a, { x: spot.x - 0.6, z: spot.z + 0.5 }, 0.7);
  await walk(b, { x: spot.x + 0.8, z: spot.z + 1.1 }, 0.7);

  await expect(a.getByText(/Ver mural/).first()).toBeVisible({ timeout: 5000 });
  await a.keyboard.press("KeyE");
  const panel = a.getByRole("dialog", { name: "Mural de recados" });
  await expect(panel).toBeVisible();

  const text = `Bem-vindos ao Infinity Space! Café às 16h na copa ☕ #${Date.now() % 10000}`;
  await panel.getByLabel("Escreva um recado para o time").fill(text);
  await panel.getByRole("radio", { name: "Azul" }).click();
  await panel.getByRole("button", { name: "Pregar" }).click();
  const card = panel.locator("li", { hasText: text });
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText("seu");
  await expect(panel.getByLabel("Escreva um recado para o time")).toHaveValue("");

  // Bruno abre o mural e reage com 🎉.
  await b.keyboard.press("KeyE");
  const pb = b.getByRole("dialog", { name: "Mural de recados" });
  await expect(pb).toBeVisible();
  const cb = pb.locator("li", { hasText: text });
  await expect(cb).toBeVisible();
  await expect(cb.getByRole("button", { name: "Tirar do mural" })).toHaveCount(0);
  await cb.getByRole("button", { name: "Reagir", exact: true }).click();
  await cb.getByRole("button", { name: "Reagir com 🎉" }).click();
  await expect(card.getByRole("button", { name: /🎉 1/ })).toBeVisible({ timeout: 5000 });
  await expect(cb.getByRole("button", { name: /🎉 1 \(inclui você\)/ })).toBeVisible();

  await a.screenshot({ path: `${SHOTS}/escritorio-mural-painel.png` });
  // No mundo: fecha os painéis e olha o mural.
  await a.keyboard.press("Escape");
  await b.keyboard.press("Escape");
  await a.waitForTimeout(1200);
  await a.screenshot({ path: `${SHOTS}/escritorio-mural-2d.png` });
  await b.waitForTimeout(1200);
  await b.screenshot({ path: `${SHOTS}/escritorio-mural-3d.png` });

  // A Ana recarrega a página (outra sessão) e ainda consegue tirar o próprio recado.
  await a.reload();
  await a.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await walk(a, { x: spot.x - 0.6, z: spot.z + 0.5 }, 0.7);
  await expect(a.getByText(/Ver mural/).first()).toBeVisible({ timeout: 5000 });
  await a.keyboard.press("KeyE");
  const again = a.getByRole("dialog", { name: "Mural de recados" }).locator("li", { hasText: text });
  await again.getByRole("button", { name: "Tirar do mural" }).click();
  await expect(again).toHaveCount(0, { timeout: 5000 });
});
