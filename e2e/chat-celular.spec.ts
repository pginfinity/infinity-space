import { expect, test } from "./setup.ts";
import { tag, SHOTS, composer, dock, enter, panel, say } from "./chat-util.ts";

/**
 * Chat no celular: o botão cabe na doca, o painel ocupa a tela e o campo fica acima do teclado
 * virtual (simulado encolhendo a área visível).
 */
test("celular: painel em tela cheia e campo acima do teclado", async ({ browser }) => {
  const RUN = tag();
  const page = await enter(browser, "Ana", "2d", { mobile: true });
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;

  const btn = dock(page);
  await expect(btn).toBeVisible();
  const r = (await btn.boundingBox())!;
  expect(r.x + r.width).toBeLessThanOrEqual(vw);
  await btn.tap();
  await expect(panel(page)).toBeVisible();
  const p = (await panel(page).boundingBox())!;
  expect(p.width).toBeGreaterThanOrEqual(vw - 1);
  expect(p.height).toBeGreaterThanOrEqual(vh - 1);
  // No celular o campo não abre o teclado sozinho.
  await expect(composer(page)).not.toBeFocused();

  await composer(page).tap();
  await say(page, `Chegando no escritório em 10 min ${RUN}`);
  await expect(panel(page).getByRole("log").getByText(`Chegando no escritório em 10 min ${RUN}`)).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/chat-celular.png` });

  // Teclado virtual: a área visível encolhe 40%; o campo continua visível acima dele.
  await page.setViewportSize({ width: vw, height: Math.round(vh * 0.6) });
  await page.waitForTimeout(300);
  const c = (await composer(page).boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(Math.round(vh * 0.6));
  await page.screenshot({ path: `${SHOTS}/chat-celular-teclado.png` });

  // Fechar pelo X.
  await panel(page).getByRole("button", { name: "Fechar chat (Esc)" }).tap();
  await expect(panel(page)).toBeHidden();
});
