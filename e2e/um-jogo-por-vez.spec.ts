import { expect, test, type Page } from "./setup.ts";
import { actState, enter, objects, selfId, sendAct, walkTo } from "./arcade-util.ts";

/**
 * Um jogo por vez: sentada esperando no Lig 4, a Ana vai para o hockey e sai do Lig 4 sozinha.
 * Com uma partida de Lig 4 rolando, o hockey recusa e avisa.
 */

interface Snap {
  table: string;
  kind: string;
  phase: string;
  seats: Array<string | null>;
}
interface Duel {
  seats: Array<string | null>;
}

const games = (p: Page) => p.evaluate(() => Object.values((window as any).__infinity.store.getState().games) as Snap[]);
const game = (p: Page, t: string) => p.evaluate((id) => (window as any).__infinity.store.getState().games[id] as Snap, t);

/** Ponto em pé no lado `seat` da mesa de hockey (mesmo cálculo do servidor). */
function stand(t: { pos: { x: number; z: number }; rot: number }, seat: number) {
  const z = (seat === 0 ? 1 : -1) * (1.86 / 2 + 0.42);
  const a = Math.PI - t.rot;
  return { x: t.pos.x + z * Math.sin(a), z: t.pos.z + z * Math.cos(a) };
}

test("um jogo por vez: sai do lugar de espera e não larga partida no meio", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const anaId = await selfId(ana);
  const lig4 = (await games(ana)).find((g) => g.kind === "connect4" && g.seats.every((s) => s === null))!.table;
  const [hockey] = await objects(ana, "airhockey");
  const hid = hockey!.gameId!;

  // Ana senta no Lig 4 e fica esperando.
  await ana.evaluate((t) => (window as any).__infinity.store.getState().openGame(t), lig4);
  await ana.getByRole("dialog", { name: "Lig 4" }).getByRole("button", { name: "Sentar como Laranja" }).click();
  await expect.poll(async () => (await game(ana, lig4)).seats[0], { timeout: 30_000 }).toBe(anaId);
  await ana.keyboard.press("Escape");

  // Vai para o hockey: senta lá e sai do Lig 4.
  await walkTo(ana, stand(hockey!, 0));
  await sendAct(ana, hid, "sit", { seat: 0 });
  await expect.poll(async () => (await actState<Duel>(ana, hid)).seats[0], { timeout: 10_000 }).toBe(anaId);
  await expect.poll(async () => (await game(ana, lig4)).seats[0], { timeout: 10_000 }).toBeNull();
  await sendAct(ana, hid, "stand");
  await expect.poll(async () => (await actState<Duel>(ana, hid)).seats[0], { timeout: 10_000 }).toBeNull();

  // Agora uma partida de Lig 4 de verdade.
  for (const [p, seat] of [[ana, "Sentar como Laranja"], [bruno, "Sentar como Branco"]] as const) {
    await p.evaluate((t) => (window as any).__infinity.store.getState().openGame(t), lig4);
    await p.getByRole("dialog", { name: "Lig 4" }).getByRole("button", { name: seat }).click();
  }
  await expect.poll(async () => (await game(ana, lig4)).phase, { timeout: 30_000 }).toBe("playing");
  await ana.keyboard.press("Escape");

  // Com a partida rolando, o hockey recusa e avisa.
  await walkTo(ana, stand(hockey!, 0));
  await sendAct(ana, hid, "sit", { seat: 0 });
  await expect(ana.getByText(/no meio de uma partida de Lig 4/)).toBeVisible({ timeout: 8000 });
  expect((await actState<Duel>(ana, hid)).seats[0]).toBeNull();
  expect((await game(ana, lig4)).seats[0]).toBe(anaId);
});
