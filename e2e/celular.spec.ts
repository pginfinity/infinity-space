import { devices } from "@playwright/test";
import { expect, test } from "./setup.ts";

/** Celular (2D): a doca cabe na tela, tocar no chão anda, e o menu "Mais" dá acesso ao resto. */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
}
type W = { __infinity: Hook };

test("no celular a doca cabe e tocar no chão anda", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.grantPermissions(["microphone", "camera"]);
  const page = await ctx.newPage();
  await page.goto("/?nome=Ana&lente=2d");
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  // Toda a doca dentro da tela.
  const vw = page.viewportSize()!.width;
  const dock = page.getByRole("toolbar", { name: "Controles" });
  const box = (await dock.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  for (const b of await dock.getByRole("button").all()) {
    if (!(await b.isVisible())) continue;
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(vw);
  }
  await page.screenshot({ path: "test-results/screens/v3-celular.png" });

  // Tocar no chão, acima do avatar, faz andar.
  const before = await page.evaluate(() => ({ ...(window as unknown as W).__infinity.self }));
  await page.touchscreen.tap(vw / 2 + 40, page.viewportSize()!.height / 2 - 120);
  await expect
    .poll(() => page.evaluate((b) => Math.hypot((window as unknown as W).__infinity.self.x - b.x, (window as unknown as W).__infinity.self.z - b.z), before), { timeout: 10_000 })
    .toBeGreaterThan(0.5);

  // Menu "Mais": abre os ajustes de áudio e vídeo.
  await page.getByRole("button", { name: "Mais opções" }).tap();
  await page.getByRole("menuitem", { name: "Áudio e vídeo" }).tap();
  await expect(page.getByRole("dialog", { name: "Áudio e vídeo" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/v3-celular-ajustes.png" });
});
