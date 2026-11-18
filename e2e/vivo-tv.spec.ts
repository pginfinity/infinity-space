import { expect, test, type Page } from "./setup.ts";
import { actState, enter, promptLabel, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * TV do lounge (Assistir junto), com o player falso dos testes (sem YouTube de verdade):
 * a Ana (2D) cola um link e os dois veem o mesmo vídeo no mesmo ponto; o Bruno (3D) pausa e a Ana
 * acompanha; um player adiantado volta para o tempo certo; a fila anda; a TV do mundo mostra
 * "Assistindo junto"; links que não são do YouTube não entram; quem sai do lounge para de ouvir e
 * não controla mais.
 */

const ID = "dQw4w9WgXcQ";
const ID2 = "9bZkp7q19f0";

interface Tv {
  playing: { video: string; title: string; paused: boolean; pos: number; at: number; len?: number } | null;
  queue: Array<{ video: string; title: string }>;
}
interface TvHook {
  player(): { video: string | null; playing: boolean; time: number; volume: number } | null;
  nudge(s: number): void;
  claimed(): boolean;
  shared(): number;
  inLounge(): boolean;
}
type TW = W & { __tv: TvHook };

const player = (p: Page) => p.evaluate(() => (window as unknown as TW).__tv.player());
/** Diferença (s) entre o player local e o tempo compartilhado. */
const drift = (p: Page) =>
  p.evaluate(() => {
    const t = (window as unknown as TW).__tv;
    const pl = t.player();
    return pl ? Math.abs(pl.time - t.shared()) : Infinity;
  });

test("TV do lounge: assistir junto, sincronizado entre duas janelas (2D e 3D)", async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  await a.waitForFunction(() => !!(window as unknown as Partial<TW>).__tv && !!(window as unknown as TW).__infinity.acts.state.getState().acts["tv-lounge"]);

  // Os dois no lounge do Átrio, na frente da TV.
  await walkNear(a, { x: 5, z: -2.9 }, 0.6);
  await walkNear(b, { x: 6.1, z: -3.2 }, 0.8);
  await expect.poll(() => a.evaluate(() => (window as unknown as TW).__tv.inLounge())).toBe(true);
  await expect.poll(() => promptLabel(a)).toBe("Assistir junto");
  await a.keyboard.press("KeyE");
  const panel = a.getByRole("dialog", { name: "TV do lounge" });
  await expect(panel).toBeVisible();

  // Só links do YouTube: o painel avisa e o servidor também recusa.
  const input = panel.getByLabel("Link do YouTube");
  await input.fill("https://vimeo.com/76979871");
  await panel.getByRole("button", { name: "Assistir agora" }).click();
  await expect(panel.getByRole("alert")).toHaveText("Só links do YouTube (youtube.com ou youtu.be).");
  const before = await actState<Tv>(a, "tv-lounge");
  await a.evaluate(() => (window as unknown as TW).__infinity.acts.send("tv-lounge", "add", { link: "https://evil.example/watch?v=dQw4w9WgXcQ", now: true }));
  await expect(a.getByText("Só links do YouTube.")).toBeVisible();
  expect((await actState<Tv>(a, "tv-lounge")).playing?.video ?? null).toBe(before.playing?.video ?? null);

  // Link válido: o vídeo começa para todos no lounge.
  await input.fill(`https://youtu.be/${ID}?si=teste`);
  await panel.getByRole("button", { name: "Assistir agora" }).click();
  await expect.poll(async () => (await actState<Tv>(b, "tv-lounge")).playing?.video).toBe(ID);
  for (const p of [a, b]) await expect.poll(async () => (await player(p))?.video, { timeout: 10_000 }).toBe(ID);
  for (const p of [a, b]) await expect.poll(() => drift(p)).toBeLessThan(1.5);
  // O player conta o título e a duração ao servidor; a TV do mundo mostra "Assistindo junto".
  await expect.poll(async () => (await actState<Tv>(a, "tv-lounge")).playing?.title).toBe(`Vídeo de teste ${ID}`);
  expect((await actState<Tv>(a, "tv-lounge")).playing?.len).toBe(600);
  for (const p of [a, b]) await expect.poll(() => p.evaluate(() => (window as unknown as TW).__tv.claimed())).toBe(true);
  // Volume moderado por padrão (só para cada um).
  await expect.poll(async () => (await player(b))?.volume ?? 0).toBeGreaterThan(0.3);
  expect((await player(b))!.volume).toBeLessThan(0.4);

  const miniB = b.getByRole("region", { name: "TV do lounge" });
  await expect(miniB).toBeVisible();
  await expect(miniB).toContainText(`Vídeo de teste ${ID}`);
  await a.waitForTimeout(600);
  await a.screenshot({ path: "test-results/screens/vivo-tv-painel-2d.png" });
  await b.waitForTimeout(600);
  await b.screenshot({ path: "test-results/screens/vivo-tv-mini-3d.png" });

  // O Bruno pausa pelo minitocador: a Ana acompanha, no mesmo ponto.
  await miniB.getByRole("button", { name: "Pausar" }).click();
  await expect.poll(async () => (await actState<Tv>(a, "tv-lounge")).playing?.paused).toBe(true);
  await expect.poll(async () => (await player(a))?.playing).toBe(false);
  const pa = (await player(a))!.time;
  const pb = (await player(b))!.time;
  expect(Math.abs(pa - pb)).toBeLessThan(1.5);
  await expect(panel).toContainText("Pausado");

  // A Ana avança 10 s e dá play: o player do Bruno pula junto.
  await panel.getByRole("button", { name: "Avançar 10 segundos" }).click();
  await panel.getByRole("button", { name: "Tocar" }).click();
  await expect.poll(async () => (await actState<Tv>(b, "tv-lounge")).playing?.paused).toBe(false);
  await expect.poll(async () => (await player(b))?.playing).toBe(true);
  await expect.poll(() => drift(b)).toBeLessThan(1.5);
  expect((await player(b))!.time).toBeGreaterThan(pb + 9);

  // Player adiantado 5 s (máquina lenta, aba em segundo plano): volta para o tempo certo sozinho.
  await b.evaluate(() => (window as unknown as TW).__tv.nudge(5));
  expect(await drift(b)).toBeGreaterThan(4);
  await expect.poll(() => drift(b), { timeout: 6000 }).toBeLessThan(1.5);

  // Fila: o próximo vídeo entra na fila e o "Próximo vídeo" troca para todos.
  await input.fill(`https://www.youtube.com/watch?v=${ID2}`);
  await panel.getByRole("button", { name: "Pôr na fila" }).click();
  await expect.poll(async () => (await actState<Tv>(b, "tv-lounge")).queue.at(-1)?.video).toBe(ID2);
  await expect(miniB).toContainText("na fila");
  await a.screenshot({ path: "test-results/screens/vivo-tv-fila-2d.png" });
  // (pode haver fila de rodadas anteriores: pula até o vídeo novo)
  for (let i = 0; i < 10 && (await actState<Tv>(a, "tv-lounge")).playing?.video !== ID2; i++) {
    await panel.getByRole("button", { name: "Próximo vídeo" }).click();
    await a.waitForTimeout(3200);
  }
  await expect.poll(async () => (await player(b))?.video, { timeout: 10_000 }).toBe(ID2);

  // A TV do mundo, nas duas lentes: painel fechado, câmera perto da TV.
  await a.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  const miniA = a.getByRole("region", { name: "TV do lounge" });
  await expect(miniA).toBeVisible();
  await zoomIn(a, 4);
  await a.waitForTimeout(1200);
  await a.screenshot({ path: "test-results/screens/vivo-tv-mundo-2d.png" });
  await b.screenshot({ path: "test-results/screens/vivo-tv-mundo-3d.png" });

  // Esconder o vídeo: fica só a pílula com o título, e o som continua.
  await miniA.getByRole("button", { name: "Esconder o vídeo" }).click();
  await expect(a.locator('[data-tv-mode="pill"]')).toBeVisible();
  expect((await player(a))?.playing).toBe(true);
  await a.locator('[data-tv-mode="pill"]').getByRole("button", { name: "Mostrar o vídeo" }).click();
  await expect(a.locator('[data-tv-mode="mini"]')).toBeVisible();

  // O Bruno sai do lounge: o player fecha (para de ouvir) e ele não controla mais a TV.
  await walkNear(b, { x: 1, z: 6.5 }, 1.0);
  await expect(miniB).toHaveCount(0);
  await expect.poll(() => player(b)).toBeNull();
  await b.evaluate(() => (window as unknown as TW).__infinity.acts.send("tv-lounge", "pause"));
  await expect(b.getByText("Chegue no lounge do Átrio para usar a TV.")).toBeVisible();
  expect((await actState<Tv>(a, "tv-lounge")).playing?.paused).toBe(false);

  // Desliga a TV no fim (deixa o escritório como estava).
  await a.evaluate(async () => {
    const t = (window as unknown as TW).__infinity;
    for (let i = 0; i < 12 && (t.acts.state.getState().acts["tv-lounge"]!.state as Tv).playing; i++) {
      t.acts.send("tv-lounge", "next");
      await new Promise((r) => setTimeout(r, 3200));
    }
  });
  await expect.poll(async () => (await actState<Tv>(a, "tv-lounge")).playing).toBeNull();
  await expect.poll(() => a.evaluate(() => (window as unknown as TW).__tv.claimed())).toBe(false);
});
