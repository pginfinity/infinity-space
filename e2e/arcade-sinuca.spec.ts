import { expect, test, type Page } from "./setup.ts";
import { SHOTS, actState, enter, objects, selfId, settle, walkTo, type Obj } from "./arcade-util.ts";

/**
 * Sinuca: duas pessoas pegam os lados, quem sai mira no triângulo com o mouse e segura para dar força.
 * O servidor simula a tacada e todo mundo anima a mesma conta (painel e mesa no mundo). Depois, quem
 * está na vez taca de novo; no fim, alguém desiste.
 */

interface Pool {
  seats: Array<string | null>;
  phase: string;
  turn: number;
  shot: number;
  balls: Array<[number, number] | null>;
  last: { time: number; by: number } | null;
  winner: number | null;
}

const HW = 0.585 + 0.09;
const L = 2.6;
const STAND = 0.5;

function stand(t: Obj, seat: number) {
  const z = (seat === 0 ? 1 : -1) * (L / 2 + STAND);
  const a = Math.PI - t.rot;
  return { x: t.pos.x + z * Math.sin(a), z: t.pos.z + z * Math.cos(a) };
}

async function aim(page: Page, id: string, seat: number, x: number, z: number) {
  const box = (await page.locator(`[data-pool-canvas="${id}"]`).boundingBox())!;
  const k = box.width / 2 / HW;
  const f = seat === 1 ? -1 : 1;
  await page.mouse.move(box.x + box.width / 2 + x * k * f, box.y + box.height / 2 + z * k * f, { steps: 5 });
}

async function shoot(page: Page, id: string, seat: number, x: number, z: number, holdMs: number) {
  await aim(page, id, seat, x, z);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

test("sinuca: lados, saída com mira e força, animação para todos e desistência", async ({ browser }) => {
  test.setTimeout(200_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const carla = await enter(browser, "Carla", "3d");
  const [table] = await objects(ana, "pool");
  const id = table!.gameId!;
  await Promise.all([walkTo(ana, stand(table!, 0)), walkTo(bruno, stand(table!, 1)), walkTo(carla, { x: table!.pos.x - 0.4, z: table!.pos.z + 1.7 })]);

  for (const p of [ana, bruno]) {
    await expect(p.getByText("Jogar sinuca").first()).toBeVisible({ timeout: 5000 });
    await p.keyboard.press("KeyE");
  }
  const panelA = ana.getByRole("dialog", { name: "Sinuca" });
  const panelB = bruno.getByRole("dialog", { name: "Sinuca" });
  await panelA.getByRole("button", { name: "Jogar deste lado" }).click();
  await expect.poll(async () => (await actState<Pool>(ana, id)).seats[0], { timeout: 20_000 }).toBe(await selfId(ana));
  await panelB.getByRole("button", { name: "Jogar do outro lado" }).click();
  await expect.poll(async () => (await actState<Pool>(ana, id)).phase, { timeout: 20_000 }).toBe("playing");

  const st0 = await actState<Pool>(ana, id);
  const pages = [ana, bruno];
  const S = pages[st0.turn]!;
  const panelS = st0.turn === 0 ? panelA : panelB;
  await expect(panelS.getByText("Sua vez").first()).toBeVisible();
  // mira no primeiro da fileira do triângulo (lado -z) e segura até quase o máximo
  const apex = st0.balls[1]!;
  await aim(S, id, st0.turn, apex[0] + 0.004, apex[1]);
  await S.waitForTimeout(300);
  await panelS.screenshot({ path: `${SHOTS}/arcade-sinuca-mira.png` });
  await shoot(S, id, st0.turn, apex[0] + 0.004, apex[1], 1050);
  await expect.poll(async () => (await actState<Pool>(ana, id)).shot, { timeout: 8000, message: "a saída valeu" }).toBe(st0.shot + 1);
  await S.waitForTimeout(450);
  await panelA.screenshot({ path: `${SHOTS}/arcade-sinuca-saida.png` });
  await settle(carla, 50);
  await carla.screenshot({ path: `${SHOTS}/arcade-sinuca-mundo-3d.png` });
  await ana.screenshot({ path: `${SHOTS}/arcade-sinuca-mundo-2d.png` });

  // espera a tacada parar de rolar; quem está na vez taca na bola mais perto
  const st1 = await actState<Pool>(ana, id);
  await ana.waitForTimeout(st1.last!.time * 1000 + 600);
  const T = pages[st1.turn]!;
  const cue = st1.balls[0]!;
  let best: [number, number] | null = null;
  for (let i = 1; i < 16; i++) {
    const b = st1.balls[i];
    if (b && i !== 8 && (!best || Math.hypot(b[0] - cue[0], b[1] - cue[1]) < Math.hypot(best[0] - cue[0], best[1] - cue[1]))) best = b;
  }
  await shoot(T, id, st1.turn, best![0], best![1], 500);
  await expect.poll(async () => (await actState<Pool>(ana, id)).shot, { timeout: 8000, message: "segunda tacada" }).toBe(st1.shot + 1);
  await ana.waitForTimeout(1200);
  await panelB.screenshot({ path: `${SHOTS}/arcade-sinuca-bruno.png` });

  // Bruno desiste: a Ana vence.
  await panelB.getByRole("button", { name: "Desistir" }).click();
  await panelB.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(panelA.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await ana.waitForTimeout(700);
  await panelA.screenshot({ path: `${SHOTS}/arcade-sinuca-vitoria.png` });
  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await actState<Pool>(ana, id)).seats).toEqual([null, null]);
});
