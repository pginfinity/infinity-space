import { expect, test } from "./setup.ts";
import { actState, enter, frontOf, promptLabel, selfId, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Copa: a Ana pede um café na máquina (menu, preparo, item na mão) e o Bruno, na copa, vê o vapor,
 * o café na mão dela e o contador do dia subir. Depois ela faz pipoca na bancada.
 */

interface Copa {
  counts: Record<string, number>;
  busy: Record<string, { id: string; item: string }>;
}

test("café na máquina e pipoca na bancada, com contador do time", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  const anaId = await selfId(a);

  // Bruno fica no meio da copa, olhando para a máquina.
  await walkNear(b, { x: -9.4, z: 16.6 }, 0.6);
  await b.evaluate(() => ((window as unknown as W).__infinity.self.yaw = -Math.PI / 2));
  const before = (await actState<Copa>(b, "copa")).counts.coffee ?? 0;

  // Ana chega na máquina: o botão vira "Café ou chá" e E abre o menu.
  await walkNear(a, await frontOf(a, "coffee-machine"), 0.9);
  await expect.poll(() => promptLabel(a)).toBe("Café ou chá");
  await zoomIn(a, 4);
  await a.keyboard.press("KeyE");
  const menu = a.getByRole("dialog", { name: "Café ou chá" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Café" })).toBeFocused();
  await a.screenshot({ path: "test-results/screens/vivo-copa-menu.png" });
  // Teclado: 1 escolhe o café.
  await a.keyboard.press("Digit1");
  await expect(menu).toHaveCount(0);

  // Preparando: barra para ela, vapor para todos (a máquina fica ocupada no estado).
  await expect(a.getByRole("status").filter({ hasText: "Preparando um café" })).toBeVisible({ timeout: 5000 });
  await expect.poll(async () => Object.values((await actState<Copa>(b, "copa")).busy).some((x) => x.id === anaId)).toBe(true);
  await a.waitForTimeout(1200);
  await a.screenshot({ path: "test-results/screens/vivo-copa-preparo-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-copa-preparo-3d.png" });

  // Pronto: café na mão, visto pelo Bruno, e o contador do dia subiu.
  await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toContainText("Café", { timeout: 8000 });
  await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.held, anaId)).toBe("coffee");
  await expect.poll(async () => (await actState<Copa>(b, "copa")).counts.coffee).toBe(before + 1);

  // Pipoca na bancada (a geladeira e a bancada são alvos do pacote).
  const counter = await a.evaluate(() => {
    const o = (window as unknown as W).__infinity.world().map.objects.find((x) => x.type === "kitchen-counter")!;
    return { x: o.pos.x + 0.9, z: o.pos.z + 0.68 };
  });
  await walkNear(a, counter, 0.8);
  await expect.poll(() => promptLabel(a)).toBe("Fazer pipoca");
  await a.keyboard.press("KeyE");
  await expect(a.getByRole("status").filter({ hasText: "Preparando uma pipoca" })).toBeVisible({ timeout: 5000 });
  await a.waitForTimeout(2000);
  await a.screenshot({ path: "test-results/screens/vivo-copa-pipoca-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-copa-pipoca-3d.png" });
  await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toContainText("Pipoca", { timeout: 8000 });

  // O quadro de giz: etiqueta nítida no 2D para quem está perto.
  await walkNear(a, { x: -9.0, z: 13.8 }, 0.8);
  await expect(a.getByText("Copa hoje")).toBeVisible();
  await a.waitForTimeout(500);
  await a.screenshot({ path: "test-results/screens/vivo-copa-quadro-2d.png" });
  await walkNear(a, { x: -5.6, z: 13.6 }, 0.8);
  await walkNear(b, { x: -8.9, z: 14.5 }, 0.6);
  await b.evaluate(() => ((window as unknown as W).__infinity.self.yaw = 0));
  await zoomIn(b, 6);
  await b.waitForTimeout(800);
  await b.screenshot({ path: "test-results/screens/vivo-copa-quadro-3d.png" });
});
