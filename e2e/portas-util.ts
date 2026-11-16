import { expect, type Browser, type Page } from "./setup.ts";

/**
 * Utilidades dos testes do pacote "portas" (portas das salas, roda fechada e sussurro).
 * Voz de verdade com microfone falso: precisa do LiveKit rodando.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  world(): { zones: { zoneAt(p: { x: number; z: number }): { id: string } | undefined } };
  interact: { getState(): { target: { label: string } | null } };
  acts: { send(id: string, op: string, data?: unknown): void };
  media: {
    state: { getState(): { status: string; mic: boolean; audience: number } };
    audio(): string[];
    debug(): { id: string; hearing: string; tracks: { source: string; subscribed: boolean; status: string; permission: string }[] }[];
  };
}
interface PortasHook {
  state(): { doors: Record<string, { state: string; admitted: string[]; note: string; knocks: { id: string }[] }>; circles: { id: string; members: string[] }[] } | undefined;
}

type W = { __infinity: Hook; __portas: PortasHook };

export async function enter(browser: Browser, name: string, mic = true): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.context().grantPermissions(["microphone", "camera"]);
  // O LiveKit de desenvolvimento é compartilhado e às vezes não fecha a conexão de mídia na primeira:
  // recarrega a página e tenta de novo (até 3 vezes).
  for (let attempt = 1; ; attempt++) {
    await page.goto(`/?nome=${name}&lente=2d`);
    await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId && !!(window as unknown as Partial<W>).__portas, null, { timeout: 30_000 });
    const status = await page
      .waitForFunction(
        () => {
          const s = (window as unknown as W).__infinity.media.state.getState().status;
          return s === "on" || s === "error" ? s : false;
        },
        null,
        { timeout: 30_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => "timeout");
    if (status === "on") break;
    if (attempt >= 3) throw new Error(`${name}: a mídia não conectou (${status})`);
  }
  if (mic) {
    await page.keyboard.press("KeyM");
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.media.state.getState().mic), { timeout: 10_000 }).toBe(true);
  }
  return page;
}

export const idOf = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
export const audio = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.media.audio());
export const audienceCount = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.media.state.getState().audience);
export const pos = (p: Page) => p.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
export const zoneOf = (p: Page) =>
  p.evaluate(() => {
    const h = (window as unknown as W).__infinity;
    return h.world().zones.zoneAt({ x: h.self.x, z: h.self.z })?.id ?? null;
  });
export const portasState = (p: Page) => p.evaluate(() => (window as unknown as W).__portas.state());
export const prompt = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? null);
export const act = (p: Page, op: string, data?: unknown) => p.evaluate(([op, data]) => (window as unknown as W).__infinity.acts.send("portas", op as string, data), [op, data] as const);

/** Anda até o ponto e espera chegar (a até 0,35 m). */
export async function walk(p: Page, to: { x: number; z: number }, timeout = 30_000): Promise<void> {
  await p.evaluate((t) => (window as unknown as W).__infinity.walkTo(t), to);
  await expect
    .poll(async () => {
      const at = await pos(p);
      return Math.hypot(at.x - to.x, at.z - to.z);
    }, { timeout })
    .toBeLessThan(0.35);
}

/**
 * Força o próprio avatar para um ponto (como um cliente adulterado que ignora a porta).
 * O motor de movimento manda essa pose para o servidor no próximo envio.
 */
export const forceTo = (p: Page, to: { x: number; z: number }) =>
  p.evaluate((t) => {
    const h = (window as unknown as W).__infinity;
    h.self.x = t.x;
    h.self.z = t.z;
  }, to);

/** Estado da voz de uma pessoa no LiveKit, visto por quem escuta (diagnóstico para mensagens de erro). */
export const micTrackOf = (listener: Page, speakerId: string) =>
  listener.evaluate((id) => {
    const p = (window as unknown as W).__infinity.media.debug().find((x) => x.id === id);
    return p?.tracks.find((t) => t.source === "microphone") ?? null;
  }, speakerId);
