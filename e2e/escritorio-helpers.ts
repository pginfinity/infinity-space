import { expect, type Browser, type Page } from "./setup.ts";

/** Ajudantes dos testes do pacote "escritorio" (gancho window.__infinity, só em desenvolvimento). */

export const SHOTS = "test-results/screens";

export interface Hook {
  store: { getState(): { selfId: string | null; players: Record<string, { id: string; name: string; note?: string }> } };
  self: { x: number; z: number; yaw: number };
  walkTo(p: { x: number; z: number }): boolean;
  sampleRemote(id: string): { x: number; z: number } | null;
  world(): { map: { objects: Array<{ id: string; type: string; pos: { x: number; z: number }; rot: number; interact?: { point: { x: number; z: number } } }> } };
  interact: { getState(): { target: { label: string } | null } };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } }; send(id: string, op: string, data?: unknown): void };
}
export type W = { __infinity: Hook };

export async function enter(browser: Browser, name: string, lens: "2d" | "3d"): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  return page;
}

export function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

/** Anda até o ponto pelo caminho do jogo e espera chegar. */
export async function walk(page: Page, p: { x: number; z: number }, tol = 0.6): Promise<void> {
  const dist = () => page.evaluate((p) => Math.hypot((window as unknown as W).__infinity.self.x - p.x, (window as unknown as W).__infinity.self.z - p.z), p);
  // Se a rota travar numa quina (ou a página acabou de carregar), pede de novo.
  for (let i = 0; i < 4; i++) {
    await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), p);
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      if ((await dist()) < tol) return;
      await page.waitForTimeout(250);
    }
  }
  expect(await dist()).toBeLessThan(tol);
}

export function objectOf(page: Page, type: string) {
  return page.evaluate((type) => (window as unknown as W).__infinity.world().map.objects.find((o) => o.type === type)!, type);
}

export async function waitOnline(page: Page, n: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as W).__infinity.store.getState().players).length), { timeout: 15_000 }).toBe(n);
}
