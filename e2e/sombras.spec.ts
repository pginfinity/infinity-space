import { expect, test } from "./setup.ts";

/**
 * Sombras do Sol acompanham quem anda: o quadro de sombra segue a câmera e é refeito a cada quadro.
 * Força o visual Cinema com sombras (o navegador de teste começa no leve) e o céu de manhã, anda pela
 * estação e confere, a cada parada, que a pessoa está dentro do quadro de sombra (longe da borda,
 * onde a sombra desvanece). Os screenshots ficam para olhar.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
}
type W = { __infinity: Hook; __infinityScene?: { traverse(cb: (o: unknown) => void): void } };

for (const lens of ["2d", "3d"] as const) {
  test(`sombra acompanha quem anda (${lens.toUpperCase()})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("infinity.qualidade.v1", "auto");
      } catch {
        /* sem armazenamento */
      }
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // (SOMBRAS_CEU troca a hora do céu, para olhar a sombra com o Sol baixo)
    const ceu = process.env.SOMBRAS_CEU ?? "2026-11-18T10:30:00-03:00";
    await page.goto(`/?nome=Sombra&lente=${lens}&visual=cinema&quadros&ceu=${encodeURIComponent(ceu)}`);
    await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
    if (lens === "3d") await page.waitForSelector('[role="application"][data-ready="true"]', { timeout: 120_000 });
    await page.waitForTimeout(2500);

    // Onde a pessoa cai no quadro de sombra (0 a 1 nos dois eixos; fora disso, sem sombra).
    const inFrame = () =>
      page.evaluate(() => {
        const w = window as unknown as W;
        let found: number[] | null = null;
        w.__infinityScene?.traverse((o) => {
          const l = o as { isDirectionalLight?: boolean; castShadow?: boolean; shadow?: { matrix: { elements: number[] } } };
          if (l.isDirectionalLight && l.castShadow && l.shadow) found = l.shadow.matrix.elements;
        });
        if (!found) return null;
        const e = found as number[];
        const { x, z } = w.__infinity.self;
        const y = 0.9;
        const u = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        const v = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        return [u, v];
      });

    const stops = [
      { x: -8, z: 4 },
      { x: -18.4, z: 2.5 },
    ];
    let i = 0;
    for (const stop of stops) {
      await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), stop);
      // no meio do caminho e na chegada
      for (const wait of [900, 3500]) {
        await page.waitForTimeout(wait);
        await page.screenshot({ path: `test-results/screens/sombras-${lens}-${i++}.png` });
        const uv = await inFrame();
        expect(uv, "luz do Sol com sombra").not.toBeNull();
        for (const c of uv!) {
          expect(c).toBeGreaterThan(0.1);
          expect(c).toBeLessThan(0.9);
        }
      }
    }
    expect(errors).toEqual([]);
  });
}
