import { expect, test } from "./setup.ts";

/**
 * Visual oficial (Cinema) com tudo ligado: qualidade Alta (sombras do Sol, oclusão de ambiente,
 * suavização de bordas, brilho, gradação). O navegador de teste começa no leve; aqui força o Alta e
 * confere que as duas lentes abrem sem erro de shader nem de página.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  walkTo(p: { x: number; z: number }): boolean;
}
type W = { __infinity: Hook };

for (const lens of ["3d", "2d"] as const) {
  test(`Cinema em qualidade Alta abre sem erros (${lens.toUpperCase()})`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("infinity.qualidade.v1", "alta");
      } catch {
        /* sem armazenamento */
      }
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/WebSocket|favicon/.test(m.text())) errors.push(m.text());
    });
    await page.goto(`/?nome=Visual&lente=${lens}`);
    await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
    if (lens === "3d") await page.waitForSelector('[role="application"][data-ready="true"]', { timeout: 120_000 });
    await page.evaluate(() => (window as unknown as W).__infinity.walkTo({ x: -18.4, z: 2.5 }));
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `test-results/screens/cinema-alta-${lens}.png` });
    expect(errors).toEqual([]);
  });
}
