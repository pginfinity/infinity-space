import { expect, type Browser, type Page } from "./setup.ts";

/** Ajuda comum dos testes dos jogos de grupo (quiz, desenho, stop). */

export interface Hook {
  store: { getState(): { selfId: string | null; players: Record<string, { name: string }> } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }, arrive?: () => void): boolean;
  world(): {
    map: { objects: Array<{ id: string; type: string; zoneId?: string; pos: { x: number; z: number }; interact?: { point: { x: number; z: number } } }> };
    zones: { zoneAt(p: { x: number; z: number }): { id: string } | undefined };
  };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } }; send(id: string, op: string, data?: unknown): void };
}
export type W = { __infinity: Hook };

export async function enter(browser: Browser, name: string, lens: "2d" | "3d" = "2d", size = { width: 1440, height: 900 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport: size })).newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  return page;
}

/** Anda até o ponto e espera chegar (a rota pode ser longa). */
export async function walk(page: Page, p: { x: number; z: number }, tol = 0.6): Promise<void> {
  await page.evaluate((q) => (window as unknown as W).__infinity.walkTo(q), p);
  await expect
    .poll(() => page.evaluate((q) => Math.hypot((window as unknown as W).__infinity.self.x - q.x, (window as unknown as W).__infinity.self.z - q.z), p), { timeout: 40_000 })
    .toBeLessThan(tol);
}

export async function zoneOf(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const h = (window as unknown as W).__infinity;
    return h.world().zones.zoneAt({ x: h.self.x, z: h.self.z })?.id;
  });
}

export async function actState<T>(page: Page, id: string): Promise<T> {
  return page.evaluate((i) => (window as unknown as W).__infinity.acts.state.getState().acts[i]?.state, id) as Promise<T>;
}

export async function send(page: Page, id: string, op: string, data?: unknown): Promise<void> {
  await page.evaluate(([i, o, d]) => (window as unknown as W).__infinity.acts.send(i as string, o as string, d), [id, op, data] as const);
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens/${name}.png` });
}

/** Anda até o ponto andável mais perto de `p`. */
export async function walkNear(page: Page, p: { x: number; z: number }, tol = 0.7): Promise<{ x: number; z: number }> {
  const q = await page.evaluate((t) => {
    const h = (window as unknown as { __infinity: { world(): { nav: { nearestWalkable(p: { x: number; z: number }, r: number): { x: number; z: number } | null } } } }).__infinity;
    return h.world().nav.nearestWalkable(t, 2.5) ?? t;
  }, p);
  await walk(page, q, tol);
  return q;
}

/** Quantos pixels do canvas não são brancos (o desenho chegou?). */
export async function inkPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) return -1;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i]! < 200 || d[i + 1]! < 200 || d[i + 2]! < 200) n++;
    return n;
  }, selector);
}

/** Rabisca no canvas com o mouse (um círculo e um zigue-zague). */
export async function scribble(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  const cx = box.x + box.width * 0.4;
  const cy = box.y + box.height * 0.45;
  const r = box.height * 0.25;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { steps: 2 });
  }
  await page.mouse.up();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.7);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.62 + i * 0.03), box.y + box.height * (i % 2 ? 0.55 : 0.7), { steps: 3 });
  await page.mouse.up();
}
