import { expect, test } from "./setup.ts";

/** Guia da estação no mapa ampliado: lista do que fazer, destaque no mapa e "ir até lá". */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
}
type W = { __infinity: Hook };

test("guia da estação: escolher o telescópio leva até ele", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/?nome=Ana&lente=2d");
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });

  await page.getByRole("button", { name: "Ampliar mapa" }).click();
  const guide = page.getByRole("complementary", { name: "O que fazer aqui" });
  await expect(guide).toBeVisible();
  for (const name of ["Quiz Show", "Fliperamas", "Gongo", "Jukebox", "Telescópio"]) await expect(guide.getByRole("button", { name: new RegExp(name) })).toBeVisible();

  const before = await page.evaluate(() => ({ ...(window as unknown as W).__infinity.self }));
  await guide.getByRole("button", { name: /Telescópio/ }).click();
  await expect
    .poll(() => page.evaluate((b) => Math.hypot((window as unknown as W).__infinity.self.x - b.x, (window as unknown as W).__infinity.self.z - b.z), before), { timeout: 20_000 })
    .toBeGreaterThan(2);
  await page.screenshot({ path: "test-results/screens/v3-guia-indo.png" });
});
