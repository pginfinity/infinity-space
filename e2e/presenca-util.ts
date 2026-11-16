import { expect, type Browser, type Page } from "./setup.ts";

/** Ajudantes dos testes do pacote "presenca" (ganchos window.__infinity e window.__presenca, só em desenvolvimento). */

export const SHOTS = "test-results/screens";

interface Pos {
  x: number;
  z: number;
}

export interface Hook {
  store: { getState(): { selfId: string | null; lens: string; players: Record<string, { id: string; name: string; status: string }> } };
  self: Pos & { yaw: number; anim: string };
  walkTo(p: Pos): boolean;
  sampleRemote(id: string): (Pos & { anim: string }) | null;
  world(): { zones: { zoneAt(p: Pos): { id: string; name: string } | undefined } };
  media: { state: { getState(): { status: string; cam: boolean; videos: Record<string, unknown> } } };
  acts: { send(id: string, op: string, data?: unknown): void };
}

export interface PresencaHook {
  store: { getState(): { travel: unknown; following: { leader: string; waiting: boolean } | null; followers: Record<string, string>; callsIn: unknown[] } };
  pip: { getState(): { win: Window | null; content: boolean } };
  setAwayMinuteMs(ms: number): void;
  awayIsAuto(): boolean;
  controlMode(): string | null;
}

export type W = { __infinity: Hook; __presenca: PresencaHook };

export async function enter(browser: Browser, name: string, lens: "2d" | "3d" = "2d", opts: { media?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (opts.media) await ctx.grantPermissions(["microphone", "camera"]);
  const page = await ctx.newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId && !!(window as unknown as Partial<W>).__presenca, null, { timeout: 30_000 });
  return page;
}

export function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

export function pos(page: Page): Promise<Pos> {
  return page.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
}

export async function distance(a: Page, b: Page): Promise<number> {
  const [pa, pb] = await Promise.all([pos(a), pos(b)]);
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

/** Anda até o ponto pelo caminho do jogo e espera chegar. */
export async function walk(page: Page, p: Pos, tol = 0.6): Promise<void> {
  const dist = async () => {
    const q = await pos(page);
    return Math.hypot(q.x - p.x, q.z - p.z);
  };
  for (let i = 0; i < 4; i++) {
    await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), p);
    const t0 = Date.now();
    while (Date.now() - t0 < 12_000) {
      if ((await dist()) < tol) return;
      await page.waitForTimeout(250);
    }
  }
  expect(await dist()).toBeLessThan(tol);
}

export async function waitOnline(page: Page, n: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as W).__infinity.store.getState().players).length), { timeout: 15_000 }).toBe(n);
}

/** Status de uma pessoa visto por outra página. */
export function statusOf(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.status, id);
}

/** Abre o painel Pessoas pela doca (se ainda não estiver aberto). */
export async function openPeople(page: Page): Promise<void> {
  if (await page.getByRole("complementary", { name: "Pessoas" }).isVisible()) return;
  await page.getByRole("toolbar", { name: "Controles" }).getByRole("button", { name: "Pessoas", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Pessoas" })).toBeVisible();
}
