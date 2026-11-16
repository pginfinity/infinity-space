import { expect, test } from "./setup.ts";
import { actState, enter, frontOf, promptLabel, selfId, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Plantas: a Ana rega a planta mais seca do Átrio (regador na mão, gotas, brilho) e o Bruno vê a planta
 * voltar e a contagem "plantas felizes" do time. Na estação de rega ela pega e devolve o regador.
 */

interface Plants {
  wateredAt: Record<string, number>;
  now: number;
  happy: number;
  total: number;
}

test("regar uma planta murcha, visto por outra pessoa", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  const anaId = await selfId(a);

  // A planta com menos água (dá para regar: abaixo de "cheia") que tenha, na mesma sala, um lugar
  // ao sul dela para o Bruno ficar (a câmera do 3D começa olhando para o norte, para a planta).
  const target = await a.evaluate(() => {
    const w = window as unknown as W;
    const wd = w.__infinity.world() as unknown as { nav: { isWalkable(p: { x: number; z: number }): boolean }; zones: { zoneAt(p: { x: number; z: number }): { id: string } | undefined } };
    const s = w.__infinity.acts.state.getState().acts.plantas!.state as Plants;
    const level = (id: string) => Math.max(0, 1 - (s.now - s.wateredAt[id]!) / (3 * 86_400_000));
    const list = w.__infinity
      .world()
      .map.objects.filter((o) => o.type === "plant" || o.type === "plant-tall")
      .map((o) => {
        const spots = [{ x: o.pos.x, z: o.pos.z + 2.6 }, { x: o.pos.x - 0.9, z: o.pos.z + 2.6 }, { x: o.pos.x + 0.9, z: o.pos.z + 2.6 }, { x: o.pos.x, z: o.pos.z + 1.9 }];
        const watch = spots.find((p) => wd.nav.isWalkable(p) && wd.zones.zoneAt(p)?.id === o.zoneId);
        return { id: o.id, pos: o.pos, level: level(o.id), watch };
      })
      .filter((p) => p.watch && p.level < 0.9)
      .sort((x, y) => x.level - y.level);
    return list[0]!;
  });
  expect(target.level).toBeLessThan(0.92);
  const before = await actState<Plants>(b, "plantas");

  // Bruno fica ao sul da planta (a câmera dele olha para o norte); Ana chega do lado.
  await walkNear(b, target.watch!, 0.8);
  await b.evaluate(() => ((window as unknown as W).__infinity.self.yaw = 0));
  await zoomIn(b, 3);
  await walkNear(a, target.pos, 1.3);
  await expect.poll(() => promptLabel(a)).toMatch(/^Regar a planta/);
  await zoomIn(a, 5);
  await a.screenshot({ path: "test-results/screens/vivo-plantas-antes-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-plantas-antes-3d.png" });

  await a.keyboard.press("KeyE");
  // Todo mundo recebe a rega: a hora da planta muda no estado do Bruno.
  await expect.poll(async () => (await actState<Plants>(b, "plantas")).wateredAt[target.id]).toBeGreaterThan(before.wateredAt[target.id]!);
  await a.waitForTimeout(900);
  await a.screenshot({ path: "test-results/screens/vivo-plantas-regando-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-plantas-regando-3d.png" });
  await a.waitForTimeout(2600);
  await a.screenshot({ path: "test-results/screens/vivo-plantas-depois-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-plantas-depois-3d.png" });
  const after = await actState<Plants>(b, "plantas");
  expect(after.happy).toBeGreaterThanOrEqual(before.happy);
  expect(after.total).toBe(before.total);
  // Regar de novo logo em seguida: já está bem regada.
  await expect.poll(async () => (await promptLabel(a)) ?? "").not.toMatch(/^Regar a planta/);

  // Estação de rega: pega o regador (chip "Regador") e devolve.
  await walkNear(a, await frontOf(a, "watering-station"), 0.9);
  await expect.poll(() => promptLabel(a)).toBe("Pegar o regador");
  await a.keyboard.press("KeyE");
  await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toContainText("Regador", { timeout: 5000 });
  await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.held, anaId)).toBe("watering-can");
  await expect(a.getByText("Plantas felizes:")).toBeVisible();
  await a.screenshot({ path: "test-results/screens/vivo-plantas-estacao-2d.png" });
  await expect.poll(() => promptLabel(a)).toBe("Devolver o regador");
  await a.keyboard.press("KeyE");
  await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toHaveCount(0, { timeout: 5000 });
});

test("planta murcha se vê nas duas lentes (cor, inclinação e folhas no chão)", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await walkNear(a, { x: -3.2, z: 7.4 }, 0.8);
  await zoomIn(a, 6);
  for (const [w, name] of [
    [0, "viçosa"],
    [0.55, "com-sede"],
    [1, "murcha"],
  ] as const) {
    await a.evaluate((w) => (window as unknown as W).__vivo.wilt("plant-1", w), w);
    await a.waitForTimeout(1500);
    await a.screenshot({ path: `test-results/screens/vivo-plantas-${name}-2d.png`, clip: { x: 420, y: 200, width: 600, height: 500 } });
  }
  const b = await (await browser.newContext()).newPage();
  await enter(b, "Ana3d", "3d");
  await walkNear(b, { x: -3.2, z: 7.4 }, 0.8);
  await zoomIn(b, 6);
  for (const [w, name] of [
    [0, "viçosa"],
    [1, "murcha"],
  ] as const) {
    await b.evaluate((w) => (window as unknown as W).__vivo.wilt("plant-1", w), w);
    await b.waitForTimeout(1500);
    await b.screenshot({ path: `test-results/screens/vivo-plantas-${name}-3d.png`, clip: { x: 320, y: 60, width: 800, height: 640 } });
  }
});
