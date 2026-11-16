import { expect, test, type Page } from "./setup.ts";
import { SHOTS, actState, enter, objects, settle, walkTo, type Obj } from "./arcade-util.ts";

/**
 * Fliperamas: a Ana joga Cauda de Cometa de verdade até bater, depois uma partida pontuada entra no
 * ranking do escritório (o servidor confere a pontuação). Bruno vê a máquina ocupada e o placar do
 * Arcade no mundo. Os outros dois jogos abrem, começam e pausam.
 */

interface Cab {
  boards: Record<string, Array<{ name: string; score: number }>>;
  busy: Record<string, string>;
}

const GAME_OF_VARIANT = ["faxina", "cometa", "estilhaco"];
const NAMES: Record<string, string> = { faxina: "Faxina Orbital", cometa: "Cauda de Cometa", estilhaco: "Estilhaço" };

/** Em pé na frente da máquina (elas olham para o oeste). */
const front = (m: Obj) => ({ x: m.pos.x - 0.95, z: m.pos.z });

async function openMachine(page: Page, m: Obj, name: string) {
  await walkTo(page, front(m), 0.35);
  await expect(page.getByText(`Jogar ${name}`).first()).toBeVisible({ timeout: 5000 });
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

test("fliperamas: jogar, bater, pontuar no ranking e ver as telas no mundo", async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno", "3d");
  const machines = await objects(ana, "arcade");
  const byGame = Object.fromEntries(machines.map((m) => [GAME_OF_VARIANT[(m.variant ?? 0) % 3]!, m]));
  const [board] = await objects(ana, "arcade-board");

  // Cauda de Cometa: tela de espera, partida, batida.
  await openMachine(ana, byGame.cometa!, NAMES.cometa!);
  const panel = ana.getByRole("dialog", { name: NAMES.cometa });
  await settle(ana, 900);
  await panel.screenshot({ path: `${SHOTS}/arcade-cometa-espera.png` });
  await ana.keyboard.press("Space");
  await expect(panel.getByRole("button", { name: /Pausar/ })).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await actState<Cab>(ana, "fliperamas")).busy[byGame.cometa!.id]).toBe("Ana");

  // Bruno chega perto e vê a máquina ocupada e o placar.
  await walkTo(bruno, { x: -14.6, z: 14.8 });
  await panel.screenshot({ path: `${SHOTS}/arcade-cometa-jogo.png` });
  await settle(bruno, 700);
  await bruno.screenshot({ path: `${SHOTS}/arcade-fliperamas-mundo-3d.png` });
  // pausa e volta
  await ana.keyboard.press("KeyP");
  await expect(panel.getByRole("button", { name: /Continuar/ })).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}/arcade-cometa-pausa.png` });
  await ana.keyboard.press("KeyP");
  await expect(panel.getByRole("button", { name: /Pausar/ })).toBeVisible();
  // vira para a direita (para dentro) e segue até bater no planeta
  await ana.keyboard.press("ArrowRight");
  await expect(panel.getByRole("button", { name: /Jogar de novo/ })).toBeVisible({ timeout: 20_000 });
  await ana.waitForTimeout(900);
  await panel.screenshot({ path: `${SHOTS}/arcade-cometa-fim.png` });

  // Partida pontuada: o servidor confere token, tempo e limite, e o ranking aparece na lateral e no mundo.
  await ana.keyboard.press("Space");
  await expect(panel.getByRole("button", { name: /Pausar/ })).toBeVisible({ timeout: 8000 });
  await ana.keyboard.press("KeyP");
  const token = await ana.evaluate(() => (window as any).__arcade.cab().run?.token as string);
  expect(token).toBeTruthy();
  // pontuação absurda é recusada
  await ana.waitForTimeout(3300);
  await ana.evaluate((t) => (window as any).__infinity.acts.send("fliperamas", "score", { token: t, score: 999999 }), token);
  await expect.poll(() => ana.evaluate(() => (window as any).__arcade.cab().result?.rejected === true)).toBe(true);
  // nova partida com pontuação plausível entra no ranking
  await panel.getByRole("button", { name: "Sair" }).click();
  await expect(panel).toBeHidden();
  await ana.keyboard.press("KeyE");
  await expect(panel).toBeVisible();
  await ana.keyboard.press("Space");
  await expect(panel.getByRole("button", { name: /Pausar/ })).toBeVisible({ timeout: 8000 });
  await ana.keyboard.press("KeyP");
  const token2 = await ana.evaluate(() => (window as any).__arcade.cab().run?.token as string);
  await ana.waitForTimeout(3300);
  await ana.evaluate((t) => (window as any).__infinity.acts.send("fliperamas", "score", { token: t, score: 420 }), token2);
  await expect.poll(async () => (await actState<Cab>(ana, "fliperamas")).boards.cometa?.some((e) => e.name === "Ana" && e.score >= 420)).toBe(true);
  await expect(panel.getByText("Seu recorde: 420")).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}/arcade-cometa-ranking.png` });
  await ana.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // Placar do Arcade: E abre os recordes.
  await walkTo(bruno, { x: board!.interact!.point.x, z: board!.interact!.point.z + 0.3 }, 0.35);
  await expect(bruno.getByText("Ver recordes").first()).toBeVisible({ timeout: 5000 });
  await bruno.keyboard.press("KeyE");
  const records = bruno.getByRole("dialog", { name: "Recordes do Arcade" });
  await expect(records).toBeVisible();
  await records.getByRole("tab", { name: NAMES.cometa }).click();
  await expect(records.getByText("Ana")).toBeVisible();
  await settle(bruno, 700);
  await bruno.screenshot({ path: `${SHOTS}/arcade-recordes-3d.png` });
  await bruno.keyboard.press("Escape");

  // Os outros dois jogos abrem, começam e pausam.
  for (const g of ["faxina", "estilhaco"]) {
    await openMachine(ana, byGame[g]!, NAMES[g]!);
    const p = ana.getByRole("dialog", { name: NAMES[g] });
    await settle(ana, 600);
    await p.screenshot({ path: `${SHOTS}/arcade-${g}-espera.png` });
    await ana.keyboard.press("Space");
    await expect(p.getByRole("button", { name: /Pausar/ })).toBeVisible({ timeout: 8000 });
    await ana.keyboard.down("Space");
    await ana.keyboard.down("ArrowLeft");
    await ana.waitForTimeout(900);
    await ana.keyboard.up("ArrowLeft");
    await ana.keyboard.down("ArrowRight");
    await ana.waitForTimeout(1300);
    await ana.keyboard.up("ArrowRight");
    await ana.keyboard.up("Space");
    await p.screenshot({ path: `${SHOTS}/arcade-${g}-jogo.png` });
    await ana.keyboard.press("Escape"); // pausa
    await expect(p.getByRole("button", { name: /Continuar/ })).toBeVisible();
    await ana.keyboard.press("Escape"); // sai
    await expect(p).toBeHidden();
  }
  await ana.screenshot({ path: `${SHOTS}/arcade-fliperamas-mundo-2d.png` });
  expect((await actState<Cab>(ana, "fliperamas")).busy).toEqual({});
});
