import { expect, test, type Page } from "./setup.ts";

/**
 * Áudio e vídeo por pessoa: painel de ajustes (supressão de ruído aplicada na faixa do microfone,
 * medidor com o filtro, prévia da câmera) e volume individual no painel Pessoas.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  media: { state: { getState(): { status: string; mic: boolean } }; processor(): string | null };
}
type W = { __infinity: Hook };

async function enter(page: Page, name: string) {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

const processor = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.media.processor());

test("ajustes de áudio e vídeo valem na hora", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana");
  await enter(b, "Bruno");

  // Microfone ligado: o padrão é a supressão forte (RNNoise) na própria faixa.
  await a.keyboard.press("KeyM");
  await expect.poll(() => processor(a), { timeout: 15_000 }).toBe("infinity-noise-strong");

  // Abre o painel e troca para "Máxima": o filtro muda sem desligar o microfone.
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  const panel = a.getByRole("dialog", { name: "Áudio e vídeo" });
  await expect(panel).toBeVisible();
  await panel.getByRole("radio", { name: /Máxima/ }).click();
  await expect.poll(() => processor(a), { timeout: 15_000 }).toBe("infinity-noise-max");
  expect(await a.evaluate(() => (window as unknown as W).__infinity.media.state.getState().mic)).toBe(true);

  // "Navegador": sai o filtro próprio.
  await panel.getByRole("radio", { name: /Navegador/ }).click();
  await expect.poll(() => processor(a), { timeout: 15_000 }).toBeNull();

  // O medidor do teste mexe com o tom do microfone falso.
  const meter = panel.locator("div.origin-left");
  await expect.poll(() => meter.evaluate((el) => (el as HTMLElement).style.transform), { timeout: 10_000 }).not.toBe("scaleX(0)");

  // Prévia da câmera sob demanda.
  await panel.getByRole("button", { name: "Testar câmera" }).click();
  await expect.poll(() => panel.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 10_000 }).toBeGreaterThan(0);
  await a.screenshot({ path: "test-results/screens/v3-ajustes.png" });
  await a.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Volume individual do Bruno no painel Pessoas, guardado pelo nome.
  await a.getByRole("button", { name: "Pessoas", exact: true }).click();
  await a.getByRole("button", { name: "Volume de Bruno" }).click();
  const slider = a.getByRole("slider", { name: "Volume de Bruno" });
  await slider.fill("50");
  await expect.poll(() => a.evaluate(() => JSON.parse(localStorage.getItem("infinity.media.v1") ?? "{}").people?.bruno)).toBe(0.5);
  await a.screenshot({ path: "test-results/screens/v3-volume-pessoa.png" });
});
