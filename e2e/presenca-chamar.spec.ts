import { expect, test } from "./setup.ts";
import { SHOTS, distance, enter, openPeople, waitOnline, walk } from "./presenca-util.ts";

/**
 * Chamar alguém pelo painel Pessoas: o pedido chega com o nome de quem chamou, "Ir até lá" faz a
 * pessoa andar até perto de quem chamou; o limite de um chamado a cada 20 s; e uma recusa.
 */
test("chamar: pedido, ir até lá, limite de 20 s e recusa", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  const c = await enter(browser, "Carla");
  await waitOnline(a, 3);
  await walk(a, { x: -2, z: 3.5 });
  await walk(b, { x: 5, z: 7.5 });

  await openPeople(a);
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/presenca-painel-pessoas.png` });
  await a.getByRole("button", { name: "Chamar Bruno" }).click();
  await expect(a.getByText("Chamando Bruno…")).toBeVisible({ timeout: 5000 });

  const card = b.getByRole("alertdialog", { name: "Ana está te chamando" });
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText("em Átrio");
  await b.screenshot({ path: `${SHOTS}/presenca-chamado.png` });

  // Um chamado a cada 20 s: o botão fica travado com a contagem, inclusive para outra pessoa.
  await expect(a.getByRole("button", { name: /Dá para chamar de novo em \d+ s/ }).first()).toBeDisabled();

  // Tecla I = "Ir até lá".
  await b.keyboard.press("KeyI");
  await expect(card).toBeHidden();
  await expect(a.getByText("Bruno está vindo.")).toBeVisible({ timeout: 5000 });
  await expect(a.getByText("Chamando Bruno…")).toBeHidden();
  await expect.poll(() => distance(a, b), { timeout: 20_000 }).toBeLessThan(2.2);
  await expect(b.getByText("Você chegou perto de Ana.")).toBeVisible({ timeout: 5000 });
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${SHOTS}/presenca-chegou.png` });

  // Recusa: a Carla chama, o Bruno diz "Agora não".
  await openPeople(c);
  await c.getByRole("button", { name: "Chamar Bruno" }).click();
  const card2 = b.getByRole("alertdialog", { name: "Carla está te chamando" });
  await expect(card2).toBeVisible({ timeout: 5000 });
  await card2.getByRole("button", { name: "Agora não" }).click();
  await expect(card2).toBeHidden();
  await expect(c.getByText("Bruno não pode agora.")).toBeVisible({ timeout: 5000 });

  // Cancelar: a Carla não pode chamar de novo antes dos 20 s.
  await expect(c.getByRole("button", { name: /Dá para chamar de novo/ }).first()).toBeDisabled();
});
