import { expect, test, type Page } from "./setup.ts";
import { actState, enter, promptLabel, selfId, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Orbi: a Ana encontra o robô passeando, chama ("Chamar o Orbi"), ele a segue; ela faz carinho
 * (corações) e depois dispensa. O Bruno vê o Orbi seguindo a Ana e o carinho no estado.
 */

interface Orbi {
  mode: string;
  from: { x: number; z: number };
  path: Array<{ x: number; z: number }>;
  speed: number;
  startAt: number;
  follow: { id: string; name: string } | null;
  pet: { name: string; at: number } | null;
  now: number;
}

/** Onde o Orbi está agora, pela mesma conta dos clientes (trajeto + hora de saída). */
function orbiNow(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as W).__infinity.acts.state.getState().acts.orbi!.state as Orbi;
    let left = Math.max(0, ((Date.now() - s.startAt) / 1000) * s.speed);
    let a = s.from;
    for (const b of s.path) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (left < d) return { x: a.x + ((b.x - a.x) * left) / d, z: a.z + ((b.z - a.z) * left) / d };
      left -= d;
      a = b;
    }
    return a;
  });
}

test("chamar o Orbi, ele segue, carinho e dispensar", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  const anaId = await selfId(a);

  // Vai atrás do Orbi até aparecer "Chamar o Orbi" (ele anda, então reajusta o destino).
  await expect
    .poll(
      async () => {
        const o = await orbiNow(a);
        await a.evaluate((o) => (window as unknown as W).__infinity.walkTo({ x: o.x + 1.5, z: o.z + 1 }), o);
        return (await promptLabel(a)) ?? "";
      },
      { timeout: 60_000, intervals: [1500] },
    )
    .toMatch(/Chamar o Orbi|Fazer carinho no Orbi/);
  await a.evaluate(() => (window as unknown as W).__infinity.acts.send("orbi", "call"));
  await expect.poll(async () => (await actState<Orbi>(b, "orbi")).follow?.name).toBe("Ana");
  await expect(a.getByRole("status").filter({ hasText: "O Orbi está te seguindo" })).toBeVisible();

  // Ana anda pelo Átrio; o Orbi vem atrás e para do lado dela.
  await walkNear(a, { x: 3.6, z: 3.4 }, 0.8);
  await expect
    .poll(async () => {
      const o = await orbiNow(a);
      const me = await a.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
      return Math.hypot(o.x - me.x, o.z - me.z);
    }, { timeout: 30_000 })
    .toBeLessThan(2.2);
  // Bruno chega perto para ver (ao sul, a câmera dele olha para o norte).
  await walkNear(b, { x: 3.6, z: 6.6 }, 0.8);
  await zoomIn(a, 6);
  await zoomIn(b, 2);
  await a.waitForTimeout(800);
  await a.screenshot({ path: "test-results/screens/vivo-orbi-seguindo-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-orbi-seguindo-3d.png" });

  // Carinho: E com o Orbi do lado.
  await expect.poll(() => promptLabel(a), { timeout: 10_000 }).toBe("Fazer carinho no Orbi");
  await a.keyboard.press("KeyE");
  await expect.poll(async () => (await actState<Orbi>(b, "orbi")).pet?.name, { timeout: 5000 }).toBe("Ana");
  expect((await actState<Orbi>(b, "orbi")).mode).toBe("pet");
  await a.waitForTimeout(450);
  await a.screenshot({ path: "test-results/screens/vivo-orbi-carinho-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-orbi-carinho-3d.png" });

  // Dispensar: volta a passear.
  await a.waitForTimeout(3000);
  await a.getByRole("button", { name: "Pedir para o Orbi voltar a passear" }).click();
  await expect.poll(async () => (await actState<Orbi>(b, "orbi")).follow).toBeNull();
  await expect(a.getByRole("status").filter({ hasText: "O Orbi está te seguindo" })).toHaveCount(0);
  expect(anaId).toBeTruthy();
});
