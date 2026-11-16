import { expect, test } from "./setup.ts";
import { SHOTS, enter, selfId, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Toca aqui, brinde e abraço: a Ana chega perto do Bruno, escolhe o gesto, o Bruno topa com T;
 * os dois se viram um para o outro e fazem o gesto juntos, com efeito, nas duas lentes.
 * Depois, um brinde pelo botão e um abraço recusado.
 */
test("toca aqui: convite, topar com T, gesto dos dois e recusa", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);
  const ida = await selfId(a);
  const idb = await selfId(b);
  await walk(a, { x: 3.0, z: 6.6 }, 0.4);
  await walk(b, { x: 4.25, z: 6.4 }, 0.4);

  // O alvo dinâmico aparece com o nome da pessoa.
  await expect(a.getByText("Toca aqui com Bruno")).toBeVisible({ timeout: 8000 });
  await a.keyboard.press("KeyE");
  const chooser = a.getByRole("dialog", { name: "Com Bruno" });
  await expect(chooser).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/escritorio-toca-escolha.png` });
  // Tecla 1 = toca aqui (sem disparar o emote 1 da barra).
  await a.waitForTimeout(150);
  await a.keyboard.press("Digit1");
  await expect(chooser).toBeHidden();
  await expect(a.getByText(/Toca aqui com Bruno: esperando/)).toBeVisible({ timeout: 5000 });

  const card = b.getByRole("alertdialog", { name: "Ana quer bater um toca aqui" });
  await expect(card).toBeVisible({ timeout: 5000 });
  await b.screenshot({ path: `${SHOTS}/escritorio-toca-convite.png` });
  await b.keyboard.press("KeyT");
  await expect(card).toBeHidden();
  await b.waitForTimeout(350);
  await b.screenshot({ path: `${SHOTS}/escritorio-toca-efeito-3d.png` });
  await expect(a.getByText(/esperando/)).toBeHidden({ timeout: 5000 });

  // Os dois se viram um para o outro.
  await expect
    .poll(async () => {
      const [pa, pb] = await Promise.all([a.evaluate(() => ({ ...(window as unknown as W).__infinity.self })), b.evaluate(() => ({ ...(window as unknown as W).__infinity.self }))]);
      const want = Math.atan2(pb.x - pa.x, -(pb.z - pa.z));
      const d = Math.atan2(Math.sin(want - pa.yaw), Math.cos(want - pa.yaw));
      return Math.abs(d);
    })
    .toBeLessThan(0.3);
  await a.screenshot({ path: `${SHOTS}/escritorio-toca-2d.png` });
  await b.screenshot({ path: `${SHOTS}/escritorio-toca-3d.png` });
  void ida;
  void idb;

  // Brinde pelo botão.
  await a.waitForTimeout(1500);
  await a.keyboard.press("KeyE");
  await a.getByRole("dialog", { name: "Com Bruno" }).getByRole("button", { name: /Brinde/ }).click();
  await b.getByRole("alertdialog", { name: "Ana quer fazer um brinde" }).getByRole("button", { name: /Topar/ }).click();
  await b.waitForTimeout(900);
  await b.screenshot({ path: `${SHOTS}/escritorio-toca-brinde-3d.png` });
  await a.screenshot({ path: `${SHOTS}/escritorio-toca-brinde-2d.png` });

  // Abraço recusado: a Ana fica sabendo.
  await a.waitForTimeout(1500);
  await a.keyboard.press("KeyE");
  await a.waitForTimeout(150);
  await a.keyboard.press("Digit3");
  const hug = b.getByRole("alertdialog", { name: "Ana quer te dar um abraço" });
  await expect(hug).toBeVisible({ timeout: 5000 });
  await hug.getByRole("button", { name: "Agora não" }).click();
  await expect(a.getByText("Bruno não pôde agora.")).toBeVisible({ timeout: 5000 });
});
