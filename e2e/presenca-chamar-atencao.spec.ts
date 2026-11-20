import { expect, test } from "./setup.ts";
import { SHOTS, distance, enter, openPeople, statusOf, waitOnline, walk } from "./presenca-util.ts";

/**
 * Chamar a atenção: o chamado toma a tela de quem está disponível e só fecha por uma escolha
 * (vou aí, chama aqui, agora não com recado, responder no chat); quem chamou recebe a resposta.
 * Em Foco ou Não perturbe, nada toma a tela: sobra um lembrete discreto quando a pessoa sai do modo.
 */

test("chamado em tela cheia: chama aqui, recado rápido e responder no chat", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  const c = await enter(browser, "Carla");
  const d = await enter(browser, "Davi");
  await waitOnline(a, 4);
  await walk(a, { x: -2, z: 3.5 });
  await walk(b, { x: 5, z: 7.5 });

  // Ana chama: a tela do Bruno é tomada pelo chamado, com o rosto e o lugar de quem chamou.
  await openPeople(a);
  await a.getByRole("button", { name: "Chamar Bruno" }).click();
  const card = b.getByRole("alertdialog", { name: "Ana está te chamando" });
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText("em Átrio");
  for (const name of ["Vou aí", "Chama aqui", "Responder no chat", "Agora não", "Em reunião"]) await expect(card.getByRole("button", { name })).toBeVisible();
  // A camada cobre a tela toda: o escritório por baixo não recebe cliques.
  const cover = await b.evaluate(() => document.elementFromPoint(20, 450)?.closest(".fixed")?.getBoundingClientRect().toJSON());
  expect(cover).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
  // Esc não fecha: só uma escolha fecha.
  await b.keyboard.press("Escape");
  await expect(card).toBeVisible();
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/chamado-tela-cheia.png` });

  // "Chama aqui": quem anda é a Ana.
  await card.getByRole("button", { name: "Chama aqui" }).click();
  await expect(card).toBeHidden();
  await expect(a.getByText("Bruno pediu para você ir até lá.")).toBeVisible({ timeout: 5000 });
  await expect(b.getByText("Ana está vindo.")).toBeVisible({ timeout: 5000 });
  await expect.poll(() => distance(a, b), { timeout: 20_000 }).toBeLessThan(2.2);
  await expect(a.getByText("Você chegou perto de Bruno.")).toBeVisible({ timeout: 5000 });

  // Recado rápido: a Carla recebe o "Agora não" com o recado.
  await openPeople(c);
  await c.getByRole("button", { name: "Chamar Bruno" }).click();
  const card2 = b.getByRole("alertdialog", { name: "Carla está te chamando" });
  await expect(card2).toBeVisible({ timeout: 5000 });
  await card2.getByRole("button", { name: "Em reunião" }).click();
  await expect(card2).toBeHidden();
  await expect(c.getByText("Bruno não pode agora: “Em reunião”")).toBeVisible({ timeout: 5000 });
  // A mesma pessoa, no máximo uma vez por minuto (o servidor responde quanto falta).
  await c.waitForTimeout(500);

  // Responder no chat: o Davi fica sabendo e a conversa com ele abre para o Bruno.
  await openPeople(d);
  await d.getByRole("button", { name: "Chamar Bruno" }).click();
  const card3 = b.getByRole("alertdialog", { name: "Davi está te chamando" });
  await expect(card3).toBeVisible({ timeout: 5000 });
  await card3.getByRole("button", { name: "Responder no chat" }).click();
  await expect(card3).toBeHidden();
  await expect(d.getByText("Bruno vai responder no chat.")).toBeVisible({ timeout: 5000 });
  await expect(b.getByRole("log", { name: "Mensagem para Davi" })).toBeVisible({ timeout: 5000 });
});

test("em Foco e em Não perturbe: nada toma a tela, e o lembrete aparece ao sair do modo", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  const c = await enter(browser, "Carla");
  await waitOnline(a, 3);
  const ida = await a.evaluate(() => (window as unknown as { __infinity: { store: { getState(): { selfId: string } } } }).__infinity.store.getState().selfId);

  // Ana em Foco. Bruno chama: ele fica sabendo; a tela da Ana não muda e nada aparece ainda.
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  const settings = a.getByRole("dialog", { name: "Áudio e vídeo" });
  await settings.getByRole("radio", { name: "Foco" }).click();
  await expect.poll(() => statusOf(b, ida), { timeout: 5000 }).toBe("focus");
  await openPeople(b);
  await b.getByRole("button", { name: "Chamar Ana" }).click();
  await expect(b.getByText("Ana está em foco agora e vai ver o seu chamado depois.")).toBeVisible({ timeout: 5000 });
  await a.waitForTimeout(800);
  await expect(a.getByRole("alertdialog")).toHaveCount(0);
  await expect(a.getByText("Bruno te chamou")).toHaveCount(0);

  // Saiu do Foco: o lembrete discreto aparece, com "Chamar de volta".
  await settings.getByRole("radio", { name: "Disponível" }).click();
  await expect(a.getByText("Bruno te chamou")).toBeVisible({ timeout: 5000 });
  await expect(a.getByRole("button", { name: "Chamar de volta" })).toBeVisible();
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/chamado-nota-foco.png` });
  await a.getByRole("button", { name: "Dispensar" }).click();
  await expect(a.getByText("Bruno te chamou")).toHaveCount(0);

  // Carla numa sala com Não perturbe: a Ana chama, nada toma a tela; ao sair da sala, o lembrete.
  await walk(c, { x: -18.5, z: -2.0 });
  await c.getByRole("radio", { name: /Não perturbe/ }).click();
  await openPeople(a);
  await a.getByRole("button", { name: "Chamar Carla" }).click();
  await expect(a.getByText("Carla está em foco agora e vai ver o seu chamado depois.")).toBeVisible({ timeout: 5000 });
  await c.waitForTimeout(800);
  await expect(c.getByRole("alertdialog")).toHaveCount(0);
  await expect(c.getByText("Ana te chamou")).toHaveCount(0);
  await walk(c, { x: -16.0, z: -5.6 });
  await expect(c.getByText("Ana te chamou")).toBeVisible({ timeout: 5000 });
  await c.waitForTimeout(300);
  await c.screenshot({ path: `${SHOTS}/chamado-nota-dnd.png` });
});
