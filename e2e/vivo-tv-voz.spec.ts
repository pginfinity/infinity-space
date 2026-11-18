import { expect, test, type Page } from "./setup.ts";
import { walkNear, type W } from "./vivo-util.ts";

/**
 * TV do lounge e voz: quando alguém que você ouve fala, o som da TV abaixa sozinho e volta depois.
 * Usa o LiveKit local (npm run dev sobe) e o microfone falso do Chrome (um bipe periódico).
 * O vídeo é o do player falso dos testes; o que se confere é o volume aplicado ao player.
 */

const ID = "dQw4w9WgXcQ";

interface TvHook {
  player(): { video: string | null; playing: boolean; time: number; volume: number } | null;
}
interface MediaHook {
  media: { state: { getState(): { status: string; mic: boolean; speaking: Record<string, unknown> } } };
}
type TW = W & { __tv: TvHook; __infinity: W["__infinity"] & MediaHook };

async function enter(page: Page, name: string, lens: "2d" | "3d") {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.goto(`/?nome=${name}&lente=${lens}`);
  await page.waitForFunction(() => {
    const w = window as unknown as Partial<TW>;
    return !!w.__infinity?.store.getState().selfId && !!w.__tv && !!w.__infinity.acts.state.getState().acts["tv-lounge"];
  }, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as TW).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

const volume = (p: Page) => p.evaluate(() => (window as unknown as TW).__tv.player()?.volume ?? -1);

test("TV do lounge abaixa quando alguém fala e volta depois", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "2d");
  await walkNear(a, { x: 5, z: -2.9 }, 0.6);
  await walkNear(b, { x: 6.1, z: -3.2 }, 0.8);

  // A Ana põe um vídeo; volume normal (35%) enquanto ninguém fala.
  await a.evaluate((id) => (window as unknown as TW).__infinity.acts.send("tv-lounge", "add", { link: `https://youtu.be/${id}`, now: true }), ID);
  await expect.poll(async () => (await a.evaluate(() => (window as unknown as TW).__tv.player()))?.video, { timeout: 10_000 }).toBe(ID);
  await expect.poll(() => volume(a), { timeout: 10_000 }).toBeGreaterThan(0.3);

  // O Bruno liga o microfone (o falso do Chrome bipa): a Ana o ouve falando e a TV abaixa.
  await b.keyboard.press("KeyM");
  await expect.poll(() => b.evaluate(() => (window as unknown as TW).__infinity.media.state.getState().mic), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => a.evaluate(() => Object.keys((window as unknown as TW).__infinity.media.state.getState().speaking).length), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => volume(a), { timeout: 10_000 }).toBeLessThan(0.25);

  // Microfone desligado: a voz para e o volume volta devagar ao normal.
  await b.keyboard.press("KeyM");
  await expect.poll(() => volume(a), { timeout: 20_000 }).toBeGreaterThan(0.3);

  await a.evaluate(() => (window as unknown as TW).__infinity.acts.send("tv-lounge", "pause", {}));
});
