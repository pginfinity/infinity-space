import { expect, test, type Page } from "./setup.ts";

/**
 * Compartilhamento de tela: a Ana compartilha dentro da Sala Eclipse; para o Bruno (na mesma sala,
 * ouve a Ana) a tela abre sozinha, grande, na resolução da captura. Ele minimiza, fecha (não reabre
 * sozinha) e reabre pela faixa do topo. Precisa do LiveKit rodando.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  media: {
    state: { getState(): { status: string; screen: boolean; screens: Record<string, HTMLVideoElement> } };
    screenStats(id: string): Promise<{ width: number; height: number; fps: number; codec: string } | null>;
  };
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
  await Promise.all([walk(a, -23.6, 1.2), walk(b, -23.6, 3.4)]);

  // Ana abre o menu, escolhe "Documento" e o navegador (falso) entrega a tela.
  await a.getByRole("button", { name: "Compartilhar a tela" }).click();
  await expect(a.getByRole("menu")).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-tela-menu.png" });
  await a.getByRole("menuitem", { name: /Documento/ }).click();
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.media.state.getState().screen), { timeout: 15_000 }).toBe(true);

  const anaId = await a.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);

  // Bruno recebe a tela e ela abre sozinha, grande (ele ouve a Ana: mesma sala).
  await expect.poll(() => b.evaluate(() => Object.keys((window as unknown as W).__infinity.media.state.getState().screens)), { timeout: 20_000 }).toContain(anaId);
  const viewer = b.getByRole("dialog", { name: /Tela de Ana/ });
  await expect(viewer).toBeVisible({ timeout: 10_000 });
  await expect(b.getByRole("button", { name: "Aumentar zoom" })).toBeVisible();
  // A doca (microfone, câmera) continua à mão com a tela aberta.
  await b.getByRole("button", { name: /microfone/i }).first().click({ trial: true, timeout: 3000 });

  // Resolução: o Bruno recebe a camada de cima, do tamanho que a Ana captura (getStats do receptor).
  const sent = await a.evaluate((id) => {
    const v = (window as unknown as W).__infinity.media.state.getState().screens[id]!;
    return { width: v.videoWidth, height: v.videoHeight };
  }, anaId);
  expect(sent.width).toBeGreaterThan(0);
  await expect
    .poll(async () => (await b.evaluate((id) => (window as unknown as W).__infinity.media.screenStats(id), anaId))?.width ?? 0, { timeout: 20_000, message: `largura recebida = capturada (${sent.width})` })
    .toBe(sent.width);
  await expect.poll(async () => (await b.evaluate((id) => (window as unknown as W).__infinity.media.screenStats(id), anaId))?.fps ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
  const got = await b.evaluate((id) => (window as unknown as W).__infinity.media.screenStats(id), anaId);
  console.log(`[tela] capturada ${sent.width}x${sent.height}; recebida ${got?.width}x${got?.height} a ${got?.fps} q/s (${got?.codec})`);
  await b.waitForTimeout(600);
  await b.screenshot({ path: "test-results/screens/v3-tela-aberta.png" });

  // Minimizar: fica num quadro pequeno; fechar: vai para a faixa do topo e não reabre sozinha.
  await b.getByRole("button", { name: "Minimizar" }).click();
  await expect(b.getByRole("button", { name: "Aumentar zoom" })).toHaveCount(0);
  await b.waitForTimeout(400);
  await b.screenshot({ path: "test-results/screens/v3-tela-mini.png" });
  await viewer.getByRole("button", { name: "Fechar" }).click();
  const thumb = b.getByRole("button", { name: /Tela de Ana/ });
  await expect(thumb).toBeVisible();
  await b.waitForTimeout(1500);
  await expect(viewer).toHaveCount(0);
  // A imagem segue chegando (o vídeo tem quadros).
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

  // Reabre pela faixa, com zoom.
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
