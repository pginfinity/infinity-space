import { devices } from "@playwright/test";
import { expect, type Browser, type Page } from "./setup.ts";

/** Ajudantes dos testes do pacote "chat" (ganchos window.__infinity e __infinityChat, só em desenvolvimento). */

export const SHOTS = "test-results/screens";

interface ChatMsgLike {
  id: number;
  text: string;
  name: string;
  from: string;
}

export interface Hook {
  store: { getState(): { selfId: string | null; players: Record<string, { id: string; name: string; note?: string }> } };
  self: { x: number; z: number; yaw: number };
  walkTo(p: { x: number; z: number }): boolean;
  sampleRemote(id: string): { x: number; z: number } | null;
}
export interface ChatHook {
  state: {
    getState(): {
      open: boolean;
      tab: string;
      geralLoaded: boolean;
      geral: ChatMsgLike[];
      perto: ChatMsgLike[];
      convs: Record<string, { key: string; name: string; unread: number; msgs: ChatMsgLike[]; last: ChatMsgLike | null }>;
    };
  };
  unread(): { geral: number; perto: number; dm: number; mentions: number; badge: number; dot: boolean };
}
export type W = { __infinity: Hook; __infinityChat: ChatHook };

/** Marca única para os textos de um teste (o escritório de teste guarda o Geral entre rodadas). */
export const tag = (): string => Math.random().toString(36).slice(2, 7);

export async function enter(browser: Browser, name: string, lens: "2d" | "3d", opts: { mobile?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext(opts.mobile ? { ...devices["Pixel 7"] } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId && !!(window as unknown as Partial<W>).__infinityChat, null, { timeout: 30_000 });
  // O chat já recebeu o Geral (a primeira sincronia terminou).
  await page.waitForFunction(() => (window as unknown as W).__infinityChat.state.getState().geralLoaded, null, { timeout: 30_000 });
  return page;
}

export function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

/** Anda até o ponto pelo caminho do jogo e espera chegar. */
export async function walk(page: Page, p: { x: number; z: number }, tol = 0.6): Promise<void> {
  const dist = () => page.evaluate((p) => Math.hypot((window as unknown as W).__infinity.self.x - p.x, (window as unknown as W).__infinity.self.z - p.z), p);
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

/** As outras janelas já veem esta pessoa no lugar novo (as poses chegam a 15 Hz). */
export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

export function unread(page: Page) {
  return page.evaluate(() => (window as unknown as W).__infinityChat.unread());
}

export function chatState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as W).__infinityChat.state.getState();
    return { open: s.open, tab: s.tab, geral: s.geral.map((m) => m.text), perto: s.perto.map((m) => m.text), convs: Object.values(s.convs).map((c) => ({ key: c.key, name: c.name, unread: c.unread, texts: c.msgs.map((m) => m.text) })) };
  });
}

export const panel = (page: Page) => page.getByRole("dialog", { name: "Chat" });
export const composer = (page: Page) => panel(page).getByRole("textbox", { name: "Escrever mensagem" });
export const dock = (page: Page) => page.locator("[data-chat-dock]");

/** Abre o chat pela tecla C (com o foco fora de campos de texto). */
export async function openByKey(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("KeyC");
  await expect(panel(page)).toBeVisible();
}

export async function tab(page: Page, name: "Geral" | "Perto" | "Conversas"): Promise<void> {
  await panel(page).getByRole("tab", { name: new RegExp(`^${name}`) }).click();
}

/** Escreve e envia com Enter. */
export async function say(page: Page, text: string): Promise<void> {
  const box = composer(page);
  await box.click();
  await box.fill(text);
  await box.press("Enter");
}
