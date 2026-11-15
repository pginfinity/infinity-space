import { expect, test, type Page } from "@playwright/test";

/**
 * Voz por proximidade com privacidade aplicada no servidor:
 * perto, um ouve o outro; quando um entra na sala de reunião, o de fora para de receber a voz.
 * Precisa do LiveKit rodando (npm run dev já sobe).
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  media: { state: { getState(): { status: string; mic: boolean; audience: number } }; audio(): string[] };
}
const hook = (p: Page) => p.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity !== undefined);

async function enter(page: Page, name: string) {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as { __infinity?: Hook }).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

test("perto se ouve, na sala fechada não", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana");
  await enter(b, "Bruno");
  expect(await hook(a)).toBe(true);

  // Os dois ligam o microfone (M).
  await a.keyboard.press("KeyM");
  await b.keyboard.press("KeyM");
  await expect.poll(() => a.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.state.getState().mic), { timeout: 10_000 }).toBe(true);

  const anaId = await a.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.store.getState().selfId!);
  const brunoId = await b.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.store.getState().selfId!);

  // Perto (chegada): cada um recebe a voz do outro, e o botão mostra quem ouve.
  await expect.poll(() => b.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.audio()), { timeout: 20_000 }).toContain(anaId);
  await expect.poll(() => a.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.audio()), { timeout: 20_000 }).toContain(brunoId);
  await expect(a.getByRole("button", { name: /Desligar microfone/ })).toContainText("1 ouve");
  await a.screenshot({ path: "test-results/screens/v3-voz-perto.png" });

  // Bruno entra na Sala Órbita (fechada): a Ana deixa de ouvi-lo e ele deixa de ouvir a Ana.
  await b.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.walkTo({ x: -21, z: 1.6 }));
  await expect.poll(() => a.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.audio()), { timeout: 30_000 }).not.toContain(brunoId);
  await expect.poll(() => b.evaluate(() => (window as unknown as { __infinity: Hook }).__infinity.media.audio()), { timeout: 10_000 }).not.toContain(anaId);
  await expect(a.getByRole("button", { name: /Desligar microfone/ })).toContainText("ninguém ouve", { timeout: 10_000 });
});
