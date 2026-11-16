import { expect, test, type Page } from "./setup.ts";
import { SHOTS, actState, enter, objects, selfId, settle, walkTo, type Obj } from "./arcade-util.ts";

/**
 * Hockey de mesa: duas pessoas pegam os lados da mesa, a contagem roda, a Ana leva o rebatedor
 * com o mouse e faz gol. Quem assiste por perto vê disco e rebatedores andando no mundo (2D e 3D).
 */

interface Duel {
  seats: Array<string | null>;
  phase: string;
  score: [number, number];
  winner: number | null;
}

const HW = 0.48 + 0.07 + 0.01;

/** Ponto em pé de cada lado (mesmo cálculo do servidor). */
function stand(t: Obj, seat: number): { x: number; z: number } {
  const z = (seat === 0 ? 1 : -1) * (1.86 / 2 + 0.42);
  const a = Math.PI - t.rot;
  return { x: t.pos.x + z * Math.sin(a), z: t.pos.z + z * Math.cos(a) };
}

/** Leva o mouse ao ponto (x, z) da mesa no canvas do painel (lugar 1 vê a mesa girada). */
async function aim(page: Page, id: string, seat: number, x: number, z: number, steps = 6) {
  const box = (await page.locator(`[data-duel-canvas="${id}"]`).boundingBox())!;
  const k = (box.width / 2 / HW) * 0.985;
  const f = seat === 1 ? -1 : 1;
  await page.mouse.move(box.x + box.width / 2 + x * k * f, box.y + box.height / 2 + z * k * f, { steps });
}

test("hockey de mesa: lugares, contagem, gol com o mouse e a mesa ao vivo no mundo", async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const [table] = await objects(ana, "airhockey");
  const id = table!.gameId!;

  // Os dois vão até a mesa (Carla e Duda chegam junto para assistir, pela 3D e pela 2D); E abre o painel.
  const carla = await enter(browser, "Carla", "3d");
  const duda = await enter(browser, "Duda", "2d");
  await Promise.all([
    walkTo(ana, stand(table!, 0)),
    walkTo(bruno, stand(table!, 1)),
    walkTo(carla, { x: table!.pos.x + 1.6, z: table!.pos.z + 0.4 }),
    walkTo(duda, { x: table!.pos.x + 1.5, z: table!.pos.z - 0.3 }),
  ]);
  for (const p of [ana, bruno]) {
    await expect(p.getByText("Jogar hockey").first()).toBeVisible({ timeout: 5000 });
    await p.keyboard.press("KeyE");
  }
  const panelA = ana.getByRole("dialog", { name: "Hockey de mesa" });
  const panelB = bruno.getByRole("dialog", { name: "Hockey de mesa" });
  await expect(panelA).toBeVisible();
  await panelA.getByRole("button", { name: "Jogar como Laranja" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).seats[0], { timeout: 20_000 }).toBe(await selfId(ana));
  await panelB.getByRole("button", { name: "Jogar como Azul" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).phase, { timeout: 20_000 }).toBe("countdown");
  await expect(panelA.getByText("3", { exact: true })).toBeVisible({ timeout: 3000 });
  await panelA.screenshot({ path: `${SHOTS}/arcade-hockey-contagem.png` });
  await expect.poll(async () => (await actState<Duel>(ana, id)).phase, { timeout: 10_000 }).toBe("playing");


  // Bruno tira o rebatedor do caminho; a Ana encosta no disco (que começa do lado dela) e chuta reto.
  await aim(bruno, id, 1, -0.4, -0.08);
  for (let kick = 0; kick < 4 && (await actState<Duel>(ana, id)).score[0] === 0; kick++) {
    await aim(ana, id, 0, 0, 0.75, 4);
    await ana.waitForTimeout(kick === 0 ? 300 : 1800);
    await aim(ana, id, 0, 0, 0.6, 3);
    await ana.waitForTimeout(150);
    await aim(ana, id, 0, 0, 0.08, 2);
    await expect.poll(async () => (await actState<Duel>(ana, id)).score[0], { timeout: 3000 }).toBe(1).catch(() => undefined);
  }
  await expect(panelB.getByText("Gol de Ana!")).toBeVisible({ timeout: 5000 });
  await expect(panelA.getByText("Gol seu!")).toBeVisible();
  await panelA.screenshot({ path: `${SHOTS}/arcade-hockey-ana.png` });
  await panelB.screenshot({ path: `${SHOTS}/arcade-hockey-bruno.png` });
  await settle(carla, 100);
  await carla.screenshot({ path: `${SHOTS}/arcade-hockey-mundo-3d.png` });
  await duda.screenshot({ path: `${SHOTS}/arcade-hockey-mundo-2d.png` });
  expect((await actState<Duel>(ana, id)).score).toEqual([1, 0]);

  // Bruno desiste; a Ana vê a vitória e os dois levantam.
  await panelB.getByRole("button", { name: "Desistir" }).click();
  await panelB.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(panelA.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await expect(panelB.getByText("Você perdeu")).toBeVisible();
  await ana.waitForTimeout(600);
  await panelA.screenshot({ path: `${SHOTS}/arcade-hockey-vitoria.png` });
  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).seats).toEqual([null, null]);
  await ana.keyboard.press("Escape");
  await expect(panelA).toBeHidden();
});
