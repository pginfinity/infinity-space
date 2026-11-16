import { expect, test } from "./setup.ts";
import { SHOTS, distance, enter, openPeople, pos, selfId, waitOnline, walk, type W } from "./presenca-util.ts";

/**
 * Teleporte só com convite: sem chamado aceito, o pedido de teleporte não move ninguém; depois de
 * topar um chamado de longe, "Teleportar" leva a pessoa a um lugar livre perto de quem chamou,
 * uma vez só.
 */
test("teleporte: só depois de topar o chamado, para perto de quem chamou, uma vez", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  await waitOnline(a, 2);
  const ida = await selfId(a);

  // Ana vai para o Arcade; Bruno fica perto do Átrio (bem mais de 22 m de caminho).
  await walk(a, { x: -19, z: 17 }, 0.8);
  await walk(b, { x: 4, z: 3 });

  // Sem convite: nada acontece (espera terminar a rota antes de medir).
  await b.waitForTimeout(1200);
  const before = await pos(b);
  await b.evaluate((id) => (window as unknown as W).__infinity.acts.send("chamado", "teleport", { from: id }), ida);
  await b.waitForTimeout(2000);
  const still = await pos(b);
  expect(Math.hypot(still.x - before.x, still.z - before.z)).toBeLessThan(0.3);
  expect(await b.evaluate(() => (window as unknown as W).__presenca.controlMode())).toBeNull();

  // Ana chama; Bruno topa e vê a opção de teleportar.
  await openPeople(a);
  await a.getByRole("button", { name: "Chamar Bruno" }).click();
  const card = b.getByRole("alertdialog", { name: "Ana está te chamando" });
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText("em Arcade");
  await card.getByRole("button", { name: /Ir até lá/ }).click();
  const chip = b.getByRole("status").filter({ hasText: "Indo até Ana" });
  await expect(chip).toBeVisible({ timeout: 5000 });
  await expect(chip.getByRole("button", { name: "Teleportar" })).toBeVisible();
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/presenca-teleporte-oferta.png` });

  await chip.getByRole("button", { name: "Teleportar" }).click();
  await expect.poll(() => distance(a, b), { timeout: 20_000 }).toBeLessThan(3.2);
  await expect(chip).toBeHidden({ timeout: 5000 });
  // Ana vê o Bruno chegar perto (a posição passou pelo servidor).
  const idb = await selfId(b);
  await expect
    .poll(async () => {
      const [pa, pb] = await Promise.all([pos(a), a.evaluate((id) => (window as unknown as W).__infinity.sampleRemote(id), idb)]);
      return pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : 99;
    }, { timeout: 8000 })
    .toBeLessThan(3.4);
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/presenca-teleporte-chegou.png` });

  // Segunda vez: o convite já foi usado. Bruno se afasta e pede de novo: não sai do lugar.
  await walk(b, { x: -15, z: 13.5 }, 0.8);
  await b.waitForTimeout(1200);
  const again = await pos(b);
  await b.evaluate((id) => (window as unknown as W).__infinity.acts.send("chamado", "teleport", { from: id }), ida);
  await b.waitForTimeout(2000);
  const after = await pos(b);
  expect(Math.hypot(after.x - again.x, after.z - again.z)).toBeLessThan(0.3);
});
