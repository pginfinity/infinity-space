import { expect, test } from "./setup.ts";

/** Interação: andar até uma cadeira, ver "E · Sentar", sentar, e quem está longe vê a pessoa sentada. */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number; anim: string };
  sampleRemote(id: string): { x: number; z: number; anim: string } | null;
  walkTo(p: { x: number; z: number }): boolean;
  interact: { getState(): { target: { label: string } | null } };
  world(): { map: { desks: Array<{ seat: { x: number; z: number } }> } };
}
declare global {
  interface Window {
    __infinity?: Hook;
  }
}

test("andar até a cadeira, apertar E e sentar", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  for (const [p, n] of [
    [a, "Ana"],
    [b, "Bruno"],
  ] as const) {
    await p.goto(`/?nome=${n}&lente=2d`);
    await p.waitForFunction(() => !!window.__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  }

  // Ana vai até a cadeira de uma mesa da Gestão & Projetos.
  const seat = await a.evaluate(() => {
    const desks = window.__infinity!.world().map.desks;
    const d = desks.find((d) => d.seat.z > 18 && d.seat.x > 0)!;
    window.__infinity!.walkTo(d.seat);
    return d.seat;
  });
  await expect.poll(() => a.evaluate((s) => Math.hypot(window.__infinity!.self.x - s.x, window.__infinity!.self.z - s.z), seat), { timeout: 20_000 }).toBeLessThan(0.8);

  // Aparece o botão de sentar.
  await expect(a.getByRole("button", { name: /Sentar/ })).toBeVisible({ timeout: 5_000 });
  await a.keyboard.press("KeyE");
  await expect.poll(() => a.evaluate(() => window.__infinity!.self.anim), { timeout: 5_000 }).toBe("sit");

  // Bruno vê a Ana sentada.
  const anaId = await a.evaluate(() => window.__infinity!.store.getState().selfId!);
  await expect.poll(() => b.evaluate((id) => window.__infinity!.sampleRemote(id)?.anim ?? null, anaId), { timeout: 15_000 }).toBe("sit");

  await a.waitForTimeout(800);
  await a.screenshot({ path: "test-results/screens/v2-sentada.png" });

  // Andar levanta.
  await a.keyboard.down("KeyS");
  await a.waitForTimeout(400);
  await a.keyboard.up("KeyS");
  await expect.poll(() => a.evaluate(() => window.__infinity!.self.anim)).not.toBe("sit");
});
