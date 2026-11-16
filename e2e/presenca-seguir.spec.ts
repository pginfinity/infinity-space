import { expect, test, type Page } from "./setup.ts";
import { SHOTS, distance, enter, openPeople, waitOnline, walk, type W } from "./presenca-util.ts";

/**
 * Seguir com aceite: sem topar não segue; topando, quem segue anda atrás (a ~1,2 m) de quem é
 * seguido; para com Esc, com o "Parar" de quem é seguido e com qualquer movimento manual.
 */

const following = (p: Page) => p.evaluate(() => (window as unknown as W).__presenca.store.getState().following?.leader ?? null);
const followers = (p: Page) => p.evaluate(() => Object.keys((window as unknown as W).__presenca.store.getState().followers).length);

async function askAndAccept(a: Page, b: Page, walkingTo?: { x: number; z: number }): Promise<void> {
  await openPeople(b);
  await b.getByRole("button", { name: "Seguir Ana" }).click();
  await expect(b.getByText("Pedido para seguir Ana…")).toBeVisible({ timeout: 5000 });
  const card = a.getByRole("alertdialog", { name: "Bruno quer te seguir" });
  await expect(card).toBeVisible({ timeout: 5000 });
  // Quem pediu pode estar andando quando a outra pessoa topa: o seguir assume a rota.
  if (walkingTo) await b.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), walkingTo);
  await card.getByRole("button", { name: "Deixar" }).click();
  await expect(b.getByText(/Seguindo Ana/).first()).toBeVisible({ timeout: 5000 });
  await expect(a.getByText("Bruno está te seguindo")).toBeVisible({ timeout: 5000 });
}

test("seguir: com aceite, anda atrás, para com Esc, com o Parar e com movimento manual", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await enter(browser, "Ana", "3d");
  const b = await enter(browser, "Bruno", "2d");
  await waitOnline(a, 2);
  await walk(a, { x: -2, z: 3.5 });
  await walk(b, { x: 4, z: 7.5 });

  // Recusa: não segue.
  await openPeople(b);
  await b.getByRole("button", { name: "Seguir Ana" }).click();
  const card = a.getByRole("alertdialog", { name: "Bruno quer te seguir" });
  await expect(card).toBeVisible({ timeout: 5000 });
  await a.screenshot({ path: `${SHOTS}/presenca-seguir-pedido-3d.png` });
  await card.getByRole("button", { name: "Agora não" }).click();
  await expect(b.getByText("Ana recusou o pedido para seguir.")).toBeVisible({ timeout: 5000 });
  expect(await following(b)).toBeNull();

  // Topa: Bruno anda atrás da Ana até o Marketing Studio.
  await b.waitForTimeout(3100);
  await askAndAccept(a, b);
  await walk(a, { x: -9, z: 2 }, 0.6);
  await expect.poll(() => distance(a, b), { timeout: 20_000 }).toBeLessThan(2.1);
  // Não fica em cima: guarda a distância.
  expect(await distance(a, b)).toBeGreaterThan(0.7);
  await b.waitForTimeout(800);
  await b.screenshot({ path: `${SHOTS}/presenca-seguindo-2d.png` });
  await a.screenshot({ path: `${SHOTS}/presenca-seguida-3d.png` });

  // Esc para (dos dois lados).
  await b.keyboard.press("Escape");
  await expect.poll(() => following(b)).toBeNull();
  await expect.poll(() => followers(a), { timeout: 5000 }).toBe(0);
  await expect(a.getByText("Bruno parou de te seguir.")).toBeVisible({ timeout: 5000 });

  // Quem é seguido para pelo botão.
  await b.waitForTimeout(3100);
  await askAndAccept(a, b);
  await a.getByRole("status").filter({ hasText: "Bruno está te seguindo" }).getByRole("button", { name: "Parar" }).click();
  await expect.poll(() => following(b), { timeout: 5000 }).toBeNull();
  await expect(b.getByText("Ana parou o seguir.")).toBeVisible({ timeout: 5000 });

  // Movimento manual para.
  await b.waitForTimeout(3100);
  await askAndAccept(a, b);
  await b.keyboard.down("KeyS");
  await b.waitForTimeout(300);
  await b.keyboard.up("KeyS");
  await expect.poll(() => following(b), { timeout: 5000 }).toBeNull();
  await expect.poll(() => followers(a), { timeout: 5000 }).toBe(0);
  await expect(b.getByText("Você parou de seguir Ana.")).toBeVisible({ timeout: 5000 });
});

/** O seguir não leva ninguém para dentro de uma cabine individual: espera na porta e volta a seguir quando a pessoa sai. */
test("seguir: espera na porta da cabine de foco e volta a seguir na saída", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "2d");
  await waitOnline(a, 2);
  await walk(a, { x: 20.5, z: 1 }, 0.6);
  await walk(b, { x: 20.5, z: 5 }, 0.6);
  await askAndAccept(a, b, { x: 10, z: 10.5 });
  await b.waitForTimeout(1500);
  expect(await following(b)).not.toBeNull();
  await expect.poll(() => distance(a, b), { timeout: 15_000 }).toBeLessThan(2.1);

  const zoneOf = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.world().zones.zoneAt((window as unknown as W).__infinity.self)?.id ?? null);
  const waiting = (p: Page) => p.evaluate(() => (window as unknown as W).__presenca.store.getState().following?.waiting ?? null);

  // Ana entra na Cabine 1 (para uma pessoa): Bruno para do lado de fora e avisa que está esperando.
  await walk(a, { x: 24, z: -2.4 }, 0.5);
  expect(await zoneOf(a)).toBe("foco-1");
  await expect.poll(() => waiting(b), { timeout: 15_000 }).toBe(true);
  await b.waitForTimeout(1500);
  expect(await zoneOf(b)).not.toBe("foco-1");
  await expect(b.getByText(/esperando na porta/)).toBeVisible();
  await b.screenshot({ path: `${SHOTS}/presenca-seguir-porta.png` });

  // Ana sai: Bruno volta a seguir.
  await walk(a, { x: 20.5, z: 6 }, 0.6);
  await expect.poll(() => waiting(b), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => distance(a, b), { timeout: 20_000 }).toBeLessThan(2.1);
  expect(await following(b)).not.toBeNull();
});
