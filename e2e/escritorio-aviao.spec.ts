import { expect, test } from "./setup.ts";
import { SHOTS, enter, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Aviãozinho de papel: a Ana escreve para o Bruno, o avião voa da mão dela até ele (que anda
 * durante o voo) e só ele recebe o cartão com o recado. Um avião a cada 10 s por pessoa.
 */
test("aviãozinho: escolher pessoa, voo seguindo quem recebe e cartão só para ela", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);
  await walk(a, { x: 1.0, z: 2.0 + 5.2 }, 0.6);
  await walk(b, { x: 4.6, z: 3.4 }, 0.6);

  await a.getByRole("button", { name: "Aviãozinho de papel" }).click();
  const dialog = a.getByRole("dialog", { name: "Aviãozinho de papel" });
  await expect(dialog).toBeVisible();
  // Com uma pessoa só online, ela já vem escolhida.
  await expect(dialog.getByRole("radio", { name: /Bruno/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("textbox").fill("Bora tomar um café às 16h? ☕");
  await a.screenshot({ path: `${SHOTS}/escritorio-aviao-escrever.png` });
  await dialog.getByRole("button", { name: "Lançar" }).click();
  await expect(dialog).toBeHidden();
  await expect(a.getByText("Aviãozinho a caminho de Bruno.")).toBeVisible({ timeout: 5000 });

  // Bruno anda durante o voo; o avião segue.
  await b.evaluate(() => (window as unknown as W).__infinity.walkTo({ x: 5.6, z: 2.2 }));
  await a.waitForTimeout(900);
  await a.screenshot({ path: `${SHOTS}/escritorio-aviao-voo-2d.png` });
  await b.screenshot({ path: `${SHOTS}/escritorio-aviao-voo-3d.png` });

  const card = b.getByRole("article", { name: "Aviãozinho de Ana" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("Bora tomar um café às 16h?");
  await expect(a.getByRole("article", { name: /Aviãozinho de/ })).toHaveCount(0);
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/escritorio-aviao-cartao.png` });

  // Responder abre o avião já para a Ana.
  await card.getByRole("button", { name: "Responder" }).click();
  const reply = b.getByRole("dialog", { name: "Aviãozinho de papel" });
  await expect(reply.getByRole("radio", { name: /Ana/ })).toHaveAttribute("aria-checked", "true");
  await b.keyboard.press("Escape");
  await expect(reply).toBeHidden();

  // Outro avião logo em seguida: precisa esperar.
  await a.getByRole("button", { name: "Aviãozinho de papel" }).click();
  await a.getByRole("dialog", { name: "Aviãozinho de papel" }).getByRole("textbox").fill("De novo!");
  await a.getByRole("dialog", { name: "Aviãozinho de papel" }).getByRole("button", { name: "Lançar" }).click();
  await expect(a.getByText(/Dobrando o próximo avião/)).toBeVisible({ timeout: 5000 });
});
