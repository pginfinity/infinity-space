import { expect, test, type Page } from "./setup.ts";
import { SHOTS, enter, objects, selfId, settle, walkTo } from "./arcade-util.ts";

/**
 * Mesas do Arcade: a mesa nova do jogo da velha funciona de ponta a ponta, e o tabuleiro ao vivo
 * aparece no tampo das mesas para quem passa (2D e 3D).
 */

interface Snap {
  table: string;
  kind: string;
  seats: Array<string | null>;
  phase: string;
  state: { turn: number; winner: number | null; grid: number[] };
}

const snap = (page: Page, table: string) => page.evaluate((t) => (window as any).__infinity.store.getState().games[t] as Snap, table);

test("jogo da velha na mesa nova, com a partida visível no tampo", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");

  const [table] = await objects(ana, "tictactoe-table");
  expect(table?.gameId, "a planta precisa ter uma mesa tictactoe-table com gameId").toBeTruthy();
  const id = table!.gameId!;
  await expect.poll(async () => (await snap(ana, id))?.kind).toBe("tictactoe");

  for (const p of [ana, bruno]) await p.evaluate((t) => (window as any).__infinity.store.getState().openGame(t), id);
  const panelA = ana.getByRole("dialog", { name: "Jogo da velha" });
  const panelB = bruno.getByRole("dialog", { name: "Jogo da velha" });
  await panelA.getByRole("button", { name: "Sentar como Xis" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 40_000 }).toBe(await selfId(ana));
  await panelB.getByRole("button", { name: "Sentar como Bola" }).click();
  await expect.poll(async () => (await snap(bruno, id)).phase, { timeout: 40_000 }).toBe("playing");

  // Xis faz a linha de cima: 0, 1, 2 (Bola joga 3 e 4).
  const plays: Array<[Page, number]> = [
    [ana, 0],
    [bruno, 4],
    [ana, 1],
    [bruno, 3],
  ];
  for (const [page, cell] of plays) {
    const me = await selfId(page);
    await expect.poll(async () => {
      const g = await snap(page, id);
      return g.seats[g.state.turn] === me;
    }).toBe(true);
    await page.getByRole("dialog", { name: "Jogo da velha" }).getByRole("gridcell", { name: `Casa ${cell + 1}`, exact: true }).click();
  }
  await expect.poll(async () => (await snap(ana, id)).state.grid.filter((c) => c >= 0).length).toBe(4);

  // Quem passa vê a partida no tampo: Carla chega pela lente 3D e Duda pela 2D.
  const carla = await enter(browser, "Carla", "3d");
  const duda = await enter(browser, "Duda", "2d");
  await Promise.all([walkTo(carla, { x: table!.pos.x + 0.2, z: table!.pos.z + 1.6 }), walkTo(duda, { x: table!.pos.x, z: table!.pos.z + 1.4 })]);
  await ana.getByRole("dialog", { name: "Jogo da velha" }).getByRole("gridcell", { name: "Casa 3", exact: true }).click();
  await expect(panelA.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await settle(carla, 1200);
  await carla.screenshot({ path: `${SHOTS}/arcade-mesas-3d.png` });
  await duda.screenshot({ path: `${SHOTS}/arcade-mesas-2d.png` });
  await panelA.screenshot({ path: `${SHOTS}/arcade-velha-painel.png` });

  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats).toEqual([null, null]);
});
