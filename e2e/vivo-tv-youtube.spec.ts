import { expect, test, type Page } from "./setup.ts";
import { actState, promptLabel, walkNear, type W } from "./vivo-util.ts";

/**
 * TV do lounge com o YouTube DE VERDADE (precisa de internet; só roda com TV_REAL=1):
 * duas janelas no lounge, um vídeo público que permite incorporação, os dois players tocando no
 * mesmo ponto, pausa e retomada sincronizadas e o título vindo do próprio YouTube.
 * O teste normal (vivo-tv.spec.ts) usa um player falso; este confere a integração real.
 */

// "Big Buck Bunny" (Blender Foundation, incorporação liberada) e "Me at the zoo".
const ID = "aqz-KE-bpKQ";
const ID2 = "jNQXAC9IVRw";

interface Tv {
  playing: { video: string; title: string; paused: boolean; pos: number; at: number; len?: number } | null;
}
interface TvHook {
  player(): { video: string | null; playing: boolean; time: number; volume: number; ready?: boolean } | null;
  shared(): number;
  inLounge(): boolean;
}
type TW = W & { __tv: TvHook };

const player = (p: Page) => p.evaluate(() => (window as unknown as TW).__tv.player());
const drift = (p: Page) =>
  p.evaluate(() => {
    const t = (window as unknown as TW).__tv;
    const pl = t.player();
    return pl ? Math.abs(pl.time - t.shared()) : Infinity;
  });

async function enter(page: Page, name: string, lens: "2d" | "3d") {
  await page.goto(`/?nome=${name}&lente=${lens}&tv=real`);
  await page.waitForFunction(() => {
    const w = window as unknown as Partial<TW>;
    return !!w.__infinity?.store.getState().selfId && !!w.__tv && !!w.__infinity.acts.state.getState().acts["tv-lounge"];
  }, null, { timeout: 30_000 });
}

test("TV do lounge com o YouTube de verdade: duas janelas no mesmo ponto", async ({ browser }) => {
  test.skip(!process.env.TV_REAL, "precisa de internet: TV_REAL=1");
  test.setTimeout(240_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");

  await walkNear(a, { x: 5, z: -2.9 }, 0.6);
  await walkNear(b, { x: 6.1, z: -3.2 }, 0.8);
  await expect.poll(() => promptLabel(a)).toBe("Assistir junto");
  await a.keyboard.press("KeyE");
  const panel = a.getByRole("dialog", { name: "TV do lounge" });
  await expect(panel).toBeVisible();

  await panel.getByLabel("Link do YouTube").fill(`https://www.youtube.com/watch?v=${ID}`);
  await panel.getByRole("button", { name: "Assistir agora" }).click();
  // Começa do zero (o lounge pode ter este mesmo vídeo de uma rodada anterior, em outro ponto).
  for (const p of [a, b]) await expect.poll(() => p.evaluate(() => (window as unknown as TW).__tv.shared()), { timeout: 10_000 }).toBeLessThan(8);

  // Os dois players do YouTube carregam o vídeo e tocam (o tempo anda).
  for (const p of [a, b]) await expect.poll(async () => (await player(p))?.video, { timeout: 30_000 }).toBe(ID);
  for (const p of [a, b]) {
    // pronto (iframe carregado) e tocando de verdade: o tempo do próprio YouTube anda
    await expect.poll(async () => { const s = await player(p); return !!s?.ready && s.playing; }, { timeout: 30_000 }).toBe(true);
    // (o lounge pode ter um vídeo de antes: espera o player alinhar com o tempo compartilhado)
    await expect.poll(() => drift(p), { timeout: 20_000 }).toBeLessThan(1.5);
    const t0 = (await player(p))!.time;
    await p.waitForTimeout(3000);
    expect((await player(p))!.time).toBeGreaterThan(t0 + 1.5);
  }
  for (const p of [a, b]) await expect.poll(() => drift(p), { timeout: 15_000 }).toBeLessThan(1.5);
  // Título do próprio YouTube (não o "Vídeo do YouTube · id" provisório).
  await expect.poll(async () => (await actState<Tv>(a, "tv-lounge")).playing?.title ?? "", { timeout: 20_000 }).toMatch(/Bunny/i);
  await a.waitForTimeout(1500);
  await a.screenshot({ path: "test-results/screens/vivo-tv-youtube-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-tv-youtube-3d.png" });

  // Pausa do Bruno chega à Ana, no mesmo ponto; e a retomada também.
  const miniB = b.getByRole("region", { name: "TV do lounge" });
  await miniB.getByRole("button", { name: "Pausar" }).click();
  await expect.poll(async () => (await player(a))?.playing, { timeout: 10_000 }).toBe(false);
  expect(Math.abs((await player(a))!.time - (await player(b))!.time)).toBeLessThan(1.5);
  await panel.getByRole("button", { name: "Tocar" }).click();
  await expect.poll(async () => (await player(b))?.playing, { timeout: 10_000 }).toBe(true);
  await expect.poll(() => drift(b), { timeout: 15_000 }).toBeLessThan(1.5);

  // Troca de vídeo para todos.
  await panel.getByLabel("Link do YouTube").fill(`https://youtu.be/${ID2}`);
  await panel.getByRole("button", { name: "Assistir agora" }).click();
  for (const p of [a, b]) await expect.poll(async () => (await player(p))?.video, { timeout: 30_000 }).toBe(ID2);

  // Pausa no fim, para não deixar som tocando no escritório de testes.
  await a.evaluate(() => (window as unknown as TW).__infinity.acts.send("tv-lounge", "pause", {}));
  expect(errors).toEqual([]);
});
