import { expect, test, type Page } from "./setup.ts";
import { SHOTS, actState, enter, objects, selfId, settle, walkTo, type Obj } from "./arcade-util.ts";

/**
 * Pingue-pongue: saque pelo teclado, ponto de quem saca quando o outro não alcança,
 * troca de bola com as duas raquetes no caminho e a mesa ao vivo no mundo para quem assiste.
 */

interface Duel {
  seats: Array<string | null>;
  phase: string;
  score: [number, number];
}

const HW = 0.75 + 0.35 + 0.06;
/** Pausa do servidor depois de cada ponto (RT_POINT_PAUSE_MS). */
const RT_PAUSE = 1200;

function stand(t: Obj, seat: number): { x: number; z: number } {
  const z = (seat === 0 ? 1 : -1) * (2.7 / 2 + 0.7);
  const a = Math.PI - t.rot;
  return { x: t.pos.x + z * Math.sin(a), z: t.pos.z + z * Math.cos(a) };
}

async function aim(page: Page, id: string, seat: number, x: number, z: number, steps = 5) {
  const box = (await page.locator(`[data-duel-canvas="${id}"]`).boundingBox())!;
  const k = (box.width / 2 / HW) * 0.985;
  const f = seat === 1 ? -1 : 1;
  await page.mouse.move(box.x + box.width / 2 + x * k * f, box.y + box.height / 2 + z * k * f, { steps });
}

test("pingue-pongue: saque, ponto, troca de bola e a mesa ao vivo no mundo", async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const [table] = await objects(ana, "pingpong");
  const id = table!.gameId!;

  const carla = await enter(browser, "Carla", "3d");
  const duda = await enter(browser, "Duda", "2d");
  await Promise.all([
    walkTo(ana, stand(table!, 0)),
    walkTo(bruno, stand(table!, 1)),
    walkTo(carla, { x: table!.pos.x + 0.3, z: table!.pos.z + 1.6 }),
    walkTo(duda, { x: table!.pos.x - 0.3, z: table!.pos.z - 1.5 }),
  ]);
  for (const p of [ana, bruno]) {
    await expect(p.getByText("Jogar pingue-pongue").first()).toBeVisible({ timeout: 5000 });
    await p.keyboard.press("KeyE");
  }
  const panelA = ana.getByRole("dialog", { name: "Pingue-pongue" });
  const panelB = bruno.getByRole("dialog", { name: "Pingue-pongue" });
  await panelA.getByRole("button", { name: "Jogar como Laranja" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).seats[0], { timeout: 20_000 }).toBe(await selfId(ana));
  await panelB.getByRole("button", { name: "Jogar como Azul" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).phase, { timeout: 15_000 }).toBe("playing");
  // Quem saca alterna a cada partida na mesa: S saca, R recebe.
  const first = (await actState<Duel & { serve: number }>(ana, id)).serve;
  const S = first === 0 ? ana : bruno;
  const R = first === 0 ? bruno : ana;
  const sSeat = first;
  const rSeat = 1 - first;
  const panelS = S.getByRole("dialog", { name: "Pingue-pongue" });
  const panelR = R.getByRole("dialog", { name: "Pingue-pongue" });
  const nameS = first === 0 ? "Ana" : "Bruno";
  const away = (seat: number) => (seat === 0 ? 1.7 : -1.7);
  const score = async () => (await actState<Duel>(ana, id)).score;
  const want = (sPts: number, rPts: number) => (first === 0 ? [sPts, rPts] : [rPts, sPts]);
  await expect(panelS.getByText("Seu saque")).toBeVisible({ timeout: 5000 });
  await expect(panelR.getByText(`Saque de ${nameS}`)).toBeVisible();

  // 1º ponto: saque pelo teclado (Espaço); quem recebe deixa passar.
  await aim(S, id, sSeat, 0, away(sSeat) * 0.95);
  await aim(R, id, rSeat, 0.9, away(rSeat));
  await S.waitForTimeout(300);
  await panelS.screenshot({ path: `${SHOTS}/arcade-pingue-saque.png` });
  await S.keyboard.press("Space");
  await expect.poll(score, { timeout: 8000, message: "ponto de quem sacou" }).toEqual(want(1, 0));
  await expect(panelR.getByText(`Ponto de ${nameS}`)).toBeVisible({ timeout: 3000 });

  // 2º ponto (mesmo saque): saque pelo meio com um clique e as duas raquetes no caminho: a bola vai e volta.
  await aim(R, id, rSeat, 0, away(rSeat) * 0.95);
  await aim(S, id, sSeat, 0, away(sSeat) * 0.95);
  await S.waitForTimeout(RT_PAUSE + 300);
  await S.mouse.down();
  await S.mouse.up();
  await S.waitForTimeout(1800);
  await panelS.screenshot({ path: `${SHOTS}/arcade-pingue-ana.png` });
  await panelR.screenshot({ path: `${SHOTS}/arcade-pingue-bruno.png` });
  await settle(carla, 50);
  await carla.screenshot({ path: `${SHOTS}/arcade-pingue-mundo-3d.png` });
  await duda.screenshot({ path: `${SHOTS}/arcade-pingue-mundo-2d.png` });
  // a bola ainda está em jogo depois de várias travessias
  expect(await score()).toEqual(want(1, 0));
  // quem sacou sai do caminho e perde o ponto
  await aim(S, id, sSeat, -0.9, away(sSeat) * 1.1);
  await expect.poll(score, { timeout: 10_000, message: "ponto de quem recebeu" }).toEqual(want(1, 1));

  // quem sacou desiste; o outro vence.
  await panelS.getByRole("button", { name: "Desistir" }).click();
  await panelS.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(panelR.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await R.waitForTimeout(500);
  await panelR.screenshot({ path: `${SHOTS}/arcade-pingue-vitoria.png` });
  await panelS.getByRole("button", { name: "Levantar" }).click();
  await panelR.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await actState<Duel>(ana, id)).seats).toEqual([null, null]);
});
