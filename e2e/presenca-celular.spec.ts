import { expect, test } from "./setup.ts";
import { SHOTS, enter, openPeople, waitOnline, type W } from "./presenca-util.ts";

/** No celular: o chamado chega legível e tocável, o painel Pessoas tem os botões e a busca abre pela doca. */
test("celular: chamado, painel Pessoas e busca pela doca", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const a = await ctx.newPage();
  await a.goto("/?nome=Ana&lente=2d");
  await a.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId && !!(window as unknown as Partial<W>).__presenca, null, { timeout: 30_000 });
  const b = await enter(browser, "Bruno");
  await waitOnline(b, 2);

  // Bruno chama a Ana: o cartão cabe na tela do celular.
  await openPeople(b);
  await b.getByRole("button", { name: "Chamar Ana" }).click();
  const card = a.getByRole("alertdialog", { name: "Bruno está te chamando" });
  await expect(card).toBeVisible({ timeout: 5000 });
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await a.screenshot({ path: `${SHOTS}/presenca-celular-chamado.png` });
  await card.getByRole("button", { name: "Agora não" }).tap();
  await expect(card).toBeHidden();

  // Painel Pessoas com Ir até / Chamar / Seguir.
  await openPeople(a);
  await expect(a.getByRole("button", { name: "Seguir Bruno" })).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/presenca-celular-pessoas.png` });
  await a.getByRole("button", { name: "Fechar" }).first().tap();

  // Busca pela doca.
  await a.getByRole("button", { name: "Buscar e comandos (Ctrl+K)" }).tap();
  const dialog = a.getByRole("dialog", { name: "Buscar e comandos" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("copa");
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/presenca-celular-busca.png` });
  await dialog.getByRole("option").first().tap();
  await expect(dialog).toBeHidden();
});
