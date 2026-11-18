import { expect, test, type Browser, type Page } from "./setup.ts";

/**
 * Espaço vivo: o céu real sobre São Paulo nas duas lentes (Terra de dia e de noite, Lua, meteoro das
 * Leônidas no pico de 17/11/2026, pôr e nascer do Sol na borda da Terra), o telescópio e o painel
 * "Agora no espaço" pela busca (Ctrl+K). Usa os ganchos de desenvolvimento `?ceu=` (instante do céu),
 * `?ceuvel=` (velocidade; quase zero congela) e `window.__infinityCam` (aponta a câmera do 3D).
 * Uma janela por vez: cada quadro sai sem os avatares das outras.
 */

const SHOTS = "test-results/screens";
// Velocidade quase zero: o céu fica parado no instante pedido (todas as janelas veem o mesmo quadro).
const FROZEN = "ceuvel=0.0000001";

type W = {
  __infinity: { store: { getState(): { selfId: string | null } }; self: { x: number; z: number }; walkTo(p: { x: number; z: number }): boolean };
  __infinityCam?: (yawDeg: number, pitch?: number, dist?: number) => void;
  __infinitySky?: { meteors: { drawn: number; head: Float32Array } };
};

async function open(browser: Browser, lens: "2d" | "3d", ceu: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto(`/?nome=Ceu&lente=${lens}&ceu=${encodeURIComponent(ceu)}&${FROZEN}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  if (lens === "3d") await page.waitForSelector('[data-ready="true"]', { timeout: 60_000 });
  await page.waitForFunction(() => !!(window as unknown as W).__infinitySky, null, { timeout: 60_000 });
  // Texturas chegam depois do primeiro quadro.
  await page.waitForTimeout(2500);
  return page;
}

const errorsOf = (page: Page) => (page as unknown as { errors: string[] }).errors;

/** Confere que não houve erro na página e fecha a janela. */
async function done(page: Page): Promise<void> {
  expect(errorsOf(page)).toEqual([]);
  await page.context().close();
}

async function aim(page: Page, yawDeg: number, pitch: number, dist: number): Promise<void> {
  await page.evaluate(([y, p, d]) => (window as unknown as W).__infinityCam?.(y!, p, d), [yawDeg, pitch, dist]);
  await page.waitForTimeout(2500);
}

/** 2D: afasta o zoom (a Terra aparece em volta da estação) e gira a vista (Q/R). */
async function iso(page: Page, keys: string[] = []): Promise<void> {
  await page.mouse.move(720, 450);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80);
  }
  for (const k of keys) await page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3).toLowerCase() })), k);
  await page.waitForTimeout(2500);
}

test("céu real: Terra de dia e de noite nas duas lentes", async ({ browser }) => {
  test.setTimeout(240_000);
  // Meio-dia: Sol quase a pino, a Terra clara com nuvens além das janelas.
  const d3 = await open(browser, "3d", "2026-11-17T12:00:00-03:00");
  await aim(d3, 200, 0.6, 22);
  await d3.screenshot({ path: `${SHOTS}/espaco-3d-dia.png` });
  await done(d3);
  const d2 = await open(browser, "2d", "2026-11-17T12:00:00-03:00");
  await iso(d2);
  await d2.screenshot({ path: `${SHOTS}/espaco-2d-dia.png` });
  await done(d2);

  // 23h30: a estação na sombra da Terra; lá embaixo, as luzes das cidades.
  const n3 = await open(browser, "3d", "2026-11-17T23:30:00-03:00");
  await aim(n3, 250, 0.6, 22);
  await n3.screenshot({ path: `${SHOTS}/espaco-3d-noite.png` });
  await done(n3);
  const n2 = await open(browser, "2d", "2026-11-17T23:30:00-03:00");
  await iso(n2, ["KeyR"]);
  await n2.screenshot({ path: `${SHOTS}/espaco-2d-noite.png` });
  await done(n2);
});

test("Lua de quarto crescente se pondo no oeste e o telescópio apontando para ela", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await open(browser, "3d", "2026-11-17T23:59:00-03:00");
  await aim(page, 264, 0.18, 14);
  await page.screenshot({ path: `${SHOTS}/espaco-3d-lua.png` });
  await done(page);

  // 00h30: o Cruzeiro do Sul nasce a sudeste, ao lado do Saco de Carvão da Via Láctea.
  const crux = await open(browser, "3d", "2026-11-18T00:30:00-03:00");
  await aim(crux, 155, 0.18, 14);
  await crux.screenshot({ path: `${SHOTS}/espaco-3d-cruzeiro.png` });
  await done(crux);

  // Telescópio da Diretoria: anda até ele e usa (E).
  const tele = await open(browser, "2d", "2026-11-17T21:30:00-03:00");
  const far = () => tele.evaluate(() => Math.hypot((window as unknown as W).__infinity.self.x - 24.2, (window as unknown as W).__infinity.self.z + 11.7));
  for (let i = 0; i < 4 && (await far()) > 0.8; i++) {
    await tele.evaluate(() => (window as unknown as W).__infinity.walkTo({ x: 24.2, z: -11.7 }));
    const t0 = Date.now();
    while (Date.now() - t0 < 15_000 && (await far()) > 0.8) await tele.waitForTimeout(300);
  }
  expect(await far()).toBeLessThan(0.8);
  await tele.waitForTimeout(600);
  await tele.keyboard.press("KeyE");
  const dialog = tele.getByRole("dialog", { name: "Telescópio" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText("A Lua, daqui da estação");
  await tele.waitForTimeout(8000);
  await tele.screenshot({ path: `${SHOTS}/espaco-telescopio.png` });
  await done(tele);
});

test("meteoro das Leônidas: o mesmo risco, no mesmo lugar, para todo mundo", async ({ browser }) => {
  test.setTimeout(180_000);
  // Instante sorteado pelo calendário (semente = minuto): uma Leônida a meio caminho, ~2° acima do horizonte, a NNE.
  const at = "2026-11-17T07:21:14.724Z";
  const head = (p: Page) => p.evaluate(() => Array.from((window as unknown as W).__infinitySky!.meteors.head.slice(0, 3)));
  const drawn = (p: Page) => p.evaluate(() => (window as unknown as W).__infinitySky!.meteors.drawn);

  const a = await open(browser, "3d", at);
  await expect.poll(() => drawn(a)).toBeGreaterThan(0);
  const ha = await head(a);
  expect((Math.atan2(ha[0]!, -ha[2]!) * 180) / Math.PI).toBeCloseTo(16, -0.5);
  expect((Math.asin(ha[1]!) * 180) / Math.PI).toBeCloseTo(2.3, -0.5);
  await aim(a, 16, 0.18, 14);
  await a.screenshot({ path: `${SHOTS}/espaco-3d-meteoro.png` });
  await done(a);

  // Outra janela, outra lente: o mesmo meteoro no mesmo ponto do céu.
  const b = await open(browser, "2d", at);
  await expect.poll(() => drawn(b)).toBeGreaterThan(0);
  const hb = await head(b);
  for (let i = 0; i < 3; i++) expect(hb[i]!).toBeCloseTo(ha[i]!, 3);
  await iso(b, ["KeyQ"]);
  await b.screenshot({ path: `${SHOTS}/espaco-2d-meteoro.png` });
  await done(b);
});

test("pôr do Sol na borda da Terra (3D) e nascer do Sol (2D)", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await open(browser, "3d", "2026-11-17T18:40:00-03:00");
  await aim(a, 248, 0.18, 22);
  await a.screenshot({ path: `${SHOTS}/espaco-3d-sol.png` });
  await done(a);
  const b = await open(browser, "2d", "2026-11-17T04:21:00-03:00");
  await iso(b, ["KeyQ"]);
  await b.screenshot({ path: `${SHOTS}/espaco-2d-amanhecer.png` });
  await done(b);
});

test("painel Agora no espaço pela busca (Ctrl+K)", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await open(browser, "2d", "2026-11-17T21:30:00-03:00");
  const palette = page.getByRole("dialog", { name: "Buscar e comandos" });
  await page.keyboard.press("Control+KeyK");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("eclipse");
  const option = palette.getByRole("option", { name: /Agora no espaço/ });
  await expect(option).toBeVisible();
  await option.click();

  const panel = page.getByRole("dialog", { name: "Agora no espaço" });
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText("Quarto crescente");
  await expect(panel).toContainText("Na sombra da Terra");
  await expect(panel).toContainText(/Volta ao Sol às \d\d:\d\d/);
  await expect(panel).toContainText("Leônidas");
  await expect(panel).toContainText("pico hoje");
  await expect(panel).toContainText("Solar anular · 06/02/2027", { timeout: 10_000 });
  await expect(panel).toContainText(/Lunar penumbral\s*· 20\/02\/2027/);
  await expect(panel).toContainText("Saturno");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/espaco-painel.png` });

  // Esc fecha.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await done(page);
});
