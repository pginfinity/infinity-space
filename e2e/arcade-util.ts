import { expect, type Browser, type Page } from "./setup.ts";

/** Apoio dos testes do pacote arcade (não é um teste: não termina em .spec.ts). */

export const SHOTS = "test-results/screens";

export interface Obj {
  id: string;
  type: string;
  pos: { x: number; z: number };
  rot: number;
  gameId?: string;
  gameSeat?: number;
  variant?: number;
  zoneId?: string;
  interact?: { point: { x: number; z: number }; yaw: number; radius: number };
}

export async function enter(browser: Browser, name: string, lens: "2d" | "3d" = "2d"): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name}] erro na página:`, e.message));
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as any).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  return page;
}

export const selfId = (page: Page) => page.evaluate(() => (window as any).__infinity.store.getState().selfId as string);

export const objects = (page: Page, type: string) =>
  page.evaluate((t) => ((window as any).__infinity.world().map.objects as Obj[]).filter((o) => o.type === t), type);

export const actState = <T>(page: Page, id: string) => page.evaluate((i) => (window as any).__infinity.acts.state.getState().acts[i]?.state, id) as Promise<T>;

export const sendAct = (page: Page, id: string, op: string, data?: unknown) =>
  page.evaluate(([i, o, d]) => (window as any).__infinity.acts.send(i, o, d), [id, op, data] as const);

/** Anda até o ponto e espera chegar. */
export async function walkTo(page: Page, p: { x: number; z: number }, tol = 0.6): Promise<void> {
  await page.evaluate((q) => (window as any).__infinity.walkTo(q), p);
  await expect
    .poll(() => page.evaluate((q) => Math.hypot((window as any).__infinity.self.x - q.x, (window as any).__infinity.self.z - q.z), p), { timeout: 75_000, message: "chegar ao ponto" })
    .toBeLessThan(tol);
}

/** Espera alguns quadros (texturas e animações assentarem antes do screenshot). */
export const settle = (page: Page, ms = 600) => page.waitForTimeout(ms);
