import { expect, test } from "./setup.ts";
import { SHOTS, enter, objectOf, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Botão de deploy: a Ana aperta no Dev Lab e vê a contagem 3-2-1; o foguete decola do berço
 * e cruza o céu dela (2D) e o do Bruno, que está longe, no Átrio (3D). A contagem do mês sobe
 * e não aceita outro aperto logo em seguida.
 */
test("deploy: contagem, foguete para todos e contagem do mês", async ({ browser }) => {
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);

  const button = await objectOf(a, "big-button");
  await walk(a, button.interact!.point, 1.4);
  await expect(a.getByText(/Fazer deploy/).first()).toBeVisible({ timeout: 5000 });
  const before = await a.evaluate(() => ((window as unknown as W).__infinity.acts.state.getState().acts["deploy"]?.state as { count: number }).count);

  await a.keyboard.press("KeyE");
  const cd = a.getByRole("status").filter({ hasText: "Deploy em produção" });
  await expect(cd).toBeVisible({ timeout: 5000 });
  await expect(cd).toContainText("Ana apertou o botão");
  await a.screenshot({ path: `${SHOTS}/escritorio-deploy-contagem.png` });
  // O Bruno está longe: não vê a contagem.
  await expect(b.getByText("Deploy em produção")).toHaveCount(0);

  // Decolagem: aviso para todo mundo com a contagem do mês.
  for (const p of [a, b]) await expect(p.getByText(/Foguete no ar/)).toBeVisible({ timeout: 8000 });
  // O foguete cruza o céu do Bruno (longe) logo depois de subir; no Dev Lab, decola do berço antes.
  await b.waitForTimeout(500);
  await b.screenshot({ path: `${SHOTS}/escritorio-deploy-ceu-3d.png` });
  await a.screenshot({ path: `${SHOTS}/escritorio-deploy-decolagem-2d.png` });
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/escritorio-deploy-ceu-2d.png` });

  await expect.poll(() => b.evaluate(() => ((window as unknown as W).__infinity.acts.state.getState().acts["deploy"]?.state as { count: number }).count)).toBe(before + 1);

  // Apertar de novo logo em seguida: o próximo foguete ainda está encaixando.
  await a.waitForTimeout(500);
  await a.keyboard.press("KeyE");
  await expect(a.getByText(/próximo foguete está encaixando/)).toBeVisible({ timeout: 5000 });
});
