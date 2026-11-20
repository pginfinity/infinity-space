import { expect, test } from "./setup.ts";
import { SHOTS, enter, waitOnline, walk, type W } from "./escritorio-helpers.ts";

type WM = W & { __infinity: { media: { state: { getState(): { audience: number } } } } };

/**
 * Megafone: a Gestora (admin de desenvolvimento, ?admin=1) no Átrio e o Bruno dentro da Eclipse. Sem
 * megafone ela não chega a ele; com o megafone ligado a voz dela chega (a lista de quem ouve sobe) e o
 * Bruno vê quem está falando. O aviso escrito aparece como cartão na tela dele. O Bruno não tem o botão.
 */
test("megafone: admin fala e escreve para todos; o time só recebe", async ({ browser }) => {
  test.setTimeout(120_000);
  const b = await enter(browser, "Bruno", "3d");
  const a = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await a.goto(`/?nome=Gestora&lente=2d&admin=1`);
  await a.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await waitOnline(a, 2);
  await walk(b, { x: -22, z: 2 });
  const audience = () => a.evaluate(() => (window as unknown as WM).__infinity.media.state.getState().audience);
  await expect.poll(audience, { timeout: 5000 }).toBe(0);

  // O Bruno não tem megafone.
  await b.getByRole("button", { name: /pessoas online/ }).click();
  await expect(b.getByRole("button", { name: "Megafone" })).toHaveCount(0);
  await b.keyboard.press("Escape");

  await a.getByRole("button", { name: /pessoas online/ }).click();
  await a.getByRole("button", { name: "Megafone" }).click();
  const dlg = a.getByRole("dialog", { name: "Megafone" });
  await expect(dlg).toBeVisible();

  await dlg.getByRole("button", { name: "Falar para todos" }).click();
  await expect.poll(audience, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await expect(b.getByText("Gestora está falando para todos")).toBeVisible({ timeout: 5000 });
  await expect(a.getByText("Você está falando para todos")).toBeVisible();
  await b.screenshot({ path: `${SHOTS}/escritorio-megafone-3d.png` });
  await dlg.getByRole("button", { name: "Parar" }).click();
  await expect.poll(audience, { timeout: 5000 }).toBe(0);
  await expect(b.getByText("Gestora está falando para todos")).toHaveCount(0, { timeout: 5000 });

  const tag = Date.now() % 10000;
  await dlg.getByRole("textbox", { name: "Aviso escrito" }).fill(`Reunião geral às 15h #${tag}`);
  await dlg.getByRole("button", { name: "Avisar todos" }).click();
  await expect(dlg.getByRole("textbox", { name: "Aviso escrito" })).toHaveValue("");
  const card = b.getByText(`Reunião geral às 15h #${tag}`);
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(b.getByText("Aviso de Gestora")).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/escritorio-megafone-admin.png` });
  await b.getByRole("button", { name: "Fechar aviso" }).click();
  await expect(card).toHaveCount(0);
});
