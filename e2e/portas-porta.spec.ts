import { expect, test } from "./setup.ts";
import { act, audio, enter, forceTo, idOf, portasState, pos, prompt, walk, zoneOf } from "./portas-util.ts";

/**
 * Portas das salas: fechada isola e só entra quem é deixado; trancada barra até quem bate;
 * o servidor devolve quem tenta entrar à força; sala vazia volta a ficar aberta.
 */

const DENTRO = { x: -18.5, z: -2.0 }; // Sala Eclipse
const PORTA_FORA = { x: -17.4, z: -4.9 };
const PORTA_DENTRO = { x: -17.4, z: -3.0 };
const CORREDOR = { x: -16.0, z: -5.6 };

test("porta fechada: isola, bate, deixa entrar; trancada: barra e o servidor devolve", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const caio = await enter(browser, "Caio", false);
  const anaId = await idOf(ana);
  const brunoId = await idOf(bruno);

  await Promise.all([walk(ana, DENTRO), walk(bruno, { x: -17.4, z: -5.3 }), walk(caio, CORREDOR)]);
  expect(await zoneOf(ana)).toBe("eclipse");

  // Ana fecha a porta pelo controle do HUD.
  await ana.getByRole("radio", { name: /Fechada/ }).click();
  await expect.poll(async () => (await portasState(ana))?.doors.eclipse?.state).toBe("closed");
  expect((await portasState(ana))!.doors.eclipse!.admitted).toEqual([anaId]);
  await ana.screenshot({ path: "test-results/screens/portas-porta-fechada-dentro.png" });

  // Sala fechada isola: quem está do lado de fora da porta não recebe a voz e não é ouvido.
  await expect.poll(() => audio(bruno), { timeout: 20_000 }).not.toContain(anaId);
  await expect.poll(() => audio(ana), { timeout: 10_000 }).not.toContain(brunoId);

  // Bruno tenta entrar andando: o caminho para na porta.
  await bruno.evaluate((t) => (window as unknown as { __infinity: { walkTo(p: unknown): boolean } }).__infinity.walkTo(t), DENTRO);
  await bruno.waitForTimeout(2500);
  expect(await zoneOf(bruno)).not.toBe("eclipse");
  await bruno.screenshot({ path: "test-results/screens/portas-porta-fechada-fora.png" });

  // Bruno força a entrada (cliente adulterado): o servidor devolve para fora.
  await forceTo(bruno, PORTA_DENTRO);
  await expect.poll(async () => (await pos(bruno)).z, { timeout: 5000 }).toBeLessThan(-4);
  expect(await zoneOf(bruno)).not.toBe("eclipse");

  // Bate na porta (E); Ana recebe o pedido e deixa entrar; Bruno entra sozinho.
  await walk(bruno, PORTA_FORA);
  await expect.poll(() => prompt(bruno)).toBe("Bater na porta");
  await bruno.keyboard.press("KeyE");
  const card = ana.getByRole("alertdialog", { name: "Bruno bateu" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await ana.screenshot({ path: "test-results/screens/portas-porta-bateu.png" });
  await card.getByRole("button", { name: "Deixar entrar" }).click();
  await expect.poll(() => zoneOf(bruno), { timeout: 15_000 }).toBe("eclipse");
  await expect.poll(() => audio(ana), { timeout: 20_000 }).toContain(brunoId);
  await expect.poll(() => audio(bruno), { timeout: 20_000 }).toContain(anaId);

  // Bilhete na porta, visto por quem chega perto.
  await ana.getByRole("button", { name: /Bilhete na porta/ }).click();
  await ana.getByRole("textbox", { name: /Bilhete na porta/ }).fill("Em entrevista até 15h");
  await ana.getByRole("button", { name: "Pendurar" }).click();
  await expect.poll(async () => (await portasState(ana))?.doors.eclipse?.note).toBe("Em entrevista até 15h");

  // Não perturbe: quem bate recebe o aviso, e a entrada à força volta para fora.
  await ana.getByRole("radio", { name: /Não perturbe/ }).click();
  await expect.poll(async () => (await portasState(ana))?.doors.eclipse?.state).toBe("locked");
  await walk(caio, PORTA_FORA);
  await expect.poll(() => prompt(caio)).toBe("Não perturbe");
  // A Sala Eclipse tem duas entradas: o bilhete aparece nas duas.
  await expect(caio.locator("[data-portas-selo=eclipse]")).toHaveCount(2);
  for (const selo of await caio.locator("[data-portas-selo=eclipse]").all()) await expect(selo).toContainText("Em entrevista até 15h");
  await caio.keyboard.press("KeyE");
  await expect(caio.getByRole("status").filter({ hasText: "Não perturbe · Em entrevista até 15h" })).toBeVisible({ timeout: 5000 });
  await caio.screenshot({ path: "test-results/screens/portas-porta-trancada.png" });
  await forceTo(caio, PORTA_DENTRO);
  await expect.poll(async () => (await pos(caio)).z, { timeout: 5000 }).toBeLessThan(-4);
  expect(await zoneOf(caio)).not.toBe("eclipse");
  // Nem bater por baixo dos panos adianta: ninguém de dentro recebe pedido.
  await act(caio, "bater", { zone: "eclipse" });
  await ana.waitForTimeout(800);
  expect((await portasState(ana))!.doors.eclipse!.knocks).toEqual([]);

  // O mesmo no 3D (visual).
  await caio.evaluate(() => (window as unknown as { __infinity: { store: { getState(): { setLens(l: string): void } } } }).__infinity.store.getState().setLens("3d"));
  await caio.waitForTimeout(5000);
  await caio.screenshot({ path: "test-results/screens/portas-porta-trancada-3d.png" });

  // Todo mundo sai: a sala vazia volta a ficar aberta, sem bilhete.
  await Promise.all([walk(ana, { x: -18.5, z: -5.6 }), walk(bruno, { x: -19.5, z: -5.6 })]);
  await expect.poll(async () => (await portasState(caio))?.doors.eclipse, { timeout: 15_000 }).toMatchObject({ state: "open", note: "" });
});
