import { expect, test, type Page } from "./setup.ts";

/**
 * Aceite da Etapa 0: duas pessoas, uma no 2D e outra no 3D, se veem andar no lugar certo.
 */

declare global {
  interface Window {
    __infinity?: {
      store: { getState(): { selfId: string | null; players: Record<string, unknown> } };
      self: { x: number; z: number };
      sampleRemote(id: string): { x: number; z: number } | null;
    };
  }
}

const SHOTS = "test-results/screens";

async function enter(page: Page, name: string, lens: "2d" | "3d") {
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!window.__infinity?.store.getState().selfId, null, { timeout: 30_000 });
}

test("tela de entrada", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entre no escritório" })).toBeVisible();
  await page.getByLabel("Seu nome").fill("Marina");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/entrada.png` });
});

test("2D e 3D no mesmo mundo, em tempo real", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ana = await ctxA.newPage();
  const bruno = await ctxB.newPage();

  await enter(ana, "Ana", "2d");
  await enter(bruno, "Bruno", "3d");

  // Os dois se veem na lista.
  await expect(ana.getByText("2 pessoas online")).toBeVisible({ timeout: 15_000 });
  await expect(bruno.getByText("2 pessoas online")).toBeVisible({ timeout: 15_000 });

  const anaId = await ana.evaluate(() => window.__infinity!.store.getState().selfId!);
  const start = await ana.evaluate(() => ({ x: window.__infinity!.self.x, z: window.__infinity!.self.z }));

  // Ana anda para o norte (em direção à estrela) por um tempo.
  await ana.waitForTimeout(600);
  await ana.keyboard.down("KeyW");
  await ana.waitForTimeout(900);
  await ana.keyboard.up("KeyW");
  await ana.waitForTimeout(500);

  const end = await ana.evaluate(() => ({ x: window.__infinity!.self.x, z: window.__infinity!.self.z }));
  expect(start.z - end.z, "Ana andou para o norte").toBeGreaterThan(1);

  // Bruno, no 3D, vê a Ana no mesmo lugar. No teste o WebGL roda por software e a página 3D fica lenta,
  // então esperamos a visão convergir em vez de conferir num instante fixo.
  await expect
    .poll(
      async () => {
        const seen = await bruno.evaluate((id) => window.__infinity!.sampleRemote(id), anaId);
        return seen ? Math.hypot(seen.x - end.x, seen.z - end.z) : Infinity;
      },
      { message: "Bruno vê a Ana onde ela está", timeout: 15_000 },
    )
    .toBeLessThan(0.3);

  await ana.waitForTimeout(800);
  await bruno.waitForTimeout(2500);
  await ana.screenshot({ path: `${SHOTS}/ana-2d.png` });
  await bruno.screenshot({ path: `${SHOTS}/bruno-3d.png` });

  // Troca de lente sem cair: Ana vai para o 3D com a tecla L.
  await ana.keyboard.press("KeyL");
  await expect(ana.getByRole("application", { name: "Escritório em 3D" })).toBeVisible({ timeout: 20_000 });
  await ana.waitForTimeout(2500);
  expect(await ana.evaluate(() => window.__infinity!.store.getState().selfId)).toBe(anaId);
  await ana.screenshot({ path: `${SHOTS}/ana-3d.png` });

  await ctxA.close();
  await ctxB.close();
});
