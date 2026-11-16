import { expect, test, type Page } from "./setup.ts";
import { SHOTS, actState, enter, objects, walkTo } from "./arcade-util.ts";

/**
 * Bolinha de papel: a Ana pega a bolinha na lixeira da copa, se afasta, mira com o mouse e segura
 * o tempo certo para a força bater com a distância. Cesta conta na sequência e vira recorde do dia;
 * errar zera. O Bruno, por perto, vê a bolinha voar.
 */

const MIN = 0.8;
const MAX = 7.2;
/** Tempo segurando para a força levar a bolinha a `d` metros (a força enche em 1,1 s). */
const holdFor = (d: number) => ((d - MIN) / (MAX - MIN)) * 1100;

async function aimAt(page: Page, x: number, z: number) {
  const p = await page.evaluate(([a, b]) => (window as any).__arcade.paperScreen(a, b), [x, z] as const);
  expect(p).toBeTruthy();
  await page.mouse.move(p.x, p.y, { steps: 4 });
}

test("bolinha de papel: mirar, dar força, acertar, errar e o recorde do dia", async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno", "3d");
  const bins = await objects(ana, "trash-bin");
  // lixeira da copa, perto da cafeteira
  const bin = bins.find((b) => b.zoneId === "cafe" && b.pos.z < 14)!;
  expect(bin, "a copa precisa de uma lixeira").toBeTruthy();
  const spot = { x: bin.pos.x + 4, z: bin.pos.z };

  await Promise.all([walkTo(ana, { x: bin.pos.x + 1.2, z: bin.pos.z }), walkTo(bruno, { x: bin.pos.x + 2.2, z: bin.pos.z + 2.6 })]);
  await expect(ana.getByText("Arremessar bolinha de papel").first()).toBeVisible({ timeout: 5000 });
  await ana.keyboard.press("KeyE");
  await expect(ana.getByRole("group", { name: "Bolinha de papel" })).toBeVisible();
  // a bolinha aparece na mão para todo mundo
  await expect.poll(() => bruno.evaluate(() => Object.values((window as any).__infinity.store.getState().players).some((p: any) => p.name === "Ana" && p.held === "paper"))).toBe(true);

  // Afasta-se 4 m (andar continua valendo com a bolinha na mão) e mira na lixeira.
  await walkTo(ana, spot, 0.2);
  const dist = Math.hypot(spot.x - bin.pos.x, spot.z - bin.pos.z);
  let hits = 0;
  for (let attempt = 0; attempt < 4 && hits === 0; attempt++) {
    await aimAt(ana, bin.pos.x, bin.pos.z);
    await ana.mouse.down();
    await ana.waitForTimeout(holdFor(dist));
    await ana.mouse.up();
    await bruno.waitForTimeout(350);
    if (attempt === 0) await bruno.screenshot({ path: `${SHOTS}/arcade-bolinha-voo-3d.png` });
    await ana.waitForTimeout(900);
    hits = (await actState<{ record: { name: string; streak: number } | null }>(ana, "bolinha")).record?.streak ?? 0;
  }
  expect(hits, "acertar a lixeira com a força certa").toBeGreaterThanOrEqual(1);
  await expect(ana.getByRole("group", { name: "Bolinha de papel" }).getByText(/Recorde de hoje: Ana/)).toBeVisible();
  await ana.screenshot({ path: `${SHOTS}/arcade-bolinha-2d.png` });

  // Pouca força: a bolinha cai no meio do caminho e a sequência zera.
  await ana.waitForTimeout(700);
  await aimAt(ana, bin.pos.x, bin.pos.z);
  await ana.mouse.down();
  await ana.waitForTimeout(60);
  await ana.mouse.up();
  await expect(ana.getByText("Errou", { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(ana.getByText("0 acertos seguidos")).toBeVisible();

  // Esc guarda a bolinha.
  await ana.keyboard.press("Escape");
  await expect(ana.getByRole("group", { name: "Bolinha de papel" })).toBeHidden();
  await expect.poll(() => bruno.evaluate(() => Object.values((window as any).__infinity.store.getState().players).some((p: any) => p.name === "Ana" && p.held === "paper"))).toBe(false);
});
