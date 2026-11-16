import { expect, test } from "./setup.ts";
import { enter, frontOf, promptLabel, walkNear, zoomIn, type W } from "./vivo-util.ts";

/** Telescópio da Diretoria: abre a vista da Terra em tela cheia; Esc volta ao escritório. */

test("olhar pelo telescópio e voltar com Esc", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "3d");
  await walkNear(a, await frontOf(a, "telescope", -0.95), 0.7);
  await expect.poll(() => promptLabel(a)).toBe("Olhar pelo telescópio");
  await zoomIn(a, 4);
  await a.screenshot({ path: "test-results/screens/vivo-telescopio-objeto-3d.png" });

  await a.keyboard.press("KeyE");
  const view = a.getByRole("dialog", { name: "Telescópio" });
  await expect(view).toBeVisible();
  await expect(view.getByRole("button", { name: /Fechar/ })).toBeFocused();
  // As teclas não andam com o avatar enquanto olha.
  const before = await a.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(400);
  await a.keyboard.up("KeyW");
  const after = await a.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
  await a.waitForTimeout(5000);
  await a.screenshot({ path: "test-results/screens/vivo-telescopio-vista.png" });

  await a.keyboard.press("Escape");
  await expect(view).toHaveCount(0);

  // No 2D o telescópio está no mesmo lugar.
  const b = await (await browser.newContext()).newPage();
  await enter(b, "Bia", "2d");
  await walkNear(b, await frontOf(b, "telescope", -0.95), 0.7);
  await zoomIn(b, 6);
  await b.screenshot({ path: "test-results/screens/vivo-telescopio-objeto-2d.png" });
});
