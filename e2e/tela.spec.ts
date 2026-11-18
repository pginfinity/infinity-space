import { expect, test, type Page } from "./setup.ts";

/**
 * Compartilhamento de tela: a Ana compartilha dentro da Sala Eclipse, o Bruno (na mesma sala)
 * recebe a tela, vê na faixa do topo e abre em tela cheia. Precisa do LiveKit rodando.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  media: { state: { getState(): { status: string; screen: boolean; screens: Record<string, HTMLVideoElement> } } };
}
type W = { __infinity: Hook };

async function enter(page: Page, name: string) {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

async function walk(page: Page, x: number, z: number) {
  await page.evaluate(([x, z]) => (window as unknown as W).__infinity.walkTo({ x: x!, z: z! }), [x, z]);
  await expect
    .poll(() => page.evaluate(([x, z]) => Math.hypot((window as unknown as W).__infinity.self.x - x!, (window as unknown as W).__infinity.self.z - z!), [x, z]), { timeout: 30_000 })
    .toBeLessThan(0.6);
}

test("compartilha a tela na sala de reunião", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana");
  await enter(b, "Bruno");

  // Os dois entram na Sala Eclipse.
  await Promise.all([walk(a, -21, 1.6), walk(b, -23, 1.6)]);

  // Ana abre o menu, escolhe "Documento" e o navegador (falso) entrega a tela.
  await a.getByRole("button", { name: "Compartilhar a tela" }).click();
  await expect(a.getByRole("menu")).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-tela-menu.png" });
  await a.getByRole("menuitem", { name: /Documento/ }).click();
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.media.state.getState().screen), { timeout: 15_000 }).toBe(true);

  const anaId = await a.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);

  // Bruno recebe a tela e ela aparece na faixa do topo.
  await expect.poll(() => b.evaluate(() => Object.keys((window as unknown as W).__infinity.media.state.getState().screens)), { timeout: 20_000 }).toContain(anaId);
  const thumb = b.getByRole("button", { name: /Tela de Ana/ });
  await expect(thumb).toBeVisible();
  // A imagem chega de fato (o vídeo tem quadros).
  await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.media.state.getState().screens[id]?.videoWidth ?? 0, anaId), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect
    .poll(() =>
      b.evaluate(() => {
        let o = (window as any).__infinity.tvs.mesh("eclipse");
        const isVideo = o?.material?.map?.isVideoTexture === true;
        while (o?.parent) o = o.parent;
        return isVideo && o?.type === "Scene";
      }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await b.waitForTimeout(800);
  await b.screenshot({ path: "test-results/screens/v3-tela-sala.png" });

  // Tela cheia com zoom.
  await thumb.click();
  await expect(b.getByRole("button", { name: "Aumentar zoom" })).toBeVisible();
  await b.getByRole("button", { name: "Aumentar zoom" }).click();
  await b.waitForTimeout(500);
  await b.screenshot({ path: "test-results/screens/v3-tela-cheia.png" });

  // Caneta: a Ana abre a própria tela em tela cheia; o Bruno risca e o traço aparece para ela.
  await a.getByRole("button", { name: /Sua tela/ }).click();
  await b.getByRole("button", { name: "Caneta" }).click();
  const pad = (await b.locator("canvas.cursor-crosshair").boundingBox())!;
  await b.mouse.move(pad.x + pad.width * 0.3, pad.y + pad.height * 0.4);
  await b.mouse.down();
  for (let i = 1; i <= 8; i++) await b.mouse.move(pad.x + pad.width * (0.3 + i * 0.04), pad.y + pad.height * (0.4 + (i % 2) * 0.05));
  await b.mouse.up();
  const painted = (p: typeof a) =>
    p.evaluate(() => {
      const c = [...document.querySelectorAll("canvas")].find((x) => x.className.includes("rounded-lg") && x.getAttribute("aria-hidden") === "true") as HTMLCanvasElement | undefined;
      if (!c || !c.width) return 0;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i]! > 40) n++;
      return n;
    });
  await expect.poll(() => painted(a), { timeout: 5000, message: "traço do Bruno na tela da Ana" }).toBeGreaterThan(20);
  await a.screenshot({ path: "test-results/screens/v3-tela-caneta.png" });
  await a.keyboard.press("Escape");
  await b.keyboard.press("Escape");

  // Ana para: some do Bruno.
  await a.getByRole("button", { name: "Parar de compartilhar a tela" }).click();
  await expect.poll(() => b.evaluate(() => Object.keys((window as unknown as W).__infinity.media.state.getState().screens)), { timeout: 15_000 }).not.toContain(anaId);
  await expect(thumb).toHaveCount(0);
});
